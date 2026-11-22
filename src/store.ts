import { useCallback, useEffect, useRef, useState } from 'react'
import type { Campaign } from './types'
import { migrateCampaign, sampleCampaign } from './data'
import { diskGet, diskPut } from './disk'

const KEY = 'quest-forge:v1'

function load(): Campaign[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map(migrateCampaign)
    }
  } catch {
    /* ignore corrupt storage */
  }
  return [sampleCampaign()]
}

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>(load)
  const timer = useRef<number | undefined>(undefined)
  const synced = useRef(false)

  // The project folder (data/campaigns.json) wins over the browser copy when the dev server is running
  useEffect(() => {
    diskGet<Campaign[]>('campaigns')
      .then((disk) => {
        if (disk === undefined) return // no dev server: browser only
        if (Array.isArray(disk)) setCampaigns(disk.map(migrateCampaign))
        synced.current = true
        if (disk === null) setCampaigns((cs) => [...cs]) // first run: trigger a save of what the browser had
      })
      .catch((e) => console.error('Could not read data/campaigns.json', e))
  }, [])

  // Debounced persistence: browser always, project folder once synced
  useEffect(() => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(campaigns))
      } catch (e) {
        console.error('Failed to save', e)
      }
    }, 300)
    if (synced.current) diskPut('campaigns', campaigns)
  }, [campaigns])

  const updateCampaign = useCallback((id: string, fn: (c: Campaign) => Campaign) => {
    setCampaigns((cs) => cs.map((c) => (c.id === id ? { ...fn(c), updatedAt: Date.now() } : c)))
  }, [])

  return { campaigns, setCampaigns, updateCampaign }
}

export function downloadText(filename: string, text: string, type = 'application/json') {
  const blob = new Blob([text], { type })
  downloadBlob(filename, blob)
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled'
}
