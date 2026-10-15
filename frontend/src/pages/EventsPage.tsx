import { Fragment, useMemo, useState } from 'react'
import { Chip, Empty, PageHead } from '../components/ui'
import { utc } from '../format'
import type { Alert, EventRecord } from '../types'

type Props = { events: EventRecord[]; alerts: Alert[] }

export default function EventsPage({ events, alerts }: Props) {
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const [open, setOpen] = useState<string | null>(null)

  const types = useMemo(() => Array.from(new Set(events.map((e) => e.event_type))).sort(), [events])

  const alertsByEvent = useMemo(() => {
    const map = new Map<string, string[]>()
    alerts.forEach((alert) =>
      alert.matched_event_ids.forEach((id) => map.set(id, [...(map.get(id) ?? []), alert.id])),
    )
    return map
  }, [alerts])

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return [...events]
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.event_id.localeCompare(b.event_id))
      .filter((event) => type === 'all' || event.event_type === type)
      .filter(
        (event) =>
          !needle ||
          [event.event_id, event.event_type, event.user, event.host, event.src_ip, JSON.stringify(event.details ?? {})]
            .join(' ')
            .toLowerCase()
            .includes(needle),
      )
  }, [events, query, type])

  return (
    <>
      <PageHead
        title="Events"
        lede={events.length ? `${rows.length} of ${events.length} events shown, oldest first.` : 'Nothing loaded yet.'}
      />

      {events.length === 0 ? (
        <Empty title="No events">Load a scenario or import events on the <a href="#/data">Data</a> page.</Empty>
      ) : (
        <>
          <div className="filters">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ID, account, host, IP, reason…"
              aria-label="Search events"
            />
            <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by event type">
              <option value="all">All event types</option>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {(query || type !== 'all') && (
              <button type="button" className="link-btn" onClick={() => { setQuery(''); setType('all') }}>
                Clear filters
              </button>
            )}
          </div>

          {rows.length === 0 ? (
            <Empty title="No events match these filters" />
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
                    <th>Referenced by</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((event) => {
                    const expanded = open === event.event_id
                    const refs = alertsByEvent.get(event.event_id) ?? []
                    return (
                      <Fragment key={event.event_id}>
                        <tr>
                          <td className="mono">{utc(event.timestamp)}</td>
                          <td>
                            <button
                              type="button"
                              className="id-btn"
                              aria-expanded={expanded}
                              onClick={() => setOpen(expanded ? null : event.event_id)}
                            >
                              {event.event_id}
                            </button>
                          </td>
                          <td className="mono">{event.event_type}</td>
                          <td>
                            {event.user}
                            <div className="muted">{event.host}</div>
                          </td>
                          <td className="mono">{event.src_ip ?? '—'}</td>
                          <td>
                            {refs.length === 0 ? <span className="muted">—</span> : refs.map((id) => <Chip key={id}>{id}</Chip>)}
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="detail-row">
                            <td colSpan={6}>
                              <pre className="raw">{JSON.stringify(event, null, 2)}</pre>
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
      )}
    </>
  )
}
