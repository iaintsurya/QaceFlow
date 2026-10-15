from app.engine import correlate, detect
from app.scenarios import get_scenario, suspicious_login_scenario


def test_suspicious_login_scenario_is_deterministic():
    assert suspicious_login_scenario() == suspicious_login_scenario()


def test_suspicious_login_scenario_produces_expected_results():
    events = suspicious_login_scenario()
    alerts = detect(events)
    incidents = correlate(alerts)

    assert len(events) == 6
    assert [a["rule_id"] for a in alerts] == ["AUTH-001", "AUTH-002"]
    assert len(incidents) == 1
    assert incidents[0]["id"] == "INC-0001"
    assert incidents[0]["severity"] == "high"
    assert incidents[0]["event_ids"] == [f"EVT-{i:05d}" for i in range(1, 7)]


def test_scenario_events_are_marked_as_simulated():
    for event in suspicious_login_scenario():
        assert event["source"] == "simulated_auth_log"
        assert event["details"]["scenario"] == "suspicious-login"


def test_repeated_failures_scenario_triggers_only_auth001():
    alerts = detect(get_scenario("repeated-failures"))

    assert [a["rule_id"] for a in alerts] == ["AUTH-001"]
    assert correlate(alerts) == []


def test_benign_scenario_triggers_nothing():
    assert detect(get_scenario("benign-login")) == []
