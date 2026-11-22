import { useCallback, useEffect, useRef, useState } from 'react'
import { CAT, TM, pretty } from './catalog'
import { diskGet, diskPut } from '../disk'

/* ---------- model (compatible with Sword & Sorcery Companion backups) ---------- */
export interface CardTok { t: number; c: number }
export interface Card { cat: string; id: string; flipped: boolean; counters: number; tokens: CardTok[] }
export interface Hero {
  card: Card
  main: Card | null
  sec: Card | null
  armor: Card | null
  art: Card | null
  skills: Card[]
  inv: Card[]
  tokens: CardTok[]
  form: number
  gold: number
  dmg: number
  shield: number
  rank: number
  turn: boolean
  alive: boolean
}
export interface LogEntry { questId: string; title: string; result: 'won' | 'lost'; date: string }
export interface Game {
  id: string
  name: string
  created: string
  soul: number
  notes: string
  stash: Card[]
  chars: Hero[]
  /** Quest Forge additions: the campaign being played and progress through it */
  campaignId?: string
  questId?: string
  log?: LogEntry[]
}
export interface CustomCard { cat: string; id: string; name: string }
export interface PlayState {
  v: 1
  _t: number
  settings: { maxInv: number; maxSkills: number }
  names: Record<string, string>
  custom: CustomCard[]
  games: Game[]
}

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)
export const defState = (): PlayState => ({ v: 1, _t: 0, settings: { maxInv: 8, maxSkills: 6 }, names: {}, custom: [], games: [] })

export function normalize(s: unknown): PlayState {
  const d = defState()
  if (!s || typeof s !== 'object') return d
  const o = s as Partial<PlayState>
  d.settings.maxInv = Math.max(1, +(o.settings?.maxInv ?? 8) || 8)
  d.settings.maxSkills = Math.max(1, +(o.settings?.maxSkills ?? 6) || 6)
  d.names = o.names && typeof o.names === 'object' ? o.names : {}
  d.custom = Array.isArray(o.custom) ? o.custom : []
  d.games = Array.isArray(o.games) ? o.games : []
  d._t = +(o._t ?? 0) || 0
  for (const g of d.games) {
    g.id ||= uid()
    g.name ||= 'Untitled'
    g.soul = +g.soul || 0
    g.notes ||= ''
    g.created ||= ''
    g.stash = Array.isArray(g.stash) ? g.stash : []
    g.chars = Array.isArray(g.chars) ? g.chars : []
    g.log = Array.isArray(g.log) ? g.log : []
    for (const c of g.chars) {
      c.skills ||= []
      c.inv ||= []
      c.tokens ||= []
      c.form = +c.form || 0
      c.gold = +c.gold || 0
      c.dmg = +c.dmg || 0
      c.shield = +c.shield || 0
      c.rank = +c.rank || 0
      c.turn = !!c.turn
      c.alive = c.alive !== false
    }
  }
  return d
}

export const mkCard = (cat: string, id: string): Card => ({ cat, id, flipped: false, counters: 0, tokens: [] })
export const mkHero = (id: string): Hero => ({
  card: mkCard('characters', id), main: null, sec: null, armor: null, art: null, skills: [], inv: [], tokens: [],
  form: 0, gold: 0, dmg: 0, shield: 0, rank: 0, turn: false, alive: true,
})

/* ---------- names ---------- */
export function nameOf(S: PlayState, cat: string, id: string) {
  const k = `${cat}/${id}`
  if (S.names[k]) return S.names[k]
  const c = S.custom.find((x) => x.cat === cat && x.id === id)
  return c ? c.name : pretty(cat, id)
}

export function catalogue(S: PlayState, cat: string) {
  return [...(CAT[cat] ?? []).map((x) => x.id), ...S.custom.filter((c) => c.cat === cat).map((c) => c.id)]
}

/* ---------- token logic (same stacking rules as the companion) ---------- */
export function placeToken(list: CardTok[], t: number, add: boolean, game?: Game, hero?: Hero) {
  const d = TM[t]
  if (!d) return
  const fi = list.findIndex((x) => x.t === t)
  const f = fi >= 0 ? list[fi] : null
  switch (d.b) {
    case 0:
      if (add && !f) list.push({ t, c: 1 })
      else if (!add && f) list.splice(fi, 1)
      break
    case 1:
      if (add) list.push({ t, c: 1 })
      else if (fi >= 0) list.splice(fi, 1)
      break
    case 2:
    case 3:
      if (f) {
        f.c += add ? 1 : -1
        if (f.c === 0) list.splice(fi, 1)
      } else if (add) list.push({ t, c: 1 })
      else if (d.b === 2) list.push({ t, c: -1 })
      break
    case 4:
      if (add && !f) {
        const si = list.findIndex((x) => x.t === d.s)
        if (si >= 0) list.splice(si, 1)
        list.push({ t, c: 1 })
      } else if (!add && f) list.splice(fi, 1)
      break
    case 5:
      if (add && !f) {
        if (game && hero) for (const o of game.chars) if (o !== hero) o.tokens = o.tokens.filter((x) => x.t !== t)
        list.push({ t, c: 1 })
      } else if (!add && f) list.splice(fi, 1)
      break
  }
  list.sort((a, b) => a.t - b.t)
}

/** Put a card in the first free suitable slot on a hero */
export function placeInHero(S: PlayState, h: Hero, card: Card): boolean {
  const c = card.cat
  if (c === 'weapons') {
    if (!h.main) { h.main = card; return true }
    if (!h.sec) { h.sec = card; return true }
  } else if (c === 'armors' && !h.armor) { h.armor = card; return true }
  else if (c === 'artefacts' && !h.art) { h.art = card; return true }
  else if (c === 'skills') {
    if (h.skills.length >= S.settings.maxSkills) return false
    h.skills.push(card)
    return true
  }
  if (h.inv.length >= S.settings.maxInv) return false
  h.inv.push(card)
  return true
}

/* ---------- persistence ---------- */
const KEY = 'quest-forge:play:v1'

function load(): PlayState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return normalize(JSON.parse(raw))
  } catch {
    /* ignore */
  }
  return defState()
}

/**
 * The play state is a mutable tree (like the companion's); `mutate` edits a deep copy and saves it.
 */
export function usePlayState() {
  const [S, setS] = useState<PlayState>(load)
  const timer = useRef<number | undefined>(undefined)
  const synced = useRef(false)
  // data/play.json in the project folder wins when the dev server is running
  useEffect(() => {
    diskGet<PlayState>('play')
      .then((disk) => {
        if (disk === undefined) return
        synced.current = true
        if (disk) setS(normalize(disk))
        else setS((cur) => ({ ...cur })) // first run: save what the browser had
      })
      .catch((e) => console.error('Could not read data/play.json', e))
  }, [])
  useEffect(() => {
    if (synced.current) diskPut('play', S)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(S))
      } catch (e) {
        console.error('Failed to save play state', e)
      }
    }, 250)
  }, [S])
  const mutate = useCallback((fn: (draft: PlayState) => void) => {
    setS((cur) => {
      const draft = structuredClone(cur)
      fn(draft)
      draft._t = Date.now()
      return draft
    })
  }, [])
  const replace = useCallback((next: PlayState) => setS(next), [])
  return { S, mutate, replace }
}
