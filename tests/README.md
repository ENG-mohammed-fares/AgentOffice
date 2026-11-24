# AgentOffice automated tests

No paid services and no live credentials are used. Node 22's built-in test runner and V8 coverage use the actual extracted production modules.

Run from repository root with Node.js 22 and Python installed:

```sh
python scripts/ci-prepare.py
node --experimental-test-coverage --test-coverage-include="**/electron/auth.cjs" --test-coverage-include="**/electron/identity.cjs" --test-coverage-include="**/electron/startup-update.cjs" --test-coverage-include="**/electron/update-policy.cjs" --test app/scripts/identity.test.cjs tests/unit/auth.test.cjs tests/unit/identity-errors.test.cjs
```

The extraction command requires a clean app directory. Run the Node command alone if already extracted. The current account implementation is legacy; temp files exist only in unit-test fixtures and do not represent the upcoming cloud database. Tests mock IPC, external identity, network replies and time. Real hashing and filesystem operations exercise local-account migration safety. Existing Electron smoke tests run separately on Windows. Reports appear in CI job summary and agentoffice-unit-coverage artifact. Coverage includes only the four named production modules; it is not whole-app coverage. Native V8 reports lines, branches and functions, not a separate statement metric. Coverage thresholds will be set after verifying this expanded baseline. Live Supabase, installed updater and visual QA are separate.
