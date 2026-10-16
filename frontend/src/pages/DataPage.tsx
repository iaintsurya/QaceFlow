import { useEffect, useState } from 'react'
import { ApiError, getScenarios, importEvents, importLog, replayScenario } from '../api'
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
  const [format, setFormat] = useState<'json' | 'auth-log'>('json')
  const [year, setYear] = useState(String(new Date().getUTCFullYear()))

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

    if (format === 'auth-log') {
      const wholeYear = Number(year)
      if (!Number.isInteger(wholeYear) || wholeYear < 2000 || wholeYear > 2100) {
        setImportProblems(['Enter the year the log was written, for example 2026.'])
        return
      }
      if (!confirmReplace()) return
      setBusy('import')
      try {
        const result = await importLog(text, wholeYear)
        setText('')
        await onLoaded(
          `Imported ${summarise(result)} ${plural(result.skipped_lines ?? 0, 'other line')} skipped. Imported events are unverified. Notes and status were reset.`,
        )
      } catch (err) {
        setImportProblems(err instanceof ApiError ? [err.message, ...err.details] : ['Import failed.'])
      } finally {
        setBusy(null)
      }
      return
    }

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
      setImportProblems(err instanceof ApiError ? [err.message, ...err.details] : ['Import failed.'])
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
        <div className="form-row">
          <label className="inline-label">
            Format{' '}
            <select
              value={format}
              onChange={(e) => { setFormat(e.target.value as 'json' | 'auth-log'); setText(''); setImportProblems([]) }}
              aria-label="Import format"
            >
              <option value="json">JSON events</option>
              <option value="auth-log">Linux auth.log (OpenSSH)</option>
            </select>
          </label>
        </div>
        {format === 'json' ? (
          <p className="muted">
            Paste a JSON array or choose a file. Required: <code>event_id</code>, <code>timestamp</code> (ISO 8601),{' '}
            <code>event_type</code>, <code>host</code>, <code>user</code>. Optional: <code>src_ip</code>, <code>details</code>.
            Detections understand <code>authentication.failure</code> and <code>authentication.success</code>.
            The whole import is rejected if any record is invalid. Use only data you are authorised to analyse.
          </p>
        ) : (
          <p className="muted">
            Paste or choose an OpenSSH <code>auth.log</code> (or <code>secure</code>) file. Failed and accepted SSH logins
            become events; every other line is skipped and counted. Syslog lines carry no year or time zone, so enter the
            year and times are treated as UTC. The original log line is kept as evidence. Use only logs you are authorised to analyse.
          </p>
        )}
        <textarea
          className="code-box"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={9}
          spellCheck={false}
          aria-label={format === 'json' ? 'Events as JSON' : 'auth.log contents'}
          placeholder={
            format === 'json'
              ? '[{"event_id":"E1","timestamp":"2026-10-14T09:00:00Z","event_type":"authentication.failure","host":"srv-1","user":"bob","src_ip":"198.51.100.9"}]'
              : 'Oct 14 03:12:15 web-01 sshd[2213]: Failed password for root from 203.0.113.50 port 51122 ssh2'
          }
        />
        <div className="form-row">
          <label className="btn btn-secondary file-btn">
            {format === 'json' ? 'Choose JSON file' : 'Choose log file'}
            <input
              type="file"
              accept={format === 'json' ? 'application/json,.json' : '.log,.txt,text/plain'}
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (file) { setImportProblems([]); setText(await file.text()) }
                e.target.value = ''
              }}
            />
          </label>
          {format === 'auth-log' && (
            <label className="inline-label">
              Year{' '}
              <input
                type="text"
                inputMode="numeric"
                className="year"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                aria-label="Year the log was written"
              />
            </label>
          )}
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
