# Development workflow

## Branching and commits

Prefer small commits that each represent one real change, such as:

- `docs: clarify architecture and local setup`
- `test: cover correlation edge cases`
- `feat(api): add investigation report endpoint`
- `feat(ui): add Markdown report export`
- `style(ui): adopt white forensic workspace theme`

Do not create commits for changes that were not made. Do not commit `.venv`, `node_modules`, generated databases, build output, caches, credentials or machine-specific files.

## Verification checklist

- [ ] `/api/health` returns `status: ok`.
- [ ] Replaying the demo reports event, alert and incident counts.
- [ ] Event, alert and incident views use API responses.
- [ ] Notes remain after browser reload and API restart.
- [ ] Status remains after browser reload and API restart.
- [ ] Exported Markdown includes saved notes, linked alerts and evidence.
- [ ] Invalid incident IDs return HTTP 404.
- [ ] Invalid statuses return HTTP 400.
- [ ] Backend tests pass.
- [ ] `npm run build` passes.
- [ ] README commands match the repository.

## Reset behavior

The suspicious-login replay endpoint intentionally resets the demo events, alerts, incidents and notes to keep the sample deterministic. Treat this as a destructive demo action and communicate it clearly in the UI.
