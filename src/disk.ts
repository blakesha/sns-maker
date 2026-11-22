/**
 * Project-folder storage via the dev server (see vite.config.ts).
 * Every call degrades gracefully when there is no dev server (static build): data then stays in the browser only.
 */

let available: boolean | null = null

/** Is the dev-server store reachable? Cached after the first check. */
export async function diskAvailable() {
  if (available != null) return available
  try {
    const r = await fetch('/api/packs')
    available = r.ok && (r.headers.get('content-type') ?? '').includes('json')
  } catch {
    available = false
  }
  return available
}

/** undefined = no dev server, null = no file yet */
export async function diskGet<T>(name: string): Promise<T | null | undefined> {
  if (!(await diskAvailable())) return undefined
  const r = await fetch(`/api/store/${name}`)
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`Could not read ${name}: ${r.status}`)
  return (await r.json()) as T
}

const timers: Record<string, number> = {}
const listeners = new Set<(s: DiskStatus) => void>()
export type DiskStatus = 'browser' | 'saving' | 'saved' | 'error'
let status: DiskStatus = 'browser'
function setStatus(s: DiskStatus) {
  status = s
  listeners.forEach((l) => l(s))
}
export function onDiskStatus(l: (s: DiskStatus) => void) {
  listeners.add(l)
  l(status)
  return () => void listeners.delete(l)
}

/** Debounced write of `data` to the named store */
export function diskPut(name: string, data: unknown, delay = 600) {
  if (!available) return
  setStatus('saving')
  window.clearTimeout(timers[name])
  timers[name] = window.setTimeout(async () => {
    try {
      const r = await fetch(`/api/store/${name}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      setStatus(r.ok ? 'saved' : 'error')
    } catch {
      setStatus('error')
    }
  }, delay)
}

export interface PackInfo { file: string; mtime: number }
export async function listPacks(): Promise<PackInfo[]> {
  if (!(await diskAvailable())) return []
  const r = await fetch('/api/packs')
  return r.ok ? r.json() : []
}
export async function fetchPack(file: string) {
  const r = await fetch(`/local-assets/${file}`)
  if (!r.ok) throw new Error(`Could not load ${file}`)
  return r.json()
}
