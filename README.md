# QaceFlow

**An open-source security investigation workbench for explainable detections and incident correlation.**

QaceFlow is a local-first cybersecurity project designed to explore how security events can be transformed into actionable alerts and candidate incidents. It combines simulated authentication telemetry, rule-based detection, basic alert correlation, and an interactive investigation dashboard.

> **Project status:** Early development · v0.1.0  
> **Environment:** Local development with synthetic telemetry

## Overview

Security investigations often involve connecting individual events, understanding why detection rules fired, and documenting the evidence behind an incident. QaceFlow explores this workflow through a small, transparent, and reproducible security lab.

The current version generates a simulated authentication scenario, evaluates detection rules, correlates related alerts, and presents the results in a web dashboard.

## Features

- **Simulated telemetry:** Generate a repeatable sequence of authentication failures followed by a successful login.
- **Rule-based detection:** Identify repeated authentication failures and failures followed by success.
- **Alert correlation:** Group related alerts sharing the same host and account into a candidate incident.
- **Evidence references:** Connect alerts and candidate incidents to the event IDs that support them.
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
| POST | `/api/scenarios/suspicious-login/replay` | Replay the simulated scenario |

## Project roadmap

- [ ] Add automated tests for detection and correlation logic.
- [ ] Build a dedicated incident investigation page.
- [ ] Add persistent analyst notes and investigation findings.
- [ ] Improve evidence timelines and event inspection.
- [ ] Add investigation report export.
- [ ] Support validated imports of authorized, sanitized telemetry.
- [ ] Add versioned detection-rule definitions.
- [ ] Improve API security and deployment readiness.

## Security and limitations

QaceFlow is an educational development project, not a production SIEM or incident-response platform.

- The included scenario uses synthetic telemetry.
- Detection and correlation logic is intentionally basic.
- The development API does not include authentication.
- The replay endpoint resets the local demo dataset.
- The application should remain on localhost and must not be exposed publicly in its current state.

Do not import sensitive logs or real incident evidence into this development version.

## Contributing

Contributions, bug reports, and suggestions are welcome. Please open an issue to discuss significant changes before submitting a pull request.

## License

Released under the [MIT License](LICENSE).

---

**QaceFlow** — From security signals to evidence-backed investigations.