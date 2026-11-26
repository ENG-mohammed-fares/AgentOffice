# CI workload heartbeat (US-CI-001)

A 30-second observation is logged while the allowlisted subprocess is still alive.
The output age reflects bytes actually forwarded from the subprocess. At 120 seconds
without output, the heartbeat adds a warning; quiet CPU/GPU work is not a proven hang.
The monitor never kills a process merely for silence and never manufactures progress.
Original output and exit status are preserved, including failures. The existing
25-minute Linux asset job and 45-minute Windows job hard safety limits are unchanged.
Only fixed version-controlled workload commands are accepted. No external dependency
or service is required.

Scope: KTX2 compression, Blender coverage, Python/Node unit tests, seated/optional
renderer review, authentication and crash smoke tests, Windows installer packaging.
Other CI steps retain their existing controls. The wrapper does not observe GPU progress
or descendant CPU activity. It observes the immediate process and its output, not
business-level test completion. Test runner and GitHub job timeouts still apply.

Test evidence: actual subprocess tests cover output, silence, successful completion,
nonzero exit and allowlisted selection. The complete workflow and SonarCloud must pass
on the exact candidate revision before integration.

## Consolidated PR verification

CI run 45769341811 passed the asset and Windows jobs, but skipped the trusted
PR SonarCloud checks and seated-avatar review after retargeting the stacked PR.
The result does not establish release or merge eligibility. A fresh synchronize
event against development must exercise the trusted PR checks and the separate
security workflow. Retain the original job deadlines and blocking gates.
