# Crash monitoring (local-first)

The desktop main process installs the monitor before the existing application initialization. Electron renderer and child-process termination events and Node uncaught-exception monitor events produce small JSON incident reports. Normal clean exits are ignored. A killed process or an out-of-memory event is an incident, not necessarily an application bug.

Reports are stored in the current Electron userData directory under crash-incidents. On Windows this is normally the application's folder under %APPDATA% (the actual directory is app.getPath('userData')). Delete that subdirectory to remove existing reports. The monitor prunes reports on application readiness and before writing a new incident: at most 50 reports and a 14-day retention window when storage is accessible. It does not delete unrelated files. Files may remain while the app is not running; inaccessible storage cannot be pruned.

Only schema version, event time, application version, process category, allowlisted termination reason, numeric exit code and allowlisted child type or exception origin are retained. No account information, tokens, URLs, arbitrary exception text, stack traces, memory dumps, hardware identifiers, or workspace content are recorded. There is no network transmission, external service, additional npm dependency or paid subscription. A user may manually share the JSON after inspecting it.

The monitor does not suppress crashes, change the default exception behavior, restart the application, or alter authentication and auto-update logic. Logging failures do not block the app. Native crashes of the main process, power loss, hard termination of the entire application, handled errors and renderer JavaScript exceptions that do not terminate the process are not covered. This is local crash diagnostics, not centralized production telemetry, alerting, crash-free session statistics, or a native minidump collector. Any future remote reporting or minidump capture requires a separate privacy/consent and security decision.

## Validation

After preparing the current app using the CI source/overlay/dependency steps, run:

```powershell
cd app
node --test scripts/crash-monitor.test.cjs
npx --no-install electron scripts/crash-monitor-smoke.cjs
```

The smoke test creates a disposable Electron profile and intentionally terminates only its own fixture renderer. Do not deliberately crash a user's live production session. Windows CI requires both the unit tests and genuine Electron termination test before packaging. Confirm the result and then verify a packaged installation separately before calling the feature production-ready.

## Future integration

When merging with the coverage and SonarCloud branches, retain both the new preparation/smoke steps and the existing quality checks. The prepared app/electron/crash-monitor.cjs is the runtime copy; avoid double counting the identical asset template in analysis, while still measuring the actual runtime module with its unit tests. Review any merge conflict explicitly. No release is published by this change alone.
