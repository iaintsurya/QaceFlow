"""Markdown investigation report generator.

Pure functions only: the report is built from the authoritative snapshot that
the API reads from the database, so the same input always gives the same text.
"""

from datetime import datetime
from typing import Any


def _cell(value: Any) -> str:
    """Make a value safe for a single Markdown table cell."""
    text = "" if value is None else str(value)
    return text.replace("\r", " ").replace("\n", " ").replace("|", "\\|").strip() or "—"


def _utc(value: Any) -> str:
    """Format an ISO timestamp as whole-second UTC, or fall back to the raw text."""
    try:
        return datetime.fromisoformat(str(value)).strftime("%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        return _cell(value)


def _quote(text: str) -> str:
    return "\n".join(f"> {line}" if line else ">" for line in text.splitlines())


def _origin_notice(events: list[dict[str, Any]]) -> str:
    if events and any(e.get("source") != "simulated_auth_log" for e in events):
        return (
            "> **Imported data.** Events were supplied by an analyst and have not been "
            "verified by QaceFlow. Correlated activity is a candidate for investigation, "
            "not proof of compromise."
        )
    return (
        "> **Simulated data.** Events in this report are synthetic lab telemetry. "
        "Correlated activity is a candidate for investigation, not proof of compromise."
    )


def build_markdown_report(snapshot: dict[str, Any]) -> str:
    incident = snapshot["incident"]
    entities = incident.get("entities", {})
    alerts = snapshot.get("alerts", [])
    events = snapshot.get("events", [])
    notes = (snapshot.get("notes") or "").strip()

    lines = [
        f"# Investigation report: {incident['id']}",
        "",
        _origin_notice(events),
        "",
        "## Case metadata",
        "",
        "| Field | Value |",
        "| --- | --- |",
        f"| Incident | {_cell(incident['id'])} |",
        f"| Title | {_cell(incident.get('title'))} |",
        f"| Status | {_cell(incident.get('status'))} |",
        f"| Severity | {_cell(incident.get('severity'))} |",
        f"| Host | {_cell(entities.get('host'))} |",
        f"| Account | {_cell(entities.get('user'))} |",
        f"| Alerts | {len(alerts)} |",
        f"| Evidence events | {len(events)} |",
        f"| Report generated (UTC) | {_utc(snapshot.get('generated_at'))} |",
        "",
        "## Why these alerts were grouped",
        "",
        incident.get("correlation_reason") or "No correlation rationale was recorded.",
        "",
        "## Alerts and detection rules",
        "",
    ]

    if not alerts:
        lines += ["No alerts are linked to this incident.", ""]
    for alert in alerts:
        lines += [
            f"### {alert['id']} · {alert['rule_id']} · {alert['severity'].upper()}",
            "",
            f"**{alert['title']}.** {alert['summary']}",
            "",
        ]
        if alert.get("threshold"):
            lines += [f"- Rule threshold: {alert['threshold']}"]
        if alert.get("explanation"):
            lines += [f"- Why it matters: {alert['explanation']}"]
        lines += [
            f"- Evidence references: {', '.join(alert['matched_event_ids'])}",
            "",
        ]

    lines += [
        "## Evidence timeline (UTC)",
        "",
        "| Time | Event ID | Type | Account | Host | Source IP |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    if not events:
        lines += ["| — | — | — | — | — | — |"]
    for event in sorted(events, key=lambda e: (e.get("timestamp", ""), e.get("event_id", ""))):
        lines.append(
            f"| {_cell(event.get('timestamp'))} | {_cell(event.get('event_id'))} "
            f"| {_cell(event.get('event_type'))} | {_cell(event.get('user'))} "
            f"| {_cell(event.get('host'))} | {_cell(event.get('src_ip'))} |"
        )

    lines += ["", "## Analyst findings", ""]
    if notes:
        lines += [_quote(notes), ""]
        if snapshot.get("notes_updated_at"):
            lines += [f"_Notes last saved (UTC): {_utc(snapshot['notes_updated_at'])}_", ""]
    else:
        lines += ["_No analyst notes were recorded for this incident._", ""]

    lines += [
        "## Known limitations",
        "",
        "- Detection rules are simple, threshold-based and can raise false positives.",
        "- A success after failures may be a user correcting a typo; verify with the account owner.",
        "- This report reflects only the events stored in QaceFlow at generation time.",
        "",
    ]
    return "\n".join(lines)
