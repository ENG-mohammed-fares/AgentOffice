# Refactoring and maintainability quality gate

The Windows CI runs the gate against the actual prepared app tree after overlays, before dependency installation. No new paid service or npm dependency is required.

- Characterization: fixed scheduler traces, pause/dispose behavior, resolution limits, slowdown/recovery and invalid sample behavior.
- Differential: compare deterministic operation sequences against the immutable historical implementation at b46d45976cd198e8aa4219e4a48ffb5bf496ac4b; 32 seeds for scheduler and adaptive resolution. Never move the baseline solely to make a refactor pass. Intentional behavioral changes require explicit review and a documented new baseline.
- Mutation: seven deliberately modified variants of the actual pure policy source, executed in memory. Only an assertion failure counts as a kill. Syntax errors, stale mutation anchors, test errors or survivors fail the gate. Initial threshold 7/7; this is not a whole-project mutation score.
- Architecture: static module dependency allowlists for office entry, renderer, batching and pure policy; dynamic import restrictions and limited crash-monitor dependency restrictions. The office entry may statically import the pure startup deadline policy from `office-performance.mjs`; the renderer itself remains a single explicit dynamic import. Negative controls exercise forbidden dependencies, including static renderer and unrelated Node imports from the entry. This is a scoped guard, not a full JS security parser or general architecture analyzer.
- Quality gate: all checks must pass; CI stops on failure. The report is uploaded to private Actions artifacts. Existing authentication, security, SonarCloud, packaging and signature requirements are unchanged.

Run locally after preparing the app as in CI:
```sh
node --experimental-vm-modules scripts/refactoring-gate.mjs
```

Expand the characterization, differential and mutation scope to authentication, updater and agent runtime as modules evolve. Do not equate this initial implementation with exhaustive behavioral equivalence. The initial revision requires successful CI evidence before adoption.
