import type { Origin } from '../format'
import type { Route } from '../router'

const TABS: { name: Route['name']; href: string; label: string }[] = [
  { name: 'cases', href: '#/cases', label: 'Cases' },
  { name: 'events', href: '#/events', label: 'Events' },
  { name: 'alerts', href: '#/alerts', label: 'Alerts' },
  { name: 'rules', href: '#/rules', label: 'Rules' },
  { name: 'data', href: '#/data', label: 'Data' },
]

type Props = { route: Route; origin: Origin; online: boolean | null }

export default function TopBar({ route, origin, online }: Props) {
  const active = route.name === 'case' ? 'cases' : route.name

  return (
    <div className="topbar">
      <div className="topbar-inner">
        <a className="wordmark" href="#/cases" aria-label="QaceFlow home">
          Qace<span>Flow</span>
        </a>

        <nav className="tabs" aria-label="Primary">
          {TABS.map((tab) => (
            <a
              key={tab.name}
              href={tab.href}
              className={tab.name === active ? 'tab tab-active' : 'tab'}
              aria-current={tab.name === active ? 'page' : undefined}
            >
              {tab.label}
            </a>
          ))}
        </nav>

        <div className="topbar-meta">
          <a href="#/data" className={`origin origin-${origin.kind}`} title="Where the loaded events came from">
            <i aria-hidden="true" />
            {origin.label}
          </a>
          <span className={`api api-${online === false ? 'down' : 'up'}`}>
            {online === null ? 'Connecting…' : online ? 'API online' : 'API offline'}
          </span>
        </div>
      </div>
    </div>
  )
}
