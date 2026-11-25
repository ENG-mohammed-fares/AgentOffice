# Engineering foundation and delivery evidence

Owner: repository maintainer; review when requirements, interfaces or release policy change.
Scope: development baseline `022972afd47476298e2eea265c67371f07348a50`, version 1.6.16;
audit performed 2026-11-25. This is a snapshot, not a claim about later heads.

## Gap inventory

| Practice | Evidence | Status | Risk and next acceptance evidence |
|---|---|---|---|
| Deterministic preparation | `scripts/ci-prepare.py`, `scripts/apply-agile-office.py` | Existing | Edit canonical overlays; preserve immutable ZIP and provenance |
| Unit/coverage | `scripts/run-coverage.cjs`, `scripts/test_*.py` | Existing | New behavior must have executed positive and negative cases |
| Architecture/mutation gate | `scripts/refactoring-gate.mjs` | Existing | Preserve default-policy characterization; explicit changes need separate contracts |
| Security and Sonar | `.github/workflows/private-security.yml`, `sonar-project.properties` | Existing, latest gate not verified here | Obtain exact candidate check results; success of an asset job is insufficient |
| Renderer improvements | PR #20, head `803cf525a446a9487d1a51f9a13e2dd7140bce48` | Experimental | Device comparison and image acceptance outstanding |
| Avatars | PR #21 and `feat/1.6.17-natural-office-motion` | Experimental | Unit/asset success does not prove furniture clearance or natural movement |
| Code documentation | PR #22 | Pending | Run architecture checks after JSDoc edits; avoid duplicate policy |
| Requirements and traceability | `docs/requirements/traceability.json` | Added in this change | Validator checks references and evidence shape, not product correctness |
| Physical GPU benchmark | `docs/performance-testing.md` | Blocked on device execution | Repeat both revisions on identical machine/preset/viewport |
| Native review enforcement | `docs/code-review.md` | Not verified | Owner-approved interim policy is not independent approval |
| Signing policy consistency | `RELEASE-POLICY.md`, owner instruction | Conflict | Older docs require signing; owner explicitly prohibits reintroducing mandatory signing. Do not modify publication policy in this scope |
| Scalable agent backend | No execution engine in current office task panel | Deferred | Define execution/security contracts before load claims |

Open PRs at audit: #12 quality remediation; #20 renderer foundation; #21 character integration;
#22 documentation (base is natural-motion branch, not development).
Run 45707480635 failed the refactoring gate with `Unexpected dynamic import` after JSDoc
used a type-only import expression. It did not reach Sonar. Run 45706992854 succeeded on
the natural-motion branch; that does not establish development or PR Sonar success.

GitHub's Sonar check at PR #20 head `803cf525a446a9487d1a51f9a13e2dd7140bce48`
reports PASS: 89.6% new-code coverage, 0.0% new duplication, zero new issues/hotspots.
PR #21 head `c9ab2d9f416c0429d5ad02b2305013d78bf1760e` reports FAIL:
56.9% new-code coverage (required 80%) and security rating C (required A).
Do not attribute the PR #22 architecture failure to Sonar or assume #20's pass covers #21.
The exact security rule/location and uncovered paths still require inspection.

## Definition of Ready and Done

Ready: owner requirement, canonical source, acceptance scenario, dependencies and risk identified.
Done: reviewed implementation and docs agree; relevant positive/negative tests, build, security,
coverage and Sonar pass at the candidate revision; visual/device criteria have real evidence.
Merge and release are separate states. Verify development again after merge. No implicit approval,
invented benchmarks, suppressed findings or automatic production promotion from this document.

## Ordered delivery backlog

| ID | Priority | Work | Status / acceptance |
|---|---|---|---|
| ENG-01 | P0 | Repair documentation/architecture conflict | Existing PR #22; gate must pass without disabling checks |
| ENG-02 | P0 | Trace requirements to canonical code and tests | This change; validator and mutation fixtures pass |
| ENG-03 | P0 | Inspect PR #20/#21 Sonar conditions | Pending exact gate evidence; fix source, not thresholds |
| PERF-01 | P1 | Compare renderer baseline and candidate | Reference hardware needed; preserve native resolution in reports |
| VIS-01 | P1 | Accept native FHD previews and bake candidate | Pending visual/UV/provenance evidence; original PBR remains default |
| MOTION-01 | P1 | Validate full chair/meeting/return sequence | Natural-motion branch; geometry checks plus video acceptance |
| ENG-04 | P2 | Exercise installed update and recovery | Isolated Windows fixture; no real-user data or release overwrite |
| SCALE-01 | P2 | Specify bounded agent execution service | Deferred until actual execution scope is approved |
| ROLLOUT-01 | P3 | Canary and A/B deployment | Deferred until opt-in cohort, telemetry/privacy, rollback and adequate sample exist |

Current sprint goal: unblock documentation checks and add executable evidence traceability.
No estimates or burndown history have been fabricated. Record remaining work when an actual
sprint is agreed; scope changes must remain visible.

## Risk register

| Risk | Trigger / impact | Mitigation / contingency | Owner / status |
|---|---|---|---|
| R-01 performance | Stalls or blurry movement | Same-device benchmark; keep original path and revert isolated PR | Maintainer / open |
| R-02 branch overlap | Multiple renderer/motion PRs | Inspect heads and dependencies before edits; do not duplicate implementations | Maintainer / open |
| R-03 false assurance | Green unit tests misreported as visual or hardware proof | Separate verification from validation in RTM | Maintainer / controlled by reporting |
| R-04 secret exposure | Public assets or renderer contain private configuration | Existing history/package scans and IPC boundaries; stop publication if found | Maintainer / ongoing |
| R-05 release policy drift | Stale signing/release docs conflict with owner decision | Reconcile in dedicated review; no release from this change | Owner / open |
| R-06 motion collision | Characters intersect chairs/glass | Geometry regression and complete rendered sequence; retain experiment isolation | Maintainer / open |

Likelihood and numeric severity are not measured; prioritize from observed failure and impact.

## Testing and experimental acceptance

Use existing Node and Python runners, deterministic clocks/fakes, AAA, and FIRST principles.
Test external adapter contracts separately from mocks. Add regression tests before or alongside
fixes and report the actual order; do not claim retrospective TDD. The RTM validator rejects
missing files, duplicate IDs, unsafe paths, absent test identifiers and unsupported pass claims.
It cannot certify that an assertion proves a requirement.

Do not add a second feature-flag framework. Rendering/character branches already have opt-in
benchmark candidates. Keep hybrid baking out of normal startup until UVs, image appearance,
KTX2 provenance, lighting and moving-character shadows pass review. A client flag grants no
authorization. Record an owner and removal condition before promoting any experiment.

Canary readiness: supported opt-in distribution, known healthy baseline, rollback procedure,
privacy-reviewed telemetry and explicit promotion/halt thresholds. A/B readiness: product
hypothesis, sufficient sample, agreed primary/guardrail metrics and consent where required.
Neither is implemented or necessary for this foundation change.
