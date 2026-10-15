import type {
  Alert, EventRecord, Incident, LoadResult, Rule, Scenario,
} from './types'

export const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

export class ApiError extends Error {
  details: string[]

  constructor(message: string, details: string[] = []) {
    super(message)
    this.details = details
  }
}

type ImportProblem = { index: number | null; field: string; message: string }

async function describe(response: Response): Promise<ApiError> {
  const body = await response.json().catch(() => null)
  const detail = body?.detail

  if (typeof detail === 'string') return new ApiError(detail)

  if (detail && typeof detail === 'object' && Array.isArray(detail.errors)) {
    const problems = (detail.errors as ImportProblem[]).map((problem) =>
      problem.index === null
        ? problem.message
        : `Event ${problem.index + 1} · ${problem.field}: ${problem.message}`,
    )
    return new ApiError(String(detail.message ?? 'Request rejected.'), problems)
  }

  return new ApiError(`Request failed (${response.status}).`)
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(`${API}${path}`, init)
  } catch {
    throw new ApiError('Cannot reach the API. Start the backend at http://127.0.0.1:8000.')
  }
  if (!response.ok) throw await describe(response)
  return response
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  return (await send(path, init)).json() as Promise<T>
}

function put<T>(path: string, body: unknown): Promise<T> {
  return json<T>(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const incidentPath = (id: string) => `/api/incidents/${encodeURIComponent(id)}`

export const getEvents = () => json<EventRecord[]>('/api/events')
export const getAlerts = () => json<Alert[]>('/api/alerts')
export const getIncidents = () => json<Incident[]>('/api/incidents')
export const getRules = () => json<Rule[]>('/api/rules')
export const getScenarios = () => json<Scenario[]>('/api/scenarios')

export const replayScenario = (id: string) =>
  json<LoadResult>(`/api/scenarios/${encodeURIComponent(id)}/replay`, { method: 'POST' })

export const importEvents = (events: unknown) =>
  json<LoadResult>('/api/events/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events }),
  })

export const getNotes = (id: string) =>
  json<{ notes: string; updated_at?: string | null }>(`${incidentPath(id)}/notes`)

export const saveNotes = (id: string, notes: string) =>
  put<{ notes: string }>(`${incidentPath(id)}/notes`, { notes })

export const saveStatus = (id: string, status: string) =>
  put<{ status: string }>(`${incidentPath(id)}/status`, { status })

export async function downloadReport(id: string): Promise<Blob> {
  return (await send(`${incidentPath(id)}/report.md`)).blob()
}
