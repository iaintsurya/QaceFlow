# QaceFlow

**An open-source security investigation workbench for explainable detections and incident correlation.**

QaceFlow is a local-first cybersecurity project designed to explore how security events can be transformed into actionable alerts and candidate incidents. It combines simulated authentication telemetry, rule-based detection, basic alert correlation, and an interactive investigation dashboard.

> **Project status:** Early development · v0.2.0  
> **Environment:** Local development with synthetic telemetry

## Overview

Security investigations often involve connecting individual events, understanding why detection rules fired, and documenting the evidence behind an incident. QaceFlow explores this workflow through a small, transparent, and reproducible security lab.

The current version offers three deterministic synthetic authentication scenarios, evaluates detection rules, correlates related alerts, and presents results in a searchable web dashboard.

## Screenshots

**Overview**: candidate incidents, evidence timeline and detection output for a replayed scenario.

![QaceFlow overview](docs/screenshots/overview.png)

**Investigation workspace**: why alerts were grouped, rule thresholds and explanations, evidence timeline with raw event inspection, and analyst findings.

![QaceFlow investigation workspace](docs/screenshots/investigation.png)

**Event import**: validated JSON import with imported data clearly labelled as unverified.

![QaceFlow event import](docs/screenshots/import.png)

A sample exported report is in [`docs/sample-report.md`](docs/sample-report.md). It was generated from `docs/sample-events.json` with an illustrative analyst note.

## Features

- **Scenario library:** Replay suspicious-login, repeated-failures and benign-login synthetic activity.
- **Rule-based detection:** Identify repeated authentication failures and failures followed by success.
- **Alert correlation:** Group related alerts sharing the same host and account into a candidate incident.
- **Event explorer:** Search event IDs, timestamps, users, hosts, source IPs, event types and reasons.\n- **Evidence references:** Connect alerts and candidate incidents to the event IDs that support them.
- **Investigation workspace:** Inspect the incident rationale, related alerts, chronological evidence and raw event payloads.
- **Persistent analyst notes:** Save investigation notes to SQLite and reload them later.
- **Incident lifecycle:** Change incident status between open, investigating and closed.
- **Report export:** Download a Markdown report containing incident metadata, analyst notes, related alerts and evidence references.
- **Local-first development:** Run the frontend and API on your own machine using synthetic data.

## Architecture

```text
Synthetic authentication scenario
              |
              v
       Event generation
              |
              v
       Detection engine
              |
              v
         Alert records
              |
              v
      Correlation engine
              |
              v
      Candidate incident
              |
              v
       React dashboard
              |
              v
       Analyst review
              |
              v
   Persistent notes + report export
```

### Technology stack

| Component | Technology |
|---|---|
| Frontend | React, TypeScript, Vite |
| Backend | Python, FastAPI |
| Data storage | SQLite |
| API documentation | OpenAPI / Swagger UI |
| Version control | Git and GitHub |

## Detection rules

| Rule ID | Detection | Purpose |
|---|---|---|
| `AUTH-001` | Repeated authentication failures | Detect five or more failures for the same host and account within a 120-second window. |
| `AUTH-002` | Failures followed by success | Identify a successful login preceded by failures for the same host and account within five minutes. |

These rules are intentionally simple and explainable. A rule match is an investigative signal, not proof of malicious activity.

## Getting started

### Prerequisites

- Python 3.11 or newer
- Node.js 20 or newer
- npm
- Git

### 1. Clone the repository

```bash
git clone https://github.com/iaintsurya/QaceFlow.git
cd QaceFlow
```

### 2. Set up the backend

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

If the `python` command is unavailable, use `.\.venv\Scripts\python.exe` in its place.

The API runs at `http://127.0.0.1:8000`.

Interactive API documentation: `http://127.0.0.1:8000/docs`

### 3. Set up the frontend

Open a second terminal at the repository root and run:

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

### 4. Run the demo

1. Ensure both the backend and frontend are running.
2. Open the QaceFlow dashboard.
3. Select **Run demo scenario**.
4. Review the generated events, detection alerts, and candidate incident.

Replaying the scenario resets the local demo dataset and regenerates the synthetic events.

## API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Check API health |
| GET | `/api/events` | List generated events |
| GET | `/api/alerts` | List detection alerts |
| GET | `/api/incidents` | List candidate incidents |
| GET | `/api/rules` | List detection rules with thresholds and explanations |
| GET | `/api/scenarios` | List the synthetic demo scenarios |
| POST | `/api/events/import` | Validate and import a JSON array of events (all-or-nothing; replaces the active dataset) |
| POST | `/api/scenarios/{scenario_id}/replay` | Replay a scenario (resets events, alerts, incidents and notes) |
| GET / PUT | `/api/incidents/{id}/notes` | Read or save analyst notes (max 20,000 characters) |
| PUT | `/api/incidents/{id}/status` | Set status to `open`, `investigating` or `closed` |
| GET | `/api/incidents/{id}/report` | Authoritative JSON snapshot of the saved investigation |
| GET | `/api/incidents/{id}/report.md` | Download the investigation report as Markdown |

Alert IDs are unique and stable, in the form `ALT-<rule>-<nn>` (for example `ALT-AUTH-001-01`).

## Project roadmap

- [x] Add automated tests for detection and correlation logic.
- [x] Build a dedicated incident investigation page.
- [x] Add persistent analyst notes and investigation findings.
- [x] Improve evidence timelines and event inspection.
- [x] Add investigation report export (Markdown).
- [x] Support validated imports of authorized, sanitized telemetry (JSON).
- [ ] Add versioned detection-rule definitions.
- [ ] Improve API security and deployment readiness.

## Security and limitations

QaceFlow is an educational development project, not a production SIEM or incident-response platform.

- The included scenario uses synthetic telemetry.
- Detection and correlation logic is intentionally basic.
- The development API does not include authentication.
- The replay endpoint resets the local demo dataset, including saved notes and incident status.
- `AUTH-002` fires after a single failure followed by a success, so it can flag a simple typo; the threshold lives in `RULES` in `engine.py`.
- Correlation groups alerts only by shared host and account.
- The application should remain on localhost and must not be exposed publicly in its current state.

Do not import sensitive logs or real incident evidence into this development version.

## Contributing

Contributions, bug reports, and suggestions are welcome. Please open an issue to discuss significant changes before submitting a pull request.

## License

Released under the [MIT License](LICENSE).

---

**QaceFlow** — From security signals to evidence-backed investigations.

## Demo scenarios

| Scenario | Expected result |
| --- | --- |
| `suspicious-login` | 6 events, 2 alerts, 1 candidate incident |
| `repeated-failures` | 5 events, 1 alert, 0 incidents |
| `benign-login` | 3 events, 0 alerts, 0 incidents |

All scenario data is synthetic. Replaying any scenario replaces the active demo dataset and clears notes attached to the previous demo incident. Export or copy any findings you need before replaying.

The scenario catalog is available at `GET /api/scenarios`. Replay one with `POST /api/scenarios/{scenario_id}/replay`. The original `POST /api/scenarios/suspicious-login/replay` route remains supported.

## Importing events

Use the **Import events** panel in the UI, or call the API directly with a JSON body of the form `{"events": [...]}`. A ready-made example is in [`docs/sample-events.json`](docs/sample-events.json).

| Field | Required | Notes |
|---|---|---|
| `event_id` | yes | Unique within the file |
| `timestamp` | yes | ISO 8601; converted to UTC |
| `event_type` | yes | Detections understand `authentication.failure` and `authentication.success`; other types are stored but not evaluated |
| `host`, `user` | yes | Used for detection and correlation |
| `src_ip` | no | Must be a valid IPv4 or IPv6 address |
| `details` | no | Free-form object |

Imports are all-or-nothing: if any record is invalid, nothing is stored and up to 25 problems are returned. Imported events are labelled `imported` and reports describe them as unverified. Up to 5,000 events can be imported at once. Importing replaces the active dataset and clears notes, like scenario replay.

## Continuous integration

GitHub Actions runs the backend tests and the frontend production build on every push and pull request (`.github/workflows/ci.yml`). Locally: `pip install -r backend/requirements-dev.txt && python -m pytest` in `backend`, and `npm run build` in `frontend`.
