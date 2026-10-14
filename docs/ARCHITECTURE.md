# Architecture

## Data flow

1. `scenarios.py` creates deterministic synthetic authentication events.
2. `main.py` stores events in SQLite and calls `detect`.
3. `engine.py` evaluates AUTH-001 and AUTH-002, attaching matched event IDs to alerts.
4. `correlate` groups alerts sharing host/account identity into candidate incidents.
5. The React UI requests events, alerts and incidents from the API.
6. The investigation workspace reads and writes analyst notes and incident status.
7. The report endpoint reads the saved incident, related alerts, evidence events and notes from SQLite.

## Trust boundaries

The API database is authoritative for report content. The browser requests a report by incident ID rather than submitting a client-assembled incident snapshot. Notes are plain text. Synthetic events use documentation-only IP space (`192.0.2.0/24`).

## SQLite entities

- `events`: canonical event identifiers, timestamps, searchable fields and original JSON payload.
- `alerts`: rule identifiers, severity, explanation and matched event IDs.
- `incidents`: status, severity, linked alerts/events, entities and correlation rationale.
- `incident_notes`: one editable analyst note document per incident and update timestamp.

## Status model

- `open`: newly created and awaiting triage.
- `investigating`: an analyst is actively reviewing evidence.
- `closed`: the current investigation is complete. This does not by itself mean malicious activity was confirmed.

## Important caveat

The correlation engine is deliberately small. Shared host/account fields are useful links but do not establish causality. Reports preserve this uncertainty in their disclaimer.
