import json
import sqlite3
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .engine import correlate, detect
from .scenarios import suspicious_login_scenario

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "qaceflow.db"

app = FastAPI(
    title="QaceFlow API",
    description="Local-first security investigation workbench (development scaffold).",
    version="0.1.0",
)

# Development only: the API is intended to run on localhost.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
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
        """)


@app.on_event("startup")
def startup() -> None:
    initialize()


def decode_event(row: sqlite3.Row) -> dict[str, Any]:
    payload = json.loads(row["payload"])
    return payload


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
    return {"status": "ok", "product": "QaceFlow", "version": "0.1.0"}


@app.get("/api/events")
def list_events() -> list[dict[str, Any]]:
    with connect() as db:
        rows = db.execute("SELECT payload FROM events ORDER BY timestamp ASC").fetchall()
    return [json.loads(row["payload"]) for row in rows]


@app.get("/api/alerts")
def list_alerts() -> list[dict[str, Any]]:
    with connect() as db:
        rows = db.execute("SELECT * FROM alerts ORDER BY created_at ASC").fetchall()
    return [decode_alert(row) for row in rows]


@app.get("/api/incidents")
def list_incidents() -> list[dict[str, Any]]:
    with connect() as db:
        rows = db.execute("SELECT * FROM incidents ORDER BY id ASC").fetchall()
    return [decode_incident(row) for row in rows]


@app.post("/api/scenarios/suspicious-login/replay")
def replay_scenario() -> dict[str, Any]:
    events = suspicious_login_scenario()
    alerts = detect(events)
    incidents = correlate(alerts)

    # Replay resets this local demo dataset to make the outcome reproducible.
    with connect() as db:
        db.execute("DELETE FROM events")
        db.execute("DELETE FROM alerts")
        db.execute("DELETE FROM incidents")
        for event in events:
            db.execute(
                """INSERT INTO events
                (event_id, timestamp, event_type, host, user, source, src_ip, payload)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    event["event_id"], event["timestamp"], event["event_type"],
                    event["host"], event["user"], event["source"], event.get("src_ip"),
                    json.dumps(event),
                ),
            )
        for alert in alerts:
            db.execute(
                """INSERT INTO alerts
                (id, rule_id, title, severity, summary, matched_event_ids, entity, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    alert["id"], alert["rule_id"], alert["title"], alert["severity"],
                    alert["summary"], json.dumps(alert["matched_event_ids"]),
                    json.dumps(alert["entity"]), alert["created_at"],
                ),
            )
        for incident in incidents:
            db.execute(
                """INSERT INTO incidents
                (id, title, status, severity, alert_ids, event_ids, entities, correlation_reason)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    incident["id"], incident["title"], incident["status"],
                    incident["severity"], json.dumps(incident["alert_ids"]),
                    json.dumps(incident["event_ids"]), json.dumps(incident["entities"]),
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
