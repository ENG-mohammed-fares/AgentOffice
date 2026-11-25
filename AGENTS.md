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

## Code documentation standard

- Follow [Google JavaScript style guide, method and function comments](https://google.github.io/styleguide/jsguide.html#jsdoc-method-and-function-comments), [PEP 8](https://peps.python.org/pep-0008/) and [PEP 257](https://peps.python.org/pep-0257/) as language-appropriate references. See `docs/code-documentation.md` for the AgentOffice contract.
- Document every new or materially changed exported function, public method, class and nontrivial internal function using JSDoc or Python docstrings. Keep concise descriptions near the declaration; use inline comments for non-obvious decisions and invariants, not obvious syntax.
- Explain behavior, meaningful inputs and units, outputs, exceptions, ownership, side effects, asynchronous lifecycle and limitations when applicable. Update documentation in the same change as the implementation; never describe unverified behavior as guaranteed.
- Require documentation review alongside functional review. Do not add cosmetic comments solely to change a metric. Preserve canonical source ownership and existing quality gates.
