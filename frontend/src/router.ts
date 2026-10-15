import { useEffect, useState } from 'react'

export type Route =
  | { name: 'cases' }
  | { name: 'case'; id: string }
  | { name: 'events' }
  | { name: 'alerts' }
  | { name: 'rules' }
  | { name: 'data' }

export function parseRoute(hash: string): Route {
  const [first, second] = hash.replace(/^#\/?/, '').split('/')
  switch (first) {
    case 'cases':
      return second ? { name: 'case', id: decodeURIComponent(second) } : { name: 'cases' }
    case 'events':
      return { name: 'events' }
    case 'alerts':
      return { name: 'alerts' }
    case 'rules':
      return { name: 'rules' }
    case 'data':
      return { name: 'data' }
    default:
      return { name: 'cases' }
  }
}

export const caseHref = (id: string) => `#/cases/${encodeURIComponent(id)}`

export function navigate(hash: string) {
  window.location.hash = hash
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash))

  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(window.location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return route
}
