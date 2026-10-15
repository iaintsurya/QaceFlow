"""Tests for QaceFlow's local incident persistence and reporting API."""

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
