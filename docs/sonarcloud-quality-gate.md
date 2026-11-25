# SonarCloud Quality Gate

Project: ENG-mohammed-fares_AgentOffice
Organization: eng-mohammed-fares

The reusable Windows CI invokes the official scanner pinned to the verified v7 commit after unit-test coverage. It imports coverage/lcov.info against the prepared app sources and waits up to 300 seconds for the server-side gate. Failed analysis, absent token, failed gate, or timeout fails CI. The release workflow passes SONAR_TOKEN explicitly; its verification and publishing jobs already depend on successful CI. No release bypass is added.

## Activation checklist before merging

1. Verify the existing project and organization in SonarCloud.
2. Verify repository Actions secret SONAR_TOKEN; rotate any previously exposed token. Never put the value into source or chat.
3. In SonarCloud Administration > Analysis Method disable automatic analysis if it is enabled, and use CI-based analysis to import LCOV.
4. Verify the subscription supports analysis of development and PRs targeting development. The Free plan only supports the Sonar main branch and PRs targeting it. If eligible, align the Sonar main branch with development using supported project settings; if unavailable, do not purchase a plan without approval. Legacy OSS plans may support multiple branches, but eligibility must be checked.
5. Verify the project uses the Sonar way quality gate, or an explicitly approved equivalent. Verify its new-code definition and coverage conditions in the dashboard. Do not claim an 80% result until actually measured.
6. Inspect the draft PR CI and SonarCloud results; verify actual LCOV import and gate status. Merge the prerequisite coverage change first, and recheck this change against the resulting development branch.

Trusted in-repository PRs targeting development and production runs must pass the gate. Other feature pushes do not run the scanner. Fork PRs receive ordinary CI only and must undergo trusted review before integration. No pull_request_target workflow or secret exposure to fork PRs is introduced.

The generated app tree is not fully tracked in Git. Sonar may lack blame information for extracted or copied files; check new-code attribution before relying on PR metrics. This is not yet a verified live gate, and the project dashboard, branch configuration, token status and account plan still require confirmation. Existing CI checks remain mandatory. No release-version change.
