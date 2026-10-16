"""Tests for QaceFlow's local incident persistence and reporting API."""

from pathlib import Path

import pytest
from fastapi import HTTPException

from app import main


@pytest.fixture
def local_database(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DB_PATH", tmp_path / "qaceflow-test.db")
    main.initialize()
    main.replay_scenario()
    return main.DB_PATH


def test_demo_scenario_creates_expected_records(local_database):
    assert len(main.list_events()) == 6
    assert len(main.list_alerts()) == 2
    assert len(main.list_incidents()) == 1


def test_notes_persist_and_report_includes_them(local_database):
    incident_id = main.list_incidents()[0]["id"]
    saved = main.save_incident_notes(incident_id, {"notes": "Reviewed the login sequence."})
    loaded = main.get_incident_notes(incident_id)
    report = main.export_incident_report(incident_id)

    assert saved["notes"] == "Reviewed the login sequence."
    assert loaded["notes"] == "Reviewed the login sequence."
    assert report["notes"] == "Reviewed the login sequence."
    assert len(report["events"]) == 6
    assert len(report["alerts"]) == 2


def test_status_update_is_saved_and_reported(local_database):
    incident_id = main.list_incidents()[0]["id"]
    updated = main.update_incident_status(incident_id, {"status": "investigating"})

    assert updated["status"] == "investigating"
    assert main.list_incidents()[0]["status"] == "investigating"
    assert main.export_incident_report(incident_id)["incident"]["status"] == "investigating"


def test_invalid_status_is_rejected(local_database):
    incident_id = main.list_incidents()[0]["id"]

    with pytest.raises(HTTPException) as error:
        main.update_incident_status(incident_id, {"status": "maybe"})

    assert error.value.status_code == 400


def test_missing_incident_report_returns_404(local_database):
    with pytest.raises(HTTPException) as error:
        main.export_incident_report("INC-NOT-REAL")

    assert error.value.status_code == 404



def test_scenario_catalog_lists_three_scenarios(local_database):
    scenarios = main.available_scenarios()
    assert {item["id"] for item in scenarios} == {
        "suspicious-login", "repeated-failures", "benign-login"
    }


def test_repeated_failures_scenario_creates_one_alert_no_incident(local_database):
    result = main.replay_named_scenario("repeated-failures")
    assert result["event_count"] == 5
    assert result["alert_count"] == 1
    assert result["incident_count"] == 0
    assert result["reset_notes"] is True


def test_benign_scenario_creates_no_alerts_or_incidents(local_database):
    result = main.replay_named_scenario("benign-login")
    assert result["event_count"] == 3
    assert result["alert_count"] == 0
    assert result["incident_count"] == 0
    assert main.list_events()[0]["details"]["scenario"] == "benign-login"


def test_unknown_scenario_returns_404(local_database):
    with pytest.raises(HTTPException) as error:
        main.replay_named_scenario("not-a-scenario")
    assert error.value.status_code == 404



def test_replaying_scenario_explicitly_resets_saved_notes(local_database):
    incident_id = main.list_incidents()[0]["id"]
    main.save_incident_notes(incident_id, {"notes": "Keep for this case only."})

    result = main.replay_named_scenario("benign-login")

    assert result["reset_notes"] is True
    assert main.list_incidents() == []
    assert main.list_events()[0]["details"]["scenario"] == "benign-login"


def test_alerts_include_rule_threshold_and_explanation(local_database):
    alert = main.list_alerts()[0]

    assert alert["threshold"]
    assert alert["explanation"]


def test_rules_endpoint_lists_documented_rules(local_database):
    assert [rule["id"] for rule in main.list_rules()] == ["AUTH-001", "AUTH-002"]


def test_oversized_notes_are_rejected(local_database):
    incident_id = main.list_incidents()[0]["id"]

    with pytest.raises(HTTPException) as error:
        main.save_incident_notes(incident_id, {"notes": "x" * (main.MAX_NOTES_LENGTH + 1)})

    assert error.value.status_code == 413
    assert main.get_incident_notes(incident_id)["notes"] == ""


def test_markdown_report_download_contains_saved_notes(local_database):
    incident_id = main.list_incidents()[0]["id"]
    main.save_incident_notes(incident_id, {"notes": "Verified with the account owner."})
    main.update_incident_status(incident_id, {"status": "investigating"})

    response = main.export_incident_report_markdown(incident_id)
    body = response.body.decode()

    assert response.media_type.startswith("text/markdown")
    assert "attachment" in response.headers["content-disposition"]
    assert "Verified with the account owner." in body
    assert "| Status | investigating |" in body
    assert "ALT-AUTH-001-01" in body


def test_markdown_report_for_missing_incident_returns_404(local_database):
    with pytest.raises(HTTPException) as error:
        main.export_incident_report_markdown("INC-NOT-REAL")

    assert error.value.status_code == 404


def test_notes_survive_a_simulated_restart(local_database):
    incident_id = main.list_incidents()[0]["id"]
    main.save_incident_notes(incident_id, {"notes": "Persisted."})

    main.initialize()  # what the server does on startup; must not wipe data

    assert main.get_incident_notes(incident_id)["notes"] == "Persisted."


def _login_burst():
    events = [
        {"event_id": f"IMP-{i}", "timestamp": f"2026-10-14T09:00:{i * 10:02d}Z",
         "event_type": "authentication.failure", "host": "srv-1", "user": "bob",
         "src_ip": "198.51.100.9"}
        for i in range(5)
    ]
    events.append({"event_id": "IMP-5", "timestamp": "2026-10-14T09:01:10Z",
                   "event_type": "authentication.success", "host": "srv-1",
                   "user": "bob", "src_ip": "198.51.100.9"})
    return events


def test_import_runs_detection_and_correlation(local_database):
    result = main.import_events({"events": _login_burst()})

    assert result["event_count"] == 6
    assert result["alert_count"] == 2
    assert result["incident_count"] == 1
    assert main.list_events()[0]["source"] == "imported"


def test_invalid_import_is_rejected_and_stores_nothing(local_database):
    before = len(main.list_events())

    with pytest.raises(HTTPException) as error:
        main.import_events({"events": [{"event_id": "x"}]})

    assert error.value.status_code == 422
    assert error.value.detail["error_count"] > 0
    assert len(main.list_events()) == before


def test_imported_report_is_labelled_as_imported(local_database):
    main.import_events({"events": _login_burst()})
    incident_id = main.list_incidents()[0]["id"]

    body = main.export_incident_report_markdown(incident_id).body.decode()

    assert "Imported data" in body


def test_alerts_and_rules_expose_mitre_techniques(local_database):
    assert main.list_alerts()[0]["mitre"][0]["id"] == "T1110"
    assert all(rule["mitre"] for rule in main.list_rules())


def test_markdown_report_includes_mitre_mapping(local_database):
    incident_id = main.list_incidents()[0]["id"]

    body = main.export_incident_report_markdown(incident_id).body.decode()

    assert "T1110" in body and "T1078" in body


SAMPLE_LOG = Path(__file__).resolve().parents[2] / "docs" / "sample-auth.log"


def test_auth_log_import_runs_detection_and_reports_skipped_lines(local_database):
    result = main.import_events(
        {"format": "sshd-auth-log", "text": SAMPLE_LOG.read_text(), "year": 2026}
    )

    assert result["alert_count"] == 2 and result["incident_count"] == 1
    assert result["skipped_lines"] > 0
    event = main.list_events()[0]
    assert event["source"] == "imported" and "raw" in event["details"]


def test_auth_log_import_rejects_files_without_login_events(local_database):
    with pytest.raises(HTTPException) as error:
        main.import_events({"format": "sshd-auth-log", "text": "nothing useful here\n", "year": 2026})

    assert error.value.status_code == 422
    assert "No sshd login events" in error.value.detail["message"]


def test_auth_log_import_validates_text_year_and_format(local_database):
    for payload, expected in [
        ({"format": "sshd-auth-log", "text": 5}, 422),
        ({"format": "sshd-auth-log", "text": "x", "year": "2026"}, 422),
        ({"format": "sshd-auth-log", "text": "x", "year": 1999}, 422),
        ({"format": "windows-evtx", "text": "x"}, 422),
    ]:
        with pytest.raises(HTTPException) as error:
            main.import_events(payload)
        assert error.value.status_code == expected


def test_failed_log_import_keeps_the_existing_dataset(local_database):
    before = len(main.list_events())

    with pytest.raises(HTTPException):
        main.import_events({"format": "sshd-auth-log", "text": "junk", "year": 2026})

    assert len(main.list_events()) == before
