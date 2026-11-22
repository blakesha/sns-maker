import type { Campaign, Quest, Target, TileDef } from './types'

export interface Release {
  id: string
  name: string
  kind: 'core' | 'expansion'
  /** expansions: the core box(es) whose saga this belongs to */
  saga?: string[]
  /** expansions: other core boxes it is also playable with */
  compatible?: string[]
}

/**
 * Sword & Sorcery releases. Each core box has its own saga of expansions;
 * a few expansions work with more than one core box.
 */
export const RELEASES: Release[] = [
  { id: 'is', name: 'Immortal Souls', kind: 'core' },
  { id: 'ac', name: 'Ancient Chronicles', kind: 'core' },
  { id: 'al', name: 'Abyssal Legends', kind: 'core' },
  // Immortal Souls saga
  { id: 'ap', name: 'Arcane Portal', kind: 'expansion', saga: ['is'] },
  { id: 'df', name: 'Darkness Falls', kind: 'expansion', saga: ['is'] },
  { id: 'vl', name: "Vastaryous' Lair", kind: 'expansion', saga: ['is'] },
  // Ancient Chronicles saga
  { id: 'nt', name: 'Northwind Tales', kind: 'expansion', saga: ['ac'] },
  // playable with either
  { id: 'mota', name: 'Myths of the Arena', kind: 'expansion', saga: ['ac'], compatible: ['is'] },
  { id: 'custom', name: 'Custom / homebrew', kind: 'expansion', saga: ['is', 'ac', 'al'] },
]

export const releaseById = Object.fromEntries(RELEASES.map((r) => [r.id, r])) as Record<string, Release>
export const CORE_RELEASES = RELEASES.filter((r) => r.kind === 'core')

/** Expansions offered for a core box: its own saga first, then ones that are also compatible */
export function expansionsFor(core: string) {
  const exp = RELEASES.filter((r) => r.kind === 'expansion')
  return {
    saga: exp.filter((r) => r.saga?.includes(core)),
    compatible: exp.filter((r) => !r.saga?.includes(core) && r.compatible?.includes(core)),
  }
}

export function expansionAllowed(core: string, expansion: string) {
  const r = releaseById[expansion]
  return !!r && (r.saga?.includes(core) || r.compatible?.includes(core))
}

export type { Target }

export const DEFAULT_TARGET: Target = { release: 'is', expansions: [] }

/** Drop unknown releases and expansions that don't go with the core box */
export function cleanTarget(t: Target | undefined): Target {
  if (!t || !releaseById[t.release] || releaseById[t.release].kind !== 'core') return { ...DEFAULT_TARGET }
  return { release: t.release, expansions: t.expansions.filter((e) => expansionAllowed(t.release, e)) }
}

/** A quest uses its own target if set, otherwise its campaign's */
export function questTarget(c: Campaign, q: Quest): Target {
  return q.target ?? c.target ?? DEFAULT_TARGET
}

export function targetIds(t: Target) {
  return new Set([t.release, ...t.expansions])
}

export function targetLabel(t: Target) {
  return [t.release, ...t.expansions].map((id) => releaseById[id]?.name ?? id).join(' + ')
}

/** Is this tile available for the target? Tiles with no release assigned are always allowed. */
export function tileAllowed(def: TileDef | undefined, t: Target) {
  return !def?.release || targetIds(t).has(def.release)
}
