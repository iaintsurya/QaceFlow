
from app.engine import detect, correlate


def make_event(event_id, seconds, event_type, user="demo-user"):
    return {
        "event_id": event_id,
        "timestamp": f"2026-10-14T10:{seconds // 60:02d}:{seconds % 60:02d}+00:00",
        "event_type": event_type,
        "host": "lab-workstation-01",
        "user": user,
        "source": "test",
        "src_ip": "192.0.2.25",
        "details": {},
    }


def test_five_failed_logins_trigger_auth001():
    events = [
        make_event(f"EVT-{i}", i * 10, "authentication.failure")
        for i in range(5)
    ]

    alerts = detect(events)

    assert any(alert["rule_id"] == "AUTH-001" for alert in alerts)


def test_failures_followed_by_success_trigger_auth002():
    events = [
        make_event("EVT-1", 0, "authentication.failure"),
        make_event("EVT-2", 30, "authentication.failure"),
        make_event("EVT-3", 60, "authentication.success"),
    ]

    alerts = detect(events)

    assert any(alert["rule_id"] == "AUTH-002" for alert in alerts)


def test_success_without_failures_does_not_trigger_auth002():
    events = [
        make_event("EVT-1", 0, "authentication.success"),
    ]

    alerts = detect(events)

    assert not any(alert["rule_id"] == "AUTH-002" for alert in alerts)


def test_failures_for_different_users_are_not_combined():
    events = [
        make_event("EVT-1", 0, "authentication.failure", user="alice"),
        make_event("EVT-2", 10, "authentication.failure", user="bob"),
        make_event("EVT-3", 20, "authentication.failure", user="alice"),
        make_event("EVT-4", 30, "authentication.failure", user="bob"),
    ]

    alerts = detect(events)

    assert not any(alert["rule_id"] == "AUTH-001" for alert in alerts)


def test_four_failed_logins_do_not_trigger_auth001():
    events = [
        make_event(f"EVT-{i}", i * 10, "authentication.failure")
        for i in range(4)
    ]

    alerts = detect(events)

    assert not any(alert["rule_id"] == "AUTH-001" for alert in alerts)


def make_alert(alert_id, rule_id, host, user, severity, event_ids):
    return {
        "id": alert_id,
        "rule_id": rule_id,
        "title": f"Test alert {alert_id}",
        "severity": severity,
        "matched_event_ids": event_ids,
        "entity": {"host": host, "user": user},
    }


def test_related_alerts_create_candidate_incident():
    alerts = [
        make_alert("ALT-1", "AUTH-001", "host-1", "alice", "medium", ["EVT-1", "EVT-2"]),
        make_alert("ALT-2", "AUTH-002", "host-1", "alice", "high", ["EVT-2", "EVT-3"]),
    ]

    incidents = correlate(alerts)

    assert len(incidents) == 1
    assert incidents[0]["status"] == "open"
    assert incidents[0]["severity"] == "high"
    assert incidents[0]["alert_ids"] == ["ALT-1", "ALT-2"]


def test_incident_preserves_unique_evidence_references():
    alerts = [
        make_alert("ALT-1", "AUTH-001", "host-1", "alice", "medium", ["EVT-1", "EVT-2"]),
        make_alert("ALT-2", "AUTH-002", "host-1", "alice", "high", ["EVT-2", "EVT-3"]),
    ]

    incidents = correlate(alerts)

    assert incidents[0]["event_ids"] == ["EVT-1", "EVT-2", "EVT-3"]


def test_unrelated_alerts_are_not_correlated():
    alerts = [
        make_alert("ALT-1", "AUTH-001", "host-1", "alice", "medium", ["EVT-1"]),
        make_alert("ALT-2", "AUTH-002", "host-2", "bob", "high", ["EVT-2"]),
    ]

    incidents = correlate(alerts)

    assert incidents == []



def test_correlation_groups_alerts_for_same_host_and_user():
    alerts = [
        {
            "id": "ALT-1", "rule_id": "AUTH-001", "severity": "medium",
            "matched_event_ids": ["EVT-1"], "entity": {"host": "host-a", "user": "alice"},
        },
        {
            "id": "ALT-2", "rule_id": "AUTH-002", "severity": "high",
            "matched_event_ids": ["EVT-2", "EVT-3"], "entity": {"host": "host-a", "user": "alice"},
        },
    ]

    incidents = correlate(alerts)

    assert len(incidents) == 1
    assert incidents[0]["alert_ids"] == ["ALT-1", "ALT-2"]
    assert incidents[0]["event_ids"] == ["EVT-1", "EVT-2", "EVT-3"]
    assert incidents[0]["severity"] == "high"
    assert "not proof" in incidents[0]["correlation_reason"]


def test_correlation_does_not_group_different_accounts():
    alerts = [
        {
            "id": "ALT-1", "rule_id": "AUTH-001", "severity": "medium",
            "matched_event_ids": ["EVT-1"], "entity": {"host": "host-a", "user": "alice"},
        },
        {
            "id": "ALT-2", "rule_id": "AUTH-002", "severity": "high",
            "matched_event_ids": ["EVT-2"], "entity": {"host": "host-a", "user": "bob"},
        },
    ]

    assert correlate(alerts) == []


def test_correlation_requires_two_alerts():
    assert correlate([{
        "id": "ALT-1", "rule_id": "AUTH-001", "severity": "medium",
        "matched_event_ids": ["EVT-1"], "entity": {"host": "host-a", "user": "alice"},
    }]) == []
