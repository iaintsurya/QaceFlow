"""Validation and normalisation for analyst-imported events.

Imports are all-or-nothing: if any record is invalid, nothing is stored and
every problem is reported so the file can be fixed in one pass.
"""

import ipaddress
from typing import Any

from .engine import parse_time

MAX_EVENTS = 5000
MAX_TEXT_LENGTH = 200
REQUIRED_FIELDS = ("event_id", "timestamp", "event_type", "host", "user")
IMPORTED_SOURCE = "imported"


def _error(index: int | None, field: str, message: str) -> dict[str, Any]:
    return {"index": index, "field": field, "message": message}


def validate_events(raw: Any) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Return (normalised_events, errors). Events are empty if there are errors."""
    if not isinstance(raw, list):
        return [], [_error(None, "events", "'events' must be a list of event objects")]
    if not raw:
        return [], [_error(None, "events", "At least one event is required")]
    if len(raw) > MAX_EVENTS:
        return [], [_error(None, "events", f"At most {MAX_EVENTS} events can be imported at once")]

    events: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    seen: set[str] = set()

    for index, item in enumerate(raw):
        if not isinstance(item, dict):
            errors.append(_error(index, "event", "Each event must be an object"))
            continue

        problems_before = len(errors)
        event: dict[str, Any] = {}

        for field in REQUIRED_FIELDS:
            value = item.get(field)
            if not isinstance(value, str) or not value.strip():
                errors.append(_error(index, field, f"'{field}' is required and must be non-empty text"))
            elif len(value.strip()) > MAX_TEXT_LENGTH:
                errors.append(_error(index, field, f"'{field}' is longer than {MAX_TEXT_LENGTH} characters"))
            else:
                event[field] = value.strip()

        if "timestamp" in event:
            try:
                event["timestamp"] = parse_time(event["timestamp"]).isoformat()
            except ValueError:
                errors.append(_error(index, "timestamp", "Timestamp must be ISO 8601, e.g. 2026-10-14T10:00:00Z"))

        if "event_id" in event:
            if event["event_id"] in seen:
                errors.append(_error(index, "event_id", f"Duplicate event_id '{event['event_id']}'"))
            seen.add(event["event_id"])

        src_ip = item.get("src_ip")
        if src_ip not in (None, ""):
            try:
                event["src_ip"] = str(ipaddress.ip_address(str(src_ip).strip()))
            except ValueError:
                errors.append(_error(index, "src_ip", "src_ip must be a valid IPv4 or IPv6 address"))

        details = item.get("details", {})
        if not isinstance(details, dict):
            errors.append(_error(index, "details", "'details' must be an object"))
            details = {}

        if len(errors) == problems_before:
            event["source"] = IMPORTED_SOURCE
            event["details"] = {**details, "imported": True}
            events.append(event)

    return ([], errors) if errors else (events, [])
