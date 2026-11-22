import { useRef, useState } from 'react'
import type { TileDef } from '../types'
import { uid } from '../data'
import { nameFromFile, readImage, useTileLibrary } from '../tiles'
import { downloadText } from '../store'
import { RELEASES, releaseById } from '../releases'

const PRESETS = [
  { label: 'Immortal Souls (1A–19B)', prefix: '', from: 1, to: 19, release: 'is' },
  { label: 'Ancient Chronicles (AC1A–AC20B)', prefix: 'AC', from: 1, to: 20, release: 'ac' },
]

/** "7B" -> 7, "AC12A" -> 12 */
const tileNumber = (name: string) => {
  const m = name.match(/(\d+)\s*[ab]?\s*$/i)
  return m ? +m[1] : NaN
}
const tilePrefix = (name: string) => name.replace(/\d+\s*[ab]?\s*$/i, '').trim()

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

export function TileLibrary() {
  const { tiles, upsert, remove, loaded, art, clearArt, ui, enemies, clearGameArt, importPack, onDisk } = useTileLibrary()
  const [gen, setGen] = useState({ prefix: '', from: 1, to: 19, sides: true, cols: 4, rows: 4, release: 'is' })
  const [assign, setAssign] = useState({ prefix: '', from: 1, to: 19, release: 'is' })
  const [relFilter, setRelFilter] = useState('all')
  const [busy, setBusy] = useState('')
  const [filter, setFilter] = useState('')
  const bulkRef = useRef<HTMLInputElement>(null)
  const importRef = useRef<HTMLInputElement>(null)

  const existing = new Set(tiles.map((t) => norm(t.name)))

  const generate = () => {
    const defs: TileDef[] = []
    for (let n = gen.from; n <= gen.to; n++) {
      const group = `${gen.prefix}${n}`
      for (const side of gen.sides ? ['A', 'B'] : ['']) {
        const name = `${gen.prefix}${n}${side}`
        if (existing.has(norm(name))) continue
        defs.push({ id: uid(), name, cols: gen.cols, rows: gen.rows, group: gen.sides ? group : undefined, release: gen.release || undefined })
      }
    }
    if (!defs.length) return alert('All of those tiles are already in your library.')
    upsert(defs)
  }

  /** Change one tile; size changes also apply to the other side of the same physical tile */
  const edit = (t: TileDef, patch: Partial<TileDef>) => {
    const sizeChange = 'cols' in patch || 'rows' in patch || 'release' in patch
    const siblings = sizeChange && t.group ? tiles.filter((x) => x.group === t.group && x.id !== t.id) : []
    const shared = ({ cols, rows, release }: Partial<TileDef>) =>
      Object.fromEntries(Object.entries({ cols, rows, release }).filter(([k]) => k in patch))
    upsert([{ ...t, ...patch }, ...siblings.map((x) => ({ ...x, ...shared(patch) }))])
  }

  const attachImage = async (t: TileDef, f: File) => {
    const { dataUrl } = await readImage(f)
    edit(t, { image: dataUrl })
  }

  /** Images are matched to tiles by file name ("7B.jpg" → tile 7B); unmatched files become new tiles */
  const bulkImport = async (files: FileList) => {
    const byName = new Map(tiles.map((t) => [norm(t.name), t]))
    const out: TileDef[] = []
    let i = 0
    for (const f of Array.from(files)) {
      setBusy(`Importing ${++i}/${files.length}…`)
      try {
        const { dataUrl, aspect } = await readImage(f)
        const name = nameFromFile(f.name)
        const match = byName.get(norm(name)) ?? byName.get(norm(name.replace(/^.*?(\d+\s*[ab])$/i, '$1')))
        if (match) out.push({ ...match, image: dataUrl })
        else {
          const rows = 4
          out.push({ id: uid(), name, cols: Math.max(1, Math.round(rows * aspect)), rows, image: dataUrl })
        }
      } catch (e) {
        console.error(e)
      }
    }
    setBusy('')
    if (out.length) upsert(out)
  }

  const assignRange = () => {
    const hits = tiles.filter((t) => {
      const n = tileNumber(t.name)
      return n >= assign.from && n <= assign.to && tilePrefix(t.name).toLowerCase() === assign.prefix.trim().toLowerCase()
    })
    if (!hits.length) return alert('No tiles in that range.')
    upsert(hits.map((t) => ({ ...t, release: assign.release || undefined })))
  }

  const exportLib = () => downloadText('tile-library.json', JSON.stringify({ questForgeTiles: tiles }))

  const importLib = async (f: File) => {
    try {
      importPack(JSON.parse(await f.text()))
    } catch (e) {
      alert(`Could not import ${f.name}: ${(e as Error).message}`)
    }
  }

  const shown = tiles.filter(
    (t) => t.name.toLowerCase().includes(filter.toLowerCase()) && (relFilter === 'all' || (t.release ?? '') === relFilter),
  )

  return (
    <div className="library">
      <div className="overview-head">
        <div>
          <h1 className="page-title">Tile Library</h1>
          <p className={`store-note ${onDisk ? 'on' : ''}`}>
            {onDisk
              ? <>Saved in your project folder: <code>local-assets/user-library.json</code>. Packs in <code>local-assets/</code> load automatically.</>
              : <>Saved in this browser only. Run the app with <code>npm run dev</code> to keep the library in your project folder.</>}
          </p>
        </div>
        <div className="row wrap">
          <button onClick={() => bulkRef.current?.click()}>Add tile images…</button>
          <button onClick={() => importRef.current?.click()}>Import library</button>
          <button onClick={exportLib} disabled={!tiles.length}>Export library</button>
        </div>
        <input ref={bulkRef} type="file" accept="image/*" multiple hidden
          onChange={(e) => { if (e.target.files?.length) bulkImport(e.target.files); e.target.value = '' }} />
        <input ref={importRef} type="file" accept=".json,application/json" multiple hidden
          onChange={async (e) => { for (const f of Array.from(e.target.files ?? [])) await importLib(f); e.target.value = '' }} />
      </div>

      <div className="lib-intro">
        <div className="gen-card">
          <h3>Add numbered tiles</h3>
          <p className="hint">
            Creates placeholder tiles named like <b>7A</b> / <b>7B</b>. No artwork needed: they show up on the map as labelled
            outlines. Add a scan or photo later if you like.
          </p>
          <div className="row wrap">
            {PRESETS.map((p) => (
              <button key={p.label} className="mini" onClick={() => setGen({ ...gen, prefix: p.prefix, from: p.from, to: p.to, sides: true, release: p.release })}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="gen-grid">
            <label>Prefix<input value={gen.prefix} placeholder="optional, e.g. MA-" onChange={(e) => setGen({ ...gen, prefix: e.target.value })} /></label>
            <label>From<input type="number" min={0} value={gen.from} onChange={(e) => setGen({ ...gen, from: +e.target.value })} /></label>
            <label>To<input type="number" min={0} value={gen.to} onChange={(e) => setGen({ ...gen, to: +e.target.value })} /></label>
            <label>Width<input type="number" min={1} max={20} value={gen.cols} onChange={(e) => setGen({ ...gen, cols: +e.target.value })} /></label>
            <label>Height<input type="number" min={1} max={20} value={gen.rows} onChange={(e) => setGen({ ...gen, rows: +e.target.value })} /></label>
            <label className="check"><input type="checkbox" checked={gen.sides} onChange={(e) => setGen({ ...gen, sides: e.target.checked })} /> A &amp; B sides</label>
            <label className="span2">Release<ReleaseSelect value={gen.release} onChange={(release) => setGen({ ...gen, release })} /></label>
          </div>
          <button onClick={generate}>Add {gen.sides ? (Math.max(0, gen.to - gen.from + 1)) * 2 : Math.max(0, gen.to - gen.from + 1)} tiles</button>
        </div>
        <div className="gen-card">
          <h3>Have the Quest Editor tile pack?</h3>
          <p className="hint">
            Click <b>Import library</b> and choose <code>local-assets/sns-quest-editor-tiles.json</code> and{' '}
            <code>sns-quest-editor-markers.json</code> and <code>sns-quest-editor-art.json</code> (select all three at once). That loads all 110
            tile sides (1A–55B) with artwork, exact shapes and joint points, so tiles snap together like the real ones.
            Placeholders with the same name are replaced, and maps that already use them update.
          </p>
          <h3>Getting sizes right</h3>
          <p className="hint">
            Tile sizes are in <b>map squares</b>. The squares are only for placing tiles; the game itself moves by areas. Pick one
            unit and use it for every tile, e.g. <b>1 square = 2.5 cm (1 inch)</b>, then measure each tile with a ruler. Both
            sides of a tile share one size, so changing 7A also changes 7B.
          </p>
          <p className="hint">
            To add artwork, use <b>Add tile images…</b> with scans or photos of your own tiles. Name the files after the tile
            (<code>7B.jpg</code>) and they attach to the matching tile automatically. Images are stored only in this browser.
          </p>
        </div>
      </div>

      {tiles.length > 0 && (
        <div className="gen-card assign-card">
          <h3>Assign tiles to a release</h3>
          <p className="hint">
            The map editor only offers tiles from a quest's release and expansions. Tiles with no release are always offered.
          </p>
          <div className="row wrap">
            <label className="small">Prefix<input value={assign.prefix} placeholder="none" onChange={(e) => setAssign({ ...assign, prefix: e.target.value })} /></label>
            <label className="small">Tiles<input type="number" min={0} value={assign.from} onChange={(e) => setAssign({ ...assign, from: +e.target.value })} /></label>
            <label className="small">to<input type="number" min={0} value={assign.to} onChange={(e) => setAssign({ ...assign, to: +e.target.value })} /></label>
            <label className="small">belong to<ReleaseSelect value={assign.release} onChange={(release) => setAssign({ ...assign, release })} /></label>
            <button onClick={assignRange}>Assign</button>
          </div>
          <div className="rel-summary">
            {[...RELEASES.map((r) => r.id), ''].map((id) => {
              const n = tiles.filter((t) => (t.release ?? '') === id).length
              return n ? (
                <span key={id || 'none'}>{id ? releaseById[id].name : 'No release'}: <b>{n}</b></span>
              ) : null
            })}
          </div>
        </div>
      )}

      {art.length > 0 && (
        <p className="hint">
          {art.length} game markers loaded (doors, chests, spawn points, events…). Use them from the map's Tokens tool.{' '}
          <button className="link" onClick={() => confirm('Remove all marker art? Markers on maps fall back to generic tokens.') && clearArt()}>Remove</button>
        </p>
      )}

      {(enemies.length > 0 || Object.keys(ui).length > 0) && (
        <p className="hint">
          Game art loaded: {enemies.length} enemies, {Object.keys(ui).length} interface images.{' '}
          <button className="link" onClick={() => confirm('Remove enemy cards and interface art?') && clearGameArt()}>Remove</button>
        </p>
      )}

      {busy && <p className="hint">{busy}</p>}
      {loaded && tiles.length === 0 && <p className="muted">No tiles yet. Add a numbered set above to get started.</p>}

      {tiles.length > 0 && (
        <>
          <div className="side-head">
            <h3>{tiles.length} tiles</h3>
            <div className="row">
              <select className="rel-select" value={relFilter} onChange={(e) => setRelFilter(e.target.value)}>
                <option value="all">All releases</option>
                {RELEASES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                <option value="">No release</option>
              </select>
              <input className="tile-filter" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            </div>
          </div>
          <div className="tile-grid">
            {shown.map((t) => (
              <TileCard key={t.id} tile={t} onEdit={(p) => edit(t, p)} onImage={(f) => attachImage(t, f)}
                onDelete={() => confirm(`Delete tile ${t.name}? Maps that use it will show a "missing tile" outline.`) && remove(t.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function TileCard({ tile, onEdit, onImage, onDelete }: {
  tile: TileDef
  onEdit: (p: Partial<TileDef>) => void
  onImage: (f: File) => void
  onDelete: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const max = Math.max(tile.cols, tile.rows)
  const w = (tile.cols / max) * 100
  const h = (tile.rows / max) * 100
  return (
    <div className="tile-card">
      <div className="tile-preview">
        <div className="tile-shape" style={{ width: `${w}%`, height: `${h}%` }}>
          {tile.image ? <img src={tile.image} alt={tile.name} /> : <span>{tile.name}</span>}
        </div>
      </div>
      <input className="tile-name" value={tile.name} onChange={(e) => onEdit({ name: e.target.value })} />
      <ReleaseSelect value={tile.release ?? ''} onChange={(release) => onEdit({ release: release || undefined })} />
      {tile.joints ? (
        <div className="muted small-text">
          {+tile.cols.toFixed(2)} × {+tile.rows.toFixed(2)} squares · {tile.joints.length} joints
        </div>
      ) : (
        <div className="row">
          <label className="small">W<input type="number" min={1} max={20} value={tile.cols} onChange={(e) => onEdit({ cols: Math.max(1, +e.target.value) })} /></label>
          <label className="small">H<input type="number" min={1} max={20} value={tile.rows} onChange={(e) => onEdit({ rows: Math.max(1, +e.target.value) })} /></label>
        </div>
      )}
      <div className="row">
        <button className="mini" onClick={() => ref.current?.click()}>{tile.image ? 'Replace image' : 'Add image'}</button>
        {tile.image && <button className="mini" onClick={() => onEdit({ image: undefined })}>Remove image</button>}
        <span className="spacer" />
        <button className="icon" title="Delete tile" onClick={onDelete}>✕</button>
      </div>
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onImage(f); e.target.value = '' }} />
    </div>
  )
}

function ReleaseSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <select className="rel-select" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">No release</option>
      {RELEASES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
    </select>
  )
}
