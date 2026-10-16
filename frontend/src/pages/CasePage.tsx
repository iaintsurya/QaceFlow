import { Fragment, useEffect, useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import { ApiError, downloadReport, getNotes, saveNotes, saveStatus } from '../api'
import { Chip, Empty, Severity, Techniques } from '../components/ui'
import { datasetOrigin, eventSpan, plural, utc } from '../format'
import type { Alert, EventRecord, Incident, Notice } from '../types'

type Props = {
  incident: Incident | undefined
  alerts: Alert[]
  events: EventRecord[]
  onChanged: () => Promise<unknown>
}

const MAX_NOTES = 20000
const STATUSES = ['open', 'investigating', 'closed']

export default function CasePage({ incident, alerts, events, onChanged }: Props) {
  if (!incident) {
    return (
      <Empty title="Case not found">
        It may have been replaced when the dataset was reloaded. <a href="#/cases">Back to all cases</a>.
      </Empty>
    )
  }
  return <CaseView key={incident.id} incident={incident} alerts={alerts} events={events} onChanged={onChanged} />
}

function CaseView({ incident, alerts, events, onChanged }: Omit<Props, 'incident'> & { incident: Incident }) {
  const [notes, setNotes] = useState('')
  const [saved, setSaved] = useState('')
  const [status, setStatus] = useState(incident.status)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const dirty = notes !== saved

  useEffect(() => setStatus(incident.status), [incident.status])

  useEffect(() => {
    let cancelled = false
    getNotes(incident.id)
      .then((data) => {
        if (cancelled) return
        setNotes(data.notes ?? '')
        setSaved(data.notes ?? '')
      })
      .catch(() => !cancelled && setNotice({ kind: 'error', text: 'Could not load saved notes. Is the backend running?' }))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [incident.id])

  const caseAlerts = useMemo(
    () => alerts.filter((alert) => incident.alert_ids.includes(alert.id)),
    [alerts, incident.alert_ids],
  )
  const caseEvents = useMemo(
    () =>
      events
        .filter((event) => incident.event_ids.includes(event.event_id))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.event_id.localeCompare(b.event_id)),
    [events, incident.event_ids],
  )
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return caseEvents.filter(
      (event) =>
        !needle ||
        [event.event_id, event.event_type, event.user, event.host, event.src_ip, JSON.stringify(event.details ?? {})]
          .join(' ')
          .toLowerCase()
          .includes(needle),
    )
  }, [caseEvents, query])

  const span = eventSpan(caseEvents)
  const origin = datasetOrigin(caseEvents)

  async function save(): Promise<boolean> {
    setSaving(true)
    try {
      await saveNotes(incident.id, notes)
      setSaved(notes)
      setNotice({ kind: 'ok', text: 'Findings saved.' })
      return true
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not save findings.' })
      return false
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(next: string) {
    const previous = status
    setStatus(next)
    try {
      await saveStatus(incident.id, next)
      setNotice({ kind: 'ok', text: `Status set to ${next}.` })
      await onChanged()
    } catch (err) {
      setStatus(previous)
      setNotice({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not update status.' })
    }
  }

  async function exportReport() {
    setExporting(true)
    try {
      if (dirty && !(await save())) return
      const blob = await downloadReport(incident.id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `qaceflow-${incident.id.toLowerCase()}-report.md`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setNotice({ kind: 'ok', text: 'Report downloaded.' })
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not export the report.' })
    } finally {
      setExporting(false)
    }
  }

  // Ctrl/Cmd+S saves; closing the tab with unsaved findings asks first.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (dirty && !saving && !loading) void save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const leave = (event: MouseEvent) => {
    if (dirty && !window.confirm('You have unsaved findings. Leave without saving?')) event.preventDefault()
  }

  return (
    <>
      <a className="back" href="#/cases" onClick={leave}>← All cases</a>

      <header className="case-head">
        <div>
          <div className="mono muted">{incident.id}</div>
          <h1>{incident.title}</h1>
          <p className="lede">{incident.entities.user ?? 'Unknown account'} on {incident.entities.host ?? 'unknown host'}</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={() => void exportReport()} disabled={loading || exporting || saving}>
            {exporting ? 'Exporting…' : 'Export report'}
          </button>
        </div>
      </header>

      <dl className="strip">
        <div><dt>Severity</dt><dd><Severity value={incident.severity} /></dd></div>
        <div>
          <dt>Status</dt>
          <dd>
            <select value={status} onChange={(e) => void changeStatus(e.target.value)} aria-label="Case status">
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </dd>
        </div>
        <div><dt>Alerts</dt><dd>{caseAlerts.length}</dd></div>
        <div><dt>Evidence events</dt><dd>{caseEvents.length}</dd></div>
        <div><dt>First event (UTC)</dt><dd className="mono">{utc(span.first)}</dd></div>
        <div><dt>Last event (UTC)</dt><dd className="mono">{utc(span.last)}</dd></div>
        <div><dt>Data</dt><dd>{origin.label}</dd></div>
      </dl>

      {notice && (
        <div className={`flash flash-${notice.kind}`} role="status">
          <span>{notice.text}</span>
          <button type="button" className="link-btn" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}

      <div className="case-grid">
        <div>
          <section className="block">
            <h2>Why these alerts were grouped</h2>
            <p>{incident.correlation_reason ?? 'No correlation rationale was recorded.'}</p>
          </section>

          <section className="block">
            <h2>{plural(caseAlerts.length, 'alert')}</h2>
            {caseAlerts.map((alert) => (
              <article key={alert.id} className="alert-item">
                <div className="alert-item-head">
                  <span className="mono">{alert.id}</span>
                  <Severity value={alert.severity} />
                </div>
                <p><strong>{alert.title}.</strong> {alert.summary}</p>
                <dl className="facts">
                  {alert.threshold && (<><dt>Threshold</dt><dd>{alert.threshold}</dd></>)}
                  {alert.explanation && (<><dt>Why it matters</dt><dd>{alert.explanation}</dd></>)}
                  {alert.mitre && alert.mitre.length > 0 && (<><dt>MITRE ATT&amp;CK</dt><dd><Techniques items={alert.mitre} /></dd></>)}
                  <dt>Evidence</dt>
                  <dd>{alert.matched_event_ids.map((id) => <Chip key={id}>{id}</Chip>)}</dd>
                </dl>
              </article>
            ))}
          </section>
        </div>

        <section className="block evidence">
          <h2>Evidence timeline</h2>
          <input
            type="search"
            className="full"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this case’s events…"
            aria-label="Search evidence"
          />
          {shown.length === 0 ? (
            <Empty title="No matching evidence" />
          ) : (
            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th>Time (UTC)</th>
                    <th>Event</th>
                    <th>Type</th>
                    <th>Account · host</th>
                    <th>Source IP</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((event) => {
                    const expanded = open === event.event_id
                    return (
                      <Fragment key={event.event_id}>
                        <tr>
                          <td className="mono">{utc(event.timestamp)}</td>
                          <td>
                            <button type="button" className="id-btn" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : event.event_id)}>
                              {event.event_id}
                            </button>
                          </td>
                          <td className={`mono ${event.event_type.endsWith('success') ? 'tone-good' : event.event_type.endsWith('failure') ? 'tone-bad' : ''}`}>
                            {event.event_type}
                          </td>
                          <td>{event.user}<div className="muted">{event.host}</div></td>
                          <td className="mono">{event.src_ip ?? '—'}</td>
                        </tr>
                        {expanded && (
                          <tr className="detail-row">
                            <td colSpan={5}><pre className="raw">{JSON.stringify(event, null, 2)}</pre></td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="block">
        <h2>Analyst findings</h2>
        <p className="muted">Saved in the local database and included in the exported report. Ctrl+S saves.</p>
        <textarea
          className="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={8}
          maxLength={MAX_NOTES}
          disabled={loading}
          aria-label="Analyst findings"
          placeholder="What did you observe, what did you check, and what do you conclude?"
        />
        <div className="form-row spread">
          <span className="muted">
            {notes.length.toLocaleString()} / {MAX_NOTES.toLocaleString()} ·{' '}
            <span className={dirty ? 'tone-warn' : 'tone-good'}>{dirty ? 'Unsaved changes' : 'Saved'}</span>
          </span>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={loading || saving || !dirty}>
            {saving ? 'Saving…' : 'Save findings'}
          </button>
        </div>
      </section>
    </>
  )
}
