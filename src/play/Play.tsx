import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Campaign, EnemyArt, Quest } from '../types'
import { useTileLibrary } from '../tiles'
import { downloadText } from '../store'
import { questTarget, targetLabel } from '../releases'
import { MapSvg } from '../components/MapSvg'
import { EnemyFace, RankSeal } from '../components/EnemyRoster'
import { CATN, FORMS, FORM_CARDS, TM, TOK, hasBack } from './catalog'
import {
  type Card, type CardTok, type Game, type Hero, type PlayState,
  catalogue, mkCard, mkHero, nameOf, normalize, placeInHero, placeToken, uid, usePlayState,
} from './state'

type Loc = { k: 'char' | 'main' | 'sec' | 'armor' | 'art' | 'skills' | 'inv' | 'stash'; i?: number }
type Sheet =
  | { t: 'newgame' }
  | { t: 'rename' }
  | { t: 'confirm'; title: string; msg: string; label?: string; run: () => void }
  | { t: 'pick'; slot: string; title: string; cats: string[] }
  | { t: 'card'; loc: Loc }
  | { t: 'renameCard'; loc: Loc }
  | { t: 'tokens' }
  | { t: 'moveto'; loc: Loc }
  | { t: 'backup' }
  | { t: 'enemy'; src: string }

const CAT_COLOR: Record<string, string> = {
  characters: '#d4a24c', weapons: '#c75d45', armors: '#6a9cc6', artefacts: '#a37fc4', skills: '#79ad72',
  inventory: '#c9a878', companions: '#5fb0a6', special: '#9a9a9a',
}

/** Card art extracted from the official companion app (see scripts/extract_companion_cards.py), keyed by catalog id. */
function cardArt(ui: Record<string, string>, id: string, flipped?: boolean) {
  return (flipped && ui[`card:${id}:back`]) || ui[`card:${id}`]
}

function getCard(g: Game | undefined, h: Hero | undefined, loc: Loc): Card | null {
  if (!g) return null
  switch (loc.k) {
    case 'char': return h?.card ?? null
    case 'main': return h?.main ?? null
    case 'sec': return h?.sec ?? null
    case 'armor': return h?.armor ?? null
    case 'art': return h?.art ?? null
    case 'skills': return h?.skills[loc.i!] ?? null
    case 'inv': return h?.inv[loc.i!] ?? null
    case 'stash': return g.stash[loc.i!] ?? null
  }
}
function takeCard(g: Game, h: Hero | undefined, loc: Loc) {
  switch (loc.k) {
    case 'main': h!.main = null; break
    case 'sec': h!.sec = null; break
    case 'armor': h!.armor = null; break
    case 'art': h!.art = null; break
    case 'skills': h!.skills.splice(loc.i!, 1); break
    case 'inv': h!.inv.splice(loc.i!, 1); break
    case 'stash': g.stash.splice(loc.i!, 1); break
  }
}

/** Quest that follows `q` for a result, honouring the quest's branch settings */
function nextQuest(c: Campaign, q: Quest, result: 'won' | 'lost'): Quest | undefined {
  if (result === 'won') {
    if (q.nextOnSuccess) return c.quests.find((x) => x.id === q.nextOnSuccess)
    return c.quests[c.quests.findIndex((x) => x.id === q.id) + 1]
  }
  if (q.nextOnFailure) return c.quests.find((x) => x.id === q.nextOnFailure)
  return q // replay
}

type Nav = { v: 'home' | 'game' | 'hero'; gid?: string; ci?: number }
interface PlayCtxT {
  S: PlayState
  ui: Record<string, string>
  enemyById: Record<string, EnemyArt>
  game: Game | undefined
  hero: Hero | undefined
  nav: Nav
  edit: (fn: (g: Game, h: Hero | undefined, S: PlayState) => void) => void
  mutate: (fn: (d: PlayState) => void) => void
  replace: (s: PlayState) => void
  sheet: Sheet | null
  setSheet: (s: Sheet | null) => void
  go: (n: Nav) => void
  toast: (m: string) => void
  campaigns: Campaign[]
  onOpenQuest: (campaignId: string, questId: string) => void
}
const PlayCtx = createContext<PlayCtxT | null>(null)
const usePlay = () => useContext(PlayCtx)!

export function Play({ campaigns, onOpenQuest }: { campaigns: Campaign[]; onOpenQuest: (campaignId: string, questId: string) => void }) {
  const { S, mutate, replace } = usePlayState()
  const { ui, enemyById } = useTileLibrary()
  const [nav, setNav] = useState<Nav>({ v: 'home' })
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [toastMsg, setToastMsg] = useState('')
  const toastT = useRef<number | undefined>(undefined)
  const toast = (m: string) => {
    setToastMsg(m)
    window.clearTimeout(toastT.current)
    toastT.current = window.setTimeout(() => setToastMsg(''), 2600)
  }

  const game = S.games.find((g) => g.id === nav.gid)
  const hero = game && nav.ci != null ? game.chars[nav.ci] : undefined

  /** Edit the current game / hero inside a mutation */
  const edit = (fn: (g: Game, h: Hero | undefined, S: PlayState) => void) =>
    mutate((d) => {
      const g = d.games.find((x) => x.id === nav.gid)
      if (!g) return
      fn(g, nav.ci != null ? g.chars[nav.ci] : undefined, d)
    })

  const go = (n: Nav) => {
    setNav(n)
    setSheet(null)
    window.scrollTo(0, 0)
  }

  const style = useMemo(
    () => ({
      ...(ui.bkg_Pergamena ? { ['--art-parch' as string]: `url(${ui.bkg_Pergamena})` } : {}),
      ...(ui.bkg_Suede ? { ['--art-suede' as string]: `url(${ui.bkg_Suede})` } : {}),
    }),
    [ui],
  )

  const ctx: PlayCtxT = { S, ui, game, hero, nav, edit, mutate, replace, setSheet, sheet, go, toast, campaigns, onOpenQuest, enemyById }

  let body: ReactNode
  if (nav.v === 'hero' && game && hero) body = <HeroView />
  else if (nav.v !== 'home' && game) body = <GameView />
  else body = <Home />

  return (
    <PlayCtx.Provider value={ctx}>
      <div className="play" style={style}>
        {body}
        {sheet && <SheetView />}
        {toastMsg && <div className="play-toast">{toastMsg}</div>}
      </div>
    </PlayCtx.Provider>
  )

}

/** Notes save on blur so typing doesn't re-render the whole view per keystroke */
function NotesBox({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value)
  return <textarea className="pin" rows={4} placeholder="Quest log, party notes…" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} />
}

/* ================= views ================= */

function Top({ title, back }: { title: string; back?: () => void }) {
  return (
    <header className="play-top">
      {back && <button className="pbtn ic" onClick={back} aria-label="Back">‹</button>}
      <h1>{title}</h1>
    </header>
  )
}

function Section({ icon, title, right, children }: { icon?: string; title: string; right?: ReactNode; children: ReactNode }) {
  const { ui } = usePlay()
  return (
    <section className="pcard">
      <h2>
        <span className="pcard-title">{icon && ui[icon] && <img src={ui[icon]} alt="" />}{title}</span>
        {right && <span className="row">{right}</span>}
      </h2>
      {children}
    </section>
  )
}

function Stepper({ value, onSet, min = 0 }: { value: number; onSet: (n: number) => void; min?: number }) {
  const clamp = (n: number) => Math.max(min, Math.min(9999, Math.round(n)))
  return (
    <div className="stp">
      <button onClick={() => onSet(clamp(value - 1))} aria-label="decrease">−</button>
      <input type="number" inputMode="numeric" value={value} onChange={(e) => isFinite(+e.target.value) && onSet(clamp(+e.target.value))} />
      <button onClick={() => onSet(clamp(value + 1))} aria-label="increase">+</button>
    </div>
  )
}

function TokChip({ x }: { x: CardTok }) {
  const d = TM[x.t]
  if (!d) return null
  return <span className="pchip on">{d.i} {d.l}{x.c !== 1 && ` ×${x.c}`}</span>
}

function CardTile({ card, loc, extra }: { card: Card; loc: Loc; extra?: string }) {
  const { S, ui, setSheet } = usePlay()
  const art = cardArt(ui, card.id, card.flipped)
  return (
    <button className={`ptile${art ? ' withart' : ''}`} style={{ borderLeftColor: CAT_COLOR[card.cat] }} onClick={() => setSheet({ t: 'card', loc })}>
      {art && <img className="ptile-art" src={art} alt="" />}
      <div className="ptile-body">
        <b>
          {nameOf(S, card.cat, card.id)}
          {card.counters > 0 && <span className="pbadge">{card.counters}</span>}
        </b>
        {(card.flipped || extra) && <small>{[card.flipped && 'flipped', extra].filter(Boolean).join(' · ')}</small>}
        {card.tokens.length > 0 && <span className="pchips">{card.tokens.map((t, i) => <TokChip key={i} x={t} />)}</span>}
      </div>
    </button>
  )
}

function Home() {
  const { S, ui, mutate, setSheet, go, campaigns } = usePlay()
  return (
    <>
      <div className="play-hero" style={ui.bkg ? { backgroundImage: `url(${ui.bkg})` } : undefined}>
        <div>
          <h1>Play</h1>
          <p>Track heroes, gear, skills and status effects. Link a game to a campaign to follow its quests.</p>
        </div>
      </div>
      <div className="row">
        <button className="pbtn pri grow" onClick={() => setSheet({ t: 'newgame' })}>+ New game</button>
        <button className="pbtn" onClick={() => setSheet({ t: 'backup' })}>Backup</button>
      </div>
      {S.games.length === 0 ? (
        <div className="pempty">No games yet.<br />Create one, or restore a backup from the Sword &amp; Sorcery Companion.</div>
      ) : (
        <div className="plist" style={{ marginTop: 12 }}>
          {S.games.map((g) => {
            const c = campaigns.find((x) => x.id === g.campaignId)
            const q = c?.quests.find((x) => x.id === g.questId)
            return (
              <button key={g.id} className="ptile game" onClick={() => go({ v: 'game', gid: g.id })}>
                <b>{g.name}</b>
                <small>
                  {g.chars.length} hero{g.chars.length === 1 ? '' : 'es'}
                  {c && ` · ${c.name}`}
                  {c && (q ? ` · ${q.title}` : ' · complete')}
                  {g.created && ` · started ${g.created}`}
                </small>
              </button>
            )
          })}
        </div>
      )}
      <Section title="Limits">
        <div className="grid2">
          <div><p className="plbl">Skill slots</p><Stepper min={1} value={S.settings.maxSkills} onSet={(n) => mutate((d) => void (d.settings.maxSkills = n))} /></div>
          <div><p className="plbl">Inventory slots</p><Stepper min={1} value={S.settings.maxInv} onSet={(n) => mutate((d) => void (d.settings.maxInv = n))} /></div>
        </div>
        <p className="pnote">Set these to match your edition. They apply to every character.</p>
      </Section>
    </>
  )
}

function QuestPanel({ g }: { g: Game }) {
  const { edit, toast, campaigns, onOpenQuest } = usePlay()
  const c = campaigns.find((x) => x.id === g.campaignId)
  if (!c) return null
  const q = c.quests.find((x) => x.id === g.questId)
  const qi = q ? c.quests.indexOf(q) : -1
  const finish = (result: 'won' | 'lost') => {
    if (!q) return
    const next = nextQuest(c, q, result)
    edit((d) => {
      d.log = [...(d.log ?? []), { questId: q.id, title: q.title, result, date: new Date().toISOString().slice(0, 10) }]
      d.questId = next?.id
    })
    toast(result === 'won' ? (next ? `Victory! Next: ${next.title}` : 'Victory! Campaign complete.') : next === q ? 'Defeat. Try the quest again.' : `Defeat. Next: ${next?.title}`)
  }
  return (
    <Section icon="quest" title={c.name} right={
      <select className="psel" value={g.questId ?? ''} onChange={(e) => edit((d) => void (d.questId = e.target.value || undefined))}>
        {c.quests.map((x, i) => <option key={x.id} value={x.id}>{i + 1}. {x.title}</option>)}
        <option value="">Campaign complete</option>
      </select>
    }>
      {!q ? (
        <div className="pempty">🏆 Campaign complete!</div>
      ) : (
        <>
          <div className="quest-now">
            <button className="quest-map" onClick={() => onOpenQuest(c.id, q.id)} title="Open in the quest editor">
              <MapSvg map={q.map} idPrefix={`pl-${q.id.slice(0, 6)}`} showGrid={false} showLabels={false} className="thumb-svg" />
            </button>
            <div>
              <div className="quest-title">Quest {qi + 1}: {q.title}</div>
              <div className="pmute">{q.difficulty} · {targetLabel(questTarget(c, q))}</div>
              {q.objectives.some((o) => o.trim()) && (
                <ul className="pobj">{q.objectives.filter((o) => o.trim()).map((o, i) => <li key={i}>{o}</li>)}</ul>
              )}
            </div>
          </div>
          {q.intro.trim() && (
            <details className="pdetails"><summary>Introduction</summary><p className="intro-text">{q.intro}</p></details>
          )}
          {(q.enemies?.length ?? 0) > 0 && <EnemyStrip q={q} />}
          {q.events.length > 0 && (
            <details className="pdetails">
              <summary>Events ({q.events.length})</summary>
              <ol>{q.events.map((ev) => <li key={ev.id}>{ev.trigger && <b>{ev.trigger}: </b>}{ev.text}</li>)}</ol>
            </details>
          )}
          {q.specialRules.trim() && (
            <details className="pdetails"><summary>Special rules</summary><p>{q.specialRules}</p></details>
          )}
          <div className="row" style={{ marginTop: 10 }}>
            <button className="pbtn win grow" onClick={() => finish('won')}>Victory</button>
            <button className="pbtn loss grow" onClick={() => finish('lost')}>Defeat</button>
          </div>
        </>
      )}
      {(g.log?.length ?? 0) > 0 && (
        <details className="pdetails">
          <summary>Quest log ({g.log!.length})</summary>
          <ul className="plog">
            {g.log!.map((l, i) => (
              <li key={i} className={l.result}>{l.result === 'won' ? '✔' : '✘'} {l.title} <span className="pmute">{l.date}</span></li>
            ))}
          </ul>
        </details>
      )}
    </Section>
  )
}

function EnemyStrip({ q }: { q: Quest }) {
  const { setSheet, enemyById } = usePlay()
  return (
    <div className="enemy-strip">
      {q.enemies!.map((x) => {
        const e = enemyById[x.enemy]
        const card = e?.ranks[x.rank]
        return (
          <button key={x.id} className="enemy-chip" onClick={() => card && setSheet({ t: 'enemy', src: card })} title={x.note}>
            <EnemyFace e={e} rank={x.rank} size={34} />
            <RankSeal rank={x.rank} size={18} />
            <span>{x.name} ×{x.count}</span>
          </button>
        )
      })}
    </div>
  )
}

function GameView() {
  const { S, ui, game, edit, mutate, setSheet, go } = usePlay()
  const g = game!
  return (
    <>
      <Top title={g.name} back={() => go({ v: 'home' })} />
      <QuestPanel g={g} />
      <Section title="Soul points pool">
        <div className="soul-row">
          {ui.Soul_Neutral && <img src={ui.Soul_Neutral} alt="" className="soul-wing" />}
          <Stepper value={g.soul} onSet={(n) => edit((d) => void (d.soul = n))} />
          {ui.Soul_Neutral && <img src={ui.Soul_Neutral} alt="" className="soul-wing flip" />}
        </div>
      </Section>
      <Section icon="champion" title="Heroes" right={<>
        {g.chars.length > 1 && (
          <button className="pbtn sm" onClick={() => edit((d) => {
            const n = d.chars.length
            const cur = d.chars.findIndex((c) => c.turn)
            let k = cur
            for (let s = 1; s <= n; s++) {
              const j = (cur + s + n) % n
              if (d.chars[j].alive) { k = j; break }
            }
            d.chars.forEach((c, i) => (c.turn = i === k))
          })}>Next turn ▶</button>
        )}
        <button className="pbtn sm pri" onClick={() => setSheet({ t: 'pick', slot: 'char', title: 'Add a hero', cats: ['characters'] })}>+ Add</button>
      </>}>
        {g.chars.length === 0 ? <div className="pempty">No heroes yet.</div> : (
          <div className="plist">
            {g.chars.map((c, i) => {
              const art = cardArt(ui, c.card.id)
              return (
                <div key={i} className={c.alive ? '' : 'fallen'}>
                  <button className={`ptile hero${art ? ' withart' : ''} ${c.turn ? 'turn' : ''}`} onClick={() => go({ v: 'hero', gid: g.id, ci: i })}>
                    {art && <img className="ptile-art" src={art} alt="" />}
                    <div className="ptile-body">
                      <b>{c.turn && '▶ '}{nameOf(S, 'characters', c.card.id)}</b>
                      <small>{c.alive ? '' : 'fallen · '}damage {c.dmg} · shield {c.shield} · gold {c.gold} · rank {c.rank}</small>
                      {c.tokens.length > 0 && <span className="pchips">{c.tokens.map((t, j) => <TokChip key={j} x={t} />)}</span>}
                    </div>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </Section>
      <Section icon="ico_BasicInfos" title="Stash" right={
        <button className="pbtn sm" onClick={() => setSheet({ t: 'pick', slot: 'stash', title: 'Add to stash', cats: ['weapons', 'armors', 'artefacts', 'skills', 'inventory', 'companions'] })}>+ Add card</button>
      }>
        {g.stash.length ? <div className="plist">{g.stash.map((c, i) => <CardTile key={i} card={c} loc={{ k: 'stash', i }} />)}</div>
          : <div className="pmute">Shared storage for cards not on a hero.</div>}
      </Section>
      <Section icon="ico_SpecialRules" title="Notes">
        <NotesBox value={g.notes} onSave={(v) => edit((d) => void (d.notes = v))} />
      </Section>
      <div className="row wrap">
        <button className="pbtn sm" onClick={() => setSheet({ t: 'rename' })}>Rename / campaign</button>
        <button className="pbtn sm dng" onClick={() => setSheet({
          t: 'confirm', title: 'Delete this game?', msg: `All heroes, cards and notes in “${g.name}” will be removed.`,
          run: () => { mutate((d) => void (d.games = d.games.filter((x) => x.id !== g.id))); go({ v: 'home' }) },
        })}>Delete game</button>
      </div>
    </>
  )
}

function HeroView() {
  const { S, game, hero, nav, edit, setSheet, go, toast } = usePlay()
  const g = game!
  const c = hero!
  const slot = (card: Card | null, k: Loc['k'], label: string, cat: string) => (
    <div>
      <p className="plbl">{label}</p>
      {card ? <CardTile card={card} loc={{ k }} /> : (
        <button className="ptile empty" onClick={() => setSheet({ t: 'pick', slot: k, title: 'Choose a card', cats: [cat] })}>+ Choose</button>
      )}
    </div>
  )
  return (
    <div className={c.alive ? '' : 'fallen'}>
      <Top title={nameOf(S, 'characters', c.card.id)} back={() => go({ v: 'game', gid: g.id })} />
      <Section icon="champion" title="Hero">
        <div className="plist"><CardTile card={c.card} loc={{ k: 'char' }} extra={hasBack('characters', c.card.id) ? 'tap to flip side' : ''} /></div>
        <p className="plbl" style={{ marginTop: 10 }}>Form</p>
        <select className="psel full" value={c.form} onChange={(e) => edit((_, h) => void (h!.form = +e.target.value))}>
          {FORMS.map((f, i) => <option key={i} value={i}>{f}</option>)}
        </select>
        {FORM_CARDS[c.form] && (
          <div className="pchips" style={{ marginTop: 8 }}>
            {FORM_CARDS[c.form].map((id) => <span key={id} className="pchip">{nameOf(S, 'special', id)}</span>)}
          </div>
        )}
      </Section>
      <Section title="Status">
        <div className="grid2">
          <div><p className="plbl">Damage</p><Stepper value={c.dmg} onSet={(n) => edit((_, h) => void (h!.dmg = n))} /></div>
          <div><p className="plbl">Magic shield</p><Stepper value={c.shield} onSet={(n) => edit((_, h) => void (h!.shield = n))} /></div>
          <div><p className="plbl">Gold</p><Stepper value={c.gold} onSet={(n) => edit((_, h) => void (h!.gold = n))} /></div>
          <div><p className="plbl">Soul rank</p><Stepper value={c.rank} onSet={(n) => edit((_, h) => void (h!.rank = n))} /></div>
        </div>
        <div className="grid2" style={{ marginTop: 10 }}>
          <button className={`tog ${c.turn ? 'on' : ''}`} onClick={() => edit((d, h) => {
            h!.turn = !h!.turn
            if (h!.turn) d.chars.forEach((o) => o !== h && (o.turn = false))
          })}><span>Active turn</span><i /></button>
          <button className={`tog ${c.alive ? '' : 'on'}`} onClick={() => edit((_, h) => void (h!.alive = !h!.alive))}><span>Fallen</span><i /></button>
        </div>
      </Section>
      <Section title="Status effects" right={<button className="pbtn sm" onClick={() => setSheet({ t: 'tokens' })}>Edit</button>}>
        {c.tokens.length ? <div className="pchips">{c.tokens.map((t, i) => <TokChip key={i} x={t} />)}</div> : <div className="pmute">None active.</div>}
      </Section>
      <Section icon="ico_Deck" title="Equipment">
        <div className="grid2">
          {slot(c.main, 'main', 'Main hand', 'weapons')}
          {slot(c.sec, 'sec', 'Off hand', 'weapons')}
          {slot(c.armor, 'armor', 'Armour', 'armors')}
          {slot(c.art, 'art', 'Artefact', 'artefacts')}
        </div>
      </Section>
      <Section icon="ico_StoryEvents" title={`Skills ${c.skills.length}/${S.settings.maxSkills}`} right={
        <button className="pbtn sm" onClick={() => c.skills.length >= S.settings.maxSkills ? toast('Skill slots are full') : setSheet({ t: 'pick', slot: 'skills', title: 'Add a skill', cats: ['skills'] })}>+ Add</button>
      }>
        {c.skills.length ? <div className="plist">{c.skills.map((k, i) => <CardTile key={i} card={k} loc={{ k: 'skills', i }} />)}</div> : <div className="pmute">No skills.</div>}
      </Section>
      <Section icon="ico_BasicInfos" title={`Inventory ${c.inv.length}/${S.settings.maxInv}`} right={
        <button className="pbtn sm" onClick={() => c.inv.length >= S.settings.maxInv ? toast('Inventory is full') : setSheet({ t: 'pick', slot: 'inv', title: 'Add to inventory', cats: ['inventory', 'companions'] })}>+ Add</button>
      }>
        {c.inv.length ? <div className="plist">{c.inv.map((k, i) => <CardTile key={i} card={k} loc={{ k: 'inv', i }} />)}</div> : <div className="pmute">Empty.</div>}
      </Section>
      <button className="pbtn sm dng" onClick={() => setSheet({
        t: 'confirm', title: 'Remove hero?', msg: 'This removes the hero and everything they carry.', label: 'Remove',
        run: () => { edit((d) => void d.chars.splice(nav.ci!, 1)); go({ v: 'game', gid: g.id }) },
      })}>Remove hero from game</button>
    </div>
  )
}

/* ================= sheets ================= */

function SheetView() {
  const { S, game, hero, edit, setSheet, sheet, toast } = usePlay()
  const close = () => setSheet(null)
  const s = sheet!
  let inner: ReactNode = null
  if (s.t === 'newgame' || s.t === 'rename') inner = <GameForm isNew={s.t === 'newgame'} />
  else if (s.t === 'confirm') inner = (
    <>
      <h3>{s.title}</h3>
      <p className="pmute">{s.msg}</p>
      <div className="row">
        <button className="pbtn grow" onClick={close}>Cancel</button>
        <button className="pbtn dng grow" onClick={() => { s.run(); close() }}>{s.label ?? 'Delete'}</button>
      </div>
    </>
  )
  else if (s.t === 'pick') inner = <Picker slot={s.slot} title={s.title} cats={s.cats} />
  else if (s.t === 'card') inner = <CardSheet loc={s.loc} />
  else if (s.t === 'renameCard') inner = <RenameCard loc={s.loc} />
  else if (s.t === 'tokens') inner = (
    <>
      <h3>Status effects</h3>
      <TokenRows list={hero?.tokens ?? []} onTok={(t, add) => edit((d, h) => placeToken(h!.tokens, t, add, d, h))} />
      <button className="pbtn pri full" style={{ marginTop: 14 }} onClick={close}>Done</button>
    </>
  )
  else if (s.t === 'moveto') inner = (
    <>
      <h3>Give to which hero?</h3>
      {game!.chars.length ? (
        <div className="plist">
          {game!.chars.map((c, i) => (
            <button key={i} className="ptile hero" onClick={() => {
              const card = game!.stash[s.loc.i!]
              // check on a copy first so the message matches what happens
              const ok = !!card && placeInHero(S, structuredClone(c), card)
              if (ok) edit((d, _h, St) => { placeInHero(St, d.chars[i], d.stash[s.loc.i!]); d.stash.splice(s.loc.i!, 1) })
              toast(ok ? `Given to ${nameOf(S, 'characters', c.card.id)}` : 'No room on that hero')
              close()
            }}><b>{nameOf(S, 'characters', c.card.id)}</b></button>
          ))}
        </div>
      ) : <div className="pmute">Add a hero first.</div>}
      <button className="pbtn full" style={{ marginTop: 12 }} onClick={close}>Cancel</button>
    </>
  )
  else if (s.t === 'backup') inner = <Backup />
  else if (s.t === 'enemy') return (
    <div className="pov center" onClick={close}><img className="card-preview" src={s.src} alt="" /></div>
  )
  return (
    <div className="pov" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="psheet" role="dialog">{inner}</div>
    </div>
  )
}

function GameForm({ isNew }: { isNew: boolean }) {
  const { game, edit, mutate, setSheet, go, toast, campaigns } = usePlay()
  const [name, setName] = useState(isNew ? '' : game!.name)
  const [cid, setCid] = useState(isNew ? '' : game!.campaignId ?? '')
  const save = () => {
    if (!name.trim()) return toast('Enter a name')
    if (isNew) {
      const c = campaigns.find((x) => x.id === cid)
      const g: Game = {
        id: uid(), name: name.trim(), created: new Date().toISOString().slice(0, 10), soul: 0, notes: '', stash: [], chars: [],
        campaignId: c?.id, questId: c?.quests[0]?.id, log: [],
      }
      mutate((d) => void d.games.unshift(g))
      go({ v: 'game', gid: g.id })
    } else {
      edit((d) => {
        d.name = name.trim()
        if (d.campaignId !== (cid || undefined)) {
          d.campaignId = cid || undefined
          d.questId = campaigns.find((x) => x.id === cid)?.quests[0]?.id
        }
      })
      setSheet(null)
    }
  }
  return (
    <>
      <h3>{isNew ? 'New game' : 'Rename game'}</h3>
      <input className="pin" autoFocus maxLength={60} placeholder="Game name" value={name} onChange={(e) => setName(e.target.value)} />
      <p className="plbl" style={{ marginTop: 12 }}>Campaign</p>
      <select className="psel full" value={cid} onChange={(e) => setCid(e.target.value)}>
        <option value="">None (just track heroes)</option>
        {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.quests.length} quests)</option>)}
      </select>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="pbtn grow" onClick={() => setSheet(null)}>Cancel</button>
        <button className="pbtn pri grow" onClick={save}>{isNew ? 'Create' : 'Save'}</button>
      </div>
    </>
  )
}

function Picker({ slot, title, cats }: { slot: string; title: string; cats: string[] }) {
  const { S, game, edit, mutate, setSheet, toast } = usePlay()
  const [cat, setCat] = useState(cats.length > 1 ? 'all' : cats[0])
  const [q, setQ] = useState('')
  const [custom, setCustom] = useState('')
  const have = new Set(game?.chars.map((c) => c.card.id))
  const items = (cat === 'all' ? cats : [cat])
    .flatMap((ct) => catalogue(S, ct).filter((id) => !(ct === 'characters' && have.has(id))).map((id) => ({ cat: ct, id, nm: nameOf(S, ct, id) })))
    .filter((it) => !q || it.nm.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.nm.localeCompare(b.nm))
  const add = (ct: string, id: string) => {
    edit((d, h, St) => {
      const card = mkCard(ct, id)
      if (slot === 'char') {
        d.chars.push(mkHero(id))
        if (d.chars.length === 1) d.chars[0].turn = true
      } else if (slot === 'stash') d.stash.push(card)
      else if (slot === 'main') h!.main = card
      else if (slot === 'sec') h!.sec = card
      else if (slot === 'armor') h!.armor = card
      else if (slot === 'art') h!.art = card
      else if (slot === 'skills' && h!.skills.length < St.settings.maxSkills) h!.skills.push(card)
      else if (slot === 'inv' && h!.inv.length < St.settings.maxInv) h!.inv.push(card)
    })
    setSheet(null)
  }
  const cc = cat === 'all' ? cats[0] : cat
  return (
    <>
      <h3>{title}</h3>
      {cats.length > 1 && (
        <div className="ptabs">
          <button className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>All</button>
          {cats.map((c) => <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{CATN[c]}</button>)}
        </div>
      )}
      <input className="pin" placeholder="Search…" value={q} autoFocus onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10 }} />
      {items.length === 0 ? <div className="pempty">No matches.</div> : (
        <div className="plist">
          {items.slice(0, 80).map((it) => (
            <button key={it.cat + it.id} className="ptile" style={{ borderLeftColor: CAT_COLOR[it.cat] }} onClick={() => add(it.cat, it.id)}>
              <b>{it.nm}</b>{cats.length > 1 && <small>{CATN[it.cat]}</small>}
            </button>
          ))}
          {items.length > 80 && <div className="pmute center">{items.length - 80} more. Type to narrow the list.</div>}
        </div>
      )}
      <section className="pcard" style={{ marginBottom: 0 }}>
        <h2>Add your own {CATN[cc].toLowerCase()} card</h2>
        <div className="row">
          <input className="pin" maxLength={60} placeholder="Card name" value={custom} onChange={(e) => setCustom(e.target.value)} />
          <button className="pbtn" onClick={() => {
            if (!custom.trim()) return toast('Enter a card name')
            const id = 'c_' + uid()
            mutate((d) => void d.custom.push({ cat: cc, id, name: custom.trim() }))
            add(cc, id)
          }}>Add</button>
        </div>
      </section>
    </>
  )
}

function CardSheet({ loc }: { loc: Loc }) {
  const { S, ui, game, hero, edit, setSheet, toast } = usePlay()
  const k = getCard(game, hero, loc)
  if (!k) return null
  const art = cardArt(ui, k.id, k.flipped)
  const editCard = (fn: (c: Card) => void) => edit((d, h) => { const c = getCard(d, h, loc); if (c) fn(c) })
  return (
    <>
      <h3>{nameOf(S, k.cat, k.id)}</h3>
      <p className="pmute" style={{ margin: '-6px 0 10px' }}>{CATN[k.cat]}{k.flipped && ' · flipped'}</p>
      {art && <img className="card-art" src={art} alt="" onClick={() => setSheet({ t: 'enemy', src: art })} />}
      <div className="row wrap" style={{ marginBottom: 10 }}>
        {hasBack(k.cat, k.id) && <button className="pbtn" onClick={() => editCard((c) => void (c.flipped = !c.flipped))}>Flip card</button>}
        <button className="pbtn" onClick={() => setSheet({ t: 'renameCard', loc })}>Rename</button>
      </div>
      <p className="plbl">Counters</p>
      <Stepper value={k.counters} onSet={(n) => editCard((c) => void (c.counters = n))} />
      <p className="plbl" style={{ marginTop: 12 }}>Tokens on this card</p>
      <TokenRows list={k.tokens} onTok={(t, add) => editCard((c) => placeToken(c.tokens, t, add))} />
      {loc.k !== 'char' && (
        <div className="row wrap" style={{ marginTop: 14 }}>
          {loc.k === 'stash'
            ? <button className="pbtn" onClick={() => setSheet({ t: 'moveto', loc })}>Give to hero…</button>
            : <button className="pbtn" onClick={() => { edit((d, h) => { const c = getCard(d, h, loc)!; takeCard(d, h, loc); d.stash.push(c) }); setSheet(null); toast('Moved to stash') }}>Move to stash</button>}
          <button className="pbtn dng" onClick={() => { edit((d, h) => takeCard(d, h, loc)); setSheet(null) }}>Discard</button>
        </div>
      )}
      <button className="pbtn pri full" style={{ marginTop: 14 }} onClick={() => setSheet(null)}>Done</button>
    </>
  )
}

function RenameCard({ loc }: { loc: Loc }) {
  const { S, game, hero, mutate, setSheet } = usePlay()
  const k = getCard(game, hero, loc)!
  const key = `${k.cat}/${k.id}`
  const [v, setV] = useState(nameOf(S, k.cat, k.id))
  return (
    <>
      <h3>Rename card</h3>
      <input className="pin" autoFocus maxLength={60} value={v} onChange={(e) => setV(e.target.value)} />
      <p className="pnote">Leave empty to restore the default label.</p>
      <div className="row">
        <button className="pbtn grow" onClick={() => setSheet({ t: 'card', loc })}>Cancel</button>
        <button className="pbtn pri grow" onClick={() => {
          mutate((d) => { if (v.trim()) d.names[key] = v.trim(); else delete d.names[key] })
          setSheet({ t: 'card', loc })
        }}>Save</button>
      </div>
    </>
  )
}

function TokenRows({ list, onTok }: { list: CardTok[]; onTok: (t: number, add: boolean) => void }) {
  return (
    <div>
      {TOK.map((d) => {
        const f = list.find((x) => x.t === d.t)
        return (
          <div className="trow" key={d.t}>
            <span>{d.i}</span>
            <span className="n">{d.l}</span>
            <button className="pbtn sm ic" onClick={() => onTok(d.t, false)}>−</button>
            <span className="v">{f ? ([0, 4, 5].includes(d.b) ? '✓' : f.c) : '·'}</span>
            <button className="pbtn sm ic" onClick={() => onTok(d.t, true)}>+</button>
          </div>
        )
      })}
    </div>
  )
}

function Backup() {
  const { S, replace, setSheet, go, toast } = usePlay()
  const [text, setText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const apply = (raw: string) => {
    let o: unknown
    try { o = JSON.parse(raw) } catch { return toast("That isn't valid backup data") }
    if (!o || !Array.isArray((o as PlayState).games)) return toast('No games found in that data')
    const next = normalize(o)
    replace(next)
    setSheet(null)
    go({ v: 'home' })
    toast(`Restored ${next.games.length} game${next.games.length === 1 ? '' : 's'}`)
  }
  return (
    <>
      <h3>Backup &amp; restore</h3>
      <p className="pnote">Games save automatically in this browser. Backups from the Sword &amp; Sorcery Companion can be restored here too.</p>
      <button className="pbtn pri" onClick={() => downloadText('sword-sorcery-play-backup.json', JSON.stringify(S, null, 1))}>Save backup file</button>
      <p className="plbl" style={{ marginTop: 16 }}>Restore from a backup</p>
      <textarea className="pin" rows={4} placeholder="Paste backup data here" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="pbtn" onClick={() => fileRef.current?.click()}>Choose file…</button>
        <span className="grow" />
        <button className="pbtn dng" disabled={!text.trim()} onClick={() => apply(text)}>Restore</button>
      </div>
      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => {
        const f = e.target.files?.[0]
        if (f) apply(await f.text())
        e.target.value = ''
      }} />
      <p className="pnote">Restoring replaces every game currently stored.</p>
      <button className="pbtn full" style={{ marginTop: 14 }} onClick={() => setSheet(null)}>Close</button>
    </>
  )
}
