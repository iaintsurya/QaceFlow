from datetime import datetime, timedelta, timezone


def suspicious_login_scenario() -> list[dict]:
    """Return a deterministic, synthetic sequence of authentication events."""
    start = datetime(2026, 10, 14, 10, 2, 0, tzinfo=timezone.utc)
    events = []
    samples = [
        ("authentication.failure", "invalid_password"),
        ("authentication.failure", "invalid_password"),
        ("authentication.failure", "invalid_password"),
        ("authentication.failure", "invalid_password"),
        ("authentication.failure", "invalid_password"),
        ("authentication.success", "valid_credentials"),
    ]
    for index, (event_type, reason) in enumerate(samples, start=1):
        timestamp = start + timedelta(seconds=(index - 1) * 20)
        events.append({
            "event_id": f"EVT-{index:05d}",
            "timestamp": timestamp.isoformat().replace("+00:00", "Z"),
            "event_type": event_type,
            "host": "lab-workstation-01",
            "user": "demo-user",
            "source": "simulated_auth_log",
            "src_ip": "192.0.2.25",
            "details": {"reason": reason, "scenario": "suspicious-login"},
        })
    return events
