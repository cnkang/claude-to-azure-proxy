# Completion Checklist
- Run targeted Biome checks on changed areas; ensure zero errors (warnings allowed per overrides).
- Run unit tests or narrow suites relevant to changes; for lint-only changes, spot-check as needed.
- Ensure imports use `.js` for internal modules and `node:` for built-ins.
- Keep architecture reuse: errors/validators/clients/util patterns; avoid duplicated logic.
- Update docs/comments only when behavior changes; keep correlationId and security patterns intact.
- Summarize changes and suggest next tests/steps to the user.