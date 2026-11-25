# AgentOffice engineering standards

These instructions apply to every change in this repository.

- Treat SonarCloud findings as defects to investigate. Fix valid findings in source or deterministic preparation code; document a false positive with evidence. Never lower the Quality Gate, coverage threshold, or security checks to pass a build.
- Before proposing a change, identify the canonical source of every generated file. Keep the immutable source archive and byte equality/provenance checks intact.
- Validate syntax and semantics of HTML, CSS, JavaScript, Python, and workflow configuration for changed code. A browser ignoring an invalid declaration is still a defect.
- Add a focused regression check for behavior changes and for failures that escaped earlier checks. Run relevant unit tests, the real Electron smoke test for UI or startup changes, and the production build when applicable.
- Use measured coverage mapped to canonical sources. Never invent hits or exclude live application code to inflate coverage.
- Review security and release implications for authentication, updates, packaging, signing, and public distribution. Preserve the blocking gates.
- Verify the full pull request CI and SonarCloud result before merging. After merging into development, verify that branch's own CI and Quality Gate; a passing PR alone is insufficient.
- Report exactly what passed, failed, or is still pending. Do not call a problem resolved until the post-merge development analysis passes.
