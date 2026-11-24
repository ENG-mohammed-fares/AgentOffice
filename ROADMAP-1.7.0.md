# AgentOffice 1.7.0 — release batch

Budget: $0. Release integration branch: release/v1.7.0. No automatic public release from this branch; only development can publish. Current public release: 1.6.4. Do not bump the release version or promote to development until the integrated batch is verified.

## Phase 0 — baseline
- [x] Isolate next-release development from public release delivery.
- [x] Add initial Node V8 unit coverage report to CI (existing identity/update-policy suite only; no project-wide coverage claim).
- [ ] Record measured line/branch/function percentages and uncovered modules.
- [ ] Diagnose and repair failing 1.6.5 startup crossfade smoke test (run 45430606664: timed out waiting for loaded login behind fading intro). Preserve the successful 1.6.4 release until verification.

## Phase 1 — testing architecture
- [ ] Inspect current source, define unit boundaries, dependency injection and mock contracts.
- [ ] Expand tests for authentication, storage, update paths, and failure handling. Evaluate Vitest only if it provides concrete value over the existing Node runner.
- [ ] Add integration/Electron tests and actionable coverage reports. Establish enforceable thresholds on explicitly defined production code scope; provisional goals 85% lines/functions/statements, 80% branches, 95% critical logic with a defined denominator. No exclusion of critical code just to inflate metrics.

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
