# QaceFlow: Learning Guide

A plain-language tour of the project: what it does, how it works, where each idea lives in the code, and how to explain it with confidence.

## 1. The 60-second explanation (ELI5)

Imagine an office building where every keycard swipe at every door is written in a log:

> 10:02:00 · Sam · Door 4 · card **rejected**
> 10:02:20 · Sam · Door 4 · card **rejected**
> … (three more rejections) …
> 10:03:40 · Sam · Door 4 · card **accepted**

Nobody can read thousands of lines like that all day. A security guard wants a helper that says: *"Five rejections in under two minutes, then an acceptance, on the same door for the same person. That is worth a look, and here is exactly why."*

QaceFlow is that helper for computer login logs:

1. **Events** are the log lines (who tried to log in, where, when, and whether it worked).
2. **Rules** are simple, written-down patterns, such as "5 failures within 2 minutes".
3. **Alerts** are the flags raised when a rule matches. Every alert says which rule fired and which log lines caused it.
4. **A case** groups alerts that belong together (same person, same machine) into one folder to investigate.
5. **The analyst** reads the evidence, writes notes and sets a status.
6. **A report** is exported with everything the analyst found.

The most important idea: QaceFlow says **"worth checking"**, never **"this is an attack"**. A person might simply have typed their password wrong. The tool helps a human decide.

## 2. The five concepts

| Concept | Meaning | Where it lives |
|---|---|---|
| **Event** | One recorded login attempt: id, timestamp (UTC), type, host, user, source IP | `events` table; `scenarios.py`, `ingest.py` |
| **Detection rule** | A deterministic pattern with a threshold | `RULES` and `detect()` in `engine.py` |
| **Alert** | A rule match, with severity, summary and the event IDs that caused it | `alerts` table |
| **Correlation / case** | Grouping alerts that share host and account into a candidate incident | `correlate()` in `engine.py`; `incidents` table |
| **Report** | A document built from the saved investigation | `reporting.py` |

*Deterministic* means: same input, same output, every time. There is no randomness and no AI guessing, which is why the detections can be tested.

## 3. A worked example (real numbers from the demo)

The "suspicious login" scenario has six events for `demo-user` on `lab-workstation-01`:

| Time (UTC) | Event | Type |
|---|---|---|
| 10:02:00 | EVT-00001 | failure |
| 10:02:20 | EVT-00002 | failure |
| 10:02:40 | EVT-00003 | failure |
| 10:03:00 | EVT-00004 | failure |
| 10:03:20 | EVT-00005 | failure |
| 10:03:40 | EVT-00006 | success |

- **AUTH-001** looks for 5 or more failures within 120 seconds for the same host and account. Events 1 to 5 span 10:02:00 to 10:03:20, which is 80 seconds. That is 5 failures in under 120 seconds, so it fires: `ALT-AUTH-001-01` (medium).
- **AUTH-002** looks for a success preceded by at least one failure within 5 minutes. Event 6 succeeds 20 seconds after event 5, so it fires: `ALT-AUTH-002-01` (high).
- **Correlation:** both alerts share `lab-workstation-01` and `demo-user`, so they are grouped into `INC-0001`. The case is *high* because one of its alerts is high.

## 3b. Real data: importing an auth.log

The demo scenarios are made up, but QaceFlow can also read a real Linux login log. On Linux, the SSH server writes lines like these to `/var/log/auth.log`:

```
Oct 14 03:12:15 web-01 sshd[2213]: Failed password for root from 203.0.113.50 port 51122 ssh2
Oct 14 03:12:52 web-01 sshd[2230]: Accepted password for root from 203.0.113.50 port 51210 ssh2
```

`parsers.py` reads each line with a pattern (a regular expression), keeps the "Failed" and "Accepted" ones and turns them into the same events the rules already understand. Everything else (cron jobs, package updates, session messages) is counted as "skipped". Because syslog lines have no year, you type the year in, and times are treated as UTC. Try it: choose **Linux auth.log** on the Data page and load `docs/sample-auth.log`. It produces 2 alerts and 1 case for `root` on `web-01`.

**MITRE ATT&CK** is a public catalogue of attacker behaviours. Each QaceFlow rule points at the behaviour it is meant to catch (for example T1110 Brute Force) so a reader can look it up. It is a pointer, not a verdict.

## 4. What happens when you click "Replay scenario"

1. **Browser:** `DataPage.tsx` calls `replayScenario()` from `api.ts`, which sends `POST /api/scenarios/suspicious-login/replay`. If cases already exist, it first asks for confirmation, because replay wipes notes.
2. **API:** the route in `main.py` calls `get_scenario()` from `scenarios.py`, which returns the six events.
3. **Detection:** `_store_dataset()` calls `detect(events)` to produce alerts, then `correlate(alerts)` to produce cases.
4. **Storage:** the old data is deleted and the new events, alerts and cases are inserted into SQLite.
5. **Response:** the API returns counts (6 events, 2 alerts, 1 case).
6. **Browser:** `App.tsx` reloads the three lists, shows a notice and navigates to `#/cases`, where the table renders the new case.

Notes and reports follow the same pattern: the browser asks, the server reads or writes SQLite, and the browser displays the answer. **The server is the source of truth**, so the report always reflects what is saved.

## 5. Tour of the code

**Backend (`backend/app/`)**
- `engine.py`: the brain. `RULES` documents each rule. `detect()` finds alerts. `correlate()` groups them. It never touches the database or the network, so it is easy to test.
- `scenarios.py`: three made-up datasets (suspicious login, repeated failures, benign logins).
- `ingest.py`: checks imported JSON and rejects the whole file if any record is bad.
- `parsers.py`: reads real OpenSSH `auth.log` lines and turns login attempts into events.
- `reporting.py`: turns a saved case into Markdown.
- `main.py`: the web API and the SQLite code.

**Frontend (`frontend/src/`)**
- `api.ts`: every call to the backend, in one place, with clear error messages.
- `router.ts`: tiny page router based on the URL hash.
- `pages/`: one file per screen (Cases, Case, Events, Alerts, Rules, Data).
- `components/`: the top bar and small shared pieces.
- `app.css`: the whole visual design, built from a few colour and font variables.

**Tests (`backend/tests/`)**: 80 tests. They are the safety net; if you change a rule and a test fails, the test is telling you what you changed.

## 6. Run it and poke it

```powershell
# Terminal 1: backend
cd backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --port 8000

# Terminal 2: frontend
cd frontend
npm run dev
```

Open http://127.0.0.1:5173. API docs are at http://127.0.0.1:8000/docs, which is FastAPI's built-in interactive page: try the endpoints there.

## 7. Exercises (the fastest way to really understand it)

1. **Break a rule on purpose.** In `engine.py`, change `min_failures` for AUTH-001 from 5 to 3 and run `python -m pytest`. Read which tests fail and why. Then change it back.
2. **Probe the boundary.** Import a file with five failures spaced 30 seconds apart (exactly 120 s) and another spaced 31 seconds apart. Predict which one alerts, then check.
3. **Break an import.** Put `"timestamp": "yesterday"` in a JSON file and read the error you get back.
4. **Look inside the database.** `python -c "import sqlite3; print(sqlite3.connect('backend/qaceflow.db').execute('select id, rule_id from alerts').fetchall())"`
5. **Add a rule.** Write `AUTH-003`: a successful login from a source IP that account has not used before. Steps: add it to `RULES`, add the logic to `detect()`, add scenario events, write tests for the trigger and the boundary, and see it appear on the Rules page automatically.

## 8. Glossary

- **SOC / SOC analyst:** Security Operations Centre; the people who watch for and investigate threats.
- **Telemetry / log:** records a system produces about what happened.
- **Detection rule:** a pattern that flags suspicious activity.
- **Alert:** a flag raised when a rule matches.
- **Correlation:** connecting related alerts.
- **Incident / case:** a group of related alerts to investigate.
- **False positive:** an alert for something harmless (for example a typo).
- **Evidence:** the specific events that support a conclusion.
- **Triage:** deciding which alerts deserve attention first.
- **API:** the set of requests the frontend uses to talk to the backend.
- **SQLite:** a small database stored in a single file.
- **CI:** a service that automatically runs the tests on every push.
- **UTC:** a universal time zone, so timestamps from different places line up.

## 9. Questions you should be able to answer

1. **What does QaceFlow do, in one sentence?**
   It turns raw authentication events into explainable alerts, groups related alerts into candidate cases, and lets an analyst document and export an investigation.
2. **Why are the detections deterministic rather than AI-based?**
   They can be tested, explained and trusted. An analyst can see exactly why an alert fired, and a deterministic baseline is needed before any ML is worth adding.
3. **How does AUTH-001 work?**
   For each host and account, it slides a 120-second window over the failures. Five or more inside one window raises an alert, and the search resumes after that burst so later bursts are found too.
4. **Why is an alert not proof of an attack?**
   A user can mistype a password. That is why every rule documents its innocent explanations and the interface calls a case a hypothesis.
5. **What bug did you find and fix?**
   Alert IDs were hard-coded per rule, so two matches of the same rule would have collided in the database. They are now unique and sequential, with tests.
6. **How do you prevent bad imported data?**
   The import validates every field and is all-or-nothing: one bad record rejects the file and nothing is stored.
7. **Why generate the report on the server?**
   So it always reflects the saved investigation. A report built from browser state could contain unsaved or tampered data.
8. **How is the project tested?**
   80 tests cover rules, boundaries, correlation, the API, imports and reports, run automatically by GitHub Actions along with the frontend build.
9. **What are the limitations?**
   Two authentication rules only, correlation by host and account only, no authentication, local use. The report documents these openly.
10. **What would you build next?**
    An evidence graph, more rules with false-positive tests, and CSV import.
11. **Why did you redesign the interface?**
    The first version looked like a generic dashboard. I rebuilt it around the investigation: a case list, dense evidence tables and findings, with the origin of the data always visible.
12. **How is the data kept safe?**
    It runs locally with no external services, inputs are validated and size-limited, and CORS is limited to the local development origins.

## 10. Where to read next

- [`PROJECT_REPORT.md`](PROJECT_REPORT.md): the formal report.
- [`sample-report.md`](sample-report.md): what an exported investigation looks like.
- [`../README.md`](../README.md): setup and API usage.
