import type { Campaign, MapData, Quest, TerrainId, TokenKind } from './types'
import { cleanTarget } from './releases'

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

export const TERRAINS: { id: TerrainId; name: string; color: string; accent: string }[] = [
  { id: 'void', name: 'Empty', color: 'transparent', accent: 'transparent' },
  { id: 'floor', name: 'Dungeon floor', color: '#b9a582', accent: '#a8936e' },
  { id: 'stone', name: 'Flagstone', color: '#8e8d88', accent: '#7a7974' },
  { id: 'wood', name: 'Wood planks', color: '#9a6b3f', accent: '#82572f' },
  { id: 'grass', name: 'Grass', color: '#7c9a4f', accent: '#6a8741' },
  { id: 'forest', name: 'Forest', color: '#4d6b35', accent: '#3b5627' },
  { id: 'sand', name: 'Sand', color: '#d6bf86', accent: '#c4ab6f' },
  { id: 'water', name: 'Water', color: '#4f7fa3', accent: '#406d8f' },
  { id: 'lava', name: 'Lava', color: '#c9532b', accent: '#e8823c' },
  { id: 'rubble', name: 'Rubble (difficult)', color: '#75685a', accent: '#5b5045' },
  { id: 'pit', name: 'Pit / chasm', color: '#1e1a17', accent: '#2f2924' },
]

export const terrainById = Object.fromEntries(TERRAINS.map((t) => [t.id, t])) as Record<
  TerrainId,
  (typeof TERRAINS)[number]
>

export const TOKENS: { kind: TokenKind; name: string; glyph: string; color: string }[] = [
  { kind: 'hero', name: 'Hero start', glyph: 'H', color: '#2f6fb5' },
  { kind: 'enemy', name: 'Enemy', glyph: 'E', color: '#a12a2a' },
  { kind: 'boss', name: 'Boss', glyph: 'B', color: '#5e1414' },
  { kind: 'npc', name: 'NPC', glyph: 'N', color: '#3d8a6b' },
  { kind: 'chest', name: 'Chest', glyph: 'C', color: '#b8861b' },
  { kind: 'portal', name: 'Soul portal', glyph: 'P', color: '#7b4bb3' },
  { kind: 'trap', name: 'Trap', glyph: 'T', color: '#d0681c' },
  { kind: 'objective', name: 'Objective', glyph: '★', color: '#d9a400' },
  { kind: 'event', name: 'Event marker', glyph: '!', color: '#1a1a1a' },
  { kind: 'key', name: 'Key', glyph: 'K', color: '#8c7a2a' },
  { kind: 'altar', name: 'Altar', glyph: 'A', color: '#6b6b8c' },
  { kind: 'exit', name: 'Exit / stairs', glyph: 'X', color: '#2c5e3a' },
  { kind: 'pillar', name: 'Pillar / obstacle', glyph: '■', color: '#4a4540' },
  { kind: 'door', name: 'Door', glyph: 'D', color: '#7a4a22' },
  { kind: 'marker', name: 'Marker', glyph: '◆', color: '#5a5a5a' },
  { kind: 'label', name: 'Area label', glyph: 'Aa', color: '#000000' },
]

export const tokenByKind = Object.fromEntries(TOKENS.map((t) => [t.kind, t])) as Record<
  TokenKind,
  (typeof TOKENS)[number]
>

export function newMap(width = 16, height = 12, fill: TerrainId = 'void'): MapData {
  return { width, height, tiles: [], cells: Array(width * height).fill(fill), edges: {}, tokens: [] }
}

export function resizeMap(map: MapData, width: number, height: number): MapData {
  const cells: TerrainId[] = []
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      cells.push(x < map.width && y < map.height ? map.cells[y * map.width + x] : 'void')
  const edges: MapData['edges'] = {}
  for (const [k, v] of Object.entries(map.edges)) {
    const [, xs, ys] = k.match(/^[hv]:(\d+),(\d+)$/) ?? []
    if (+xs <= width && +ys <= height) edges[k] = v
  }
  return {
    width,
    height,
    cells,
    edges,
    tiles: (map.tiles ?? []).filter((t) => t.x < width && t.y < height),
    tokens: map.tokens.filter((t) => t.x < width && t.y < height),
  }
}

/** Footprint (w,h) of a tile after rotation */
export function footprint(def: { cols: number; rows: number }, rot: number) {
  return rot % 2 ? { w: def.rows, h: def.cols } : { w: def.cols, h: def.rows }
}

/** Rotate an offset by quarter turns clockwise (screen coordinates, y down) */
export function rotateOffset([x, y]: [number, number], rot: number): [number, number] {
  switch (((rot % 4) + 4) % 4) {
    case 1: return [-y, x]
    case 2: return [-x, -y]
    case 3: return [y, -x]
    default: return [x, y]
  }
}

/** Joint positions of a placed tile in map squares */
export function worldJoints(def: { cols: number; rows: number; joints?: [number, number][] }, t: { x: number; y: number; rot: number }) {
  const f = footprint(def, t.rot)
  const cx = t.x + f.w / 2
  const cy = t.y + f.h / 2
  return (def.joints ?? []).map((j) => {
    const [dx, dy] = rotateOffset(j, t.rot)
    return [cx + dx, cy + dy] as [number, number]
  })
}

/** Fill in fields added in later versions so old saves keep working */
export function migrateCampaign(c: Campaign): Campaign {
  return { ...c, target: cleanTarget(c.target), quests: c.quests.map((q) => ({ ...q, target: q.target && cleanTarget(q.target), map: { ...q.map, tiles: q.map.tiles ?? [] } })) }
}

export function newQuest(title = 'New Quest'): Quest {
  return {
    id: uid(),
    title,
    difficulty: 'Normal',
    players: '1–5',
    intro: '',
    objectives: [''],
    setup: '',
    specialRules: '',
    events: [],
    rewards: '',
    success: '',
    failure: '',
    nextOnSuccess: '',
    nextOnFailure: '',
    map: newMap(),
  }
}

export function newCampaign(name = 'New Campaign'): Campaign {
  const now = Date.now()
  return { id: uid(), name, synopsis: '', notes: '', target: { release: 'is', expansions: [] }, quests: [newQuest('Quest 1')], createdAt: now, updatedAt: now }
}

/** A small starter campaign so the app isn't empty on first launch. */
export function sampleCampaign(): Campaign {
  const c = newCampaign('The Drowned Crypt')
  c.synopsis =
    'A plague of restless dead spills from a flooded crypt beneath the fishing village of Gullhaven. The heroes must descend, find the source, and seal it.'
  const q = c.quests[0]
  q.title = 'Below the Chapel'
  q.intro =
    'The chapel floor has split open. Cold sea-air rises from the dark, carrying the clatter of old bones. The villagers watch from a distance as you light your torches and descend.'
  q.objectives = ['Reach the altar and read the inscription.', 'Escape through the sea-gate with all heroes alive.']
  q.setup = 'Place heroes on the H markers. Place 2 skeleton warriors on each E marker in the first chamber.'
  q.specialRules = 'Flooded areas (water) cost 2 movement points to enter.'
  q.events = [
    { id: uid(), trigger: 'A hero opens the locked door', text: 'The water level rises. All heroes in water areas suffer 1 wound.' },
    { id: uid(), trigger: 'A hero reads the inscription at the altar', text: 'The Drowned Priest awakens. Place the boss on the B marker.' },
  ]
  q.rewards = 'Each hero draws 1 treasure card. The party gains the Sea-Gate Key.'
  q.success = 'The sea-gate grinds shut behind you, but the inscription spoke of a second crypt…'
  q.failure = 'The tide claims the crypt. Gullhaven must be abandoned.'
  const m = newMap(14, 10)
  const paint = (x0: number, y0: number, x1: number, y1: number, t: TerrainId) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m.cells[y * m.width + x] = t
  }
  paint(1, 1, 5, 5, 'stone')
  paint(6, 3, 8, 4, 'floor')
  paint(9, 1, 12, 8, 'floor')
  paint(10, 5, 12, 8, 'water')
  paint(2, 6, 4, 8, 'floor')
  // room walls
  const box = (x0: number, y0: number, x1: number, y1: number) => {
    for (let x = x0; x <= x1; x++) {
      m.edges[`h:${x},${y0}`] = 'wall'
      m.edges[`h:${x},${y1 + 1}`] = 'wall'
    }
    for (let y = y0; y <= y1; y++) {
      m.edges[`v:${x0},${y}`] = 'wall'
      m.edges[`v:${x1 + 1},${y}`] = 'wall'
    }
  }
  box(1, 1, 5, 5)
  box(9, 1, 12, 8)
  box(2, 6, 4, 8)
  for (let x = 6; x <= 8; x++) {
    m.edges[`h:${x},3`] = 'wall'
    m.edges[`h:${x},5`] = 'wall'
  }
  m.edges['v:6,3'] = 'door'
  delete m.edges['v:6,4']
  m.edges['v:9,3'] = 'locked'
  delete m.edges['v:9,4']
  m.edges['h:3,6'] = 'secret'
  m.tokens = [
    { id: uid(), kind: 'hero', x: 2, y: 2, label: '', note: '' },
    { id: uid(), kind: 'hero', x: 3, y: 2, label: '', note: '' },
    { id: uid(), kind: 'enemy', x: 4, y: 4, label: 'Skeletons ×2', note: '' },
    { id: uid(), kind: 'enemy', x: 10, y: 2, label: 'Skeletons ×2', note: '' },
    { id: uid(), kind: 'event', x: 8, y: 3, label: '1', note: 'Locked door' },
    { id: uid(), kind: 'altar', x: 11, y: 1, label: '', note: 'Inscription' },
    { id: uid(), kind: 'event', x: 12, y: 2, label: '2', note: '' },
    { id: uid(), kind: 'boss', x: 11, y: 6, label: 'Drowned Priest', note: '' },
    { id: uid(), kind: 'exit', x: 12, y: 8, label: 'Sea-gate', note: '' },
    { id: uid(), kind: 'chest', x: 3, y: 8, label: '', note: 'Hidden cache' },
    { id: uid(), kind: 'label', x: 2, y: 4, label: 'Chapel undercroft', note: '' },
  ]
  q.map = m
  return c
}
