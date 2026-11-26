# Remaining acceptance contracts

Owner: maintainer; product acceptance: owner. Reviewed 2026-11-26 against the current development integration baseline. Stories: US-QUALITY-003/004; requirement DR-QUALITY-001.
This work stays off the active release branch. No runtime or release switch is changed.

## Existing switch registry

All entries are local benchmark settings in `scripts/office-runtime-benchmark.cjs`.
They are not remotely configurable permissions or a second flag framework.

| Setting | Kind / default | Allowed values / activation | Rollback / removal condition |
|---|---|---|---|
| AGENTOFFICE_GRAPHICS_PRESET | Preference / balanced | high, balanced, performance; harness validates | unset; retain while hardware tiers are supported |
| AGENTOFFICE_BAKED_CANDIDATE | Experiment / absent | 1 or ktx2; explicit isolated benchmark | unset; remove after validated asset adoption or abandonment |
| AGENTOFFICE_CHARACTER_REVIEW | Experiment / off | 1 enables screenshots; requires preview destination | unset; remove when dedicated visual acceptance harness replaces it |
| AGENTOFFICE_SEATED_REVIEW | Experiment / off | 1 selects seated review scenario | unset; review alongside character scenario changes |
| AGENTOFFICE_PREVIEW_DIR | Diagnostic / absent | local operator-selected output directory | unset and delete fixture outputs after review |
| AGENTOFFICE_REQUIRE_KTX2 | Validation / off | 1 requires compressed output instead of accepting fallback | unset for an intentional fallback fixture; retain strict production asset validation |

Owner for each entry: renderer maintainer. Review at each renderer release; no calendar
expiry is invented. Promotion requires recorded visual and same-device evidence. These
switches do not enable alternate authentication, execution providers or server privileges.
The normal runtime remains the existing PBR path; a bake involving fixed chairs is not
approved for movable-chair scenes. The current flags are not all typed through one parser;
consolidation is deferred to a tested renderer PR after the release candidate settles.

## Reference device performance / visual acceptance

Use the existing `docs/performance-testing.md` preparation and benchmark commands.
Record baseline and candidate full commit IDs, Windows/Electron/driver versions, GPU,
power mode, viewport, preset, actual drawing resolution, and cold/warm conditions.
Run three repeats per revision on the same device; retain each raw JSON, then compare
median readiness time, FPS and p95 intervals. A software renderer is a separate environment.
Owner targets remain 60 FPS and approximately 16.67 ms at clear Full HD; no measured
hardware result is established by this change. Do not select budgets from CI timing.

Capture the complete typing -> chair pull -> rise -> doorway walk -> destination chair
clearance -> seating -> return sequence. Review leg/hip/hand contact, foot sliding,
turns, desk/chair/glass intersections, cancellation and restoration. Screenshots alone
cannot validate motion. Associate geometry tests and video with the exact revision.

## Isolated update and data recovery drill

Prerequisite: authorized disposable Windows VM or clean OS test account, prior approved
installer and exact candidate, known test update feed, snapshots and synthetic task data.
Never point an experimental update feed at the production distribution repository.

1. Snapshot the VM and record installer hashes/version/channel. Create only synthetic
   task data through the app. Identify the app's actual userData and task storage paths
   from the prepared main/task code before copying anything; do not guess paths.
2. Exit the app, copy fixture data to an isolated backup, record hashes and access controls.
3. Test valid update, unavailable feed, interrupted download and corrupted package as
   separate restored snapshots. Confirm failed verification never installs a bad artifact.
4. Restart and verify version, auth boundary and synthetic tasks; record logs with secrets
   redacted. Do not reuse production sessions or refresh tokens in evidence.
5. Restore the fixture backup with the app stopped, reopen and verify task contents through
   the real UI. Capture elapsed recovery time and lost synthetic changes; RTO/RPO remain
   TBD until measured and approved.
6. Revert VM snapshots and remove experimental feeds/backups. Keep only sanitized reports.

Existing candidate/feed unit tests verify metadata/hash rejection; they do not establish
clean install, installed upgrade or userData restoration. Those acceptance checks are BLOCKED
until the suitable Windows environment and artifacts are supplied to the drill.

## Workload and resource measurement

The task panel is a local demo, not a multi-user execution server. Start with fixed synthetic
task counts and repeated navigation/mount/logout, recording elapsed times and memory-object
counts. Choose stress limits from actual product validation rather than asserting capacity.
Future execution architecture must specify request authorization, step/time/cost budgets,
cancellation, bounded concurrency, deduplication, retry limits and redacted audit events.
No provider, paid service or load is provisioned here. Actual capacity/RLS/backend resilience
acceptance remains BLOCKED until those components exist and a safe workload is approved.

## Delivery status and residual risk

| Practice | Current evidence | Remaining scope |
|---|---|---|
| Story-first/BDD | Canonical stories and Given/When/Then; validator tests exercise rejection and acceptance | Review business meaning and chronology; fixtures are not product E2E |
| FIRST/AAA/TDD | Isolated Python fixtures; new defect tests run red before implementation | Broader test-double and runtime audit remains separate |
| SRP/DI | Validator splits metadata, links, tests, evidence and path checks; root injected into filesystem checks | No claim that renderer/auth are fully refactored |
| Architecture | Existing deterministic import gate retained | Keep natural-motion diagrams synchronized in renderer work |
| Feature lifecycle | Registry, owner and removal criteria above | Consolidated parser and enabled/invalid/failure runtime tests pending |
| Recovery/scalability | Repeatable isolated validation procedures above | Actual device/backend execution blocked; no benchmark claims |
| Release | This PR changes tests, validator and docs only | Release PR #25 remains independently owned and validated |

Do not call these adjacent practices fully complete. No new mandatory signing, quality
threshold changes, release version changes, updater modifications or production publication.
