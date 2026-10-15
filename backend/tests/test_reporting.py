from app.reporting import build_markdown_report


def snapshot(**overrides):
    data = {
        "generated_at": "2026-10-14T12:00:00+00:00",
        "incident": {
            "id": "INC-0001",
            "title": "Suspicious account activity",
            "status": "investigating",
            "severity": "high",
            "entities": {"host": "lab-workstation-01", "user": "demo-user"},
            "correlation_reason": "2 alerts share host lab-workstation-01.",
        },
        "alerts": [
            {
                "id": "ALT-AUTH-001-01",
                "rule_id": "AUTH-001",
                "title": "Repeated authentication failures",
                "severity": "medium",
                "summary": "5 failed logins.",
                "matched_event_ids": ["EVT-00001", "EVT-00002"],
                "threshold": "5 or more failures within 120 seconds",
                "explanation": "Could be password guessing.",
            }
        ],
        "events": [
            {"event_id": "EVT-00002", "timestamp": "2026-10-14T10:00:20+00:00",
             "event_type": "authentication.failure", "user": "demo-user",
             "host": "lab-workstation-01", "src_ip": "203.0.113.5"},
            {"event_id": "EVT-00001", "timestamp": "2026-10-14T10:00:10+00:00",
             "event_type": "authentication.failure", "user": "demo-user",
             "host": "lab-workstation-01", "src_ip": "203.0.113.5"},
        ],
        "notes": "Confirmed with the account owner.",
        "notes_updated_at": "2026-10-14T11:00:00+00:00",
    }
    data.update(overrides)
    return data


def test_report_contains_metadata_alerts_timeline_and_notes():
    report = build_markdown_report(snapshot())

    assert "# Investigation report: INC-0001" in report
    assert "| Status | investigating |" in report
    assert "ALT-AUTH-001-01" in report
    assert "5 or more failures within 120 seconds" in report
    assert "> Confirmed with the account owner." in report
    assert "not proof of compromise" in report


def test_report_timeline_is_chronological():
    report = build_markdown_report(snapshot())

    assert report.index("EVT-00001") < report.index("| 2026-10-14T10:00:20+00:00 | EVT-00002")


def test_report_is_reproducible():
    assert build_markdown_report(snapshot()) == build_markdown_report(snapshot())


def test_report_handles_missing_notes_alerts_and_events():
    report = build_markdown_report(snapshot(notes="", alerts=[], events=[]))

    assert "No analyst notes were recorded" in report
    assert "No alerts are linked to this incident." in report


def test_report_escapes_markdown_table_characters():
    event = {"event_id": "EVT|1", "timestamp": "t", "event_type": "x",
             "user": "a\nb", "host": "h", "src_ip": None}

    report = build_markdown_report(snapshot(events=[event]))

    assert "EVT\\|1" in report
    assert "a b" in report


def test_report_labels_imported_events_as_unverified():
    events = [{"event_id": "E1", "timestamp": "t", "event_type": "x", "user": "u",
               "host": "h", "src_ip": None, "source": "imported"}]

    report = build_markdown_report(snapshot(events=events))

    assert "Imported data" in report
    assert "Simulated data" not in report


def test_report_labels_simulated_events_as_simulated():
    events = [{"event_id": "E1", "timestamp": "t", "event_type": "x", "user": "u",
               "host": "h", "src_ip": None, "source": "simulated_auth_log"}]

    assert "Simulated data" in build_markdown_report(snapshot(events=events))


def test_report_timestamps_are_whole_second_utc():
    report = build_markdown_report(snapshot(generated_at="2026-10-15T19:39:30.378448+00:00"))

    assert "| Report generated (UTC) | 2026-10-15T19:39:30Z |" in report
    assert "_Notes last saved (UTC): 2026-10-14T11:00:00Z_" in report
