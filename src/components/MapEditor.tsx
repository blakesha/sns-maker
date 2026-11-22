import { useCallback, useEffect, useRef, useState } from 'react'
import type { EdgeType, MapData, PlacedTile, TerrainId, TileDef, Token, TokenKind } from '../types'
import { TERRAINS, TOKENS, footprint, newMap, resizeMap, tokenByKind, uid, worldJoints } from '../data'
import { CELL, MapSvg, TileGraphic } from './MapSvg'
import { useTileLibrary } from '../tiles'
import { releaseById, targetLabel, tileAllowed, type Target } from '../releases'
import { downloadBlob, slug } from '../store'

type Tool = 'select' | 'tile' | 'paint' | 'rect' | 'fill' | 'edge' | 'token' | 'erase'
type EdgeChoice = EdgeType | 'remove'

const TOOLS: { id: Tool; name: string; key: string; hint: string }[] = [
  { id: 'select', name: 'Select', key: 'V', hint: 'Click a token to edit it, drag to move. Del removes.' },
  { id: 'tile', name: 'Tiles', key: 'L', hint: 'Pick a tile and click to place it. Tiles snap together at their connection points; hold Alt to place freely. Q rotates.' },
  { id: 'paint', name: 'Brush', key: 'B', hint: 'Click & drag to paint terrain.' },
  { id: 'rect', name: 'Room', key: 'R', hint: 'Drag a rectangle to paint terrain. Hold Shift to also wall it in.' },
  { id: 'fill', name: 'Fill', key: 'G', hint: 'Flood-fill a connected region of the same terrain.' },
  { id: 'edge', name: 'Walls', key: 'W', hint: 'Click or drag along grid lines to place walls / doors.' },
  { id: 'token', name: 'Tokens', key: 'T', hint: 'Click a cell to place the chosen token.' },
  { id: 'erase', name: 'Erase', key: 'E', hint: 'Drag to clear terrain, tokens and walls from cells.' },
]

const EDGE_CHOICES: { id: EdgeChoice; name: string }[] = [
  { id: 'wall', name: 'Wall' },
  { id: 'door', name: 'Door' },
  { id: 'locked', name: 'Locked door' },
  { id: 'secret', name: 'Secret door' },
  { id: 'remove', name: 'Remove' },
]

interface Props {
  map: MapData
  name: string
  onChange: (m: MapData) => void
  onOpenLibrary?: () => void
  target: Target
}

/** Grow the map so every placed tile fits */
function growToFit(m: MapData, defs: Record<string, { cols: number; rows: number }>): MapData {
  let w = m.width
  let h = m.height
  for (const t of m.tiles) {
    const d = defs[t.tileId]
    if (!d) continue
    const f = footprint(d, t.rot)
    w = Math.max(w, Math.ceil(t.x + f.w - 0.01))
    h = Math.max(h, Math.ceil(t.y + f.h - 0.01))
  }
  w = Math.min(w, 80)
  h = Math.min(h, 80)
  return w === m.width && h === m.height ? m : resizeMap(m, w, h)
}

const SNAP = 0.7 // squares: how close joints must be to snap together

/**
 * Where a tile should go when its top-left is wanted at (wx, wy).
 * Tiles with joints move freely and snap joint-to-joint onto neighbouring tiles;
 * tiles without joints snap to the square grid.
 */
function placeTile(
  def: TileDef, rot: number, wx: number, wy: number, others: PlacedTile[], defs: Record<string, TileDef>, free = false,
): { x: number; y: number; snapped: boolean } {
  // Alt: place anywhere (quarter-square steps), ignoring joints
  if (free) return { x: Math.max(0, Math.round(wx * 4) / 4), y: Math.max(0, Math.round(wy * 4) / 4), snapped: false }
  if (!def.joints?.length) return { x: Math.max(0, Math.round(wx)), y: Math.max(0, Math.round(wy)), snapped: false }
  const mine = worldJoints(def, { x: wx, y: wy, rot })
  let best: { d: number; dx: number; dy: number } | null = null
  for (const o of others) {
    const od = defs[o.tileId]
    if (!od?.joints) continue
    for (const [ox, oy] of worldJoints(od, o))
      for (const [mx, my] of mine) {
        const d = Math.hypot(ox - mx, oy - my)
        if (d < SNAP && (!best || d < best.d)) best = { d, dx: ox - mx, dy: oy - my }
      }
  }
  const x = wx + (best?.dx ?? 0)
  const y = wy + (best?.dy ?? 0)
  const r = (v: number) => Math.round(v * 1000) / 1000
  return { x: r(Math.max(0, x)), y: r(Math.max(0, y)), snapped: !!best }
}

/**
 * Nearest tile connection point to (fx, fy), with the rotation a door needs to sit across it:
 * joints on a tile's left/right edge get an upright door, top/bottom edges a flat one.
 */
function nearestJoint(fx: number, fy: number, tiles: PlacedTile[], defs: Record<string, TileDef>, within = 1.2) {
  let best: { x: number; y: number; rot: number; d: number } | null = null
  for (const t of tiles) {
    const def = defs[t.tileId]
    if (!def?.joints) continue
    const f = footprint(def, t.rot)
    const cx = t.x + f.w / 2
    const cy = t.y + f.h / 2
    for (const [jx, jy] of worldJoints(def, t)) {
      const d = Math.hypot(jx - fx, jy - fy)
      if (d < within && (!best || d < best.d)) {
        const side = Math.abs(jx - cx) / (f.w / 2) > Math.abs(jy - cy) / (f.h / 2)
        best = { x: jx, y: jy, rot: side ? 1 : 0, d }
      }
    }
  }
  return best
}

function cellEdges(x: number, y: number) {
  return [`h:${x},${y}`, `h:${x},${y + 1}`, `v:${x},${y}`, `v:${x + 1},${y}`]
}

export function autoWalls(map: MapData): MapData {
  const edges = { ...map.edges }
  const solid = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < map.width && y < map.height && map.cells[y * map.width + x] !== 'void'
  for (let y = 0; y <= map.height; y++)
    for (let x = 0; x <= map.width; x++) {
      if (x < map.width && solid(x, y) !== solid(x, y - 1) && !edges[`h:${x},${y}`]) edges[`h:${x},${y}`] = 'wall'
      if (y < map.height && solid(x, y) !== solid(x - 1, y) && !edges[`v:${x},${y}`]) edges[`v:${x},${y}`] = 'wall'
    }
  return { ...map, edges }
}

export function MapEditor({ map, name, onChange, onOpenLibrary, target }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const lib = useTileLibrary()
  const [tool, setTool] = useState<Tool>(lib.tiles.length ? 'tile' : 'paint')
  const [tileDefId, setTileDefId] = useState<string | null>(null)
  const [pendingRot, setPendingRot] = useState(0)
  const [selectedTile, setSelectedTile] = useState<string | null>(null)
  const [showTileNames, setShowTileNames] = useState(true)
  const [tileFilter, setTileFilter] = useState('')
  const [showAllTiles, setShowAllTiles] = useState(false)
  const [terrain, setTerrain] = useState<TerrainId>('floor')
  const [edgeType, setEdgeType] = useState<EdgeChoice>('wall')
  const [tokenKind, setTokenKind] = useState<TokenKind>('enemy')
  const [tokenArtId, setTokenArtId] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [showGrid, setShowGrid] = useState(true)
  const [showLabels, setShowLabels] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [hover, setHover] = useState<{ x: number; y: number; fx: number; fy: number; edge: string | null } | null>(null)
  const [rectDrag, setRectDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [sizeDraft, setSizeDraft] = useState({ w: map.width, h: map.height })

  const past = useRef<MapData[]>([])
  const future = useRef<MapData[]>([])
  const mapRef = useRef(map)
  mapRef.current = map
  const drag = useRef<{ active: boolean; tokenId?: string; tileId?: string; offset?: [number, number]; shift?: boolean }>({ active: false })
  /** Alt held: place tiles freely without joint snapping */
  const altDown = useRef(false)
  const activeDef = (tileDefId && lib.byId[tileDefId]) || null

  useEffect(() => setSizeDraft({ w: map.width, h: map.height }), [map.width, map.height])

  const checkpoint = useCallback(() => {
    past.current.push(mapRef.current)
    if (past.current.length > 100) past.current.shift()
    future.current = []
  }, [])

  const commit = useCallback(
    (m: MapData, withCheckpoint = true) => {
      if (withCheckpoint) checkpoint()
      mapRef.current = m
      onChange(m)
    },
    [checkpoint, onChange],
  )

  const undo = useCallback(() => {
    const prev = past.current.pop()
    if (!prev) return
    future.current.push(mapRef.current)
    mapRef.current = prev
    onChange(prev)
  }, [onChange])

  const redo = useCallback(() => {
    const next = future.current.pop()
    if (!next) return
    past.current.push(mapRef.current)
    mapRef.current = next
    onChange(next)
  }, [onChange])

  const selectedToken = map.tokens.find((t) => t.id === selected) ?? null
  const placedTile = (map.tiles ?? []).find((t) => t.id === selectedTile) ?? null

  const updateTile = (id: string, patch: Partial<PlacedTile>, cp = true) =>
    commit({ ...mapRef.current, tiles: mapRef.current.tiles.map((t) => (t.id === id ? { ...t, ...patch } : t)) }, cp)

  const rotateTile = (id: string, dir: 1 | -1) => {
    const t = mapRef.current.tiles.find((x) => x.id === id)
    if (!t) return
    const def = lib.byId[t.tileId]
    const rot = (t.rot + dir + 4) % 4
    let { x, y } = t
    if (def?.joints?.length) {
      // jointed tiles rotate about their centre
      const a = footprint(def, t.rot)
      const b = footprint(def, rot)
      x = Math.max(0, t.x + (a.w - b.w) / 2)
      y = Math.max(0, t.y + (a.h - b.h) / 2)
    }
    const next = { ...mapRef.current, tiles: mapRef.current.tiles.map((o) => (o.id === id ? { ...o, rot, x, y } : o)) }
    commit(growToFit(next, lib.byId))
  }

  const deleteTile = useCallback(
    (id: string) => {
      commit({ ...mapRef.current, tiles: mapRef.current.tiles.filter((t) => t.id !== id) })
      setSelectedTile(null)
    },
    [commit],
  )

  const reorderTile = (id: string, toFront: boolean) => {
    const t = mapRef.current.tiles.find((x) => x.id === id)
    if (!t) return
    const rest = mapRef.current.tiles.filter((x) => x.id !== id)
    commit({ ...mapRef.current, tiles: toFront ? [...rest, t] : [t, ...rest] })
  }

  const selectToken = (id: string | null) => {
    setSelected(id)
    if (id) setSelectedTile(null)
  }
  const selectTile = (id: string | null) => {
    setSelectedTile(id)
    if (id) setSelected(null)
  }

  const updateToken = (id: string, patch: Partial<Token>, cp = true) =>
    commit({ ...mapRef.current, tokens: mapRef.current.tokens.map((t) => (t.id === id ? { ...t, ...patch } : t)) }, cp)

  const deleteToken = useCallback(
    (id: string) => {
      commit({ ...mapRef.current, tokens: mapRef.current.tokens.filter((t) => t.id !== id) })
      setSelected(null)
    },
    [commit],
  )

  const rotateTileRef = useRef(rotateTile)
  rotateTileRef.current = rotateTile
  const rotateToken = (id: string, dir: 1 | -1) => {
    const t = mapRef.current.tokens.find((x) => x.id === id)
    if (t?.art) updateToken(id, { rot: ((t.rot ?? 0) + dir + 4) % 4 })
  }
  const rotateTokenRef = useRef(rotateToken)
  rotateTokenRef.current = rotateToken

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && (selected || selectedTile)) {
        e.preventDefault()
        if (selected) deleteToken(selected)
        else if (selectedTile) deleteTile(selectedTile)
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key.toLowerCase() === 'q') {
        if (selectedTile) rotateTileRef.current(selectedTile, e.shiftKey ? -1 : 1)
        else if (selected) rotateTokenRef.current(selected, e.shiftKey ? -1 : 1)
        else setPendingRot((r) => (r + (e.shiftKey ? 3 : 1)) % 4)
        return
      }
      if (e.key === 'Escape') {
        setSelected(null)
        setSelectedTile(null)
        return
      }
      const t = TOOLS.find((t) => t.key.toLowerCase() === e.key.toLowerCase())
      if (t) setTool(t.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, selected, selectedTile, deleteToken, deleteTile])

  // --- geometry helpers ---
  const toMap = (e: React.PointerEvent) => {
    const svg = svgRef.current!
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse())
    const fx = p.x / CELL
    const fy = p.y / CELL
    const x = Math.floor(fx)
    const y = Math.floor(fy)
    // nearest edge
    const dv = Math.abs(fx - Math.round(fx))
    const dh = Math.abs(fy - Math.round(fy))
    let edge: string | null = null
    if (Math.min(dv, dh) < 0.3) {
      if (dv < dh) {
        const ex = Math.round(fx)
        if (ex >= 0 && ex <= map.width && y >= 0 && y < map.height) edge = `v:${ex},${y}`
      } else {
        const ey = Math.round(fy)
        if (ey >= 0 && ey <= map.height && x >= 0 && x < map.width) edge = `h:${x},${ey}`
      }
    }
    return { x, y, fx, fy, edge, inside: x >= 0 && y >= 0 && x < map.width && y < map.height }
  }

  const paintCell = (m: MapData, x: number, y: number, t: TerrainId): MapData => {
    const i = y * m.width + x
    if (m.cells[i] === t) return m
    const cells = m.cells.slice()
    cells[i] = t
    return { ...m, cells }
  }

  const eraseCell = (m: MapData, x: number, y: number): MapData => {
    const next = paintCell(m, x, y, 'void')
    const edges = { ...next.edges }
    let changed = next !== m
    for (const k of cellEdges(x, y))
      if (edges[k]) {
        delete edges[k]
        changed = true
      }
    const tokens = next.tokens.filter((t) => !(t.x === x && t.y === y))
    if (tokens.length !== next.tokens.length) changed = true
    return changed ? { ...next, edges, tokens } : m
  }

  const setEdge = (m: MapData, key: string, type: EdgeChoice): MapData => {
    if ((type === 'remove' && !m.edges[key]) || m.edges[key] === type) return m
    const edges = { ...m.edges }
    if (type === 'remove') delete edges[key]
    else edges[key] = type
    return { ...m, edges }
  }

  const floodFill = (m: MapData, sx: number, sy: number, t: TerrainId): MapData => {
    const target = m.cells[sy * m.width + sx]
    if (target === t) return m
    const cells = m.cells.slice()
    const stack = [[sx, sy]]
    while (stack.length) {
      const [x, y] = stack.pop()!
      if (x < 0 || y < 0 || x >= m.width || y >= m.height) continue
      const i = y * m.width + x
      if (cells[i] !== target) continue
      cells[i] = t
      // walls block flood fill so you can fill a single room
      if (!m.edges[`v:${x + 1},${y}`]) stack.push([x + 1, y])
      if (!m.edges[`v:${x},${y}`]) stack.push([x - 1, y])
      if (!m.edges[`h:${x},${y + 1}`]) stack.push([x, y + 1])
      if (!m.edges[`h:${x},${y}`]) stack.push([x, y - 1])
    }
    return { ...m, cells }
  }

  const tokenAt = (e: React.PointerEvent) => {
    const el = (e.target as Element).closest('[data-token]')
    return el?.getAttribute('data-token') ?? null
  }
  const tileAt = (e: React.PointerEvent) => {
    const el = (e.target as Element).closest('[data-tile]')
    return el?.getAttribute('data-tile') ?? null
  }
  const startTileDrag = (id: string, p: { fx: number; fy: number }) => {
    const t = mapRef.current.tiles.find((t) => t.id === id)!
    selectTile(id)
    checkpoint()
    drag.current = { active: true, tileId: id, offset: [p.fx - t.x, p.fy - t.y] }
  }
  /** Placement for a new tile with the cursor at its centre */
  const ghostPos = (def: TileDef, fx: number, fy: number) => {
    const f = footprint(def, pendingRot)
    return placeTile(def, pendingRot, fx - f.w / 2, fy - f.h / 2, mapRef.current.tiles, lib.byId, altDown.current)
  }
  /** Door markers snap onto tile connection points; other markers to half squares */
  const markerPos = (kind: TokenKind, fx: number, fy: number, free: boolean) => {
    const j = !free && kind === 'door' ? nearestJoint(fx, fy, mapRef.current.tiles, lib.byId) : null
    if (j) return { x: j.x - 0.5, y: j.y - 0.5, rot: j.rot }
    return { x: Math.round(fx * 2) / 2 - 0.5, y: Math.round(fy * 2) / 2 - 0.5 }
  }

  const applyStroke = (p: ReturnType<typeof toMap>) => {
    const m = mapRef.current
    let next = m
    if (tool === 'paint' && p.inside) next = paintCell(m, p.x, p.y, terrain)
    else if (tool === 'erase' && p.inside) next = eraseCell(m, p.x, p.y)
    else if (tool === 'edge' && p.edge) next = setEdge(m, p.edge, edgeType)
    if (next !== m) commit(next, false)
  }

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    const p = toMap(e)
    svgRef.current?.setPointerCapture(e.pointerId)
    const hitToken = tokenAt(e)

    const hitTile = tileAt(e)

    if (tool === 'select') {
      if (hitToken) {
        const t = mapRef.current.tokens.find((t) => t.id === hitToken)!
        selectToken(hitToken)
        checkpoint()
        drag.current = { active: true, tokenId: hitToken, offset: [p.fx - 0.5 - t.x, p.fy - 0.5 - t.y] }
      } else if (hitTile) startTileDrag(hitTile, p)
      else {
        setSelected(null)
        setSelectedTile(null)
      }
      return
    }
    if (tool === 'tile') {
      if (activeDef && p.fx >= 0 && p.fy >= 0 && !(hitTile && hitTile === selectedTile)) {
        const { x, y } = ghostPos(activeDef, p.fx, p.fy)
        const t: PlacedTile = { id: uid(), tileId: activeDef.id, x, y, rot: pendingRot }
        commit(growToFit({ ...mapRef.current, tiles: [...mapRef.current.tiles, t] }, lib.byId))
        selectTile(t.id)
      } else if (hitTile) startTileDrag(hitTile, p)
      else setSelectedTile(null)
      return
    }
    if (tool === 'token') {
      if (hitToken) {
        selectToken(hitToken)
        checkpoint()
        const t = mapRef.current.tokens.find((t) => t.id === hitToken)!
        drag.current = { active: true, tokenId: hitToken, offset: [p.fx - 0.5 - t.x, p.fy - 0.5 - t.y] }
        return
      }
      if (!p.inside) return
      const existingEvents = mapRef.current.tokens.filter((t) => t.kind === 'event').length
      const art = tokenArtId ? lib.artById[tokenArtId] : undefined
      const mp = art ? markerPos(art.kind, p.fx, p.fy, e.altKey) : null
      const t: Token = {
        id: uid(),
        kind: art?.kind ?? tokenKind,
        // art markers snap to half squares (doors to tile connection points)
        x: mp ? mp.x : p.x,
        y: mp ? mp.y : p.y,
        ...(art ? { art: art.id, rot: mp?.rot ?? 0 } : {}),
        label: art ? '' : tokenKind === 'event' ? String(existingEvents + 1) : tokenKind === 'label' ? 'Area' : '',
        note: '',
      }
      commit({ ...mapRef.current, tokens: [...mapRef.current.tokens, t] })
      selectToken(t.id)
      return
    }
    if (tool === 'fill') {
      if (p.inside) commit(floodFill(mapRef.current, p.x, p.y, terrain))
      return
    }
    if (tool === 'rect') {
      if (!p.inside) return
      drag.current = { active: true, shift: e.shiftKey }
      setRectDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
      return
    }
    checkpoint()
    drag.current = { active: true }
    applyStroke(p)
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = toMap(e)
    altDown.current = e.altKey
    setHover(p.inside || p.edge ? { x: p.x, y: p.y, fx: p.fx, fy: p.fy, edge: p.edge } : null)
    if (!drag.current.active) return
    if (drag.current.tileId) {
      const [ox, oy] = drag.current.offset ?? [0, 0]
      const t = mapRef.current.tiles.find((t) => t.id === drag.current.tileId)
      const def = t && lib.byId[t.tileId]
      if (!t) return
      const others = mapRef.current.tiles.filter((o) => o.id !== t.id)
      const { x: nx, y: ny } = def
        ? placeTile(def, t.rot, p.fx - ox, p.fy - oy, others, lib.byId, e.altKey)
        : { x: Math.max(0, Math.round(p.fx - ox)), y: Math.max(0, Math.round(p.fy - oy)) }
      if (t.x !== nx || t.y !== ny) updateTile(t.id, { x: nx, y: ny }, false)
      return
    }
    if (drag.current.tokenId) {
      const [ox, oy] = drag.current.offset ?? [0, 0]
      const t = mapRef.current.tokens.find((t) => t.id === drag.current.tokenId)
      if (!t) return
      if (t.art) {
        const mp = markerPos(t.kind, p.fx - ox, p.fy - oy, e.altKey)
        const patch = { x: Math.max(-0.5, mp.x), y: Math.max(-0.5, mp.y), ...(mp.rot != null ? { rot: mp.rot } : {}) }
        if (t.x !== patch.x || t.y !== patch.y || (patch.rot != null && patch.rot !== t.rot)) updateToken(t.id, patch, false)
        return
      }
      const nx = Math.max(0, Math.min(map.width - 1, Math.round(p.fx - 0.5 - ox)))
      const ny = Math.max(0, Math.min(map.height - 1, Math.round(p.fy - 0.5 - oy)))
      if (t.x !== nx || t.y !== ny) updateToken(t.id, { x: nx, y: ny }, false)
      return
    }
    if (tool === 'rect' && rectDrag) {
      const x1 = Math.max(0, Math.min(map.width - 1, p.x))
      const y1 = Math.max(0, Math.min(map.height - 1, p.y))
      if (x1 !== rectDrag.x1 || y1 !== rectDrag.y1) setRectDrag({ ...rectDrag, x1, y1 })
      return
    }
    applyStroke(p)
  }

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (tool === 'rect' && rectDrag) {
      const x0 = Math.min(rectDrag.x0, rectDrag.x1)
      const x1 = Math.max(rectDrag.x0, rectDrag.x1)
      const y0 = Math.min(rectDrag.y0, rectDrag.y1)
      const y1 = Math.max(rectDrag.y0, rectDrag.y1)
      const m = mapRef.current
      const cells = m.cells.slice()
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells[y * m.width + x] = terrain
      const edges = { ...m.edges }
      if (drag.current.shift || e.shiftKey) {
        for (let x = x0; x <= x1; x++) {
          edges[`h:${x},${y0}`] ??= 'wall'
          edges[`h:${x},${y1 + 1}`] ??= 'wall'
        }
        for (let y = y0; y <= y1; y++) {
          edges[`v:${x0},${y}`] ??= 'wall'
          edges[`v:${x1 + 1},${y}`] ??= 'wall'
        }
      }
      commit({ ...m, cells, edges })
      setRectDrag(null)
    }
    if (drag.current.tileId) {
      const grown = growToFit(mapRef.current, lib.byId)
      if (grown !== mapRef.current) commit(grown, false)
    }
    drag.current = { active: false }
  }

  const exportPng = async () => {
    const svg = svgRef.current
    if (!svg) return
    const clone = svg.cloneNode(true) as SVGSVGElement
    const vb = svg.viewBox.baseVal
    const scale = 2
    clone.setAttribute('width', String(vb.width * scale))
    clone.setAttribute('height', String(vb.height * scale))
    clone.querySelectorAll('[data-overlay]').forEach((n) => n.remove())
    const data = new XMLSerializer().serializeToString(clone)
    const img = new Image()
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(data)
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = vb.width * scale
    canvas.height = vb.height * scale
    canvas.getContext('2d')!.drawImage(img, 0, 0)
    canvas.toBlob((b) => b && downloadBlob(`${slug(name)}-map.png`, b), 'image/png')
  }

  // --- overlay (hover + rect preview) ---
  let overlay: React.ReactNode = null
  if (rectDrag) {
    const x0 = Math.min(rectDrag.x0, rectDrag.x1)
    const y0 = Math.min(rectDrag.y0, rectDrag.y1)
    overlay = (
      <rect data-overlay x={x0 * CELL} y={y0 * CELL} width={(Math.abs(rectDrag.x1 - rectDrag.x0) + 1) * CELL}
        height={(Math.abs(rectDrag.y1 - rectDrag.y0) + 1) * CELL} fill="#e0b04a" fillOpacity={0.25} stroke="#e0b04a"
        strokeWidth={2} strokeDasharray="6 4" pointerEvents="none" />
    )
  } else if (hover && tool === 'tile' && activeDef && hover.fx >= 0 && hover.fy >= 0) {
    const g = ghostPos(activeDef, hover.fx, hover.fy)
    overlay = (
      <g data-overlay>
        <TileGraphic def={activeDef} tile={{ id: 'ghost', tileId: activeDef.id, x: g.x, y: g.y, rot: pendingRot }} ghost showName />
        {g.snapped && worldJoints(activeDef, { x: g.x, y: g.y, rot: pendingRot }).map(([jx, jy], i) => (
          <circle key={i} cx={jx * CELL} cy={jy * CELL} r={7} fill="#4caf50" stroke="#fff" strokeWidth={2} pointerEvents="none" />
        ))}
      </g>
    )
  } else if (hover && tool === 'edge' && hover.edge) {
    const [dir, rest] = hover.edge.split(':')
    const [ex, ey] = rest.split(',').map(Number)
    const x = ex * CELL
    const y = ey * CELL
    overlay = (
      <line data-overlay x1={x} y1={y} x2={dir === 'h' ? x + CELL : x} y2={dir === 'v' ? y + CELL : y}
        stroke="#e0b04a" strokeWidth={8} strokeOpacity={0.7} strokeLinecap="round" pointerEvents="none" />
    )
  } else if (hover && tool !== 'select' && tool !== 'edge' && tool !== 'tile' && hover.x >= 0 && hover.y >= 0 && hover.x < map.width && hover.y < map.height) {
    overlay = (
      <rect data-overlay x={hover.x * CELL} y={hover.y * CELL} width={CELL} height={CELL} fill="#e0b04a" fillOpacity={0.2}
        stroke="#e0b04a" strokeWidth={2} pointerEvents="none" />
    )
  }

  const toolHint = TOOLS.find((t) => t.id === tool)?.hint
  const offTarget = [...new Set(map.tiles.map((t) => lib.byId[t.tileId]).filter((d) => d && !tileAllowed(d, target)).map((d) => d!.name))]

  return (
    <div className="map-editor">
      <aside className="map-tools">
        <section>
          <h4>Tools</h4>
          <div className="tool-grid">
            {TOOLS.map((t) => (
              <button key={t.id} className={tool === t.id ? 'active' : ''} onClick={() => setTool(t.id)} title={`${t.hint} (${t.key})`}>
                {t.name} <kbd>{t.key}</kbd>
              </button>
            ))}
          </div>
          <p className="hint">{toolHint}</p>
        </section>

        {tool === 'tile' && (
          <section>
            <h4>Game tiles <span className="muted">· rotation {pendingRot * 90}° (Q)</span></h4>
            {lib.tiles.length === 0 ? (
              <p className="hint">
                Your tile library is empty. Add scans of your tiles (or numbered placeholders) in the{' '}
                <button className="link" onClick={onOpenLibrary}>Tile Library</button>.
              </p>
            ) : (
              <>
                <p className="hint target-line">
                  {targetLabel(target)}
                  <label className="check"><input type="checkbox" checked={showAllTiles} onChange={(e) => setShowAllTiles(e.target.checked)} /> show all</label>
                </p>
                {lib.tiles.length > 8 && (
                  <input className="tile-filter" placeholder="Filter tiles…" value={tileFilter} onChange={(e) => setTileFilter(e.target.value)} />
                )}
                <div className="tile-palette">
                  {lib.tiles
                    .filter((t) => (showAllTiles || tileAllowed(t, target)) && t.name.toLowerCase().includes(tileFilter.toLowerCase()))
                    .map((t) => (
                      <button key={t.id} className={`tile-pick ${tileDefId === t.id ? 'active' : ''} ${tileAllowed(t, target) ? '' : 'off-target'}`}
                        onClick={() => setTileDefId(t.id)}
                        title={`${t.name} · ${t.release ? releaseById[t.release]?.name : 'no release set'}`}>
                        {t.image ? <img src={t.image} alt="" /> : <span className="tile-ph">{t.name}</span>}
                        <span className="tile-cap">{t.name}</span>
                      </button>
                    ))}
                </div>
                <button className="link" onClick={onOpenLibrary}>Manage tile library →</button>
              </>
            )}
          </section>
        )}

        {placedTile && (
          <section className="token-inspector">
            <h4>Selected tile: {lib.byId[placedTile.tileId]?.name ?? 'Missing tile'}</h4>
            <div className="row wrap">
              <button onClick={() => rotateTile(placedTile.id, -1)} title="Shift+Q">⟲ Rotate</button>
              <button onClick={() => rotateTile(placedTile.id, 1)} title="Q">⟳ Rotate</button>
            </div>
            <div className="row wrap">
              <button onClick={() => reorderTile(placedTile.id, true)}>To front</button>
              <button onClick={() => reorderTile(placedTile.id, false)}>To back</button>
            </div>
            <button className="danger" onClick={() => deleteTile(placedTile.id)}>Remove tile</button>
          </section>
        )}

        {(tool === 'paint' || tool === 'rect' || tool === 'fill') && (
          <section>
            <h4>Terrain</h4>
            <div className="swatches">
              {TERRAINS.map((t) => (
                <button key={t.id} className={`swatch ${terrain === t.id ? 'active' : ''}`} onClick={() => setTerrain(t.id)} title={t.name}>
                  <span className="chip" style={{ background: t.id === 'void' ? 'repeating-linear-gradient(45deg,#ddd 0 4px,#fff 4px 8px)' : t.color }} />
                  {t.name}
                </button>
              ))}
            </div>
          </section>
        )}

        {tool === 'edge' && (
          <section>
            <h4>Edge type</h4>
            <div className="swatches">
              {EDGE_CHOICES.map((c) => (
                <button key={c.id} className={`swatch ${edgeType === c.id ? 'active' : ''}`} onClick={() => setEdgeType(c.id)}>
                  {c.name}
                </button>
              ))}
            </div>
          </section>
        )}

        {tool === 'token' && (
          <section>
            {lib.art.length > 0 && (
              <>
                <h4>Game markers</h4>
                <div className="art-palette">
                  {lib.art.map((a) => (
                    <button key={a.id} className={`art-pick ${tokenArtId === a.id ? 'active' : ''}`} title={a.name}
                      onClick={() => { setTokenArtId(a.id); setTokenKind(a.kind) }}>
                      <img src={a.image} alt="" />
                      <span>{a.name}</span>
                    </button>
                  ))}
                </div>
                <p className="hint">{tokenArtId ? lib.artById[tokenArtId]?.name : 'Pick a marker'} · doors snap onto tile connections (Alt to place freely) · Q rotates</p>
              </>
            )}
            <h4>{lib.art.length > 0 ? 'Generic tokens' : 'Token'}</h4>
            <div className="swatches">
              {TOKENS.map((t) => (
                <button key={t.kind} className={`swatch ${!tokenArtId && tokenKind === t.kind ? 'active' : ''}`} onClick={() => { setTokenKind(t.kind); setTokenArtId(null) }}>
                  <span className="chip token-chip" style={{ background: t.kind === 'event' ? '#f3e7cc' : t.kind === 'label' ? 'transparent' : t.color, color: t.kind === 'event' || t.kind === 'label' ? '#1a1a1a' : '#fff' }}>
                    {t.glyph}
                  </span>
                  {t.name}
                </button>
              ))}
            </div>
          </section>
        )}

        {selectedToken && (
          <section className="token-inspector">
            <h4>Selected: {(selectedToken.art && lib.artById[selectedToken.art]?.name) || tokenByKind[selectedToken.kind].name}</h4>
            {selectedToken.art && (
              <div className="row wrap">
                <button onClick={() => rotateToken(selectedToken.id, -1)} title="Shift+Q">⟲ Rotate</button>
                <button onClick={() => rotateToken(selectedToken.id, 1)} title="Q">⟳ Rotate</button>
              </div>
            )}
            <label>
              Type
              <select value={selectedToken.kind} onChange={(e) => updateToken(selectedToken.id, { kind: e.target.value as TokenKind })}>
                {TOKENS.map((t) => (
                  <option key={t.kind} value={t.kind}>{t.name}</option>
                ))}
              </select>
            </label>
            <label>
              {selectedToken.kind === 'event' ? 'Event number' : 'Label'}
              <input value={selectedToken.label} onChange={(e) => updateToken(selectedToken.id, { label: e.target.value }, false)}
                placeholder={selectedToken.kind === 'enemy' ? 'e.g. Orc warriors ×2' : ''} />
            </label>
            <label>
              Note
              <textarea rows={2} value={selectedToken.note} onChange={(e) => updateToken(selectedToken.id, { note: e.target.value }, false)} />
            </label>
            <button className="danger" onClick={() => deleteToken(selectedToken.id)}>Delete token</button>
          </section>
        )}

        <section>
          <h4>Map</h4>
          <div className="row">
            <label className="small">W<input type="number" min={4} max={60} value={sizeDraft.w} onChange={(e) => setSizeDraft({ ...sizeDraft, w: +e.target.value })} /></label>
            <label className="small">H<input type="number" min={4} max={60} value={sizeDraft.h} onChange={(e) => setSizeDraft({ ...sizeDraft, h: +e.target.value })} /></label>
            <button
              disabled={sizeDraft.w === map.width && sizeDraft.h === map.height}
              onClick={() => commit(resizeMap(map, Math.max(4, Math.min(60, sizeDraft.w)), Math.max(4, Math.min(60, sizeDraft.h))))}
            >
              Resize
            </button>
          </div>
          <label className="check"><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Grid</label>
          <label className="check"><input type="checkbox" checked={showTileNames} onChange={(e) => setShowTileNames(e.target.checked)} /> Tile names</label>
          <label className="check"><input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> Token labels</label>
          <div className="row wrap">
            <button onClick={() => commit(autoWalls(map))} title="Add walls along every border between painted and empty cells">Auto-walls</button>
            <button onClick={exportPng}>Export PNG</button>
            <button className="danger" onClick={() => commit(newMap(map.width, map.height))}>Clear</button>
          </div>
        </section>
      </aside>

      <div className="map-stage">
        <div className="map-toolbar">
          <button onClick={undo} title="Undo (Ctrl+Z)">↶ Undo</button>
          <button onClick={redo} title="Redo (Ctrl+Shift+Z)">↷ Redo</button>
          <span className="spacer" />
          <button onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(1)))}>−</button>
          <span className="zoom">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.2).toFixed(1)))}>+</button>
          <span className="coords">{hover && hover.x >= 0 && hover.y >= 0 && hover.x < map.width && hover.y < map.height ? `${String.fromCharCode(65 + (hover.x % 26))}${hover.y + 1}` : ''}</span>
        </div>
        {offTarget.length > 0 && (
          <div className="warn">
            Not in {targetLabel(target)}: <b>{offTarget.join(', ')}</b>. Players will need another box for these tiles.
          </div>
        )}
        <div className="map-scroll">
          <MapSvg
            ref={svgRef}
            className={`map-svg tool-${tool}`}
            map={map}
            idPrefix="ed"
            showGrid={showGrid}
            showLabels={showLabels}
            selectedTokenId={selected}
            selectedTileId={selectedTile}
            showTileNames={showTileNames}
            showJoints={tool === 'tile' || tool === 'select'}
            overlay={overlay}
            scale={zoom}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => setHover(null)}
          />
        </div>
        <TokenLegend map={map} selected={selected} onSelect={(id) => { selectToken(id); setTool('select') }} />
      </div>
    </div>
  )
}

function TokenLegend({ map, selected, onSelect }: { map: MapData; selected: string | null; onSelect: (id: string) => void }) {
  if (!map.tokens.length) return null
  const sorted = [...map.tokens].sort((a, b) => TOKENS.findIndex((t) => t.kind === a.kind) - TOKENS.findIndex((t) => t.kind === b.kind))
  return (
    <div className="token-legend">
      {sorted.map((t) => (
        <button key={t.id} className={t.id === selected ? 'active' : ''} onClick={() => onSelect(t.id)}>
          <b style={{ color: tokenByKind[t.kind].color === '#000000' ? undefined : tokenByKind[t.kind].color }}>{tokenByKind[t.kind].name}</b>
          {t.label && <> · {t.label}</>}
          <span className="muted"> ({String.fromCharCode(65 + (t.x % 26))}{t.y + 1})</span>
        </button>
      ))}
    </div>
  )
}
