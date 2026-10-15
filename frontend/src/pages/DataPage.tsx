import { useEffect, useState } from 'react'
import { ApiError, getScenarios, importEvents, replayScenario } from '../api'
import { PageHead } from '../components/ui'
import { plural } from '../format'
import type { Origin } from '../format'
import type { Incident, LoadResult, Scenario } from '../types'

type Props = {
  origin: Origin
  eventCount: number
  incidents: Incident[]
  onLoaded: (summary: string) => Promise<void>
}

const FALLBACK: Scenario[] = [
  { id: 'suspicious-login', name: 'Suspicious login', description: 'Failed logins followed by a success.', event_count: 6 },
  { id: 'repeated-failures', name: 'Repeated failures', description: 'Repeated failures with no success.', event_count: 5 },
  { id: 'benign-login', name: 'Benign login activity', description: 'Ordinary successful logins.', event_count: 3 },
]

const REPLACE_WARNING =
  'This replaces the active dataset and clears saved notes and case status. Continue?'

function summarise(result: LoadResult): string {
  return `${plural(result.event_count, 'event')}, ${plural(result.alert_count, 'alert')}, ${plural(result.incident_count, 'candidate case')}.`
}

export default function DataPage({ origin, eventCount, incidents, onLoaded }: Props) {
  const [scenarios, setScenarios] = useState<Scenario[]>(FALLBACK)
  const [scenarioId, setScenarioId] = useState('suspicious-login')
  const [busy, setBusy] = useState<'replay' | 'import' | null>(null)
  const [replayError, setReplayError] = useState('')
  const [text, setText] = useState('')
  const [importProblems, setImportProblems] = useState<string[]>([])

  useEffect(() => {
    getScenarios().then(setScenarios).catch(() => setScenarios(FALLBACK))
  }, [])

  const chosen = scenarios.find((s) => s.id === scenarioId)
  const confirmReplace = () => incidents.length === 0 || window.confirm(REPLACE_WARNING)

  async function replay() {
    if (!confirmReplace()) return
    setBusy('replay')
    setReplayError('')
    try {
      const result = await replayScenario(scenarioId)
      await onLoaded(`Loaded “${chosen?.name ?? scenarioId}”: ${summarise(result)} Notes and status were reset.`)
    } catch (err) {
      setReplayError(err instanceof ApiError ? err.message : 'Scenario replay failed.')
    } finally {
      setBusy(null)
    }
  }

  async function runImport() {
    setImportProblems([])
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      setImportProblems(['The text is not valid JSON.'])
      return
    }
    const events = Array.isArray(parsed) ? parsed : (parsed as { events?: unknown } | null)?.events
    if (!confirmReplace()) return

    setBusy('import')
    try {
      const result = await importEvents(events)
      setText('')
      await onLoaded(`Imported ${summarise(result)} Imported events are unverified. Notes and status were reset.`)
    } catch (err) {
      setImportProblems(
        err instanceof ApiError ? [err.message, ...err.details] : ['Import failed.'],
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHead
        title="Data"
        lede={
          eventCount === 0
            ? 'No data is loaded. Replay a scenario or import your own events.'
            : `Currently loaded: ${plural(eventCount, 'event')} · ${origin.label.toLowerCase()}.`
        }
      />

      <section className="block">
        <h2>Replay a scenario</h2>
        <p className="muted">Synthetic, deterministic telemetry for trying the detections.</p>
        <div className="form-row">
          <select value={scenarioId} onChange={(e) => setScenarioId(e.target.value)} aria-label="Scenario">
            {scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button type="button" className="btn btn-primary" onClick={() => void replay()} disabled={busy !== null}>
            {busy === 'replay' ? 'Replaying…' : 'Replay scenario'}
          </button>
        </div>
        {chosen && <p className="muted">{chosen.description} {plural(chosen.event_count, 'event')}.</p>}
        {replayError && <p className="form-error" role="alert">{replayError}</p>}
      </section>

      <section className="block">
        <h2>Import events</h2>
        <p className="muted">
          Paste a JSON array or choose a file. Required: <code>event_id</code>, <code>timestamp</code> (ISO 8601),{' '}
          <code>event_type</code>, <code>host</code>, <code>user</code>. Optional: <code>src_ip</code>, <code>details</code>.
          Detections understand <code>authentication.failure</code> and <code>authentication.success</code>.
          The whole import is rejected if any record is invalid. Use only data you are authorised to analyse.
        </p>
        <textarea
          className="code-box"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={9}
          spellCheck={false}
          aria-label="Events as JSON"
          placeholder='[{"event_id":"E1","timestamp":"2026-10-14T09:00:00Z","event_type":"authentication.failure","host":"srv-1","user":"bob","src_ip":"198.51.100.9"}]'
        />
        <div className="form-row">
          <label className="btn btn-secondary file-btn">
            Choose JSON file
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (file) { setImportProblems([]); setText(await file.text()) }
                e.target.value = ''
              }}
            />
          </label>
          <button type="button" className="btn btn-primary" onClick={() => void runImport()} disabled={busy !== null || !text.trim()}>
            {busy === 'import' ? 'Importing…' : 'Import events'}
          </button>
        </div>
        {importProblems.length > 0 && (
          <ul className="problems" role="alert">
            {importProblems.map((problem, index) => <li key={index}>{problem}</li>)}
          </ul>
        )}
      </section>
    </>
  )
}
