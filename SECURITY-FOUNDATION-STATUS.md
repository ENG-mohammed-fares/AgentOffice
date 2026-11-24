# Security foundation — v1.7.0 candidate
Prepared changes, not verified until CI succeeds:
- Pin external workflow actions on release/v1.7.0 to GitHub-resolved full commit SHA; keep tag comments. Main/development still use tags until separately reconciled.
- Add PR Dependency Review (public repo; dependency graph must be enabled).
- Enforce provisional LCOV floors: 70% lines, 60% branches, 60% functions for five explicitly named production modules. No project-wide coverage claim; review baseline before raising to the agreed target.
- Restrict production IPC to the trusted top-level workspace and block navigation to other pages. Add IPC tests, bounded login/recovery attempts and per-address recovery cooldown tests.
- Keep npm high/critical audit blocking. No cloud database integration or public release.
Pending: owner Actions allowlist (SHA references), latest CI/CodeQL startup failure investigation, verify new build and live Windows auth flows; review actual CodeQL/Dependabot alerts and Sonar gate; ESLint with reproducible lockfile; wider integration tests and ruleset required checks after validation.
