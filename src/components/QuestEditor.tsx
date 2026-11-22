import { useCallback, useRef, useState } from 'react'
import type { Campaign, MapData, Quest } from '../types'
import { uid } from '../data'
import { MapEditor } from './MapEditor'
import { QuestSheet } from './QuestSheet'
import { TargetPicker } from './TargetPicker'
import { EnemyRoster } from './EnemyRoster'
import { questTarget } from '../releases'

interface Props {
  campaign: Campaign
  quest: Quest
  onChange: (q: Quest) => void
  onOpenLibrary: () => void
}

type Tab = 'story' | 'map' | 'sheet'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint && <span className="muted"> — {hint}</span>}
      </span>
      {children}
    </label>
  )
}

export function QuestEditor({ campaign, quest, onChange, onOpenLibrary }: Props) {
  const [tab, setTab] = useState<Tab>('story')
  const set = <K extends keyof Quest>(k: K, v: Quest[K]) => onChange({ ...quest, [k]: v })
  const index = campaign.quests.findIndex((q) => q.id === quest.id)
  // Stable callback so MapEditor's undo history stays coherent
  const questRef = useRef(quest)
  questRef.current = quest
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onMap = useCallback((map: MapData) => onChangeRef.current({ ...questRef.current, map }), [])

  return (
    <div className="quest-editor">
      <div className="quest-head">
        <input className="title-input" value={quest.title} onChange={(e) => set('title', e.target.value)} placeholder="Quest title" />
        <nav className="tabs">
          <button className={tab === 'story' ? 'active' : ''} onClick={() => setTab('story')}>Story &amp; Rules</button>
          <button className={tab === 'map' ? 'active' : ''} onClick={() => setTab('map')}>Map</button>
          <button className={tab === 'sheet' ? 'active' : ''} onClick={() => setTab('sheet')}>Quest Sheet</button>
        </nav>
      </div>

      {tab === 'story' && (
        <div className="story-grid">
          <div className="col">
            <div className="target-box">
              <label className="check-line">
                <input type="checkbox" checked={!quest.target}
                  onChange={(e) => set('target', e.target.checked ? undefined : { ...campaign.target, expansions: [...campaign.target.expansions] })} />
                Use the campaign's release
              </label>
              <TargetPicker value={questTarget(campaign, quest)} disabled={!quest.target} onChange={(t) => set('target', t)} />
            </div>
            <div className="row">
              <Field label="Difficulty">
                <select value={quest.difficulty} onChange={(e) => set('difficulty', e.target.value as Quest['difficulty'])}>
                  {['Easy', 'Normal', 'Hard', 'Deadly'].map((d) => <option key={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="Heroes">
                <input value={quest.players} onChange={(e) => set('players', e.target.value)} placeholder="e.g. 2–5" />
              </Field>
            </div>
            <Field label="Introduction" hint="read aloud">
              <textarea rows={6} value={quest.intro} onChange={(e) => set('intro', e.target.value)} placeholder="Set the scene…" />
            </Field>

            <div className="field">
              <span className="field-label">Objectives</span>
              {quest.objectives.map((o, i) => (
                <div className="row" key={i}>
                  <input value={o} onChange={(e) => set('objectives', quest.objectives.map((x, j) => (j === i ? e.target.value : x)))}
                    placeholder={`Objective ${i + 1}`} />
                  <button className="icon" title="Remove" onClick={() => set('objectives', quest.objectives.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
              <button className="ghost" onClick={() => set('objectives', [...quest.objectives, ''])}>+ Add objective</button>
            </div>

            <Field label="Setup" hint="tiles, starting positions, enemy groups">
              <textarea rows={4} value={quest.setup} onChange={(e) => set('setup', e.target.value)} />
            </Field>
            <Field label="Special rules">
              <textarea rows={4} value={quest.specialRules} onChange={(e) => set('specialRules', e.target.value)} />
            </Field>
          </div>

          <div className="col">
            <EnemyRoster value={quest.enemies ?? []} onChange={(v) => set('enemies', v)} />

            <div className="field">
              <span className="field-label">
                Events <span className="muted">— number them to match ! markers on the map</span>
              </span>
              {quest.events.map((ev, i) => (
                <div className="event-card" key={ev.id}>
                  <div className="row">
                    <span className="event-num">{i + 1}</span>
                    <input value={ev.trigger} placeholder="Trigger — e.g. When a hero enters the crypt"
                      onChange={(e) => set('events', quest.events.map((x) => (x.id === ev.id ? { ...x, trigger: e.target.value } : x)))} />
                    <button className="icon" title="Remove" onClick={() => set('events', quest.events.filter((x) => x.id !== ev.id))}>✕</button>
                  </div>
                  <textarea rows={3} value={ev.text} placeholder="What happens…"
                    onChange={(e) => set('events', quest.events.map((x) => (x.id === ev.id ? { ...x, text: e.target.value } : x)))} />
                </div>
              ))}
              <button className="ghost" onClick={() => set('events', [...quest.events, { id: uid(), trigger: '', text: '' }])}>+ Add event</button>
            </div>

            <Field label="Rewards">
              <textarea rows={3} value={quest.rewards} onChange={(e) => set('rewards', e.target.value)} />
            </Field>
            <Field label="Victory" hint="epilogue on success">
              <textarea rows={3} value={quest.success} onChange={(e) => set('success', e.target.value)} />
            </Field>
            <Field label="On victory, continue to">
              <select value={quest.nextOnSuccess} onChange={(e) => set('nextOnSuccess', e.target.value)}>
                <option value="">— (next in order / end)</option>
                {campaign.quests.filter((q) => q.id !== quest.id).map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}
              </select>
            </Field>
            <Field label="Defeat" hint="epilogue on failure">
              <textarea rows={3} value={quest.failure} onChange={(e) => set('failure', e.target.value)} />
            </Field>
            <Field label="On defeat, continue to">
              <select value={quest.nextOnFailure} onChange={(e) => set('nextOnFailure', e.target.value)}>
                <option value="">— (replay / end)</option>
                {campaign.quests.filter((q) => q.id !== quest.id).map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}
              </select>
            </Field>
          </div>
        </div>
      )}

      {tab === 'map' && <MapEditor key={quest.id} map={quest.map} name={quest.title} onChange={onMap} onOpenLibrary={onOpenLibrary}
          target={questTarget(campaign, quest)} />}

      {tab === 'sheet' && (
        <div className="sheet-wrap">
          <div className="sheet-actions no-print">
            <button onClick={() => window.print()}>Print / Save as PDF</button>
          </div>
          <div className="print-area">
            <QuestSheet quest={quest} campaign={campaign} index={index} />
          </div>
        </div>
      )}
    </div>
  )
}
