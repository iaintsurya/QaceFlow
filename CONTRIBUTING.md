# Contributing to QaceFlow

Thanks for your interest. QaceFlow values **explainable, tested detections** over feature count, so the bar for changes is: it is deterministic, it is tested, and a user can see why it behaves the way it does.

## Setup

Follow *Getting started* in the [README](README.md). To run the checks CI runs:

```powershell
# backend
cd backend
python -m pip install -r requirements-dev.txt
python -m pytest

# frontend
cd ../frontend
npm ci
npm run build
```

## Adding or changing a detection rule

1. Add or edit the rule in `RULES` in `backend/app/engine.py`: name, severity, exact threshold, a rationale that includes the **innocent explanations**, and an indicative MITRE ATT&CK reference.
2. Implement it in `detect()`. It must be deterministic and independent of input order.
3. Write tests for the trigger, **both sides of every boundary** (for example exactly at and just past the window), and at least one false-positive case.
4. Add a scenario or sample data that demonstrates it, and update the README, `docs/PROJECT_REPORT.md` and `CHANGELOG.md`.

The Rules page, alert explanations and exported reports pick up the new rule automatically from the catalogue.

## Manual verification before a release

Automated tests do not cover the whole interface, so before tagging a release:

- [ ] `GET /api/health` returns `status: ok`.
- [ ] Each scenario on the **Data** page loads and the counts match the table in the README.
- [ ] `docs/sample-events.json` and `docs/sample-auth.log` (year 2026) import, and the header reads *Imported data · unverified*.
- [ ] A broken import (for example a timestamp of `yesterday`) is rejected with a clear message and stores nothing.
- [ ] Findings and case status survive a page reload and a backend restart.
- [ ] The exported report contains the findings, alerts with thresholds and ATT&CK references, and the evidence timeline.
- [ ] An unknown case ID returns 404 and an invalid status returns 400.
- [ ] `python -m pytest` and `npm run build` both pass, and the README commands still match the repository.

## Pull requests

- Keep changes focused and small enough to review.
- Use clear commit messages in the style `type(scope): summary`, for example `feat(detection): add password-spraying rule` or `fix(frontend): keep event IDs on one line`.
- Do not claim a feature works unless it has been tested. Include the commands you ran.
- Never commit real logs, credentials or databases.

## Reporting bugs

Open an issue with the steps to reproduce, what you expected and what happened. For security issues, follow [SECURITY.md](SECURITY.md) instead.
