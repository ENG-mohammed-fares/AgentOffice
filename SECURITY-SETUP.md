# Security setup — owner actions
Use free features only. No paid upgrades.

1. Repository Settings > Rules > Rulesets: protect main, development and release/* against force pushes and deletion. Require pull requests for development/main when the review workflow is ready. Use observed CI/CodeQL check names, not guessed names. Keep release promotion through a reviewed PR; production CD still checks exact SHA. Do not require an impossible second reviewer in a one-person repository; use independent review where available.
2. Settings > Advanced Security (or Security): enable dependency graph, Dependabot alerts/security updates, secret scanning and push protection where available. Rotate any token that appeared in chat/screenshots; do not send it again.
3. CodeQL advanced workflow is checked in. Do not enable conflicting CodeQL default setup. Review Security > Code scanning alerts after the first completed scans; a successful scan is not proof that alerts are zero.
4. Dependabot config is prepared, but GitHub reads it from the default branch. After the tracked-source batch is verified, reconcile the default branch with the actual canonical source and make the config available there. Do not push a standalone application version to production for this purpose.
5. Review SonarCloud analysis and enable SONAR_REQUIRED=true only when quality scope and findings have been reviewed. Keep high/critical npm audit blocking. Do not bypass a failed check.
6. Restrict collaborator write privileges, require 2FA on owner account, and keep Actions default permissions read-only.

The current integration cannot change administrative settings; verify them directly in the repository UI.
