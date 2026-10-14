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
