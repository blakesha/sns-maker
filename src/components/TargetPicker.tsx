import type { Target } from '../types'
import { CORE_RELEASES, expansionAllowed, expansionsFor, type Release } from '../releases'

export function TargetPicker({ value, onChange, disabled }: { value: Target; onChange: (t: Target) => void; disabled?: boolean }) {
  const { saga, compatible } = expansionsFor(value.release)
  const toggle = (id: string) =>
    onChange({
      ...value,
      expansions: value.expansions.includes(id) ? value.expansions.filter((e) => e !== id) : [...value.expansions, id],
    })
  const chip = (r: Release) => (
    <label key={r.id} className={`chip-check ${value.expansions.includes(r.id) ? 'on' : ''}`}>
      <input type="checkbox" disabled={disabled} checked={value.expansions.includes(r.id)} onChange={() => toggle(r.id)} />
      {r.name}
    </label>
  )
  return (
    <div className={`target-picker ${disabled ? 'disabled' : ''}`}>
      <label className="field">
        <span className="field-label">Core box</span>
        <select
          value={value.release}
          disabled={disabled}
          // switching core box drops expansions that don't belong to it
          onChange={(e) => onChange({ release: e.target.value, expansions: value.expansions.filter((x) => expansionAllowed(e.target.value, x)) })}
        >
          {CORE_RELEASES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </label>
      <div className="field">
        <span className="field-label">Expansions</span>
        <div className="chips">
          {saga.length ? saga.map(chip) : <span className="muted small-text">No expansions for this box yet.</span>}
        </div>
        {compatible.length > 0 && (
          <>
            <span className="field-label sub">Also playable with this box</span>
            <div className="chips">{compatible.map(chip)}</div>
          </>
        )}
      </div>
    </div>
  )
}
