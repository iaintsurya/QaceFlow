import { Empty, PageHead, Severity, Status } from '../components/ui'
import { eventSpan, plural, utc } from '../format'
import { caseHref, navigate } from '../router'
import type { Alert, EventRecord, Incident } from '../types'

type Props = { incidents: Incident[]; alerts: Alert[]; events: EventRecord[] }

export default function CasesPage({ incidents, alerts, events }: Props) {
  const byId = new Map(events.map((event) => [event.event_id, event]))
  const incidentOf = new Map<string, string>()
  incidents.forEach((incident) => incident.alert_ids.forEach((id) => incidentOf.set(id, incident.id)))

  const latestAlerts = [...alerts]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5)

  const open = incidents.filter((incident) => incident.status !== 'closed').length

  return (
    <>
      <PageHead
        title="Cases"
        lede={
          events.length === 0
            ? 'Nothing loaded yet.'
            : `${plural(incidents.length, 'case')} (${open} not closed) · ${plural(alerts.length, 'alert')} · ${plural(events.length, 'event')}`
        }
      />

      {incidents.length === 0 ? (
        <Empty title={events.length === 0 ? 'No data loaded' : 'No candidate incidents'}>
          {events.length === 0 ? (
            <>Load a scenario or import events on the <a href="#/data">Data</a> page.</>
          ) : (
            <>Detections found nothing that correlates into a case. Review the <a href="#/alerts">alerts</a>.</>
          )}
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Case</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Account · host</th>
                <th className="num">Alerts</th>
                <th className="num">Events</th>
                <th>First event (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((incident) => {
                const span = eventSpan(
                  incident.event_ids.flatMap((id) => {
                    const event = byId.get(id)
                    return event ? [event] : []
                  }),
                )
                return (
                  <tr key={incident.id} className="row-link" onClick={() => navigate(caseHref(incident.id))}>
                    <td>
                      <a className="case-title" href={caseHref(incident.id)}>{incident.title}</a>
                      <div className="mono muted">{incident.id}</div>
                    </td>
                    <td><Severity value={incident.severity} /></td>
                    <td><Status value={incident.status} /></td>
                    <td>
                      {incident.entities.user ?? '—'}
                      <div className="muted">{incident.entities.host ?? '—'}</div>
                    </td>
                    <td className="num">{incident.alert_ids.length}</td>
                    <td className="num">{incident.event_ids.length}</td>
                    <td className="mono">{utc(span.first)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {latestAlerts.length > 0 && (
        <section className="block">
          <div className="block-head">
            <h2>Latest alerts</h2>
            <a href="#/alerts">All alerts</a>
          </div>
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>Alert</th>
                  <th>Severity</th>
                  <th>What triggered</th>
                  <th>Case</th>
                  <th>Triggered (UTC)</th>
                </tr>
              </thead>
              <tbody>
                {latestAlerts.map((alert) => {
                  const caseId = incidentOf.get(alert.id)
                  return (
                    <tr key={alert.id}>
                      <td>
                        <span className="mono">{alert.id}</span>
                        <div className="muted">{alert.title}</div>
                      </td>
                      <td><Severity value={alert.severity} /></td>
                      <td>{alert.summary}</td>
                      <td>{caseId ? <a className="mono" href={caseHref(caseId)}>{caseId}</a> : <span className="muted">—</span>}</td>
                      <td className="mono">{utc(alert.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}
