from datetime import datetime, timedelta, timezone
from typing import Any


START = datetime(2026, 10, 14, 10, 2, 0, tzinfo=timezone.utc)


def _build_events(
    scenario_id: str,
    samples: list[tuple[str, str]],
    *,
    host: str,
    user: str,
    src_ip: str,
    interval_seconds: int = 20,
) -> list[dict[str, Any]]:
    """Build deterministic synthetic authentication events."""
    events: list[dict[str, Any]] = []
    for index, (event_type, reason) in enumerate(samples, start=1):
        timestamp = START + timedelta(seconds=(index - 1) * interval_seconds)
        events.append({
            "event_id": f"EVT-{index:05d}",
            "timestamp": timestamp.isoformat().replace("+00:00", "Z"),
            "event_type": event_type,
            "host": host,
            "user": user,
            "source": "simulated_auth_log",
            "src_ip": src_ip,
            "details": {"reason": reason, "scenario": scenario_id},
        })
    return events


def suspicious_login_scenario() -> list[dict[str, Any]]:
    """Five failures followed by a success: should create two alerts."""
    samples = [
        ("authentication.failure", "invalid_password"),
        ("authentication.failure", "invalid_password"),
        ("authentication.failure", "invalid_password"),
        ("authentication.failure", "invalid_password"),
        ("authentication.failure", "invalid_password"),
        ("authentication.success", "valid_credentials"),
    ]
    return _build_events(
        "suspicious-login", samples,
        host="lab-workstation-01", user="demo-user", src_ip="192.0.2.25",
    )


def repeated_failures_scenario() -> list[dict[str, Any]]:
    """Repeated failures without a later success: should create AUTH-001 only."""
    samples = [
        ("authentication.failure", "invalid_password"),
        ("authentication.failure", "invalid_password"),
        ("authentication.failure", "invalid_password"),
        ("authentication.failure", "invalid_password"),
        ("authentication.failure", "invalid_password"),
    ]
    return _build_events(
        "repeated-failures", samples,
        host="lab-workstation-02", user="review-user", src_ip="192.0.2.26",
    )


def benign_login_scenario() -> list[dict[str, Any]]:
    """Ordinary successful logins: should not trigger authentication alerts."""
    samples = [
        ("authentication.success", "valid_credentials"),
        ("authentication.success", "valid_credentials"),
        ("authentication.success", "valid_credentials"),
    ]
    return _build_events(
        "benign-login", samples,
        host="lab-workstation-03", user="normal-user", src_ip="192.0.2.27",
        interval_seconds=90,
    )


SCENARIOS = {
    "suspicious-login": {
        "id": "suspicious-login",
        "name": "Suspicious login",
        "description": "Repeated failed logins followed by a successful login.",
        "event_count": 6,
        "runner": suspicious_login_scenario,
    },
    "repeated-failures": {
        "id": "repeated-failures",
        "name": "Repeated failures",
        "description": "Repeated failed logins without a subsequent success.",
        "event_count": 5,
        "runner": repeated_failures_scenario,
    },
    "benign-login": {
        "id": "benign-login",
        "name": "Benign login activity",
        "description": "Ordinary successful logins that should not trigger alerts.",
        "event_count": 3,
        "runner": benign_login_scenario,
    },
}


def list_scenarios() -> list[dict[str, Any]]:
    """Return public scenario metadata without exposing runner functions."""
    return [
        {key: value for key, value in scenario.items() if key != "runner"}
        for scenario in SCENARIOS.values()
    ]


def get_scenario(scenario_id: str) -> list[dict[str, Any]]:
    """Return a scenario's deterministic synthetic events."""
    scenario = SCENARIOS.get(scenario_id)
    if scenario is None:
        raise ValueError(f"Unknown scenario: {scenario_id}")
    return scenario["runner"]()
