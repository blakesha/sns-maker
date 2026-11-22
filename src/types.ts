export type TerrainId =
  | 'void'
  | 'floor'
  | 'stone'
  | 'wood'
  | 'grass'
  | 'forest'
  | 'sand'
  | 'water'
  | 'lava'
  | 'rubble'
  | 'pit'

export type EdgeType = 'wall' | 'door' | 'locked' | 'secret'

export type TokenKind =
  | 'hero'
  | 'enemy'
  | 'boss'
  | 'npc'
  | 'chest'
  | 'portal'
  | 'trap'
  | 'objective'
  | 'event'
  | 'key'
  | 'altar'
  | 'exit'
  | 'pillar'
  | 'door'
  | 'marker'
  | 'label'

export interface Token {
  id: string
  kind: TokenKind
  x: number
  y: number
  label: string
  note: string
  /** TokenArt id: draw this image instead of the generic marker */
  art?: string
  /** quarter turns clockwise (art tokens); legacy, superseded by `angle` */
  rot?: number
  /** degrees clockwise, any multiple of 45 (art tokens) */
  angle?: number
}

/** An enemy from the user's own copy of the game: card art per rank colour, optional round portrait */
export interface EnemyArt {
  id: string
  name: string
  /** G / B / R / P -> card image */
  ranks: Record<string, string>
  portrait: string | null
}

export interface QuestEnemy {
  id: string
  /** EnemyArt id, or '' for a custom enemy */
  enemy: string
  name: string
  rank: string
  count: number
  note: string
}

/** Marker artwork from the user's own copy of the game (stored only in the browser) */
export interface TokenArt {
  id: string
  name: string
  kind: TokenKind
  /** size in map squares */
  w: number
  h: number
  image: string
}

/** A map tile in the user's library (image is their own scan/photo; optional) */
export interface TileDef {
  id: string
  name: string
  /** footprint in grid squares, before rotation */
  cols: number
  rows: number
  image?: string
  /** Tiles sharing a group are two sides of one physical tile, so they share a size */
  group?: string
  /** Connection points (jigsaw tab/notch), in map squares relative to the tile centre, unrotated */
  joints?: [number, number][]
  /** Release id (see releases.ts) the physical tile comes from */
  release?: string
}

export interface Target {
  /** core box id */
  release: string
  /** expansion ids */
  expansions: string[]
}

export interface PlacedTile {
  id: string
  tileId: string
  /** top-left grid cell of the rotated footprint */
  x: number
  y: number
  /** quarter turns clockwise, 0-3 */
  rot: number
}

export interface MapData {
  width: number
  height: number
  /** Game tiles, drawn beneath terrain paint, walls and tokens */
  tiles: PlacedTile[]
  /** Row-major terrain ids, length width * height */
  cells: TerrainId[]
  /** Edge key -> edge type. Keys: "v:x,y" = left edge of cell (x,y); "h:x,y" = top edge of cell (x,y) */
  edges: Record<string, EdgeType>
  tokens: Token[]
}

export interface QuestEvent {
  id: string
  trigger: string
  text: string
}

export interface Quest {
  id: string
  title: string
  difficulty: 'Easy' | 'Normal' | 'Hard' | 'Deadly'
  players: string
  intro: string
  objectives: string[]
  setup: string
  specialRules: string
  events: QuestEvent[]
  rewards: string
  success: string
  failure: string
  nextOnSuccess: string
  nextOnFailure: string
  enemies?: QuestEnemy[]
  /** Overrides the campaign's target release when set */
  target?: Target
  map: MapData
}

export interface Campaign {
  id: string
  name: string
  synopsis: string
  notes: string
  target: Target
  quests: Quest[]
  createdAt: number
  updatedAt: number
}
