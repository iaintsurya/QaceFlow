# Security policy

## Scope

QaceFlow is an educational, local-first investigation workbench. By design it has **no authentication**, stores data **unencrypted** in a local SQLite file, and is meant to run on `localhost` only. It must not be exposed to the internet in its current state.

## Reporting a vulnerability

Please report suspected vulnerabilities **privately** using GitHub's *Report a vulnerability* button on the repository's **Security** tab (private vulnerability reporting), rather than opening a public issue. Include the affected version, steps to reproduce and the impact you expect.

You can expect an acknowledgement, and a fix or a documented limitation for issues that are in scope. Examples of in-scope issues: injection through imported events, notes or log files; unsafe rendering of imported data; path or resource abuse through the import endpoints; dependency vulnerabilities.

## Handling data

- Only import logs you are authorised to analyse, and prefer sanitized samples.
- Imported events are labelled *unverified*; correlated activity is a candidate for investigation, not proof of compromise.
- Delete `backend/qaceflow.db` to remove all stored events, alerts, cases and notes.

## Supported versions

Only the latest release receives fixes.
