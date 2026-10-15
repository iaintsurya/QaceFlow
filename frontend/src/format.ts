import type { EventRecord } from './types'

/** 2026-10-14 14:05:00 (UTC) */
export function utc(value: string | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

export type Origin = { kind: 'none' | 'simulated' | 'imported'; label: string }

/** Where the loaded events came from, so the UI never calls imported data synthetic. */
export function datasetOrigin(events: EventRecord[]): Origin {
  if (events.length === 0) return { kind: 'none', label: 'No data loaded' }
  const simulated = events.every((event) => event.source === 'simulated_auth_log')
  return simulated
    ? { kind: 'simulated', label: 'Simulated data' }
    : { kind: 'imported', label: 'Imported data · unverified' }
}

export function eventSpan(events: EventRecord[]): { first?: string; last?: string } {
  const times = events.map((event) => event.timestamp).sort()
  return { first: times[0], last: times[times.length - 1] }
}
