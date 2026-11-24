# SonarQube Cloud (SonarCloud)

Zero-cost integration. Import the public AgentOffice repository into SonarQube Cloud (EU: https://sonarcloud.io). Prefer the free OSS plan if eligible; verify that branch/PR analysis is supported. Do not activate a paid plan. Disable Automatic Analysis in Administration > Analysis Method, because CI-based analysis provides tracked source and LCOV.

Configure GitHub repository Settings > Secrets and variables > Actions:
- Secret SONAR_TOKEN: a Sonar analysis token with the minimum available permissions. Never commit or paste it in chat.
- Organization and project keys are committed in sonar-project.properties (non-secret); no separate GitHub variables needed.
- Variable SONAR_REQUIRED: leave unset initially; set to true only after first successful scan and baseline review. Then the CI waits for and enforces the Quality Gate, and missing credentials block trusted runs.

Run CI on release/v1.7.0 after configuration (push or rerun). Free plan limitations may require an OSS plan or analyzing the main Sonar branch only. Do not pay to unlock branches. Fork PRs do not receive tokens. The reusable release CI explicitly receives the Sonar token when promoted to development.

Scope: actual tracked app/src, app/electron, app/scripts production scripts, repository Python scripts and workflow YAML; test files are classified separately. V8 emits LCOV for the four existing covered production modules; other code must not be assumed covered. Sonar coverage and the four-module V8 aggregate have different denominators. Generated binaries, dependency trees and bundles are excluded. The tracked-source migration enables SCM blame and PR diff analysis; verify the first scan after migration before enforcing new-code metrics. First scan establishes findings; review before enforcing release gates. No external scan has been confirmed yet.
