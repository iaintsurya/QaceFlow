
from app.engine import detect


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
