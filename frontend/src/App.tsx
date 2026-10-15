import { useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, ArrowUpRight, BookOpen,
  CheckCircle2, ChevronRight, CircleDot, Clock3, Fingerprint, GitMerge,
  Play, RadioTower, Search, Shield, ShieldAlert, Upload, Workflow, Zap
} from 'lucide-react'
import Investigation from './investigation'

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

type EventRecord = {
  event_id: string; timestamp: string; event_type: string; host: string
  user: string; source: string; src_ip?: string; details: { reason?: string }
}
type Alert = {
  id: string; rule_id: string; title: string; severity: string; summary: string
  matched_event_ids: string[]; entity: { host: string; user: string }; created_at: string
  threshold?: string | null; explanation?: string | null
}
type Scenario = { id: string; name: string; description: string; event_count: number }
type Incident = {
  id: string; title: string; status: string; severity: string
  alert_ids: string[]; event_ids: string[]; entities: { host: string; user: string }
  correlation_reason: string
}

function time(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC', timeZoneName: 'short' })
}
function label(value: string) {
  return value.replace(/\./g, ' ').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
}

export default function App() {
  const [events, setEvents] = useState<EventRecord[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Run a scenario to populate the investigation workspace.')
  const [selected, setSelected] = useState<string | null>(null)
  const [apiOnline, setApiOnline] = useState(false)
  const [view, setView] = useState<'overview' | 'investigation'>('overview')
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [selectedScenario, setSelectedScenario] = useState('suspicious-login')
  const [eventQuery, setEventQuery] = useState('')
  const [eventType, setEventType] = useState('all')
  const [importText, setImportText] = useState('')
  const [importErrors, setImportErrors] = useState<string[]>([])
  const [importing, setImporting] = useState(false)

  async function refresh(): Promise<Incident[]> {
    try {
      const [e, a, i] = await Promise.all([
        fetch(`${API}/api/events`), fetch(`${API}/api/alerts`), fetch(`${API}/api/incidents`)
      ])
      if (!e.ok || !a.ok || !i.ok) throw new Error('API request failed')
      const nextIncidents: Incident[] = await i.json()
      setEvents(await e.json()); setAlerts(await a.json()); setIncidents(nextIncidents)
      setApiOnline(true)
      return nextIncidents
    } catch {
      setApiOnline(false)
      return []
    }
  }

  useEffect(() => {
    void refresh()
    fetch(`${API}/api/scenarios`)
      .then(response => {
        if (!response.ok) throw new Error('Scenario catalog unavailable')
        return response.json()
      })
      .then((items: Scenario[]) => setScenarios(items))
      .catch(() => setScenarios([
        { id: 'suspicious-login', name: 'Suspicious login', description: 'Failures followed by success', event_count: 6 },
        { id: 'repeated-failures', name: 'Repeated failures', description: 'Repeated failures without success', event_count: 5 },
        { id: 'benign-login', name: 'Benign login activity', description: 'Ordinary successful logins', event_count: 3 },
      ]))
  }, [])

  async function replay() {
    if (
      incidents.length > 0 &&
      !window.confirm('Replaying replaces the active demo dataset and clears saved notes and incident status. Continue?')
    ) return
    setBusy(true)
    setMessage('Generating simulated telemetry and evaluating detections…')
    try {
      const response = await fetch(`${API}/api/scenarios/${selectedScenario}/replay`, { method: 'POST' })
      if (!response.ok) throw new Error('Scenario replay failed')
      const result = await response.json()
      const freshIncidents = await refresh()
      setSelected(freshIncidents[0]?.id ?? null)
      setMessage(`${selectedScenario} replay complete · ${result.event_count} events · ${result.alert_count} alerts · ${result.incident_count} candidate incidents. Replaying replaces the active demo dataset and clears its notes.`)
    } catch {
      setMessage('Could not reach the API. Start the backend at http://127.0.0.1:8000 and try again.')
    } finally { setBusy(false) }
  }

  async function importEvents() {
    setImportErrors([])
    let parsed: unknown
    try {
      parsed = JSON.parse(importText)
    } catch {
      setImportErrors(['The text is not valid JSON.'])
      return
    }
    const events = Array.isArray(parsed) ? parsed : (parsed as { events?: unknown })?.events

    if (incidents.length > 0 && !window.confirm('Importing replaces the active dataset and clears saved notes and incident status. Continue?')) return
    setImporting(true)
    try {
      const response = await fetch(`${API}/api/events/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events }),
      })
      const result = await response.json()
      if (!response.ok) {
        const detail = result.detail
        if (detail && typeof detail === 'object' && Array.isArray(detail.errors)) {
          setImportErrors([
            detail.message,
            ...detail.errors.map((e: { index: number | null; field: string; message: string }) =>
              e.index === null ? e.message : `Event ${e.index + 1} · ${e.field}: ${e.message}`),
          ])
        } else {
          setImportErrors([typeof detail === 'string' ? detail : 'Import failed.'])
        }
        return
      }
      const freshIncidents = await refresh()
      setSelected(freshIncidents[0]?.id ?? null)
      setMessage(`Import complete · ${result.event_count} events · ${result.alert_count} alerts · ${result.incident_count} candidate incidents. Imported events are unverified.`)
      setImportText('')
    } catch {
      setImportErrors(['Could not reach the API. Start the backend at http://127.0.0.1:8000 and try again.'])
    } finally {
      setImporting(false)
    }
  }

  async function loadImportFile(file: File | undefined) {
    if (!file) return
    setImportErrors([])
    setImportText(await file.text())
  }

  const simulatedOnly = events.every(event => event.source === 'simulated_auth_log')
  const activeIncident = incidents.find(i => i.id === selected) ?? incidents[0]
  const filteredEvents = events.filter(event => {
  const query = eventQuery.trim().toLowerCase()

  if (eventType !== 'all' && event.event_type !== eventType) return false
  if (!query) return true

  return [
    event.event_id,
    event.timestamp,
    event.event_type,
    event.host,
    event.user,
    event.src_ip ?? '',
    event.details?.reason ?? '',
    event.source,
  ].some(value => value.toLowerCase().includes(query))
})
  const selectedAlerts = activeIncident ? alerts.filter(a => activeIncident.alert_ids.includes(a.id)) : alerts
  if (view === 'investigation' && activeIncident) {
  return (
    <Investigation
      incident={activeIncident}
      alerts={alerts}
      events={events}
      onBack={() => setView('overview')}
    />
  )
}
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Workflow size={21} /></div>
          <div><div className="brand-name">QaceFlow<span>.</span></div><div className="brand-sub">INVESTIGATION WORKBENCH</div></div>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          <a className="nav-item active" href="#overview"><Activity size={17} /> Overview</a>
          <a className="nav-item" href="#events"><RadioTower size={17} /> Telemetry</a>
          <a className="nav-item" href="#alerts"><Zap size={17} /> Detections</a>
          <a className="nav-item" href="#incidents"><GitMerge size={17} /> Incidents <span className="nav-count">{incidents.length.toString().padStart(2, '0')}</span></a>
          <a className="nav-item" href="#casebook"><BookOpen size={17} /> Casebook</a>
          <a className="nav-item" href="#import"><Upload size={17} /> Import</a>
        </nav>
        <div className="sidebar-bottom">
          <div className="env-card">
            <div className="env-top"><span className="status-dot" /> LOCAL LAB</div>
            <p>{simulatedOnly ? 'Simulated telemetry only' : 'Imported telemetry (unverified)'}</p>
            <small>No external data sources connected</small>
          </div>
          <div className="profile-row"><div className="avatar">Q</div><div><strong>Analyst workspace</strong><small>Development build · v0.2.0</small></div></div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">Workspace <ChevronRight size={14} /> <strong>Overview</strong></div>
          <div className="top-actions"><span className={`connection ${apiOnline ? 'online' : ''}`}><span className="status-dot" />{apiOnline ? 'API connected' : 'API offline'}</span><div className="top-avatar">Q</div></div>
        </header>

        <div className="content">
          <section className="page-heading" id="overview">
            <div><div className="eyebrow"><span className="eyebrow-line" /> SECURITY OPERATIONS / DEVELOPMENT</div>
              <h1>Investigation overview</h1>
              <p>Connect the signals. Understand the incident. Preserve the evidence.</p>
            </div>
            <div className="heading-actions">
              <label className="scenario-select-label">
                <span>DEMO SCENARIO</span>
                <select value={selectedScenario} onChange={event => setSelectedScenario(event.target.value)} disabled={busy}>
                  {scenarios.map(scenario => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}
                </select>
              </label>
              <button className="primary-btn" onClick={replay} disabled={busy}><Play size={15} fill="currentColor" />{busy ? 'Running scenario…' : 'Replay scenario'}</button>
            </div>
          </section>

          <div className="notice"><div className="notice-icon"><Shield size={17} /></div><div><strong>{simulatedOnly ? 'Local simulation environment' : 'Imported data loaded'}</strong><span>{simulatedOnly ? 'All current events are synthetic. No live endpoints or external telemetry are being monitored.' : 'These events were imported by an analyst and are unverified. No live endpoints are being monitored.'}</span></div><span className="notice-tag">SAFE LAB</span></div>

          <section className="metrics-grid">
            <Metric icon={<RadioTower size={17}/>} label="Events ingested" value={events.length} detail="Current scenario" tone="blue"/>
            <Metric icon={<ShieldAlert size={17}/>} label="Alerts generated" value={alerts.length} detail="Rule matches" tone="amber"/>
            <Metric icon={<GitMerge size={17}/>} label="Candidate incidents" value={incidents.length} detail="Correlated alerts" tone="violet"/>
            <Metric icon={<Fingerprint size={17}/>} label="Evidence references" value={new Set(alerts.flatMap(a => a.matched_event_ids)).size} detail="Unique event IDs" tone="teal"/>
          </section>

          <div className="status-message"><span className="status-dot" />{message}</div>

          <section className="section-grid">
            <div className="panel incidents-panel" id="incidents">
              <div className="panel-header"><div><div className="panel-kicker">INVESTIGATION QUEUE</div><h2>Candidate incidents</h2></div><span className="count-pill">{incidents.length} total</span></div>
              {incidents.length === 0 ? <Empty icon={<Shield size={20}/>} title="No incidents yet" text="Run the demo scenario to create a candidate incident from related alerts."/> :
                incidents.map(incident => <button key={incident.id} className={`incident-row ${selected === incident.id ? 'selected' : ''}`} onClick={() => setSelected(incident.id)}>
                  <div className="incident-icon"><AlertTriangle size={17}/></div><div className="incident-copy"><div className="incident-title">{incident.title}</div><div className="incident-meta">{incident.id} <span>·</span> {incident.entities.host}</div><div className="incident-tags"><span className={`severity ${incident.severity}`}>{incident.severity}</span><span className="mini-tag">{incident.alert_ids.length} alerts</span></div></div><ChevronRight size={17} className="row-chevron"/>
                </button>)}
              <div className="panel-footer"><span><CircleDot size={13}/> Correlation is a hypothesis, not proof.</span></div>
            </div>

            <div className="panel timeline-panel">
              <div className="panel-header"><div><div className="panel-kicker">EVENT SEQUENCE</div><h2>Evidence timeline</h2></div><span className="count-pill">{events.length} events</span></div>
              {events.length === 0 ? <Empty icon={<Clock3 size={20}/>} title="Timeline is waiting" text="Your scenario's event sequence will appear here."/> :
                <div className="timeline">
                  {events.map((event, idx) => <div className="timeline-item" key={event.event_id}>
                    <div className="timeline-track"><span className={`timeline-dot ${event.event_type.endsWith('success') ? 'success' : 'failure'}`} />{idx !== events.length - 1 && <span className="timeline-line"/>}</div>
                    <div className="timeline-content"><div className="timeline-time">{time(event.timestamp)} <span>{event.event_id}</span></div><div className="timeline-title">{label(event.event_type)}</div><div className="timeline-desc">{event.user} · {event.host} · {event.details?.reason ?? event.source}</div></div>
                  </div>)}
                </div>}
            </div>
          </section>

          <section className="panel event-explorer" id="events">
            <div className="panel-header event-explorer-header">
              <div><div className="panel-kicker">TELEMETRY / SEARCH</div><h2>Event explorer</h2></div>
              <span className="count-pill">{filteredEvents.length} of {events.length} events</span>
            </div>
            <label className="event-search">
              <Search size={17} />
              <input
                value={eventQuery}
                onChange={event => setEventQuery(event.target.value)}
                placeholder="Search event ID, user, host, source IP, type or reason…"
                aria-label="Search events"
              />
              {eventQuery && <button type="button" className="clear-search" onClick={() => setEventQuery('')}>Clear</button>}
            </label>
            <label className="event-type-filter">
              <span>EVENT TYPE</span>
              <select value={eventType} onChange={event => setEventType(event.target.value)} aria-label="Filter by event type">
                <option value="all">All types</option>
                {Array.from(new Set(events.map(event => event.event_type))).sort().map(type => <option key={type} value={type}>{label(type)}</option>)}
              </select>
            </label>
            {filteredEvents.length === 0 ? <Empty icon={<Search size={20}/>} title={events.length ? 'No matching events' : 'No events to explore'} text={events.length ? 'Try another event ID, user, host, source IP or event type.' : 'Replay a scenario to populate the event explorer.'}/> :
              <div className="table-wrap"><table><thead><tr><th>EVENT / TIME (UTC)</th><th>TYPE</th><th>USER / HOST</th><th>SOURCE IP</th><th>REASON</th></tr></thead><tbody>
                {filteredEvents.map(event => <tr key={event.event_id}>
                  <td><div className="rule-id">{event.event_id}</div><div className="table-sub">{time(event.timestamp)}</div></td>
                  <td><span className={`event-type ${event.event_type.endsWith('success') ? 'event-success' : 'event-failure'}`}>{label(event.event_type)}</span></td>
                  <td><div className="table-main">{event.user}</div><div className="table-sub">{event.host}</div></td>
                  <td className="time-cell">{event.src_ip ?? '—'}</td>
                  <td className="table-sub">{event.details?.reason ?? event.source}</td>
                </tr>)}
              </tbody></table></div>}
          </section>

          <section className="panel alerts-panel" id="alerts">
            <div className="panel-header"><div><div className="panel-kicker">DETECTION ENGINE</div><h2>Generated alerts</h2></div><span className="count-pill">{alerts.length} matches</span></div>
            {alerts.length === 0 ? <Empty icon={<Zap size={20}/>} title="No alerts generated" text="Run a scenario to evaluate authentication detection rules."/> :
              <div className="table-wrap"><table><thead><tr><th>RULE / DETECTION</th><th>SEVERITY</th><th>ENTITY</th><th>EVIDENCE</th><th>TRIGGERED (UTC)</th></tr></thead><tbody>
                {alerts.map(alert => <tr key={alert.id}><td><div className="rule-id">{alert.rule_id}</div><div className="table-main">{alert.title}</div><div className="table-sub">{alert.summary}</div>{alert.threshold && <div className="table-sub">Threshold: {alert.threshold}</div>}</td><td><span className={`severity ${alert.severity}`}>{alert.severity}</span></td><td><div className="table-main">{alert.entity.user}</div><div className="table-sub">{alert.entity.host}</div></td><td><span className="evidence-count">{alert.matched_event_ids.length} event refs</span></td><td className="time-cell">{time(alert.created_at)}</td></tr>)}
              </tbody></table></div>}
          </section>

          <section className="panel casebook-panel" id="casebook">
            <div className="panel-header"><div><div className="panel-kicker">CASEBOOK PREVIEW</div><h2>{activeIncident ? activeIncident.title : 'Investigation casebook'}</h2></div><span className="draft-label"><BookOpen size={13}/> {activeIncident ? activeIncident.status.toUpperCase() : 'EMPTY'}</span></div>
            {!activeIncident ? <Empty icon={<BookOpen size={20}/>} title="No casebook to inspect" text="A casebook will be available when a candidate incident exists."/> :
              <div className="casebook-body"><div className="casebook-summary"><div className="casebook-id">{activeIncident.id}</div><p>{activeIncident.correlation_reason}</p><div className="casebook-stats"><span><strong>{activeIncident.alert_ids.length}</strong> alerts</span><span><strong>{activeIncident.event_ids.length}</strong> evidence references</span><span><strong>{activeIncident.status}</strong> status</span></div></div><div className="casebook-next"><div className="next-icon"><CheckCircle2 size={18}/></div><div><strong>Next step</strong><p>Open the investigation workspace to review evidence, save analyst notes, change status and export the report.</p></div><ArrowUpRight size={17}/></div></div>}
          </section>
          {activeIncident && (
  <button
    className="primary-btn"
    onClick={() => setView('investigation')}
  >
    Open investigation →
  </button>
)}
          <section className="panel import-panel" id="import">
            <div className="panel-header"><div><div className="panel-kicker">TELEMETRY / IMPORT</div><h2>Import events</h2></div><span className="count-pill">JSON</span></div>
            <div className="import-body">
            <p className="import-help">Paste a JSON array of events, or choose a file. Required fields: <code>event_id</code>, <code>timestamp</code> (ISO 8601), <code>event_type</code>, <code>host</code>, <code>user</code>. Optional: <code>src_ip</code>, <code>details</code>. Detections currently understand <code>authentication.failure</code> and <code>authentication.success</code>. Use only authorized, sanitized data. The import is rejected as a whole if any record is invalid.</p>
            <textarea className="import-box" value={importText} onChange={event => setImportText(event.target.value)} rows={8} spellCheck={false} aria-label="Events JSON" placeholder='[{"event_id":"E1","timestamp":"2026-10-14T09:00:00Z","event_type":"authentication.failure","host":"srv-1","user":"bob","src_ip":"198.51.100.9"}]' />
            <div className="import-actions">
              <label className="file-btn">Choose JSON file<input type="file" accept="application/json,.json" onChange={event => void loadImportFile(event.target.files?.[0])} hidden /></label>
              <button className="primary-btn" onClick={() => void importEvents()} disabled={importing || !importText.trim()}>{importing ? 'Importing…' : 'Import events'}</button>
            </div>
            {importErrors.length > 0 && <ul className="import-errors" role="alert">{importErrors.map((error, index) => <li key={index}>{error}</li>)}</ul>}
            </div>
          </section>
          <footer><span>QaceFlow <b>·</b> v0.2.0</span><span><span className="status-dot"/> Local-first · {simulatedOnly ? 'Synthetic data' : 'Imported data'}</span><span>Built for explainable investigations</span></footer>
        </div>
      </main>
    </div>
  )
}

function Metric({icon,label,value,detail,tone}:{icon:React.ReactNode;label:string;value:number;detail:string;tone:string}) {
  return <div className="metric-card"><div className="metric-top"><span className={`metric-icon ${tone}`}>{icon}</span><span className="metric-detail">{detail}</span></div><div className="metric-value">{value.toString().padStart(2,'0')}</div><div className="metric-label">{label}</div></div>
}
function Empty({icon,title,text}:{icon:React.ReactNode;title:string;text:string}) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><strong>{title}</strong><p>{text}</p></div>
}
