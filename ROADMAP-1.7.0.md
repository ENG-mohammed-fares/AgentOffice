# AgentOffice 1.7.0 — release batch

Budget: $0. Release integration branch: release/v1.7.0. No automatic public release from this branch; only development can publish. Current public release: 1.6.4. Do not bump the release version or promote to development until the integrated batch is verified.

## Phase 0 — baseline
- [x] Isolate next-release development from public release delivery.
- [x] Add initial Node V8 unit coverage report to CI (existing identity/update-policy suite only; no project-wide coverage claim).
- [x] Baseline recorded: identity 85.85/77.78/65.22; startup-update 100/92.59/100; update-policy 100/100/100 (lines/branches/functions). Prior aggregate included test source; exclude it in new measurement.
- [x] Startup crossfade smoke regression repaired; CI run 45439347229 succeeded. Real Windows visual QA remains.

## Phase 1 — testing architecture
- [ ] Inspect current source, define unit boundaries, dependency injection and mock contracts.
- [x] Add first legacy-account IPC and identity error unit suites with isolated fixture, fake clock and deferred OAuth. Fix stale OAuth session and token-exchange concurrency. CI validated in run 45439347229. Evaluate Vitest only if it provides concrete value over the existing Node runner.
- [ ] Add integration/Electron tests and actionable coverage reports. Establish enforceable thresholds on explicitly defined production code scope; provisional goals 85% lines/functions/statements, 80% branches, 95% critical logic with a defined denominator. No exclusion of critical code just to inflate metrics.

- [x] SonarCloud configuration, account binding and first CI scan succeeded in run 45456896926. Quality Gate enforcement and findings review remain.
- [ ] Review Sonar findings, scope and quality gate; enable blocking after baseline validation.

## Phase 2 — persistent data
- [ ] Choose authenticated account identity model; define migration, schema, ownership, RLS and offline/conflict behavior.
- [ ] Use free Supabase PostgreSQL within limits; isolate local/guest data; no service-role secrets in renderer or repo.
- [ ] Verify migration and cross-user isolation with tests, then live test accounts.

## Phase 3 — motion
- [ ] Prototype robot opening a door and staged sign-in entry, using existing visual identity. User approves prototype before integration.
- [ ] Respect reduced motion, test actual readiness, keyboard/focus and theme/locale; visually validate Windows.

## Phase 4 — trusted Windows signing
- [ ] Verify current free open-source signing eligibility, pursue only a free provider.
- [ ] If accepted, review provider-specific approval and CI integration; sign application and installer before generating final update metadata; verify signatures and hashes.
- [ ] If not accepted, disclose unsigned status and SmartScreen limitations. Do not weaken security or purchase certificates.

## Phase 5 — batch QA and release
- [ ] Verify integrated functionality, actual Windows installation and updates, live OAuth/DB and coverage gates.
- [ ] Review remaining blockers with owner. Increase version to 1.7.0 only when ready.
- [ ] Promote tested batch to development for automatic CI/CD; verify published release and installed version.

High-precision review is recommended for database authorization/migrations, code-signing trust chain, and animation visual QA. Do not claim actual execution by another model without user switching to it.

## Current release foundation (priority P0/P1)
- [ ] Protect release branches, disable force pushes/deletions, require trusted review/checks without breaking development-to-release CI; owner admin settings required.
- [ ] Enable secret scanning/push protection; rotate exposed tokens; enable dependency alerts and Dependabot; configure CodeQL and dependency review with tracked source and lockfile.
- [x] Migrate canonical source from ZIP to tracked app/ files with CRC validation and committed app/package-lock.json; historical archive preserved in Git history. CI equivalence verification pending.
- [ ] Configure ESLint and enforce on maintained source; establish coverage and Sonar quality gates from reviewed baseline; expand tests for newly added modules, not just four existing modules.
- [ ] Cloud-first Supabase Auth/PostgreSQL, least privilege, RLS, separate dev/prod, verified migration and tenant isolation. No local DB as canonical user storage.
- [ ] Validate inputs and authorization server-side, rate limit sensitive operations, use bounded timeouts/retries, secure Electron IPC, protect credentials, sanitize logs.
- [ ] Basic error logging, privacy-safe diagnostics, backup/export and tested restore within free-tier limits; test modest authorized load and record baseline before claiming capacity.
- [ ] Finish previously agreed robot sign-in motion, pursue free trusted code signing, and real Windows + live authentication/database QA. Signing provider approval and SMTP are external dependencies, not completed features.
- [ ] Do not introduce paid plans, claim unlimited availability or publish this release before batch review. See [DEFERRED-BACKLOG.md](DEFERRED-BACKLOG.md) for explicit deferrals and future proposals.

## Security tools preparation
- [x] CodeQL advanced workflow and Dependabot configuration prepared on the batch branch; first CodeQL scan and default-branch activation pending.
- [ ] Owner enables GitHub branch rulesets, secrets/push protection and Dependabot security alerts; see SECURITY-SETUP.md.
