import { useCallback, useEffect, useRef, useState } from 'react'
import type { Campaign, Quest, TileDef } from './types'
import { migrateCampaign, newCampaign, newQuest, uid } from './data'
import { downloadText, slug, useCampaigns } from './store'
import { QuestEditor } from './components/QuestEditor'
import { QuestSheet } from './components/QuestSheet'
import { MapSvg } from './components/MapSvg'
import { TileLibrary } from './components/TileLibrary'
import { useTileLibrary } from './tiles'
import { TargetPicker } from './components/TargetPicker'
import { Play } from './play/Play'
import { onDiskStatus, type DiskStatus } from './disk'
import { targetLabel } from './releases'

type View = { campaignId: string | null; questId: string | null; book?: boolean; library?: boolean; play?: boolean }

function normalizeCampaign(raw: unknown): Campaign | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Campaign
  if (typeof c.name !== 'string' || !Array.isArray(c.quests)) return null
  // fresh ids avoid collisions with existing campaigns
  const idMap = new Map<string, string>()
  const quests = c.quests.map((q) => {
    const id = uid()
    idMap.set(q.id, id)
    return { ...newQuest(), ...q, id }
  })
  for (const q of quests) {
    q.nextOnSuccess = idMap.get(q.nextOnSuccess) ?? ''
    q.nextOnFailure = idMap.get(q.nextOnFailure) ?? ''
  }
  return migrateCampaign({ ...newCampaign(), ...c, id: uid(), quests, updatedAt: Date.now() })
}

export default function App() {
  const { campaigns, setCampaigns, updateCampaign } = useCampaigns()
  const tileLib = useTileLibrary()

  // Use the game's own textures for the app chrome when the art pack is loaded
  useEffect(() => {
    const root = document.documentElement.style
    const set = (v: string, name: string) =>
      tileLib.ui[name] ? root.setProperty(v, `url(${tileLib.ui[name]})`) : root.removeProperty(v)
    set('--art-parch', 'bkg_Pergamena')
    set('--art-suede', 'bkg_Suede')
    set('--art-wood', 'bkg_Wood')
  }, [tileLib.ui])
  const [view, setView] = useState<View>(() => ({ campaignId: campaigns[0]?.id ?? null, questId: null }))
  const fileRef = useRef<HTMLInputElement>(null)

  const campaign = campaigns.find((c) => c.id === view.campaignId) ?? null
  const quest = campaign?.quests.find((q) => q.id === view.questId) ?? null

  const addCampaign = () => {
    const c = newCampaign()
    setCampaigns((cs) => [...cs, c])
    setView({ campaignId: c.id, questId: null })
  }

  const deleteCampaign = (c: Campaign) => {
    if (!confirm(`Delete campaign "${c.name}" and all its quests? This cannot be undone.`)) return
    setCampaigns((cs) => cs.filter((x) => x.id !== c.id))
    setView({ campaignId: null, questId: null })
  }

  const addQuest = () => {
    if (!campaign) return
    const q = newQuest(`Quest ${campaign.quests.length + 1}`)
    updateCampaign(campaign.id, (c) => ({ ...c, quests: [...c.quests, q] }))
    setView({ campaignId: campaign.id, questId: q.id })
  }

  const duplicateQuest = (q: Quest) => {
    if (!campaign) return
    const copy: Quest = { ...structuredClone(q), id: uid(), title: `${q.title} (copy)` }
    updateCampaign(campaign.id, (c) => {
      const i = c.quests.findIndex((x) => x.id === q.id)
      const quests = [...c.quests]
      quests.splice(i + 1, 0, copy)
      return { ...c, quests }
    })
    setView({ campaignId: campaign.id, questId: copy.id })
  }

  const deleteQuest = (q: Quest) => {
    if (!campaign || !confirm(`Delete quest "${q.title}"?`)) return
    updateCampaign(campaign.id, (c) => ({
      ...c,
      quests: c.quests
        .filter((x) => x.id !== q.id)
        .map((x) => ({
          ...x,
          nextOnSuccess: x.nextOnSuccess === q.id ? '' : x.nextOnSuccess,
          nextOnFailure: x.nextOnFailure === q.id ? '' : x.nextOnFailure,
        })),
    }))
    setView({ campaignId: campaign.id, questId: null })
  }

  const moveQuest = (q: Quest, dir: -1 | 1) => {
    if (!campaign) return
    updateCampaign(campaign.id, (c) => {
      const i = c.quests.findIndex((x) => x.id === q.id)
      const j = i + dir
      if (j < 0 || j >= c.quests.length) return c
      const quests = [...c.quests]
      ;[quests[i], quests[j]] = [quests[j], quests[i]]
      return { ...c, quests }
    })
  }

  const campaignId = campaign?.id
  const onQuestChange = useCallback(
    (q: Quest) => {
      if (!campaignId) return
      updateCampaign(campaignId, (c) => ({ ...c, quests: c.quests.map((x) => (x.id === q.id ? q : x)) }))
    },
    [campaignId, updateCampaign],
  )

  const importFile = async (f: File) => {
    try {
      const parsed = JSON.parse(await f.text())
      // campaign exports carry the tile definitions they use
      const tileDefs: TileDef[] = (Array.isArray(parsed) ? parsed : [parsed]).flatMap((c) => c?.tileLibrary ?? [])
      const missing = tileDefs.filter((t) => t?.id && !tileLib.byId[t.id])
      if (missing.length) tileLib.upsert(missing)
      const list = (Array.isArray(parsed) ? parsed : [parsed]).map(normalizeCampaign).filter(Boolean) as Campaign[]
      if (!list.length) throw new Error('No campaigns found in file')
      setCampaigns((cs) => [...cs, ...list])
      setView({ campaignId: list[0].id, questId: null })
    } catch (e) {
      alert(`Could not import: ${(e as Error).message}`)
    }
  }

  return (
    <div className="app">
      <aside className="sidebar no-print">
        <div className="brand">
          {tileLib.ui.champion ? <img className="sigil-img" src={tileLib.ui.champion} alt="" /> : <span className="sigil">⚔</span>}
          <div>
            <div className="brand-name">Quest Forge</div>
            <div className="brand-sub">Campaign &amp; map maker</div>
          </div>
        </div>

        <button className={`lib-link play-link ${view.play ? 'active' : ''}`} onClick={() => setView({ campaignId: null, questId: null, play: true })}>
          {tileLib.ui.champion ? <img src={tileLib.ui.champion} alt="" /> : '⚔'} Play
        </button>
        <button className={`lib-link ${view.library ? 'active' : ''}`} onClick={() => setView({ campaignId: null, questId: null, library: true })}>
          ▦ Tile Library <span className="count">{tileLib.tiles.length}</span>
        </button>

        <div className="side-section">
          <div className="side-head">
            <h3>Campaigns</h3>
            <div>
              <button className="mini" onClick={() => fileRef.current?.click()} title="Import campaign JSON">Import</button>
              <button className="mini" onClick={addCampaign}>+ New</button>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = '' }} />
          <ul className="nav-list">
            {campaigns.map((c) => (
              <li key={c.id}>
                <button className={c.id === view.campaignId && !view.questId ? 'active' : c.id === view.campaignId ? 'open' : ''}
                  onClick={() => setView({ campaignId: c.id, questId: null })}>
                  {c.name || 'Untitled'}
                  <span className="count">{c.quests.length}</span>
                </button>
                {c.id === view.campaignId && (
                  <ul className="quest-list">
                    {c.quests.map((q, i) => (
                      <li key={q.id}>
                        <button className={q.id === view.questId ? 'active' : ''} onClick={() => setView({ campaignId: c.id, questId: q.id })}>
                          <span className="qnum">{i + 1}</span> {q.title || 'Untitled'}
                        </button>
                      </li>
                    ))}
                    <li>
                      <button className="ghost add" onClick={addQuest}>+ Add quest</button>
                    </li>
                  </ul>
                )}
              </li>
            ))}
          </ul>
          {campaigns.length === 0 && <p className="muted pad">No campaigns yet. Create one to begin.</p>}
        </div>
        <SaveStatus />
      </aside>

      <main className={`main ${view.play ? 'main-play' : ''}`}>
        {view.library && <TileLibrary />}
        {view.play && <Play campaigns={campaigns} onOpenQuest={(campaignId, questId) => setView({ campaignId, questId })} />}

        {!campaign && !view.library && !view.play && (
          <div className="empty">
            <h2>Forge your first campaign</h2>
            <p>Write quests, chain them into a campaign, and draw tile maps with walls, doors, enemies and events.</p>
            <button onClick={addCampaign}>+ New campaign</button>
          </div>
        )}

        {campaign && quest && (
          <>
            <div className="crumbs no-print">
              <button className="link" onClick={() => setView({ campaignId: campaign.id, questId: null })}>{campaign.name}</button>
              <span>/</span>
              <span>{quest.title}</span>
              <span className="spacer" />
              <button className="mini" onClick={() => moveQuest(quest, -1)} title="Move earlier">↑</button>
              <button className="mini" onClick={() => moveQuest(quest, 1)} title="Move later">↓</button>
              <button className="mini" onClick={() => duplicateQuest(quest)}>Duplicate</button>
              <button className="mini danger" onClick={() => deleteQuest(quest)}>Delete</button>
            </div>
            <QuestEditor key={quest.id} campaign={campaign} quest={quest} onChange={onQuestChange}
              onOpenLibrary={() => setView({ campaignId: null, questId: null, library: true })} />
          </>
        )}

        {campaign && !quest && !view.book && (
          <CampaignOverview
            campaign={campaign}
            onChange={(patch) => updateCampaign(campaign.id, (c) => ({ ...c, ...patch }))}
            onOpenQuest={(id) => setView({ campaignId: campaign.id, questId: id })}
            onAddQuest={addQuest}
            onMove={moveQuest}
            onExport={() => {
              const used = new Set(campaign.quests.flatMap((q) => q.map.tiles.map((t) => t.tileId)))
              // names and sizes only: tile artwork stays in this browser
              const tileLibrary = tileLib.tiles.filter((t) => used.has(t.id)).map((t) => ({ ...t, image: undefined }))
              downloadText(`${slug(campaign.name)}.campaign.json`, JSON.stringify({ ...campaign, tileLibrary }, null, 2))
            }}
            onDelete={() => deleteCampaign(campaign)}
            onBook={() => setView({ campaignId: campaign.id, questId: null, book: true })}
          />
        )}

        {campaign && !quest && view.book && (
          <div className="sheet-wrap">
            <div className="sheet-actions no-print">
              <button className="link" onClick={() => setView({ campaignId: campaign.id, questId: null })}>← Back to campaign</button>
              <span className="spacer" />
              <button onClick={() => window.print()}>Print / Save as PDF</button>
            </div>
            <div className="print-area book">
              <article className="quest-sheet cover">
                <div className="eyebrow">A campaign</div>
                <h1>{campaign.name}</h1>
                {campaign.synopsis.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
                <h2>Quests</h2>
                <ol>{campaign.quests.map((q) => <li key={q.id}>{q.title}</li>)}</ol>
              </article>
              {campaign.quests.map((q, i) => (
                <QuestSheet key={q.id} quest={q} campaign={campaign} index={i} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function CampaignOverview({
  campaign, onChange, onOpenQuest, onAddQuest, onMove, onExport, onDelete, onBook,
}: {
  campaign: Campaign
  onChange: (patch: Partial<Campaign>) => void
  onOpenQuest: (id: string) => void
  onAddQuest: () => void
  onMove: (q: Quest, dir: -1 | 1) => void
  onExport: () => void
  onDelete: () => void
  onBook: () => void
}) {
  const title = (id: string) => campaign.quests.find((q) => q.id === id)?.title
  return (
    <div className="overview">
      <div className="overview-head">
        <input className="title-input" value={campaign.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="Campaign name" />
        <div className="row">
          <button onClick={onBook}>Campaign book</button>
          <button onClick={onExport}>Export JSON</button>
          <button className="danger" onClick={onDelete}>Delete</button>
        </div>
      </div>

      <div className="target-box">
        <TargetPicker value={campaign.target} onChange={(target) => onChange({ target })} />
        <p className="hint">Quests use this release unless they set their own. The map editor only offers tiles from these boxes.</p>
      </div>

      <div className="overview-grid">
        <label className="field">
          <span className="field-label">Synopsis</span>
          <textarea rows={5} value={campaign.synopsis} onChange={(e) => onChange({ synopsis: e.target.value })}
            placeholder="What is this campaign about? Who is the villain? What's at stake?" />
        </label>
        <label className="field">
          <span className="field-label">GM / campaign notes <span className="muted">— not printed</span></span>
          <textarea rows={5} value={campaign.notes} onChange={(e) => onChange({ notes: e.target.value })}
            placeholder="Party progress, recurring NPCs, house rules, loot tracker…" />
        </label>
      </div>

      <div className="side-head">
        <h3>Quests</h3>
        <button onClick={onAddQuest}>+ Add quest</button>
      </div>
      <div className="quest-cards">
        {campaign.quests.map((q, i) => (
          <div key={q.id} className="quest-card" onClick={() => onOpenQuest(q.id)}>
            <div className="thumb">
              <MapSvg map={q.map} idPrefix={`t-${q.id.slice(0, 6)}`} showGrid={false} showLabels={false} className="thumb-svg" />
            </div>
            <div className="qc-body">
              <div className="qc-title"><span className="qnum">{i + 1}</span> {q.title || 'Untitled'}</div>
              <div className="muted small-text">
                {q.difficulty} · {q.objectives.filter((o) => o.trim()).length} objectives · {q.events.length} events · {q.map.tokens.length} tokens
              </div>
              {q.target && <div className="small-text release-tag">{targetLabel(q.target)}</div>}
              {(title(q.nextOnSuccess) || title(q.nextOnFailure)) && (
                <div className="branches small-text">
                  {title(q.nextOnSuccess) && <span className="win">Victory → {title(q.nextOnSuccess)}</span>}
                  {title(q.nextOnFailure) && <span className="loss">Defeat → {title(q.nextOnFailure)}</span>}
                </div>
              )}
            </div>
            <div className="qc-move" onClick={(e) => e.stopPropagation()}>
              <button className="mini" onClick={() => onMove(q, -1)} disabled={i === 0}>↑</button>
              <button className="mini" onClick={() => onMove(q, 1)} disabled={i === campaign.quests.length - 1}>↓</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SaveStatus() {
  const [st, setSt] = useState<DiskStatus>('browser')
  useEffect(() => onDiskStatus(setSt), [])
  const text = {
    browser: 'Saved in this browser only. Run with npm run dev to save into the project folder.',
    saving: 'Saving to project folder…',
    saved: 'Saved to project folder (data/ and local-assets/).',
    error: 'Could not save to the project folder. Is npm run dev still running?',
  }[st]
  return <p className={`side-foot muted save-${st}`}>{text}</p>
}
