import { useEffect, useState } from 'react'
import { getRules, ApiError } from '../api'
import { Empty, PageHead, Severity } from '../components/ui'
import type { Rule } from '../types'

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getRules()
      .then(setRules)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Could not load rules.'))
  }, [])

  return (
    <>
      <PageHead
        title="Detection rules"
        lede="Every alert comes from one of these deterministic rules. Thresholds are fixed and visible, so a detection can always be explained and challenged."
      />

      {error ? (
        <Empty title="Rules unavailable">{error}</Empty>
      ) : rules === null ? (
        <p className="muted">Loading rules…</p>
      ) : (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Severity</th>
                <th>Triggers when</th>
                <th>Why it matters, and what could be innocent</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td>
                    <span className="mono">{rule.id}</span>
                    <div>{rule.name}</div>
                  </td>
                  <td><Severity value={rule.severity} /></td>
                  <td>{rule.threshold}</td>
                  <td>{rule.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
