# Quality and security foundation integration

This draft combines the eight preparation PRs (#2–#9) without publishing or merging to development. CI preserves real coverage, crash smoke tests, signature policy, updater feed validation, local secret/static analysis and a new scan of the packaged ASAR, loose resources and Vite output. The external SonarCloud gate is last so local QA results remain observable even when private-project verification is blocked; it still blocks release eligibility. Review Sonar findings for newly combined source without weakening coverage or quality thresholds. The hosted renderer benchmark remains opt-in and cannot replace a physical Windows reference-device measurement. The owner-created distribution repository is now available; public distribution still requires scoped credentials and a trusted signing provider; no publication occurs on a draft PR.

See DEFERRED.md for future items and the explicitly unresolved administrative and hardware gates. Do not merge competing workflow variants individually without reconciling their changes. Keep source private; no paid service is authorized.

## Documentation separation

End-user documentation is maintained in [AgentOffice-Releases](https://github.com/ENG-mohammed-fares/AgentOffice-Releases). Its first public installer is pending. This document remains private engineering material; do not mirror it publicly.
