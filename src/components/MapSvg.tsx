import { forwardRef, type PointerEventHandler, type ReactNode } from 'react'
import type { EdgeType, MapData, PlacedTile, TileDef, Token, TokenArt } from '../types'
import { footprint, terrainById, tokenAngle, tokenByKind, worldJoints } from '../data'
import { useTileLibrary } from '../tiles'

export const CELL = 48
/** Tokens and marker art are drawn at this fraction of their nominal size so they match the scale of markers printed on the tile art (the scroll on tile 1B is ~0.36 of the marker image) */
export const TOKEN_SCALE = 0.36
/** Plain placeholder tokens (letter glyphs) need to stay legible, so they shrink less */
const GENERIC_SCALE = 0.62

interface Props {
  map: MapData
  idPrefix: string
  showGrid?: boolean
  showLabels?: boolean
  selectedTokenId?: string | null
  selectedTileId?: string | null
  showTileNames?: boolean
  showJoints?: boolean
  overlay?: ReactNode
  className?: string
  onPointerDown?: PointerEventHandler<SVGSVGElement>
  onPointerMove?: PointerEventHandler<SVGSVGElement>
  onPointerUp?: PointerEventHandler<SVGSVGElement>
  onPointerLeave?: PointerEventHandler<SVGSVGElement>
  scale?: number
}

const PAD = 12

function TerrainPatterns({ p }: { p: string }) {
  return (
    <defs>
      <pattern id={`${p}-grass`} width="12" height="12" patternUnits="userSpaceOnUse">
        <rect width="12" height="12" fill={terrainById.grass.color} />
        <path d="M3 9 l1 -3 l1 3 M8 4 l1 -3 l1 3" stroke={terrainById.grass.accent} strokeWidth="1" fill="none" />
      </pattern>
      <pattern id={`${p}-forest`} width="24" height="24" patternUnits="userSpaceOnUse">
        <rect width="24" height="24" fill={terrainById.forest.color} />
        <circle cx="7" cy="8" r="5" fill={terrainById.forest.accent} />
        <circle cx="18" cy="17" r="5.5" fill={terrainById.forest.accent} />
      </pattern>
      <pattern id={`${p}-water`} width="24" height="12" patternUnits="userSpaceOnUse">
        <rect width="24" height="12" fill={terrainById.water.color} />
        <path d="M0 6 q6 -4 12 0 t12 0" stroke="#7fa8c6" strokeWidth="1.2" fill="none" opacity="0.7" />
      </pattern>
      <pattern id={`${p}-lava`} width="24" height="24" patternUnits="userSpaceOnUse">
        <rect width="24" height="24" fill={terrainById.lava.color} />
        <path d="M0 12 q6 -8 12 0 t12 0" stroke={terrainById.lava.accent} strokeWidth="3" fill="none" />
        <circle cx="6" cy="20" r="2" fill="#f5c04a" />
      </pattern>
      <pattern id={`${p}-rubble`} width="16" height="16" patternUnits="userSpaceOnUse">
        <rect width="16" height="16" fill={terrainById.rubble.color} />
        <path d="M2 4 l3 -2 l3 2 l-2 3 z M9 11 l4 -1 l1 4 l-4 1 z" fill={terrainById.rubble.accent} />
      </pattern>
      <pattern id={`${p}-stone`} width={CELL / 2} height={CELL / 2} patternUnits="userSpaceOnUse">
        <rect width={CELL / 2} height={CELL / 2} fill={terrainById.stone.color} />
        <rect x="1" y="1" width={CELL / 2 - 2} height={CELL / 2 - 2} fill="none" stroke={terrainById.stone.accent} strokeWidth="1" />
      </pattern>
      <pattern id={`${p}-wood`} width={CELL} height="12" patternUnits="userSpaceOnUse">
        <rect width={CELL} height="12" fill={terrainById.wood.color} />
        <path d={`M0 11.5 H${CELL} M${CELL / 3} 0 V12`} stroke={terrainById.wood.accent} strokeWidth="1" />
      </pattern>
      <pattern id={`${p}-sand`} width="10" height="10" patternUnits="userSpaceOnUse">
        <rect width="10" height="10" fill={terrainById.sand.color} />
        <circle cx="3" cy="3" r="0.8" fill={terrainById.sand.accent} />
        <circle cx="8" cy="7" r="0.8" fill={terrainById.sand.accent} />
      </pattern>
      <pattern id={`${p}-pit`} width="10" height="10" patternUnits="userSpaceOnUse">
        <rect width="10" height="10" fill={terrainById.pit.color} />
        <path d="M0 10 L10 0" stroke={terrainById.pit.accent} strokeWidth="1.5" />
      </pattern>
      <pattern id={`${p}-floor`} width={CELL} height={CELL} patternUnits="userSpaceOnUse">
        <rect width={CELL} height={CELL} fill={terrainById.floor.color} />
        <circle cx="12" cy="30" r="1.2" fill={terrainById.floor.accent} />
        <circle cx="34" cy="14" r="1" fill={terrainById.floor.accent} />
      </pattern>
    </defs>
  )
}

export function terrainFill(id: string, p: string) {
  return id === 'void' ? 'transparent' : `url(#${p}-${id})`
}

function Edge({ k, type }: { k: string; type: EdgeType }) {
  const m = k.match(/^([hv]):(\d+),(\d+)$/)
  if (!m) return null
  const [, dir, xs, ys] = m
  const x = +xs * CELL
  const y = +ys * CELL
  const [x2, y2] = dir === 'h' ? [x + CELL, y] : [x, y + CELL]
  const wall = '#2a221b'
  if (type === 'wall')
    return <line x1={x} y1={y} x2={x2} y2={y2} stroke={wall} strokeWidth={7} strokeLinecap="square" />
  if (type === 'secret')
    return (
      <g>
        <line x1={x} y1={y} x2={x2} y2={y2} stroke={wall} strokeWidth={7} strokeLinecap="square" />
        <line x1={x} y1={y} x2={x2} y2={y2} stroke="#d8c39a" strokeWidth={2} strokeDasharray="4 4" />
        <text x={(x + x2) / 2} y={(y + y2) / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#d8c39a" stroke={wall} strokeWidth={3} paintOrder="stroke">S</text>
      </g>
    )
  // door / locked
  const inset = CELL * 0.2
  const dw = CELL - inset * 2
  const isH = dir === 'h'
  return (
    <g>
      {isH ? (
        <>
          <line x1={x} y1={y} x2={x + inset} y2={y} stroke={wall} strokeWidth={7} />
          <line x1={x2 - inset} y1={y} x2={x2} y2={y} stroke={wall} strokeWidth={7} />
          <rect x={x + inset} y={y - 5} width={dw} height={10} fill="#7a4a22" stroke={wall} strokeWidth={1.5} />
        </>
      ) : (
        <>
          <line x1={x} y1={y} x2={x} y2={y + inset} stroke={wall} strokeWidth={7} />
          <line x1={x} y1={y2 - inset} x2={x} y2={y2} stroke={wall} strokeWidth={7} />
          <rect x={x - 5} y={y + inset} width={10} height={dw} fill="#7a4a22" stroke={wall} strokeWidth={1.5} />
        </>
      )}
      {type === 'locked' && (
        <circle cx={(x + x2) / 2} cy={(y + y2) / 2} r={4} fill="#d4a017" stroke={wall} strokeWidth={1.5} />
      )}
    </g>
  )
}

export function TileGraphic({
  def, tile, selected = false, showName = true, ghost = false,
}: { def: TileDef | undefined; tile: PlacedTile; selected?: boolean; showName?: boolean; ghost?: boolean }) {
  const d = def ?? { cols: 2, rows: 2, name: 'Missing tile', id: '' }
  const { w, h } = footprint(d, tile.rot)
  const cx = (tile.x + w / 2) * CELL
  const cy = (tile.y + h / 2) * CELL
  const iw = d.cols * CELL
  const ih = d.rows * CELL
  return (
    <g data-tile={ghost ? undefined : tile.id} opacity={ghost ? 0.6 : 1} pointerEvents={ghost ? 'none' : undefined}>
      <g transform={`translate(${cx} ${cy}) rotate(${tile.rot * 90})`}>
        {def?.image ? (
          <image href={def.image} x={-iw / 2} y={-ih / 2} width={iw} height={ih} preserveAspectRatio="none" />
        ) : (
          <rect x={-iw / 2} y={-ih / 2} width={iw} height={ih} fill={def ? '#d9c79f' : '#f3d6d0'}
            stroke={def ? '#8a7350' : '#b03a2e'} strokeWidth={2} strokeDasharray={def ? undefined : '8 5'} />
        )}
        {/* small arrow marks the tile's "up" edge so rotation is visible */}
        {!def?.image && <path d={`M${-8} ${-ih / 2 + 14} L0 ${-ih / 2 + 6} L8 ${-ih / 2 + 14}`} fill="none" stroke="#8a7350" strokeWidth={2} />}
      </g>
      {(showName || !def?.image) && (
        <text x={tile.x * CELL + 6} y={tile.y * CELL + 18} fontSize={def?.image ? 12 : 15} fontWeight="700"
          fontFamily="Cinzel, Georgia, serif" fill={def ? '#2a1f16' : '#b03a2e'} stroke="#f3e7cc" strokeWidth={3} paintOrder="stroke"
          pointerEvents="none">
          {d.name}
        </text>
      )}
      {selected && (
        <rect x={tile.x * CELL} y={tile.y * CELL} width={w * CELL} height={h * CELL} fill="none" stroke="#e0b04a"
          strokeWidth={4} strokeDasharray="10 6" pointerEvents="none" />
      )}
    </g>
  )
}

function TokenMark({ t, selected, showLabels, art }: { t: Token; selected: boolean; showLabels: boolean; art?: TokenArt }) {
  const def = tokenByKind[t.kind]
  const cx = t.x * CELL + CELL / 2
  const cy = t.y * CELL + CELL / 2
  const tip = [art?.name ?? def.name, t.label, t.note].filter(Boolean).join(' — ')
  if (art) {
    const w = art.w * CELL * TOKEN_SCALE
    const h = art.h * CELL * TOKEN_SCALE
    return (
      <g data-token={t.id} style={{ cursor: 'pointer' }}>
        <title>{tip}</title>
        <g transform={`translate(${cx} ${cy}) rotate(${tokenAngle(t)})`}>
          <image href={art.image} x={-w / 2} y={-h / 2} width={w} height={h} />
          {selected && <rect x={-w / 2 - 3} y={-h / 2 - 3} width={w + 6} height={h + 6} fill="none" stroke="#e0b04a" strokeWidth={3} strokeDasharray="6 4" />}
        </g>
        {showLabels && t.label && (
          <text x={cx} y={cy + Math.max(w, h) / 2 + 12} textAnchor="middle" fontSize="11" fontWeight="700" fontFamily="Georgia, serif"
            fill="#1b1410" stroke="#f3e7cc" strokeWidth={3} paintOrder="stroke" pointerEvents="none">
            {t.label}
          </text>
        )}
      </g>
    )
  }
  if (t.kind === 'label') {
    return (
      <g data-token={t.id} style={{ cursor: 'pointer' }}>
        <title>{tip}</title>
        <text x={cx} y={cy + 5} textAnchor="middle" fontSize="14" fontWeight="700" fontFamily="Cinzel, Georgia, serif"
          fill="#1b1410" stroke="#f3e7cc" strokeWidth={4} paintOrder="stroke">
          {t.label || 'Label'}
        </text>
        {selected && <rect x={t.x * CELL + 2} y={t.y * CELL + 2} width={CELL - 4} height={CELL - 4} fill="none" stroke="#e0b04a" strokeWidth={2} strokeDasharray="4 3" />}
      </g>
    )
  }
  const r = (t.kind === 'boss' ? CELL * 0.42 : CELL * 0.34) * GENERIC_SCALE
  const glyph = t.kind === 'event' && t.label ? t.label.slice(0, 3) : def.glyph
  return (
    <g data-token={t.id} style={{ cursor: 'pointer' }}>
      <title>{tip}</title>
      {selected && <circle cx={cx} cy={cy} r={r + 5} fill="none" stroke="#e0b04a" strokeWidth={3} />}
      {t.kind === 'pillar' ? (
        <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={4} fill={def.color} stroke="#120d0a" strokeWidth={2} />
      ) : t.kind === 'event' ? (
        <path d={`M${cx} ${cy - r} L${cx + r} ${cy} L${cx} ${cy + r} L${cx - r} ${cy} Z`} fill="#f3e7cc" stroke="#1a1a1a" strokeWidth={2.5} />
      ) : (
        <circle cx={cx} cy={cy} r={r} fill={def.color} stroke="#120d0a" strokeWidth={2} />
      )}
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize={(glyph.length > 1 ? 12 : 15) * Math.max(GENERIC_SCALE, 0.7)} fontWeight="700"
        fontFamily="Georgia, serif" fill={t.kind === 'event' ? '#1a1a1a' : '#fff'}>
        {glyph}
      </text>
      {showLabels && t.label && t.kind !== 'event' && (
        <text x={cx} y={t.y * CELL + CELL + 2} textAnchor="middle" fontSize="10" fontWeight="600" fontFamily="Georgia, serif"
          fill="#1b1410" stroke="#f3e7cc" strokeWidth={3} paintOrder="stroke">
          {t.label}
        </text>
      )}
    </g>
  )
}

export const MapSvg = forwardRef<SVGSVGElement, Props>(function MapSvg(
  { map, idPrefix, showGrid = true, showLabels = true, selectedTokenId, selectedTileId, showTileNames = false, showJoints = false, overlay, className, scale = 1, ...handlers },
  ref,
) {
  const { byId, artById } = useTileLibrary()
  const W = map.width * CELL
  const H = map.height * CELL
  return (
    <svg
      ref={ref}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${-PAD} ${-PAD} ${W + PAD * 2} ${H + PAD * 2}`}
      width={(W + PAD * 2) * scale}
      height={(H + PAD * 2) * scale}
      {...handlers}
    >
      <TerrainPatterns p={idPrefix} />
      <rect x={-PAD} y={-PAD} width={W + PAD * 2} height={H + PAD * 2} fill="#efe3c8" />
      {/* game tiles */}
      <g>
        {(map.tiles ?? []).map((t) => (
          <TileGraphic key={t.id} def={byId[t.tileId]} tile={t} selected={t.id === selectedTileId} showName={showTileNames} />
        ))}
      </g>
      {showJoints && (
        <g data-overlay pointerEvents="none">
          {(map.tiles ?? []).flatMap((t) =>
            byId[t.tileId]
              ? worldJoints(byId[t.tileId], t).map(([x, y], i) => (
                  <circle key={`${t.id}-${i}`} cx={x * CELL} cy={y * CELL} r={5} fill="#e0b04a" stroke="#2a1f16" strokeWidth={1.5} opacity={0.85} />
                ))
              : [],
          )}
        </g>
      )}
      {/* terrain */}
      <g>
        {map.cells.map((t, i) =>
          t === 'void' ? null : (
            <rect key={i} x={(i % map.width) * CELL} y={Math.floor(i / map.width) * CELL} width={CELL + 0.5} height={CELL + 0.5}
              fill={terrainFill(t, idPrefix)} />
          ),
        )}
      </g>
      {/* grid */}
      {showGrid && (
        <g stroke="#3b2f24" strokeOpacity={0.18} strokeWidth={1}>
          {Array.from({ length: map.width + 1 }, (_, x) => (
            <line key={`gx${x}`} x1={x * CELL} y1={0} x2={x * CELL} y2={H} />
          ))}
          {Array.from({ length: map.height + 1 }, (_, y) => (
            <line key={`gy${y}`} x1={0} y1={y * CELL} x2={W} y2={y * CELL} />
          ))}
        </g>
      )}
      {/* walls & doors: walls first so doors sit on top */}
      <g>
        {Object.entries(map.edges)
          .sort(([, a], [, b]) => (a === 'wall' ? 0 : 1) - (b === 'wall' ? 0 : 1))
          .map(([k, v]) => (
            <Edge key={k} k={k} type={v} />
          ))}
      </g>
      <g>
        {map.tokens.map((t) => (
          <TokenMark key={t.id} t={t} selected={t.id === selectedTokenId} showLabels={showLabels} art={t.art ? artById[t.art] : undefined} />
        ))}
      </g>
      {overlay}
    </svg>
  )
})

