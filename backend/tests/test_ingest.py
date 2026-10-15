from app.ingest import MAX_EVENTS, validate_events


def good(event_id="E1", **overrides):
    event = {
        "event_id": event_id,
        "timestamp": "2026-10-14T10:00:00Z",
        "event_type": "authentication.failure",
        "host": "host-1",
        "user": "alice",
        "src_ip": "203.0.113.7",
    }
    event.update(overrides)
    return event


def test_valid_events_are_normalised():
    events, errors = validate_events([good()])

    assert errors == []
    assert events[0]["timestamp"] == "2026-10-14T10:00:00+00:00"
    assert events[0]["source"] == "imported"
    assert events[0]["details"]["imported"] is True


def test_missing_required_fields_are_reported_per_record():
    events, errors = validate_events([good("E1"), {"event_id": "E2"}])

    assert events == []
    assert {e["field"] for e in errors if e["index"] == 1} == {"timestamp", "event_type", "host", "user"}


def test_bad_timestamp_and_ip_are_rejected():
    _, errors = validate_events([good(timestamp="yesterday", src_ip="999.1.1.1")])

    assert {e["field"] for e in errors} == {"timestamp", "src_ip"}


def test_duplicate_event_ids_are_rejected():
    _, errors = validate_events([good("E1"), good("E1")])

    assert errors[0]["field"] == "event_id" and errors[0]["index"] == 1


def test_non_list_empty_and_oversized_inputs_are_rejected():
    assert validate_events("nope")[1]
    assert validate_events([])[1]
    assert validate_events([good(str(i)) for i in range(MAX_EVENTS + 1)])[1]


def test_non_object_records_and_bad_details_are_rejected():
    _, errors = validate_events(["text", good("E2", details="x")])

    assert [e["field"] for e in errors] == ["event", "details"]


def test_one_invalid_record_stops_the_whole_import():
    events, errors = validate_events([good("E1"), good("E2", host="")])

    assert events == [] and errors


def test_timezone_offsets_are_converted_to_utc():
    events, _ = validate_events([good(timestamp="2026-10-14T15:30:00+05:30")])

    assert events[0]["timestamp"] == "2026-10-14T10:00:00+00:00"
