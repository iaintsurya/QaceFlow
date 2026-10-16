
from app.engine import RULES, correlate, detect


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


# --- Window boundaries -------------------------------------------------------

def test_auth001_triggers_at_exactly_120_seconds():
    events = [make_event(f"EVT-{i}", i * 30, "authentication.failure") for i in range(5)]

    assert any(a["rule_id"] == "AUTH-001" for a in detect(events))


def test_auth001_does_not_trigger_when_window_exceeds_120_seconds():
    offsets = [0, 30, 60, 90, 121]
    events = [make_event(f"EVT-{i}", s, "authentication.failure") for i, s in enumerate(offsets)]

    assert not any(a["rule_id"] == "AUTH-001" for a in detect(events))


def test_auth001_ignores_slow_failures_spread_over_minutes():
    events = [make_event(f"EVT-{i}", i * 60, "authentication.failure") for i in range(6)]

    assert not any(a["rule_id"] == "AUTH-001" for a in detect(events))


def test_auth002_triggers_at_exactly_five_minutes():
    events = [
        make_event("EVT-1", 0, "authentication.failure"),
        make_event("EVT-2", 300, "authentication.success"),
    ]

    assert any(a["rule_id"] == "AUTH-002" for a in detect(events))


def test_auth002_does_not_trigger_after_five_minutes():
    events = [
        make_event("EVT-1", 0, "authentication.failure"),
        make_event("EVT-2", 301, "authentication.success"),
    ]

    assert not any(a["rule_id"] == "AUTH-002" for a in detect(events))


def test_failures_after_a_success_do_not_trigger_auth002():
    events = [
        make_event("EVT-1", 0, "authentication.success"),
        make_event("EVT-2", 30, "authentication.failure"),
        make_event("EVT-3", 60, "authentication.failure"),
    ]

    assert not any(a["rule_id"] == "AUTH-002" for a in detect(events))


# --- Entities ----------------------------------------------------------------

def test_failures_on_different_hosts_are_not_combined():
    events = []
    for i in range(3):
        events.append(make_event(f"EVT-A{i}", i * 10, "authentication.failure"))
        other = make_event(f"EVT-B{i}", i * 10 + 5, "authentication.failure")
        other["host"] = "lab-workstation-02"
        events.append(other)

    assert not any(a["rule_id"] == "AUTH-001" for a in detect(events))


# --- Alert identity and determinism ------------------------------------------

def test_two_separate_bursts_create_two_alerts_with_unique_ids():
    first = [make_event(f"EVT-A{i}", i * 10, "authentication.failure") for i in range(5)]
    second = [make_event(f"EVT-B{i}", 1000 + i * 10, "authentication.failure") for i in range(5)]

    alerts = [a for a in detect(first + second) if a["rule_id"] == "AUTH-001"]

    assert len(alerts) == 2
    assert len({a["id"] for a in alerts}) == 2
    assert alerts[0]["matched_event_ids"] == [f"EVT-A{i}" for i in range(5)]


def test_multiple_successes_create_unique_auth002_alert_ids():
    events = [
        make_event("EVT-1", 0, "authentication.failure"),
        make_event("EVT-2", 60, "authentication.success"),
        make_event("EVT-3", 120, "authentication.success"),
    ]

    alerts = [a for a in detect(events) if a["rule_id"] == "AUTH-002"]

    assert len(alerts) == 2
    assert len({a["id"] for a in alerts}) == 2


def test_detection_does_not_depend_on_input_order():
    events = [make_event(f"EVT-{i}", i * 10, "authentication.failure") for i in range(5)]
    events.append(make_event("EVT-9", 80, "authentication.success"))

    assert detect(events) == detect(list(reversed(events)))


def test_every_alert_references_a_documented_rule():
    events = [make_event(f"EVT-{i}", i * 10, "authentication.failure") for i in range(5)]
    events.append(make_event("EVT-9", 80, "authentication.success"))

    for alert in detect(events):
        assert alert["rule_id"] in RULES
        assert alert["matched_event_ids"]
        assert alert["id"].startswith(f"ALT-{alert['rule_id']}-")


def test_empty_input_produces_no_alerts_or_incidents():
    assert detect([]) == []
    assert correlate([]) == []


# --- Correlation -------------------------------------------------------------

def test_correlation_reason_names_the_rules_and_entities():
    alerts = [
        make_alert("ALT-1", "AUTH-001", "host-1", "alice", "medium", ["EVT-1"]),
        make_alert("ALT-2", "AUTH-002", "host-1", "alice", "high", ["EVT-2"]),
    ]

    reason = correlate(alerts)[0]["correlation_reason"]

    assert "AUTH-001" in reason and "AUTH-002" in reason
    assert "host-1" in reason and "alice" in reason
    assert "not proof" in reason


def test_every_rule_maps_to_a_mitre_attack_technique():
    import re

    for rule_id, rule in RULES.items():
        assert rule["mitre"], rule_id
        for technique in rule["mitre"]:
            assert re.fullmatch(r"T\d{4}(\.\d{3})?", technique["id"])
            assert technique["name"] and technique["tactic"]
