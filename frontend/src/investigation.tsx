
import { useEffect, useMemo, useState } from 'react'
import './casefile.css'

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
  const [savedNotes, setSavedNotes] = useState('')
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
          setSavedNotes(data.notes ?? '')
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

      setSavedNotes(notes)
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

  const dirty = notes !== savedNotes
  const eventClass = (type: string) =>
    type.endsWith('success') ? 'event-success' : 'event-failure'

  return (
    <main className="cf-page">
      <header className="cf-header">
        <div>
          <p className="cf-kicker">Case {incident.id} / Incident response</p>
          <h1 className="cf-title">{incident.title}</h1>
          <p className="cf-meta">
            HOST {incident.entities.host ?? 'unknown'} · ACCOUNT{' '}
            {incident.entities.user ?? 'unknown'}
          </p>
        </div>
        <div className="cf-actions">
          <button className="secondary-btn" onClick={onBack}>
            ← Back to overview
          </button>
          <button
            className="primary-btn"
            onClick={() => void exportReport()}
            disabled={loading || exporting || savingNotes}
          >
            {exporting ? 'Exporting…' : 'Export report (.md)'}
          </button>
        </div>
      </header>

      <section className="cf-bar" aria-label="Incident status">
        <div className="cf-stat">
          <span>Severity</span>
          <strong>
            <span className={`severity ${incident.severity}`}>{incident.severity}</span>
          </strong>
        </div>
        <div className="cf-stat">
          <span>Status</span>
          <select
            className="cf-select"
            value={status}
            disabled={savingStatus}
            onChange={(event) => void changeStatus(event.target.value)}
            aria-label="Incident status"
          >
            <option value="open">Open</option>
            <option value="investigating">Investigating</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <div className="cf-stat">
          <span>Alerts</span>
          <strong>{incidentAlerts.length}</strong>
        </div>
        <div className="cf-stat">
          <span>Evidence events</span>
          <strong>{incident.event_ids.length}</strong>
        </div>
        {savingStatus && <span className="cf-muted">Saving status…</span>}
      </section>

      {(message || error || loading) && (
        <div role="status" className={`cf-notice ${error ? 'error' : 'ok'}`}>
          {loading ? 'Loading saved analyst notes…' : error || message}
        </div>
      )}

      <div className="cf-grid">
        <section className="cf-section">
          <h2>Why these alerts were grouped</h2>
          <p className="cf-reason">
            {incident.correlation_reason ?? 'No correlation explanation available.'}
          </p>

          <h2>Related alerts</h2>
          {incidentAlerts.length === 0 ? (
            <p className="cf-muted">No related alerts were found.</p>
          ) : (
            incidentAlerts.map((alert) => (
              <article key={alert.id} className="cf-alert">
                <div className="cf-alert-head">
                  <strong>{alert.title}</strong>
                  <span className={`severity ${alert.severity}`}>{alert.severity}</span>
                </div>
                <p className="cf-muted cf-mono">
                  {alert.id} · RULE {alert.rule_id}
                </p>
                <p>{alert.summary}</p>
                {alert.threshold && (
                  <p className="cf-muted">Rule threshold: {alert.threshold}</p>
                )}
                {alert.explanation && (
                  <p className="cf-muted">Why it matters: {alert.explanation}</p>
                )}
                <div className="cf-refs" aria-label="Evidence references">
                  {alert.matched_event_ids.map((id) => (
                    <span key={id} className="cf-ref">{id}</span>
                  ))}
                </div>
              </article>
            ))
          )}
        </section>

        <section className="cf-section">
          <h2>Evidence timeline (UTC)</h2>
          <input
            className="cf-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search event ID, user, IP, or event type…"
            aria-label="Search evidence"
          />

          {evidence.length === 0 ? (
            <p className="cf-muted">No matching evidence found.</p>
          ) : (
            <div className="cf-table-wrap">
              <table className="cf-table">
                <thead>
                  <tr>
                    <th>TIME</th>
                    <th>EVENT</th>
                    <th>TYPE</th>
                    <th>ACCOUNT / HOST</th>
                    <th>SOURCE IP</th>
                  </tr>
                </thead>
                <tbody>
                  {evidence.map((event) => (
                    <tr key={event.event_id}>
                      <td className="cf-mono">
                        {new Date(event.timestamp).toISOString().slice(11, 19)}
                      </td>
                      <td>
                        <button
                          className="cf-row-btn"
                          aria-expanded={selectedEvent === event.event_id}
                          onClick={() =>
                            setSelectedEvent(
                              selectedEvent === event.event_id ? null : event.event_id
                            )
                          }
                        >
                          {event.event_id}
                        </button>
                        {selectedEvent === event.event_id && (
                          <pre className="cf-raw">{JSON.stringify(event, null, 2)}</pre>
                        )}
                      </td>
                      <td>
                        <span className={`event-type ${eventClass(event.event_type)}`}>
                          {event.event_type}
                        </span>
                      </td>
                      <td>
                        {event.user ?? 'unknown'}
                        <div className="cf-muted">{event.host ?? 'unknown'}</div>
                      </td>
                      <td className="cf-mono">{event.src_ip ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="cf-section wide">
          <h2>Analyst findings</h2>
          <p className="cf-muted">
            Record observations, investigation steps and conclusions. Notes are saved
            in the local SQLite database and included in the exported report.
          </p>
          <textarea
            className="cf-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Document what you observed, what you investigated, and what you concluded…"
            rows={8}
            maxLength={20000}
            disabled={loading}
            aria-label="Analyst notes"
          />
          <div className="cf-foot">
            <span className="cf-muted">
              {notes.length.toLocaleString()} / 20,000 characters ·{' '}
              <span className={dirty ? 'cf-dirty' : 'cf-saved'}>
                {dirty ? 'Unsaved changes' : 'All changes saved'}
              </span>
            </span>
            <button
              className="primary-btn"
              onClick={() => void saveNotes()}
              disabled={loading || savingNotes || !dirty}
            >
              {savingNotes ? 'Saving…' : 'Save analyst notes'}
            </button>
          </div>
        </section>
      </div>

      <p className="cf-fine">
        QaceFlow · Local-first investigation · A candidate incident is a hypothesis, not proof of compromise.
      </p>
    </main>
  )
}
