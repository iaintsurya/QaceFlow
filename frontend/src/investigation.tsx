
import { useEffect, useMemo, useState } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

type EvidenceEvent = {
  event_id: string
  timestamp: string
  event_type: string
  host?: string
  user?: string
  src_ip?: string
  details?: Record<string, unknown>
}

type Alert = {
  id: string
  rule_id: string
  title: string
  severity: string
  summary?: string
  threshold?: string | null
  explanation?: string | null
  matched_event_ids: string[]
}

type Incident = {
  id: string
  title: string
  status: string
  severity: string
  alert_ids: string[]
  event_ids: string[]
  entities: { host?: string; user?: string }
  correlation_reason?: string
}

type Props = {
  incident: Incident
  alerts: Alert[]
  events: EvidenceEvent[]
  onBack: () => void
}

export default function Investigation({
  incident,
  alerts,
  events,
  onBack,
}: Props) {
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState(incident.status)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingNotes, setSavingNotes] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [selectedEvent, setSelectedEvent] =
    useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadNotes() {
      setLoading(true)
      setError('')
      setMessage('')
      setStatus(incident.status)

      try {
        const response = await fetch(
          `${API}/api/incidents/${encodeURIComponent(incident.id)}/notes`
        )

        if (!response.ok) {
          throw new Error('Could not load saved notes.')
        }

        const data = await response.json()

        if (!cancelled) {
          setNotes(data.notes ?? '')
        }
      } catch {
        if (!cancelled) {
          setError('Could not load notes. Check that the backend is running.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadNotes()

    return () => {
      cancelled = true
    }
  }, [incident.id, incident.status])

  const incidentAlerts = useMemo(
    () => alerts.filter((alert) => incident.alert_ids.includes(alert.id)),
    [alerts, incident.alert_ids]
  )

  const evidence = useMemo(() => {
    const search = query.trim().toLowerCase()

    return events
      .filter((event) => incident.event_ids.includes(event.event_id))
      .filter((event) => {
        const searchable = [
          event.event_id,
          event.event_type,
          event.host,
          event.user,
          event.src_ip,
          JSON.stringify(event.details ?? {}),
        ]
          .join(' ')
          .toLowerCase()

        return searchable.includes(search)
      })
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() -
          new Date(b.timestamp).getTime()
      )
  }, [events, incident.event_ids, query])

  async function saveNotes() {
    setSavingNotes(true)
    setError('')
    setMessage('')

    try {
      const response = await fetch(
        `${API}/api/incidents/${encodeURIComponent(incident.id)}/notes`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail ?? 'Could not save notes.')
      }

      setMessage('Analyst notes saved to the database.')
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save notes.'
      )
    } finally {
      setSavingNotes(false)
    }
  }

  async function exportReport() {
    setExporting(true)
    setError('')
    setMessage('')
    try {
      // Save the current editor contents before exporting the authoritative report.
      const saveResponse = await fetch(
        `${API}/api/incidents/${encodeURIComponent(incident.id)}/notes`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes }),
        }
      )
      if (!saveResponse.ok) {
        const problem = await saveResponse.json()
        throw new Error(problem.detail ?? 'Could not save notes before export.')
      }

      // The server builds the Markdown report from the saved investigation.
      const response = await fetch(
        `${API}/api/incidents/${encodeURIComponent(incident.id)}/report.md`
      )
      if (!response.ok) {
        const problem = await response.json().catch(() => ({}))
        throw new Error(problem.detail ?? 'Could not generate report.')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `qaceflow-${incident.id.toLowerCase()}-report.md`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      setMessage('Investigation report exported.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export report.')
    } finally {
      setExporting(false)
    }
  }

  async function changeStatus(nextStatus: string) {
    const previousStatus = status
    setStatus(nextStatus)
    setSavingStatus(true)
    setError('')
    setMessage('')

    try {
      const response = await fetch(
        `${API}/api/incidents/${encodeURIComponent(incident.id)}/status`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextStatus }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail ?? 'Could not update status.')
      }

      setMessage(`Incident status saved as "${nextStatus}".`)
    } catch (err) {
      setStatus(previousStatus)
      setError(
        err instanceof Error ? err.message : 'Could not update status.'
      )
    } finally {
      setSavingStatus(false)
    }
  }

  const panelStyle = {
    background: '#FFFFFF',
    border: '1px solid #E3E6DF',
    borderRadius: 12,
    padding: 20,
    minWidth: 0,
  } as const

  const mutedStyle = { color: '#6B7068' } as const

  return (
    <main
      className="investigation-workspace"
      style={{
        minHeight: '100vh',
        background: '#FFFFFF',
        color: '#242722',
        padding: '28px',
        boxSizing: 'border-box',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 28,
        }}
      >
        <div>
          <p style={{ ...mutedStyle, fontSize: 12, letterSpacing: 2 }}>
            QACEFLOW / INCIDENT RESPONSE
          </p>
          <h1 style={{ margin: '8px 0' }}>{incident.title}</h1>
          <p style={mutedStyle}>
            {incident.id} · {incident.entities.host ?? 'Unknown host'} ·{' '}
            {incident.entities.user ?? 'Unknown user'}
          </p>
        </div>

        <button className="primary-btn" onClick={onBack}>
          ← Back to overview
        </button>
      </header>

      <section
        style={{
          ...panelStyle,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 20,
          flexWrap: 'wrap',
          marginBottom: 20,
        }}
      >
        <div>
          <p style={{ ...mutedStyle, margin: '0 0 8px' }}>INCIDENT STATUS</p>
          <strong>{incident.id}</strong>
          <p style={mutedStyle}>
            {incident.severity.toUpperCase()} severity ·{' '}
            {incidentAlerts.length} alerts · {evidence.length} matching events
          </p>
        </div>

        <label>
          Status{' '}
          <select
            value={status}
            disabled={savingStatus}
            onChange={(event) => void changeStatus(event.target.value)}
            style={{
              padding: 10,
              marginLeft: 8,
              borderRadius: 8,
              background: '#F7F8F6',
              color: '#242722',
              border: '1px solid #E3E6DF',
            }}
          >
            <option value="open">Open</option>
            <option value="investigating">Investigating</option>
            <option value="closed">Closed</option>
          </select>
          {savingStatus && <span> Saving…</span>}
        </label>
      </section>

      {(message || error || loading) && (
        <div
          role="status"
          style={{
            ...panelStyle,
            marginBottom: 20,
            color: error ? '#B42318' : '#527A37',
          }}
        >
          {loading ? 'Loading saved analyst notes…' : error || message}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
          gap: 20,
          alignItems: 'start',
        }}
      >
        <section style={panelStyle}>
          <h2>Incident context</h2>
          <p>{incident.correlation_reason ?? 'No correlation explanation available.'}</p>

          <h3>Related alerts</h3>
          {incidentAlerts.length === 0 ? (
            <p style={mutedStyle}>No related alerts were found.</p>
          ) : (
            incidentAlerts.map((alert) => (
              <article
                key={alert.id}
                style={{
                  borderTop: '1px solid #E3E6DF',
                  padding: '14px 0',
                }}
              >
                <strong>{alert.title}</strong>
                <p style={mutedStyle}>
                  {alert.rule_id} · {alert.severity.toUpperCase()}
                </p>
                <p>{alert.summary}</p>
                {alert.threshold && (
                  <p style={mutedStyle}>Rule threshold: {alert.threshold}</p>
                )}
                {alert.explanation && (
                  <p style={mutedStyle}>Why it matters: {alert.explanation}</p>
                )}
                <p style={mutedStyle}>
                  Evidence references: {alert.matched_event_ids.length}
                </p>
              </article>
            ))
          )}
        </section>

        <section style={panelStyle}>
          <h2>Evidence timeline</h2>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search event ID, user, IP, or event type…"
            aria-label="Search evidence"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: 12,
              margin: '8px 0 16px',
              borderRadius: 8,
              background: '#FFFFFF',
              color: '#242722',
              border: '1px solid #E3E6DF',
            }}
          />

          {evidence.length === 0 ? (
            <p style={mutedStyle}>No matching evidence found.</p>
          ) : (
            evidence.map((event) => (
              <article
                key={event.event_id}
                style={{
                  borderLeft: '2px solid #6d9fff',
                  padding: '4px 0 16px 14px',
                  marginLeft: 4,
                  marginBottom: 8,
                }}
              >
                <button
                  onClick={() =>
                    setSelectedEvent(
                      selectedEvent === event.event_id
                        ? null
                        : event.event_id
                    )
                  }
                  style={{
                    padding: 0,
                    border: 0,
                    background: 'transparent',
                    color: '#527A37',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {event.event_id} · {event.event_type}
                </button>
                <p style={mutedStyle}>
                  {new Date(event.timestamp).toLocaleString()} ·{' '}
                  {event.user ?? 'Unknown user'} ·{' '}
                  {event.host ?? 'Unknown host'}
                </p>

                {selectedEvent === event.event_id && (
                  <pre
                    style={{
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                      background: '#FFFFFF',
                      padding: 12,
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  >
                    {JSON.stringify(event, null, 2)}
                  </pre>
                )}
              </article>
            ))
          )}
        </section>

        <section style={{ ...panelStyle, gridColumn: '1 / -1' }}>
          <h2>Analyst notes</h2>
          <p style={mutedStyle}>
            Record observations, investigation steps, and conclusions for this
            incident. Notes are saved in the local SQLite database.
          </p>

          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Document what you observed, what you investigated, and what you concluded…"
            rows={8}
            disabled={loading}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              resize: 'vertical',
              padding: 14,
              borderRadius: 8,
              background: '#FFFFFF',
              color: '#242722',
              border: '1px solid #E3E6DF',
              font: 'inherit',
              lineHeight: 1.6,
            }}
          />

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              marginTop: 12,
            }}
          >
            <span style={mutedStyle}>{notes.length} characters</span>
            <div className="iv-actions">
              <button
                className="secondary-btn"
                onClick={() => void exportReport()}
                disabled={loading || exporting || savingNotes}
              >
                {exporting ? 'Exporting…' : 'Export report (.md)'}
              </button>
              <button
                className="primary-btn"
                onClick={() => void saveNotes()}
                disabled={loading || savingNotes}
              >
                {savingNotes ? 'Saving…' : 'Save analyst notes'}
              </button>
            </div>
          </div>
        </section>
      </div>

      <footer style={{ ...mutedStyle, marginTop: 28, fontSize: 12 }}>
        QaceFlow · Local-first investigation · Synthetic demo telemetry
      </footer>
    </main>
  )
}
