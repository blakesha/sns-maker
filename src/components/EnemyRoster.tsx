import { useState } from 'react'
import type { EnemyArt, QuestEnemy } from '../types'
import { uid } from '../data'
import { useTileLibrary } from '../tiles'

export const RANKS: { id: string; name: string; color: string }[] = [
  { id: 'G', name: 'Green', color: '#3f8a3a' },
  { id: 'B', name: 'Blue', color: '#2f6fb5' },
  { id: 'R', name: 'Red', color: '#a12a2a' },
  { id: 'P', name: 'Purple (master)', color: '#6b3fa0' },
]
const rankBy = Object.fromEntries(RANKS.map((r) => [r.id, r]))

/** Rank badge: the game's wax seal when available, otherwise a coloured dot */
export function RankSeal({ rank, size = 22 }: { rank: string; size?: number }) {
  const { ui } = useTileLibrary()
  const img = ui[`Wax_${rank}`]
  const r = rankBy[rank]
  if (img) return <img src={img} alt={r?.name ?? rank} title={r?.name} width={size} height={size} className="seal" />
  return <span className="seal dot" title={r?.name} style={{ width: size, height: size, background: r?.color ?? '#777' }}>{rank}</span>
}

export function EnemyFace({ e, rank, size = 40 }: { e: EnemyArt | undefined; rank?: string; size?: number }) {
  const src = e?.portrait ?? (e && rank ? e.ranks[rank] : undefined) ?? (e ? Object.values(e.ranks)[0] : undefined)
  return src ? (
    <img src={src} alt="" width={size} height={size} className={`enemy-face ${e?.portrait ? '' : 'card-crop'}`} />
  ) : (
    <span className="enemy-face blank" style={{ width: size, height: size }}>☠</span>
  )
}

export function EnemyRoster({ value, onChange }: { value: QuestEnemy[]; onChange: (v: QuestEnemy[]) => void }) {
  const { enemies, enemyById } = useTileLibrary()
  const [picking, setPicking] = useState(false)
  const [preview, setPreview] = useState<{ e: EnemyArt; rank: string } | null>(null)
  const [q, setQ] = useState('')
  const [custom, setCustom] = useState('')

  const add = (e: EnemyArt | null, rank: string, name = e?.name ?? '') => {
    onChange([...value, { id: uid(), enemy: e?.id ?? '', name, rank, count: 1, note: '' }])
    setPicking(false)
    setPreview(null)
  }
  const patch = (id: string, p: Partial<QuestEnemy>) => onChange(value.map((x) => (x.id === id ? { ...x, ...p } : x)))

  return (
    <div className="field">
      <span className="field-label">Enemies</span>
      {value.map((x) => {
        const e = enemyById[x.enemy]
        return (
          <div className="enemy-row" key={x.id}>
            <button className="icon-btn" onClick={() => e && setPreview({ e, rank: x.rank })} title={e ? 'Show card' : ''}>
              <EnemyFace e={e} rank={x.rank} />
            </button>
            <div className="enemy-main">
              <input value={x.name} onChange={(ev) => patch(x.id, { name: ev.target.value })} />
              <input className="enemy-note" value={x.note} placeholder="Where / when (e.g. spawn at S1, event 2)"
                onChange={(ev) => patch(x.id, { note: ev.target.value })} />
            </div>
            <div className="rank-pick">
              {RANKS.filter((r) => !e || e.ranks[r.id]).map((r) => (
                <button key={r.id} className={`seal-btn ${x.rank === r.id ? 'on' : ''}`} onClick={() => patch(x.id, { rank: r.id })}>
                  <RankSeal rank={r.id} size={20} />
                </button>
              ))}
            </div>
            <div className="mini-step">
              <button onClick={() => patch(x.id, { count: Math.max(1, x.count - 1) })}>−</button>
              <b>×{x.count}</b>
              <button onClick={() => patch(x.id, { count: x.count + 1 })}>+</button>
            </div>
            <button className="icon" title="Remove" onClick={() => onChange(value.filter((y) => y.id !== x.id))}>✕</button>
          </div>
        )
      })}
      <button className="ghost" onClick={() => setPicking(true)}>+ Add enemy</button>

      {picking && (
        <div className="modal-ov" onClick={(ev) => ev.target === ev.currentTarget && setPicking(false)}>
          <div className="modal wide">
            <div className="modal-head">
              <h3>Add an enemy</h3>
              <input placeholder="Search…" value={q} autoFocus onChange={(ev) => setQ(ev.target.value)} />
              <button className="icon" onClick={() => setPicking(false)}>✕</button>
            </div>
            {enemies.length === 0 && (
              <p className="hint">Import <code>sns-quest-editor-art.json</code> in the Tile Library to pick from the game's enemy cards.</p>
            )}
            <div className="enemy-grid">
              {enemies
                .filter((e) => e.name.toLowerCase().includes(q.toLowerCase()))
                .map((e) => (
                  <div key={e.id} className="enemy-pick">
                    <EnemyFace e={e} size={64} />
                    <b>{e.name}</b>
                    <div className="row">
                      {RANKS.filter((r) => e.ranks[r.id]).map((r) => (
                        <button key={r.id} className="seal-btn" title={`Add ${r.name}`} onClick={() => add(e, r.id)}>
                          <RankSeal rank={r.id} size={26} />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
            <div className="row custom-enemy">
              <input placeholder="Or a custom enemy name" value={custom} onChange={(ev) => setCustom(ev.target.value)} />
              <button disabled={!custom.trim()} onClick={() => { add(null, 'G', custom.trim()); setCustom('') }}>Add</button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="modal-ov" onClick={() => setPreview(null)}>
          <img className="card-preview" src={preview.e.ranks[preview.rank] ?? Object.values(preview.e.ranks)[0]} alt={preview.e.name} />
        </div>
      )}
    </div>
  )
}
