import { useEffect, useState } from 'react'
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BookOpen,
  CheckCircle2, ChevronRight, CircleDot, Clock3, Fingerprint, GitMerge,
  Play, RadioTower, Shield, ShieldAlert, Workflow, Zap
} from 'lucide-react'

const API = 'http://127.0.0.1:8000'

type EventRecord = {
  event_id: string; timestamp: string; event_type: string; host: string
  user: string; source: string; src_ip?: string; details: { reason?: string }
}
type Alert = {
  id: string; rule_id: string; title: string; severity: string; summary: string
  matched_event_ids: string[]; entity: { host: string; user: string }; created_at: string
}
type Incident = {
  id: string; title: string; status: string; severity: string
  alert_ids: string[]; event_ids: string[]; entities: { host: string; user: string }
  correlation_reason: string
}

function time(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC', timeZoneName: 'short' })
}
function label(value: string) {
  return value.replaceAll('.', ' ').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function App() {
  const [events, setEvents] = useState<EventRecord[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Run a scenario to populate the investigation workspace.')
  const [selected, setSelected] = useState<string | null>(null)
  const [apiOnline, setApiOnline] = useState(false)

  async function refresh() {
    try {
      const [e, a, i] = await Promise.all([
        fetch(`${API}/api/events`), fetch(`${API}/api/alerts`), fetch(`${API}/api/incidents`)
      ])
      if (!e.ok || !a.ok || !i.ok) throw new Error('API request failed')
      setEvents(await e.json()); setAlerts(await a.json()); setIncidents(await i.json())
      setApiOnline(true)
    } catch {
      setApiOnline(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  async function replay() {
    setBusy(true)
    setMessage('Generating simulated telemetry and evaluating detections…')
    try {
      const response = await fetch(`${API}/api/scenarios/suspicious-login/replay`, { method: 'POST' })
      if (!response.ok) throw new Error('Scenario replay failed')
      const result = await response.json()
      await refresh()
      setSelected(result.incident_count ? 'INC-0001' : null)
      setMessage(`Replay complete · ${result.event_count} events · ${result.alert_count} alerts · ${result.incident_count} candidate incidents`)
    } catch {
      setMessage('Could not reach the API. Start the backend at http://127.0.0.1:8000 and try again.')
    } finally { setBusy(false) }
  }

  const activeIncident = incidents.find(i => i.id === selected) ?? incidents[0]
  const selectedAlerts = activeIncident ? alerts.filter(a => activeIncident.alert_ids.includes(a.id)) : alerts

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Workflow size={21} /></div>
          <div><div className="brand-name">QaceFlow<span>.</span></div><div className="brand-sub">INVESTIGATION WORKBENCH</div></div>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          <a className="nav-item active"><Activity size={17} /> Overview <span className="nav-count">01</span></a>
          <a className="nav-item"><RadioTower size={17} /> Telemetry</a>
          <a className="nav-item"><Zap size={17} /> Detections</a>
          <a className="nav-item"><GitMerge size={17} /> Incidents <span className="nav-count">{incidents.length.toString().padStart(2, '0')}</span></a>
          <a className="nav-item"><BookOpen size={17} /> Casebooks</a>
        </nav>
        <div className="sidebar-bottom">
          <div className="env-card">
            <div className="env-top"><span className="status-dot" /> LOCAL LAB</div>
            <p>Simulated telemetry only</p>
            <small>No external data sources connected</small>
          </div>
          <div className="profile-row"><div className="avatar">Q</div><div><strong>Analyst workspace</strong><small>Development build · v0.1.0</small></div></div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">Workspace <ChevronRight size={14} /> <strong>Overview</strong></div>
          <div className="top-actions"><span className={`connection ${apiOnline ? 'online' : ''}`}><span className="status-dot" />{apiOnline ? 'API connected' : 'API offline'}</span><div className="top-avatar">Q</div></div>
        </header>

        <div className="content">
          <section className="page-heading">
            <div><div className="eyebrow"><span className="eyebrow-line" /> SECURITY OPERATIONS / DEVELOPMENT</div>
              <h1>Investigation overview</h1>
              <p>Connect the signals. Understand the incident. Preserve the evidence.</p>
            </div>
            <button className="primary-btn" onClick={replay} disabled={busy}><Play size={15} fill="currentColor" />{busy ? 'Running scenario…' : 'Run demo scenario'}</button>
          </section>

          <div className="notice"><div className="notice-icon"><Shield size={17} /></div><div><strong>Local simulation environment</strong><span>All current events are synthetic. No live endpoints or external telemetry are being monitored.</span></div><span className="notice-tag">SAFE LAB</span></div>

          <section className="metrics-grid">
            <Metric icon={<RadioTower size={17}/>} label="Events ingested" value={events.length} detail="Current scenario" tone="blue"/>
            <Metric icon={<ShieldAlert size={17}/>} label="Alerts generated" value={alerts.length} detail="Rule matches" tone="amber"/>
            <Metric icon={<GitMerge size={17}/>} label="Candidate incidents" value={incidents.length} detail="Correlated alerts" tone="violet"/>
            <Metric icon={<Fingerprint size={17}/>} label="Evidence references" value={new Set(alerts.flatMap(a => a.matched_event_ids)).size} detail="Unique event IDs" tone="teal"/>
          </section>

          <div className="status-message"><span className="status-dot" />{message}</div>

          <section className="section-grid">
            <div className="panel incidents-panel">
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

          <section className="panel alerts-panel">
            <div className="panel-header"><div><div className="panel-kicker">DETECTION ENGINE</div><h2>Generated alerts</h2></div><span className="count-pill">{alerts.length} matches</span></div>
            {alerts.length === 0 ? <Empty icon={<Zap size={20}/>} title="No alerts generated" text="Run a scenario to evaluate authentication detection rules."/> :
              <div className="table-wrap"><table><thead><tr><th>RULE / DETECTION</th><th>SEVERITY</th><th>ENTITY</th><th>EVIDENCE</th><th>TRIGGERED (UTC)</th></tr></thead><tbody>
                {alerts.map(alert => <tr key={alert.id}><td><div className="rule-id">{alert.rule_id}</div><div className="table-main">{alert.title}</div><div className="table-sub">{alert.summary}</div></td><td><span className={`severity ${alert.severity}`}>{alert.severity}</span></td><td><div className="table-main">{alert.entity.user}</div><div className="table-sub">{alert.entity.host}</div></td><td><span className="evidence-count">{alert.matched_event_ids.length} event refs</span></td><td className="time-cell">{time(alert.created_at)}</td></tr>)}
              </tbody></table></div>}
          </section>

          <section className="panel casebook-panel">
            <div className="panel-header"><div><div className="panel-kicker">CASEBOOK PREVIEW</div><h2>{activeIncident ? activeIncident.title : 'Investigation casebook'}</h2></div><span className="draft-label"><BookOpen size={13}/> FOUNDATION</span></div>
            {!activeIncident ? <Empty icon={<BookOpen size={20}/>} title="No casebook to inspect" text="A casebook will be available when a candidate incident exists."/> :
              <div className="casebook-body"><div className="casebook-summary"><div className="casebook-id">{activeIncident.id}</div><p>{activeIncident.correlation_reason}</p><div className="casebook-stats"><span><strong>{activeIncident.alert_ids.length}</strong> alerts</span><span><strong>{activeIncident.event_ids.length}</strong> evidence references</span><span><strong>{activeIncident.status}</strong> status</span></div></div><div className="casebook-next"><div className="next-icon"><CheckCircle2 size={18}/></div><div><strong>Next milestone</strong><p>Add persistent analyst notes, evidence annotations, investigation checklist, and report export.</p></div><ArrowUpRight size={17}/></div></div>}
          </section>
          <footer><span>QaceFlow <b>·</b> v0.1.0</span><span><span className="status-dot"/> Local-first · Synthetic data</span><span>Built for explainable investigations</span></footer>
        </div>
      </main>
    </div>
  )
}

function Metric({icon,label,value,detail,tone}:{icon:React.ReactNode;label:string;value:number;detail:string;tone:string}) {
  return <div className="metric-card"><div className="metric-top"><span className={`metric-icon ${tone}`}>{icon}</span><span className="metric-detail">{detail}</span></div><div className="metric-value">{value.toString().padStart(2,'0')}</div><div className="metric-label">{label}</div><div className="metric-bottom"><span className="metric-trend"><ArrowDownRight size={13}/> Live demo</span><span className="metric-neutral">Local data</span></div></div>
}
function Empty({icon,title,text}:{icon:React.ReactNode;title:string;text:string}) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><strong>{title}</strong><p>{text}</p></div>
}
