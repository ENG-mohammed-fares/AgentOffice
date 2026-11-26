# SonarCloud Quality Gate

Project: ENG-mohammed-fares_AgentOffice. Organization: eng-mohammed-fares.

## Required branch alignment

The SonarCloud Free-plan primary branch is **development**, matching this repository's trusted CI and PR target. GitHub main and the public distribution channel are unchanged. On 2026-11-25 the old Sonar-only unanalysed development record was removed and the Sonar primary branch renamed from main to development. This repairs the non-main-branch entitlement error without payment. Do not rename it back or run branch analyses for release branches under this plan. PR results alone do not establish post-merge branch success.

CI checks the live primary-branch setting before the expensive Windows build and fails closed with an actionable message if it drifts. The scanner still waits for the real server-side Quality Gate. Token absence, API failure, scanner failure, gate failure and timeout remain blocking. Automatic analysis is off; CI imports measured coverage. Never expose SONAR_TOKEN in source, URLs, logs or chat.

## Analysis scope migration

The service's new scope UX ignores sonar.sources, sonar.tests and sonar.test.inclusions. The scanner explicitly warned about this on run 45609838791 attempt 2. Keep exclusions explicit: compiled outputs, third-party public assets, test harnesses and overlay fragments already analyzed in their prepared runtime destinations. The role-specific `screen-content.mjs` overlay is canonicalized into `assets/agile-office/screen-content.mjs`; its byte-identical `app/src` copy is excluded from Sonar and its measured V8 coverage is transferred only after the byte-equality check. Do not exclude live runtime modules or build/release scripts to make coverage pass. Canonical tracked office/crash overlays are analyzed once and accept measured coverage only after byte-equality checks against their prepared copies. The retired studio/icons dashboard modules are removed from the prepared app only after checking that the new main no longer imports them; the immutable baseline ZIP is retained.

## Execution evidence

- Node unit tests produce coverage/sonar-lcov.info against byte-verified canonical sources.
- The existing real Electron authentication smoke test records V8 coverage for main-process modules and precise renderer execution. A locked v8-to-istanbul converter maps an unminified verification bundle through its source maps back to original application modules, then applies the same canonical byte checks. Conversion regression tests execute real V8 fixtures, preserve uncovered branches, check merging, verify source-map locations and reject absent evidence or changed overlay bytes.
- Python preparation/validation commands run under coverage.py, including the nested auth overlays. The Linux asset job measures real scene generation, GLB export and KTX compression, and transfers portable XML to the Windows scanner. Relative paths are required across operating systems. Both reports remain in scope; no synthetic hit counts are generated.
- Pester reports actual execution of signing/publication policy and package-secret scans. Unexecuted lines remain uncovered. Combined reports are preserved as CI artifacts.

The coverage tooling and profiler hooks exist only in test harnesses. The final minified production bundle is rebuilt without source maps after conversion and must pass the real smoke test again before packaging. Minified multi-module source maps can inflate unmapped ranges, so they are never used as execution evidence. Production Electron keeps sandboxing, context isolation, web security and the same identity/update channels. Localized UI text flagged as a hard-coded password must be reviewed with a specific justification, never hidden by disabling a credential rule. Other security findings must be fixed or individually verified.

The Sonar way gate and its 80% new-code coverage requirement remain unchanged. Do not reset the new-code period to hide legacy changes, fake coverage, use continue-on-error, or publish when an applicable gate fails. Public release eligibility still requires exact candidate provenance, a newer eligible version and actual trusted Authenticode signing.
