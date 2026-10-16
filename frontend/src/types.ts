export type EventRecord = {
  event_id: string
  timestamp: string
  event_type: string
  host: string
  user: string
  source: string
  src_ip?: string | null
  details?: Record<string, unknown>
}

export type Technique = { id: string; name: string; tactic: string }

export type Alert = {
  id: string
  rule_id: string
  title: string
  severity: string
  summary: string
  matched_event_ids: string[]
  entity: { host: string; user: string }
  created_at: string
  threshold?: string | null
  explanation?: string | null
  mitre?: Technique[]
}

export type Incident = {
  id: string
  title: string
  status: string
  severity: string
  alert_ids: string[]
  event_ids: string[]
  entities: { host?: string; user?: string }
  correlation_reason?: string
}

export type Rule = {
  id: string
  name: string
  severity: string
  window_seconds: number
  min_failures: number
  threshold: string
  description: string
  mitre?: Technique[]
}

export type Scenario = {
  id: string
  name: string
  description: string
  event_count: number
}

export type Workspace = {
  events: EventRecord[]
  alerts: Alert[]
  incidents: Incident[]
}

export type LoadResult = {
  event_count: number
  alert_count: number
  incident_count: number
  skipped_lines?: number
}

export type Notice = { kind: 'ok' | 'error'; text: string }
