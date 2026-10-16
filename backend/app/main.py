
import json
import sqlite3
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware

from .engine import RULES, correlate, detect
from .ingest import validate_events
from .parsers import MAX_LOG_BYTES, SSHD_FORMAT, parse_sshd_auth_log
from .reporting import build_markdown_report
from .scenarios import SCENARIOS, get_scenario, list_scenarios


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "qaceflow.db"
MAX_NOTES_LENGTH = 20_000

@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize()
    yield


app = FastAPI(
    title="QaceFlow API",
    description="Local-first security investigation workbench.",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["Content-Type"],
)


def connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize() -> None:
    with connect() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS events (
                event_id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                event_type TEXT NOT NULL,
                host TEXT NOT NULL,
                user TEXT NOT NULL,
                source TEXT NOT NULL,
                src_ip TEXT,
                payload TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS alerts (
                id TEXT PRIMARY KEY,
                rule_id TEXT NOT NULL,
                title TEXT NOT NULL,
                severity TEXT NOT NULL,
                summary TEXT NOT NULL,
                matched_event_ids TEXT NOT NULL,
                entity TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS incidents (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                status TEXT NOT NULL,
                severity TEXT NOT NULL,
                alert_ids TEXT NOT NULL,
                event_ids TEXT NOT NULL,
                entities TEXT NOT NULL,
                correlation_reason TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS incident_notes (
                incident_id TEXT PRIMARY KEY,
                notes TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL
            );
        """)


def decode_alert(row: sqlite3.Row) -> dict[str, Any]:
    rule = RULES.get(row["rule_id"], {})
    return {
        "id": row["id"],
        "rule_id": row["rule_id"],
        "title": row["title"],
        "severity": row["severity"],
        "summary": row["summary"],
        "matched_event_ids": json.loads(row["matched_event_ids"]),
        "entity": json.loads(row["entity"]),
        "created_at": row["created_at"],
        "threshold": rule.get("threshold"),
        "explanation": rule.get("description"),
        "mitre": rule.get("mitre", []),
    }


def decode_incident(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "status": row["status"],
        "severity": row["severity"],
        "alert_ids": json.loads(row["alert_ids"]),
        "event_ids": json.loads(row["event_ids"]),
        "entities": json.loads(row["entities"]),
        "correlation_reason": row["correlation_reason"],
    }


@app.get("/api/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "product": "QaceFlow",
        "version": "0.2.0",
    }


@app.get("/api/events")
def list_events() -> list[dict[str, Any]]:
    with connect() as db:
        rows = db.execute(
            "SELECT payload FROM events ORDER BY timestamp ASC"
        ).fetchall()

    return [json.loads(row["payload"]) for row in rows]


@app.get("/api/alerts")
def list_alerts() -> list[dict[str, Any]]:
    with connect() as db:
        rows = db.execute(
            "SELECT * FROM alerts ORDER BY created_at ASC"
        ).fetchall()

    return [decode_alert(row) for row in rows]


@app.get("/api/incidents")
def list_incidents() -> list[dict[str, Any]]:
    with connect() as db:
        rows = db.execute(
            "SELECT * FROM incidents ORDER BY id ASC"
        ).fetchall()

    return [decode_incident(row) for row in rows]


@app.get("/api/rules")
def list_rules() -> list[dict[str, Any]]:
    """Describe every detection rule, its threshold and why it matters."""
    return [{"id": rule_id, **rule} for rule_id, rule in sorted(RULES.items())]


@app.get("/api/scenarios")
def available_scenarios() -> list[dict[str, Any]]:
    """List available deterministic synthetic demo scenarios."""
    return list_scenarios()


def _store_dataset(events: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Detect, correlate and persist a dataset, replacing the active one.

    Replacing the dataset also clears notes and status. Callers state this in
    their response so the reset is never implicit.
    """
    alerts = detect(events)
    incidents = correlate(alerts)

    with connect() as db:
        db.execute("DELETE FROM events")
        db.execute("DELETE FROM alerts")
        db.execute("DELETE FROM incidents")
        db.execute("DELETE FROM incident_notes")

        for event in events:
            db.execute(
                """
                INSERT INTO events
                (event_id, timestamp, event_type, host, user, source, src_ip, payload)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event["event_id"], event["timestamp"], event["event_type"],
                    event["host"], event["user"], event["source"],
                    event.get("src_ip"), json.dumps(event),
                ),
            )

        for alert in alerts:
            db.execute(
                """
                INSERT INTO alerts
                (id, rule_id, title, severity, summary,
                 matched_event_ids, entity, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    alert["id"], alert["rule_id"], alert["title"], alert["severity"],
                    alert["summary"], json.dumps(alert["matched_event_ids"]),
                    json.dumps(alert["entity"]), alert["created_at"],
                ),
            )

        for incident in incidents:
            db.execute(
                """
                INSERT INTO incidents
                (id, title, status, severity, alert_ids, event_ids,
                 entities, correlation_reason)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    incident["id"], incident["title"], incident["status"],
                    incident["severity"], json.dumps(incident["alert_ids"]),
                    json.dumps(incident["event_ids"]), json.dumps(incident["entities"]),
                    incident["correlation_reason"],
                ),
            )

    return alerts, incidents


def _replay_scenario(scenario_id: str) -> dict[str, Any]:
    try:
        events = get_scenario(scenario_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

    alerts, incidents = _store_dataset(events)

    return {
        "scenario": scenario_id,
        "event_count": len(events),
        "alert_count": len(alerts),
        "incident_count": len(incidents),
        "message": "Scenario replayed. The active demo dataset and its notes were reset.",
        "reset_notes": True,
    }


def _rejected(message: str, field: str, status_code: int = 422) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={
            "message": message,
            "errors": [{"index": None, "field": field, "message": message}],
            "error_count": 1,
        },
    )


def _events_from_log(payload: dict[str, Any]) -> tuple[list[dict[str, Any]], int]:
    """Turn an uploaded log file into raw events. Returns (events, skipped_lines)."""
    text = payload.get("text")
    if not isinstance(text, str) or not text.strip():
        raise _rejected("'text' must contain the log file contents", "text")
    if len(text.encode("utf-8", errors="ignore")) > MAX_LOG_BYTES:
        raise _rejected(f"Log files are limited to {MAX_LOG_BYTES // 1_000_000} MB", "text", 413)

    year = payload.get("year", datetime.now(timezone.utc).year)
    if isinstance(year, bool) or not isinstance(year, int) or not 2000 <= year <= 2100:
        raise _rejected("'year' must be a whole year between 2000 and 2100", "year")

    parsed = parse_sshd_auth_log(text, year)
    if not parsed["events"]:
        raise _rejected(
            "No sshd login events (Failed/Accepted) were found in this log. "
            "Check that it is an OpenSSH auth.log or secure file.",
            "text",
        )
    return parsed["events"], parsed["skipped_lines"]


@app.post("/api/events/import")
def import_events(payload: dict[str, Any]) -> dict[str, Any]:
    """Validate and import events, replacing the active dataset.

    Accepts either ``{"events": [...]}`` or a log file:
    ``{"format": "sshd-auth-log", "text": "...", "year": 2026}``.
    """
    log_format = payload.get("format")
    skipped_lines: int | None = None

    if log_format is None:
        raw_events = payload.get("events")
    elif log_format == SSHD_FORMAT:
        raw_events, skipped_lines = _events_from_log(payload)
    else:
        raise _rejected(f"Unsupported format. Supported: {SSHD_FORMAT}", "format")

    events, errors = validate_events(raw_events)
    if errors:
        raise HTTPException(
            status_code=422,
            detail={
                "message": f"Import rejected: {len(errors)} problem(s) found. Nothing was stored.",
                "errors": errors[:25],
                "error_count": len(errors),
            },
        )

    alerts, incidents = _store_dataset(events)
    result: dict[str, Any] = {
        "event_count": len(events),
        "alert_count": len(alerts),
        "incident_count": len(incidents),
        "message": "Events imported. The active dataset and its notes were replaced.",
        "reset_notes": True,
    }
    if skipped_lines is not None:
        result["skipped_lines"] = skipped_lines
    return result


@app.post("/api/scenarios/suspicious-login/replay")
def replay_scenario() -> dict[str, Any]:
    """Backward-compatible endpoint for the original suspicious-login demo."""
    return _replay_scenario("suspicious-login")


@app.post("/api/scenarios/{scenario_id}/replay")
def replay_named_scenario(scenario_id: str) -> dict[str, Any]:
    return _replay_scenario(scenario_id)


@app.get("/api/incidents/{incident_id}/notes")
def get_incident_notes(incident_id: str) -> dict[str, Any]:
    with connect() as db:
        incident = db.execute(
            "SELECT id FROM incidents WHERE id = ?",
            (incident_id,),
        ).fetchone()

        if incident is None:
            raise HTTPException(
                status_code=404,
                detail="Incident not found",
            )

        row = db.execute(
            """
            SELECT notes, updated_at
            FROM incident_notes
            WHERE incident_id = ?
            """,
            (incident_id,),
        ).fetchone()

    return {
        "incident_id": incident_id,
        "notes": row["notes"] if row else "",
        "updated_at": row["updated_at"] if row else None,
    }


@app.put("/api/incidents/{incident_id}/notes")
def save_incident_notes(
    incident_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    notes = payload.get("notes")

    if not isinstance(notes, str):
        raise HTTPException(
            status_code=400,
            detail="Notes must be text",
        )

    if len(notes) > MAX_NOTES_LENGTH:
        raise HTTPException(
            status_code=413,
            detail=f"Notes are limited to {MAX_NOTES_LENGTH} characters",
        )

    now = datetime.now(timezone.utc).isoformat()

    with connect() as db:
        incident = db.execute(
            "SELECT id FROM incidents WHERE id = ?",
            (incident_id,),
        ).fetchone()

        if incident is None:
            raise HTTPException(
                status_code=404,
                detail="Incident not found",
            )

        db.execute(
            """
            INSERT INTO incident_notes (incident_id, notes, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(incident_id) DO UPDATE SET
                notes = excluded.notes,
                updated_at = excluded.updated_at
            """,
            (incident_id, notes, now),
        )

    return {
        "incident_id": incident_id,
        "notes": notes,
        "updated_at": now,
    }


@app.put("/api/incidents/{incident_id}/status")
def update_incident_status(
    incident_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    status = payload.get("status")
    allowed_statuses = {"open", "investigating", "closed"}

    if status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail="Status must be open, investigating, or closed",
        )

    with connect() as db:
        incident = db.execute(
            "SELECT id FROM incidents WHERE id = ?",
            (incident_id,),
        ).fetchone()

        if incident is None:
            raise HTTPException(
                status_code=404,
                detail="Incident not found",
            )

        db.execute(
            "UPDATE incidents SET status = ? WHERE id = ?",
            (status, incident_id),
        )

    return {
        "incident_id": incident_id,
        "status": status,
    }


@app.get("/api/incidents/{incident_id}/report")
def export_incident_report(incident_id: str) -> dict[str, Any]:
    """Return a complete, database-backed snapshot for an investigation report."""
    with connect() as db:
        incident_row = db.execute(
            "SELECT * FROM incidents WHERE id = ?", (incident_id,)
        ).fetchone()
        if incident_row is None:
            raise HTTPException(status_code=404, detail="Incident not found")

        incident = decode_incident(incident_row)
        note_row = db.execute(
            "SELECT notes, updated_at FROM incident_notes WHERE incident_id = ?",
            (incident_id,),
        ).fetchone()

        alert_rows = []
        for alert_id in incident["alert_ids"]:
            row = db.execute("SELECT * FROM alerts WHERE id = ?", (alert_id,)).fetchone()
            if row is not None:
                alert_rows.append(decode_alert(row))

        event_rows = []
        for event_id in incident["event_ids"]:
            row = db.execute("SELECT payload FROM events WHERE event_id = ?", (event_id,)).fetchone()
            if row is not None:
                event_rows.append(json.loads(row["payload"]))

    event_rows.sort(key=lambda item: item.get("timestamp", ""))
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "incident": incident,
        "notes": note_row["notes"] if note_row else "",
        "notes_updated_at": note_row["updated_at"] if note_row else None,
        "alerts": alert_rows,
        "events": event_rows,
        "disclaimer": "QaceFlow demo report. Correlated activity is a candidate for investigation, not proof of compromise. Demo telemetry may be synthetic.",
    }


@app.get("/api/incidents/{incident_id}/report.md")
def export_incident_report_markdown(incident_id: str) -> Response:
    """Download the investigation report as a Markdown file."""
    snapshot = export_incident_report(incident_id)
    return Response(
        content=build_markdown_report(snapshot),
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="qaceflow-{incident_id.lower()}-report.md"'
        },
    )
