# Code coverage

The Windows CI job runs Node 22's native unit-test coverage on the fully prepared production source tree. No new npm dependencies or lockfile changes are needed.

After preparing the current checkout using the same source/asset/dependency steps as CI, run from the repository root:

```powershell
node --test scripts/coverage-report.test.cjs
node scripts/run-coverage.cjs
```

The runner discovers top-level app/scripts/*.test.js, *.test.cjs and *.test.mjs files, requires the identity and office performance suites, and fails if any test fails, the LCOV report is absent or malformed, or any of the four mandatory production modules has no measured line coverage.

Outputs:

- GitHub Actions job summary: measured line, branch and function percentages.
- coverage/summary.json: counts, measured source modules, unmeasured JS file inventory and test exit code.
- coverage/lcov.info: repository-relative app/ paths for the subsequent Sonar analysis of the same prepared source.
- coverage/raw-lcov.info: unmodified Node reporter output for debugging.

CI uploads the reports as the agentoffice-code-coverage artifact, including after a failed test when reports are available.

## Scope and limitations

Node's native collector reports modules actually loaded in the unit-test process. The percentages are **not whole-app coverage**. The inventory explicitly lists unmeasured production JS sources in app/src and app/electron; these are not included in the displayed measured-module denominator. Electron browser/main-process smoke tests, Python build scripts, generated assets and installed executable instrumentation are not measured here. Existing Electron smoke tests remain mandatory and separate.

## Policy

The first successful CI result is the baseline; do not claim a numerical coverage result before that run. A numeric regression threshold must be based on the verified baseline and the measured scope. The immediate mandatory gate is successful tests and a valid nonempty report covering the four required modules. The next quality stage will configure the SonarCloud Quality Gate and verify coverage import against the same extracted source; untested production sources should not be excluded simply to improve a score. Target 80% new-code coverage as a proposed policy, not as a measured current result.

No release is published by this change itself.
