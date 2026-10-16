import { Fragment, useState } from 'react'
import { Chip, Empty, PageHead, Severity, Techniques } from '../components/ui'
import { plural, utc } from '../format'
import { caseHref } from '../router'
import type { Alert, Incident } from '../types'

type Props = { alerts: Alert[]; incidents: Incident[] }

export default function AlertsPage({ alerts, incidents }: Props) {
  const [open, setOpen] = useState<string | null>(null)

  const caseOf = new Map<string, string>()
  incidents.forEach((incident) => incident.alert_ids.forEach((id) => caseOf.set(id, incident.id)))

  const rows = [...alerts].sort((a, b) => a.created_at.localeCompare(b.created_at))

  return (
    <>
      <PageHead
        title="Alerts"
        lede={alerts.length ? `${plural(alerts.length, 'alert')}. Select an alert ID to see why it triggered.` : 'Nothing loaded yet.'}
      />

      {alerts.length === 0 ? (
        <Empty title="No alerts">
          The loaded events did not match any detection rule. See the <a href="#/rules">rules</a> for the thresholds.
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Alert</th>
                <th>Rule</th>
                <th>Severity</th>
                <th>Account · host</th>
                <th className="num">Evidence</th>
                <th>Case</th>
                <th>Triggered (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((alert) => {
                const expanded = open === alert.id
                const caseId = caseOf.get(alert.id)
                return (
                  <Fragment key={alert.id}>
                    <tr>
                      <td>
                        <button
                          type="button"
                          className="id-btn"
                          aria-expanded={expanded}
                          onClick={() => setOpen(expanded ? null : alert.id)}
                        >
                          {alert.id}
                        </button>
                      </td>
                      <td>
                        <span className="mono">{alert.rule_id}</span>
                        <div className="muted">{alert.title}</div>
                      </td>
                      <td><Severity value={alert.severity} /></td>
                      <td>
                        {alert.entity.user}
                        <div className="muted">{alert.entity.host}</div>
                      </td>
                      <td className="num">{alert.matched_event_ids.length}</td>
                      <td>{caseId ? <a className="mono" href={caseHref(caseId)}>{caseId}</a> : <span className="muted">—</span>}</td>
                      <td className="mono">{utc(alert.created_at)}</td>
                    </tr>
                    {expanded && (
                      <tr className="detail-row">
                        <td colSpan={7}>
                          <dl className="facts">
                            <dt>What triggered</dt>
                            <dd>{alert.summary}</dd>
                            {alert.threshold && (<><dt>Rule threshold</dt><dd>{alert.threshold}</dd></>)}
                            {alert.explanation && (<><dt>Why it matters</dt><dd>{alert.explanation}</dd></>)}
                            {alert.mitre && alert.mitre.length > 0 && (<><dt>MITRE ATT&amp;CK</dt><dd><Techniques items={alert.mitre} /></dd></>)}
                            <dt>Evidence</dt>
                            <dd>{alert.matched_event_ids.map((id) => <Chip key={id}>{id}</Chip>)}</dd>
                          </dl>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
