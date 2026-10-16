# Changelog

## 0.2.0

### Added
- Persistent analyst notes and incident status (SQLite), with a 20,000-character note limit.
- Investigation workspace: case-file layout, evidence timeline with raw event inspection, rule explanations and unsaved-changes indicator.
- Markdown investigation report (`GET /api/incidents/{id}/report.md`) generated on the server from the saved investigation.
- Detection rule catalogue (`GET /api/rules`) with thresholds and explanations on every alert.
- Three synthetic scenarios: suspicious login, repeated failures, benign logins.
- Validated, all-or-nothing JSON event import (`POST /api/events/import`) with an import panel in the UI.
- Event explorer search and event-type filter.
- GitHub Actions CI (backend tests and frontend production build).
- 60+ automated tests covering detection boundaries, correlation, reporting, import validation and the API.

### Fixed
- Alert IDs are now unique and stable (`ALT-<rule>-<nn>`); previously two matches of one rule would collide.
- `AUTH-001` now detects repeated bursts instead of only the first one.
- The overview no longer assumes the incident is `INC-0001`; dead sidebar links and placeholder metrics were removed.
- Reports describe imported events as unverified rather than simulated.

### Changed
- The interface was redesigned as a case ledger: top-bar navigation, dense tables, serif headings, and separate Cases, Case, Events, Alerts, Rules and Data pages. The frontend is split into typed modules with a single stylesheet.
- The Rules page lists every detection rule with its exact threshold and rationale.
- Frontend dependencies are pinned instead of `latest`.
- Replaying a scenario or importing events asks for confirmation because it clears notes and status.

## 0.1.0
- Initial release: simulated authentication telemetry, two detection rules, alert correlation and an overview dashboard.
