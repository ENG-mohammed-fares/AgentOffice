# Private source repository transition

AgentOffice source is private. Do not restore public visibility to regain free checks. Previously public clones, forks or downloaded copies may still exist. Rotate any genuinely exposed credential at the issuing provider; never add blanket scanner exclusions or rewrite history automatically.

## Local security gates
The new workflow uses pinned Gitleaks and Semgrep Community Edition with local rules, no SaaS credentials, and redacted secret logs. It checks fetched Git history, the working tree (including nested archives and some encoded content), and extracted baseline source plus tracked scripts/assets. Existing blocking npm audit in CI remains required. Semgrep's initial four targeted rules are defense in depth, not equivalent to CodeQL or full vulnerability coverage; the security workflow does not build the final overlays itself. Review genuine findings, expand rules and test the final prepared runtime separately. A clean scan is not proof of absence of vulnerabilities. Release eligibility depends on successful local scanning once the PR is integrated. The default branch and current production branch are not changed by this draft.

## Branch protection and reviews
GitHub Free private repositories do not offer the existing branch ruleset enforcement. Restrict collaborator write access, use PRs, require independent review as a team procedure, and avoid direct pushes. CI can reject an unsafe release, but cannot prevent direct pushes/merges to the branch on this plan. Do not claim native enforcement or bypass review with a fake approval. GitHub Pro/Team or a different hosting setup is needed for enforced rulesets.

## SonarCloud
Before a new analysis, verify in SonarCloud administration that the project is private, that its organization is eligible for free private analysis, and that external users cannot read it. Review retained historical analysis and any previously public source exposure. Only after confirming this, set the GitHub Actions repository variable AGENTOFFICE_SONAR_PRIVATE_CONFIRMED=true. The updated SonarCloud quality PR blocks private-source analysis until this explicit confirmation. Never lower quality conditions to bypass the check.

## Public update distribution
The existing GitHub Releases URL is in a private repository and is not a public download channel. Do not embed a GitHub PAT, app token, or other repository credential in Electron or distribute it to customers. Preserve private source and use a separate public repository containing only reviewed distributable installers, blockmaps, and update metadata, or an authenticated distribution service appropriate for licensed customers. The owner created the separate public repository, and user-facing documentation has been added. Do not copy source or source history into it. Electron's generated update configuration and any runtime feed override must target the new public channel. Keep signing, metadata integrity, artifact hashes, and CI provenance checks. Publish only the reviewed binary distribution files, never private source archives or build logs. Use a least-privilege release-only credential scoped to the distribution repository in the publishing job. Test unauthenticated download and installed-app updates. Existing clients pointing to the private old repository may require a one-time manual installation of a new signed version; changing the future feed cannot remotely update them through an inaccessible old feed. The currently private release channel is unchanged by this draft; do not claim public auto-update works.

## Cost control
Private GitHub Actions hosted compute/artifacts use the account's included quota; set an Actions budget with stop-on-limit enabled and review storage. Do not increase paid budgets. Reduce redundant Windows CI runs and artifact retention only after reviewing impact. No paid service is authorized.

## Documentation separation

End-user documentation is maintained in [AgentOffice-Releases](https://github.com/ENG-mohammed-fares/AgentOffice-Releases). Its first public installer is pending. This document remains private engineering material; do not mirror it publicly.
