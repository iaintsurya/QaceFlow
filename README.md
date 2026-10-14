# QaceFlow

**An open-source security investigation workbench.**

QaceFlow turns security events into explainable detections and candidate incidents. This first milestone uses simulated telemetry so the complete workflow can be explored safely on a local machine.

## What's included

- React + TypeScript dashboard (Vite)
- Python + FastAPI API
- SQLite storage
- Deterministic simulated suspicious-login scenario
- Threshold detection for repeated failed logins
- Sequence detection for failures followed by a success
- Basic alert correlation with explicit match reasons
- Event and alert inspection in the dashboard

> This is an early development scaffold, not a production SIEM. Use simulated data only. The API has no authentication and must remain bound to localhost.

## Requirements

- Python 3.11+
- Node.js 20+ and npm

## Run the backend

From the project root:

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment:

**Windows PowerShell**
```powershell
.venv\Scripts\Activate.ps1
```

**macOS/Linux**
```bash
source .venv/bin/activate
```

Install and run:

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
```

API: http://127.0.0.1:8000  
Interactive API docs: http://127.0.0.1:8000/docs

## Run the frontend

In a second terminal, from the project root:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite, usually http://localhost:5173.

## Try it

1. Start the backend and frontend.
2. Click **Run suspicious-login scenario**.
3. Review the generated events and alerts.
4. Inspect the alert explanations and the candidate incident correlation.

The scenario is deterministic: replaying it resets the demo dataset and generates the same event IDs and detection outcomes.

## Initial API endpoints

- `GET /api/health`
- `GET /api/events`
- `GET /api/alerts`
- `GET /api/incidents`
- `POST /api/scenarios/suspicious-login/replay`

## Architecture

```text
React dashboard
      |
      v
FastAPI routes
      |
      +--> Scenario runner
      +--> Detection engine
      +--> Correlation engine
      |
      v
SQLite (events, alerts, incidents)
```

## Current limitations

- Only one simulated scenario is included.
- Detection rules are implemented in Python rather than loaded from YAML yet.
- Correlation is intentionally simple and deterministic.
- No authentication, multi-user support, live telemetry, automated response, or public deployment.
- The sample IP is from a documentation-only address range.

## Planned milestones

1. Add tests for detection thresholds and sequence rules.
2. Add an evidence-linked investigation casebook.
3. Add filtering, timeline views, and report export.
4. Move detection definitions into versioned rule files.
5. Add import validation for authorized, sanitized CSV/JSON telemetry.
6. Harden before considering any network-accessible deployment.

## License

MIT — see `LICENSE`.
