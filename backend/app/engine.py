from datetime import datetime, timedelta, timezone
from typing import Any


def parse_time(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def detect(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Small deterministic detection engine for the initial demo."""
    alerts: list[dict[str, Any]] = []
    failures = [
        event for event in events
        if event["event_type"] == "authentication.failure"
    ]

    # AUTH-001: five or more failures for the same host/account in 120 seconds.
    buckets: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for event in failures:
        key = (event.get("host", ""), event.get("user", ""))
        buckets.setdefault(key, []).append(event)

    for (host, user), bucket in buckets.items():
        ordered = sorted(bucket, key=lambda e: parse_time(e["timestamp"]))
        for index, first in enumerate(ordered):
            window_end = parse_time(first["timestamp"]) + timedelta(seconds=120)
            matches = [
                item for item in ordered[index:]
                if parse_time(item["timestamp"]) <= window_end
            ]
            if len(matches) >= 5:
                alerts.append({
                    "id": "ALT-AUTH-001",
                    "rule_id": "AUTH-001",
                    "title": "Repeated authentication failures",
                    "severity": "medium",
                    "summary": f"{len(matches)} failed logins for {user} on {host} within 120 seconds.",
                    "matched_event_ids": [item["event_id"] for item in matches],
                    "entity": {"host": host, "user": user},
                    "created_at": matches[-1]["timestamp"],
                })
                break

    # AUTH-002: failures followed by success for the same host/account within 5 minutes.
    successes = [
        event for event in events
        if event["event_type"] == "authentication.success"
    ]
    for success in successes:
        success_time = parse_time(success["timestamp"])
        related = [
            event for event in failures
            if event.get("host") == success.get("host")
            and event.get("user") == success.get("user")
            and timedelta(0) <= success_time - parse_time(event["timestamp"]) <= timedelta(minutes=5)
        ]
        if related:
            alerts.append({
                "id": "ALT-AUTH-002",
                "rule_id": "AUTH-002",
                "title": "Failed logins followed by success",
                "severity": "high",
                "summary": (
                    f"{len(related)} failed login(s) preceded a successful login "
                    f"for {success.get('user')} on {success.get('host')} within five minutes."
                ),
                "matched_event_ids": [e["event_id"] for e in related] + [success["event_id"]],
                "entity": {"host": success.get("host", ""), "user": success.get("user", "")},
                "created_at": success["timestamp"],
            })

    # Keep deterministic IDs unique if a sequence creates multiple matching candidates.
    unique: dict[tuple[str, tuple[str, ...]], dict[str, Any]] = {}
    for alert in alerts:
        key = (alert["rule_id"], tuple(alert["matched_event_ids"]))
        unique[key] = alert
    return list(unique.values())


def correlate(alerts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Create a candidate incident when alerts share host/account entities."""
    if len(alerts) < 2:
        return []

    grouped: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for alert in alerts:
        entity = alert.get("entity", {})
        key = (entity.get("host", ""), entity.get("user", ""))
        grouped.setdefault(key, []).append(alert)

    incidents: list[dict[str, Any]] = []
    for (host, user), group in grouped.items():
        if len(group) < 2:
            continue
        incidents.append({
            "id": f"INC-{len(incidents) + 1:04d}",
            "title": "Suspicious account activity",
            "status": "open",
            "severity": "high" if any(a["severity"] == "high" for a in group) else "medium",
            "alert_ids": [a["id"] for a in group],
            "event_ids": sorted({event_id for alert in group for event_id in alert["matched_event_ids"]}),
            "entities": {"host": host, "user": user},
            "correlation_reason": (
                "Alerts share the same host and account. This is a candidate relationship, "
                "not proof that the events have the same cause."
            ),
        })
    return incidents
