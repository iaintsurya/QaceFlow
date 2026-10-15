import { useCallback, useEffect, useState } from 'react'
import pkg from '../package.json'
import { getAlerts, getEvents, getIncidents } from './api'
import TopBar from './components/TopBar'
import { Flash } from './components/ui'
import { datasetOrigin } from './format'
import AlertsPage from './pages/AlertsPage'
import CasePage from './pages/CasePage'
import CasesPage from './pages/CasesPage'
import DataPage from './pages/DataPage'
import EventsPage from './pages/EventsPage'
import RulesPage from './pages/RulesPage'
import { navigate, useRoute } from './router'
import type { Notice, Workspace } from './types'

const EMPTY: Workspace = { events: [], alerts: [], incidents: [] }

export default function App() {
  const route = useRoute()
  const [data, setData] = useState<Workspace>(EMPTY)
  const [online, setOnline] = useState<boolean | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  const refresh = useCallback(async (): Promise<Workspace | null> => {
    try {
      const [events, alerts, incidents] = await Promise.all([getEvents(), getAlerts(), getIncidents()])
      const next = { events, alerts, incidents }
      setData(next)
      setOnline(true)
      return next
    } catch {
      setOnline(false)
      return null
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 8000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const onLoaded = useCallback(
    async (summary: string) => {
      const next = await refresh()
      setNotice(
        next
          ? { kind: 'ok', text: summary }
          : { kind: 'error', text: 'Data was loaded, but the lists could not be refreshed from the API.' },
      )
      navigate('#/cases')
    },
    [refresh],
  )

  const origin = datasetOrigin(data.events)

  let page
  switch (route.name) {
    case 'case':
      page =
        online === null ? (
          <p className="muted">Loading…</p>
        ) : (
          <CasePage
            incident={data.incidents.find((incident) => incident.id === route.id)}
            alerts={data.alerts}
            events={data.events}
            onChanged={refresh}
          />
        )
      break
    case 'events':
      page = <EventsPage events={data.events} alerts={data.alerts} />
      break
    case 'alerts':
      page = <AlertsPage alerts={data.alerts} incidents={data.incidents} />
      break
    case 'rules':
      page = <RulesPage />
      break
    case 'data':
      page = (
        <DataPage
          origin={origin}
          eventCount={data.events.length}
          incidents={data.incidents}
          onLoaded={onLoaded}
        />
      )
      break
    default:
      page = <CasesPage incidents={data.incidents} alerts={data.alerts} events={data.events} />
  }

  return (
    <>
      <TopBar route={route} origin={origin} online={online} />
      <main className="page">
        {online === false && (
          <div className="flash flash-error" role="alert">
            <span>Cannot reach the API at http://127.0.0.1:8000. Start the backend, then retry.</span>
            <button type="button" className="link-btn" onClick={() => void refresh()}>Retry</button>
          </div>
        )}
        <Flash notice={notice} onDismiss={() => setNotice(null)} />
        {page}
      </main>
      <footer className="site-foot">
        QaceFlow v{pkg.version} · Open-source security investigation workbench · A candidate case is a hypothesis, not proof of compromise.
      </footer>
    </>
  )
}
