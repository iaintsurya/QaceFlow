
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .engine import correlate, detect
from .scenarios import suspicious_login_scenario


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "qaceflow.db"

app = FastAPI(
    title="QaceFlow API",
    description="Local-first security investigation workbench.",
    version="0.1.0",
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


@app.on_event("startup")
def startup() -> None:
    initialize()


def decode_alert(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "rule_id": row["rule_id"],
        "title": row["title"],
        "severity": row["severity"],
        "summary": row["summary"],
        "matched_event_ids": json.loads(row["matched_event_ids"]),
        "entity": json.loads(row["entity"]),
        "created_at": row["created_at"],
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
        "version": "0.1.0",
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


@app.post("/api/scenarios/suspicious-login/replay")
def replay_scenario() -> dict[str, Any]:
    events = suspicious_login_scenario()
    alerts = detect(events)
    incidents = correlate(alerts)

    # Reset the demo dataset for reproducible results.
    with connect() as db:
        db.execute("DELETE FROM events")
        db.execute("DELETE FROM alerts")
        db.execute("DELETE FROM incidents")
        db.execute("DELETE FROM incident_notes")

        for event in events:
            db.execute(
                """
                INSERT INTO events
                (event_id, timestamp, event_type, host, user, source,
                 src_ip, payload)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event["event_id"],
                    event["timestamp"],
                    event["event_type"],
                    event["host"],
                    event["user"],
                    event["source"],
                    event.get("src_ip"),
                    json.dumps(event),
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
                    alert["id"],
                    alert["rule_id"],
                    alert["title"],
                    alert["severity"],
                    alert["summary"],
                    json.dumps(alert["matched_event_ids"]),
                    json.dumps(alert["entity"]),
                    alert["created_at"],
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
                    incident["id"],
                    incident["title"],
                    incident["status"],
                    incident["severity"],
                    json.dumps(incident["alert_ids"]),
                    json.dumps(incident["event_ids"]),
                    json.dumps(incident["entities"]),
                    incident["correlation_reason"],
                ),
            )

    return {
        "scenario": "suspicious-login",
        "event_count": len(events),
        "alert_count": len(alerts),
        "incident_count": len(incidents),
        "message": "Scenario replayed. The local demo dataset was reset.",
    }


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
