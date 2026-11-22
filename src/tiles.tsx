import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { diskAvailable, diskGet, diskPut, fetchPack, listPacks } from './disk'
import type { EnemyArt, TileDef, TokenArt } from './types'

/* ---------- IndexedDB storage (tile images are too big for localStorage) ---------- */
const DB = 'quest-forge'
const STORE = 'tiles'
const ART = 'tokenArt'
const GAME = 'gameArt'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 3)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(ART)) db.createObjectStore(ART, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(GAME)) db.createObjectStore(GAME, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void, store = STORE): Promise<T | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const r = fn(t.objectStore(store))
    t.oncomplete = () => resolve(r ? r.result : undefined)
    t.onerror = () => reject(t.error)
  })
}

const dbAll = () => tx<TileDef[]>('readonly', (s) => s.getAll()).then((r) => r ?? [])
const dbPut = (defs: TileDef[]) => tx('readwrite', (s) => void defs.forEach((d) => s.put(d)))
const dbDelete = (id: string) => tx('readwrite', (s) => void s.delete(id))
const artAll = () => tx<TokenArt[]>('readonly', (s) => s.getAll(), ART).then((r) => r ?? [])
const artPut = (a: TokenArt[]) => tx('readwrite', (s) => void a.forEach((d) => s.put(d)), ART)
const artClear = () => tx('readwrite', (s) => void s.clear(), ART)
type GameArtRec = { id: 'ui'; data: Record<string, string> } | { id: 'enemies'; data: EnemyArt[] }
const gameAll = () => tx<GameArtRec[]>('readonly', (s) => s.getAll(), GAME).then((r) => r ?? [])
const gamePut = (recs: GameArtRec[]) => tx('readwrite', (s) => void recs.forEach((r) => s.put(r)), GAME)
const gameClear = () => tx('readwrite', (s) => void s.clear(), GAME)

/* ---------- Image import helpers ---------- */
export function readImage(file: File, maxSide = 1600): Promise<{ dataUrl: string; aspect: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      const png = file.type === 'image/png'
      resolve({ dataUrl: canvas.toDataURL(png ? 'image/png' : 'image/jpeg', 0.9), aspect: img.width / img.height })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Could not read ${file.name}`))
    }
    img.src = url
  })
}

/** "sns_tile_03b.jpg" -> "03b" style name */
export function nameFromFile(name: string) {
  return name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim()
}

/* ---------- Packs & project-folder sync ---------- */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const byName = (a: TileDef, b: TileDef) => a.name.localeCompare(b.name, undefined, { numeric: true })
/** Tiles from the extracted Quest Editor pack have stable ids starting with this */
const isPackTile = (t: TileDef) => t.id.startsWith('qe-')

/** What's saved to local-assets/user-library.json: your own tiles in full, pack tiles as small overrides */
interface PackOverride { id: string; pack: true; name: string; release: string | null }
interface UserLibrary { v: 1; tiles: (TileDef | PackOverride)[]; deleted: string[] }

/**
 * Merge pack tiles into a library: a pack tile replaces a same-named placeholder (keeping its id so
 * maps that use it update), and keeps a release you assigned by hand when the pack doesn't give one.
 */
function mergePackTiles(current: TileDef[], incoming: TileDef[], deleted: Set<string>) {
  const byId = new Map(current.map((t) => [t.id, t]))
  const placeholders = new Map(current.filter((t) => !t.image && !t.joints).map((t) => [norm(t.name), t]))
  for (const t of incoming) {
    if (!t?.id || !t.name || deleted.has(t.id)) continue
    const ph = placeholders.get(norm(t.name))
    const id = ph?.id ?? t.id
    const prev = byId.get(id)
    const release = t.release ?? prev?.release
    byId.set(id, { ...t, id, name: prev && isPackTile(prev) ? prev.name : t.name, ...(release ? { release } : {}) })
  }
  return [...byId.values()].sort(byName)
}

function applyUserLibrary(current: TileDef[], doc: UserLibrary) {
  const deleted = new Set(doc.deleted ?? [])
  const byId = new Map(current.filter((t) => !deleted.has(t.id)).map((t) => [t.id, t]))
  for (const e of doc.tiles ?? []) {
    if ('pack' in e && e.pack) {
      const t = byId.get(e.id)
      if (t) byId.set(e.id, { ...t, name: e.name, release: e.release ?? undefined })
    } else byId.set(e.id, e as TileDef)
  }
  return [...byId.values()].sort(byName)
}

function toUserLibrary(tiles: TileDef[], deleted: Set<string>): UserLibrary {
  return {
    v: 1,
    tiles: tiles.map((t) => (isPackTile(t) ? { id: t.id, pack: true as const, name: t.name, release: t.release ?? null } : t)),
    deleted: [...deleted],
  }
}

const STAMPS = 'quest-forge:pack-stamps'

/* ---------- Context ---------- */
interface TileLib {
  tiles: TileDef[]
  byId: Record<string, TileDef>
  loaded: boolean
  upsert: (defs: TileDef[]) => void
  remove: (id: string) => void
  art: TokenArt[]
  artById: Record<string, TokenArt>
  upsertArt: (a: TokenArt[]) => void
  clearArt: () => void
  /** interface art by name (bkg_Pergamena, Wax_R, ico_Deck...) */
  ui: Record<string, string>
  enemies: EnemyArt[]
  enemyById: Record<string, EnemyArt>
  setGameArt: (ui: Record<string, string>, enemies: EnemyArt[]) => void
  clearGameArt: () => void
  /** Import a tile / marker / art pack or an exported library (parsed JSON) */
  importPack: (data: unknown) => void
  /** true when the library is kept in the project folder (dev server) */
  onDisk: boolean
}

const Ctx = createContext<TileLib | null>(null)

export function TileLibraryProvider({ children }: { children: ReactNode }) {
  const [tiles, setTiles] = useState<TileDef[]>([])
  const [loaded, setLoaded] = useState(false)
  const [art, setArt] = useState<TokenArt[]>([])
  const [ui, setUi] = useState<Record<string, string>>({})
  const [enemies, setEnemies] = useState<EnemyArt[]>([])
  const [onDisk, setOnDisk] = useState(false)
  const deleted = useRef(new Set<string>())
  const synced = useRef(false)

  const setGameArt = useCallback((u: Record<string, string>, e: EnemyArt[]) => {
    setUi(u)
    setEnemies(e)
    gamePut([{ id: 'ui', data: u }, { id: 'enemies', data: e }]).catch((err) => alert(`Could not save game art: ${err}`))
  }, [])

  const clearGameArt = useCallback(() => {
    setUi({})
    setEnemies([])
    gameClear().catch(console.error)
  }, [])

  const upsertArt = useCallback((a: TokenArt[]) => {
    setArt((cur) => {
      const m = new Map(cur.map((x) => [x.id, x]))
      a.forEach((x) => m.set(x.id, x))
      return [...m.values()]
    })
    artPut(a).catch((e) => alert(`Could not save markers: ${e}`))
  }, [])

  const clearArt = useCallback(() => {
    setArt([])
    artClear().catch(console.error)
  }, [])

  /** Replace the whole tile list (state + browser cache) */
  const setAll = useCallback((next: TileDef[]) => {
    setTiles(next)
    dbPut(next).catch((e) => console.error('Could not cache tiles', e))
  }, [])

  const upsert = useCallback((defs: TileDef[]) => {
    defs.forEach((d) => deleted.current.delete(d.id))
    setTiles((ts) => {
      const map = new Map(ts.map((t) => [t.id, t]))
      defs.forEach((d) => map.set(d.id, d))
      return [...map.values()].sort(byName)
    })
    dbPut(defs).catch((e) => alert(`Could not save tiles: ${e}`))
  }, [])

  const remove = useCallback((id: string) => {
    if (id.startsWith('qe-')) deleted.current.add(id) // so the pack doesn't bring it back
    setTiles((ts) => ts.filter((t) => t.id !== id))
    dbDelete(id).catch(console.error)
  }, [])

  const tilesRef = useRef(tiles)
  tilesRef.current = tiles

  const importPack = useCallback(
    (data: unknown) => {
      const d = data as { questForgeArt?: { ui?: Record<string, string>; enemies?: EnemyArt[] }; questForgeTokens?: TokenArt[]; questForgeTiles?: TileDef[] }
      if (!d || typeof d !== 'object') throw new Error('Not a pack file')
      if (d.questForgeArt) setGameArt(d.questForgeArt.ui ?? {}, d.questForgeArt.enemies ?? [])
      if (Array.isArray(d.questForgeTokens)) upsertArt(d.questForgeTokens.filter((a) => a?.id && a.image))
      const list = d.questForgeTiles ?? (Array.isArray(data) ? (data as TileDef[]) : null)
      if (list) {
        // an explicit import brings back tiles you'd deleted
        list.forEach((t) => deleted.current.delete(t.id))
        setAll(mergePackTiles(tilesRef.current, list, deleted.current))
      } else if (!d.questForgeArt && !d.questForgeTokens) throw new Error('Not a tile library or pack file')
    },
    [setGameArt, upsertArt, setAll],
  )

  // Startup: browser cache first (fast), then the project folder (source of truth)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let current: TileDef[] = []
      let haveArt = false
      let haveUi = false
      try {
        current = (await dbAll()).sort(byName)
        const a = await artAll()
        haveArt = a.length > 0
        const recs = await gameAll()
        for (const r of recs) {
          if (r.id === 'ui') { setUi(r.data); haveUi = Object.keys(r.data).length > 0 } else setEnemies(r.data)
        }
        if (cancelled) return
        setTiles(current)
        setArt(a)
      } catch (e) {
        console.error('Tile library failed to load', e)
      }
      setLoaded(true)

      if (!(await diskAvailable()) || cancelled) return
      try {
        const doc = await diskGet<UserLibrary>('library')
        if (doc) deleted.current = new Set(doc.deleted ?? [])
        // re-import packs that changed on disk (or that the browser cache is missing)
        const stamps: Record<string, number> = JSON.parse(localStorage.getItem(STAMPS) ?? '{}')
        for (const p of await listPacks()) {
          const missing =
            (p.file.includes('tiles') && !current.some(isPackTile)) ||
            (p.file.includes('markers') && !haveArt) ||
            (p.file.includes('-art') && !haveUi)
          if (stamps[p.file] === p.mtime && !missing) continue
          const data = await fetchPack(p.file)
          if (data.questForgeTiles) current = mergePackTiles(current, data.questForgeTiles, deleted.current)
          if (data.questForgeTokens) upsertArt(data.questForgeTokens)
          if (data.questForgeArt) setGameArt(data.questForgeArt.ui ?? {}, data.questForgeArt.enemies ?? [])
          stamps[p.file] = p.mtime
        }
        localStorage.setItem(STAMPS, JSON.stringify(stamps))
        if (doc) current = applyUserLibrary(current, doc)
        if (cancelled) return
        setAll(current)
        synced.current = true
        setOnDisk(true)
        // first run with the dev server: save what the browser had
        if (!doc) diskPut('library', toUserLibrary(current, deleted.current), 0)
      } catch (e) {
        console.error('Could not sync the tile library with the project folder', e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [setAll, upsertArt, setGameArt])

  // Every change after the initial sync goes back to local-assets/user-library.json
  useEffect(() => {
    if (synced.current) diskPut('library', toUserLibrary(tiles, deleted.current), 800)
  }, [tiles])

  const byId = useMemo(() => Object.fromEntries(tiles.map((t) => [t.id, t])), [tiles])
  const artById = useMemo(() => Object.fromEntries(art.map((a) => [a.id, a])), [art])
  const enemyById = useMemo(() => Object.fromEntries(enemies.map((e) => [e.id, e])), [enemies])

  return (
    <Ctx.Provider value={{ tiles, byId, loaded, upsert, remove, art, artById, upsertArt, clearArt, ui, enemies, enemyById, setGameArt, clearGameArt, importPack, onDisk }}>
      {children}
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTileLibrary() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useTileLibrary outside provider')
  return c
}
