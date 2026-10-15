from datetime import datetime, timedelta, timezone
from typing import Any

# Rule catalogue. Thresholds live here so the detection code, the API and the
# investigation report all describe a rule the same way.
RULES: dict[str, dict[str, Any]] = {
    "AUTH-001": {
        "name": "Repeated authentication failures",
        "severity": "medium",
        "window_seconds": 120,
        "min_failures": 5,
        "threshold": (
            "5 or more failed logins for the same host and account "
            "within 120 seconds"
        ),
        "description": (
            "Repeated failures in a short period can indicate password "
            "guessing, but can also come from a misconfigured service or a "
            "user mistyping a password."
        ),
    },
    "AUTH-002": {
        "name": "Failed logins followed by success",
        "severity": "high",
        "window_seconds": 300,
        "min_failures": 1,
        "threshold": (
            "A successful login preceded by at least 1 failed login for the "
            "same host and account within 5 minutes"
        ),
        "description": (
            "A success shortly after failures can mean a guessed or reused "
            "credential was accepted, or simply that the user corrected a "
            "typo. Verify with the account owner."
        ),
    },
}


def parse_time(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _sort_key(event: dict[str, Any]) -> tuple[datetime, str]:
    return parse_time(event["timestamp"]), event["event_id"]


def detect(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Deterministic detection engine.

    The result does not depend on the order of the input events, and every
    alert gets a unique, stable ID of the form ``ALT-<rule>-<nn>``.
    """
    ordered_events = sorted(events, key=_sort_key)
    failures = [e for e in ordered_events if e["event_type"] == "authentication.failure"]
    successes = [e for e in ordered_events if e["event_type"] == "authentication.success"]
    found: list[dict[str, Any]] = []

    # AUTH-001: bursts of failures for the same host/account.
    rule = RULES["AUTH-001"]
    window = timedelta(seconds=rule["window_seconds"])
    buckets: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for event in failures:
        key = (event.get("host", ""), event.get("user", ""))
        buckets.setdefault(key, []).append(event)

    for (host, user), bucket in sorted(buckets.items()):
        times = [parse_time(e["timestamp"]) for e in bucket]
        start = 0
        while start < len(bucket):
            end = start
            window_end = times[start] + window
            while end < len(bucket) and times[end] <= window_end:
                end += 1
            matches = bucket[start:end]
            if len(matches) >= rule["min_failures"]:
                found.append({
                    "rule_id": "AUTH-001",
                    "title": rule["name"],
                    "severity": rule["severity"],
                    "summary": (
                        f"{len(matches)} failed logins for {user} on {host} "
                        f"within {rule['window_seconds']} seconds."
                    ),
                    "matched_event_ids": [m["event_id"] for m in matches],
                    "entity": {"host": host, "user": user},
                    "created_at": matches[-1]["timestamp"],
                })
                start = end  # next burst starts after this one
            else:
                start += 1

    # AUTH-002: a success shortly after failures for the same host/account.
    rule = RULES["AUTH-002"]
    window = timedelta(seconds=rule["window_seconds"])
    for success in successes:
        success_time = parse_time(success["timestamp"])
        related = [
            f for f in failures
            if f.get("host") == success.get("host")
            and f.get("user") == success.get("user")
            and timedelta(0) <= success_time - parse_time(f["timestamp"]) <= window
        ]
        if len(related) >= rule["min_failures"]:
            found.append({
                "rule_id": "AUTH-002",
                "title": rule["name"],
                "severity": rule["severity"],
                "summary": (
                    f"{len(related)} failed login(s) preceded a successful login "
                    f"for {success.get('user')} on {success.get('host')} within five minutes."
                ),
                "matched_event_ids": [e["event_id"] for e in related] + [success["event_id"]],
                "entity": {"host": success.get("host", ""), "user": success.get("user", "")},
                "created_at": success["timestamp"],
            })

    # Drop exact duplicates, then assign stable per-rule sequence IDs.
    unique: dict[tuple[str, tuple[str, ...]], dict[str, Any]] = {}
    for alert in found:
        unique[(alert["rule_id"], tuple(alert["matched_event_ids"]))] = alert

    alerts = sorted(
        unique.values(),
        key=lambda a: (parse_time(a["created_at"]), a["rule_id"], a["matched_event_ids"]),
    )
    counters: dict[str, int] = {}
    for alert in alerts:
        counters[alert["rule_id"]] = counters.get(alert["rule_id"], 0) + 1
        alert["id"] = f"ALT-{alert['rule_id']}-{counters[alert['rule_id']]:02d}"
    return alerts


def correlate(alerts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Create a candidate incident when alerts share a host and account."""
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for alert in alerts:
        entity = alert.get("entity", {})
        key = (entity.get("host", ""), entity.get("user", ""))
        grouped.setdefault(key, []).append(alert)

    incidents: list[dict[str, Any]] = []
    for (host, user), group in sorted(grouped.items()):
        if len(group) < 2:
            continue
        rules = ", ".join(sorted({a["rule_id"] for a in group}))
        incidents.append({
            "id": f"INC-{len(incidents) + 1:04d}",
            "title": "Suspicious account activity",
            "status": "open",
            "severity": "high" if any(a["severity"] == "high" for a in group) else "medium",
            "alert_ids": [a["id"] for a in group],
            "event_ids": sorted({e for a in group for e in a["matched_event_ids"]}),
            "entities": {"host": host, "user": user},
            "correlation_reason": (
                f"{len(group)} alerts ({rules}) share host {host} and account {user}. "
                "This is a candidate relationship, not proof that the events "
                "have the same cause."
            ),
        })
    return incidents
