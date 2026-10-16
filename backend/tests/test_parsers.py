from pathlib import Path

from app.engine import correlate, detect
from app.ingest import validate_events
from app.parsers import parse_sshd_auth_log

SAMPLE = Path(__file__).resolve().parents[2] / "docs" / "sample-auth.log"


def test_failed_and_accepted_logins_become_events():
    text = (
        "Oct 14 10:02:00 web-01 sshd[1]: Failed password for bob from 198.51.100.9 port 4000 ssh2\n"
        "Oct 14 10:02:09 web-01 sshd[2]: Accepted password for bob from 198.51.100.9 port 4001 ssh2\n"
    )

    result = parse_sshd_auth_log(text, 2026)
    first, second = result["events"]

    assert first["event_type"] == "authentication.failure"
    assert second["event_type"] == "authentication.success"
    assert first["timestamp"] == "2026-10-14T10:02:00+00:00"
    assert (first["host"], first["user"], first["src_ip"]) == ("web-01", "bob", "198.51.100.9")
    assert [first["event_id"], second["event_id"]] == ["LOG-00001", "LOG-00002"]


def test_invalid_user_failures_are_flagged_and_use_the_attempted_name():
    text = "Oct 14 10:02:00 h sshd[1]: Failed password for invalid user admin from 203.0.113.5 port 1 ssh2"

    event = parse_sshd_auth_log(text, 2026)["events"][0]

    assert event["user"] == "admin"
    assert event["details"]["invalid_user"] is True


def test_non_login_lines_are_skipped_and_counted():
    text = (
        "Oct 14 10:00:00 h CRON[1]: session opened\n"
        "Oct 14 10:00:01 h sshd[2]: Invalid user x from 203.0.113.5 port 1\n"
        "Oct 14 10:00:02 h sshd[2]: Failed password for x from 203.0.113.5 port 1 ssh2\n"
        "not a log line\n"
    )

    result = parse_sshd_auth_log(text, 2026)

    assert len(result["events"]) == 1
    assert result["lines"] == 4 and result["skipped_lines"] == 3


def test_single_digit_days_and_ipv6_addresses_are_supported():
    text = "Oct  4 09:01:02 h sshd[1]: Accepted publickey for ann from 2001:db8::1 port 22 ssh2"

    event = parse_sshd_auth_log(text, 2026)["events"][0]

    assert event["timestamp"] == "2026-10-04T09:01:02+00:00"
    assert event["src_ip"] == "2001:db8::1"


def test_impossible_dates_are_skipped_instead_of_crashing():
    text = "Feb 29 10:00:00 h sshd[1]: Failed password for a from 203.0.113.5 port 1 ssh2"

    assert parse_sshd_auth_log(text, 2026)["events"] == []
    assert len(parse_sshd_auth_log(text, 2028)["events"]) == 1


def test_raw_line_is_kept_as_evidence_but_truncated():
    long_tail = "x" * 900
    text = f"Oct 14 10:00:00 h sshd[1]: Failed password for a from 203.0.113.5 port 1 ssh2 {long_tail}"

    raw = parse_sshd_auth_log(text, 2026)["events"][0]["details"]["raw"]

    assert raw.startswith("Oct 14 10:00:00 h sshd[1]: Failed password")
    assert len(raw) == 500


def test_parsed_events_pass_import_validation():
    events = parse_sshd_auth_log(SAMPLE.read_text(), 2026)["events"]

    valid, errors = validate_events(events)

    assert errors == [] and len(valid) == len(events)


def test_sample_log_detects_a_brute_force_followed_by_a_root_login():
    events, _ = validate_events(parse_sshd_auth_log(SAMPLE.read_text(), 2026)["events"])

    alerts = detect(events)
    incidents = correlate(alerts)

    assert [a["rule_id"] for a in alerts] == ["AUTH-001", "AUTH-002"]
    assert alerts[0]["entity"] == {"host": "web-01", "user": "root"}
    assert len(incidents) == 1 and incidents[0]["entities"]["user"] == "root"
