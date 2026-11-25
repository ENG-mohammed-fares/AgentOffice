# Engineering lessons and prevention log

Record verified problems, their cause, the fix, its regression protection, and evidence. Never record secrets or mark a proposed fix as verified before the corresponding CI run.

| Incident | Observed evidence and cause | Prevention / next verification |
| --- | --- | --- |
| Raw ASAR duplicate alert | Extracted ASAR and Vite output passed; opaque ASAR scan reported a generic API-key finding without path context. | Scan extracted named files plus every other loose resource, including unpacked ASAR files. Never broaden secret allowlists merely to turn a check green. Windows packaged scan passed on b46d459. |
| Private-source analysis | Earlier analysis was intentionally blocked until the private project was confirmed. | Keep explicit privacy confirmation and trusted in-repository CI analysis; never restore public source to obtain free checks. |
| Misleading coverage comparison | Sonar PR #10 reported 36.5% new-code coverage and security C; loaded-module Node coverage is a narrower measure. | Preserve 80% and A gates. Test actual production behavior; import JS and Python execution coverage; inspect missing lines and private security findings. Feature push CI success does not mean PR Quality Gate success. |
| Duplicate updater metadata | Release metadata parser accepted the first matching key, even if another conflicting top-level key followed. Whitespace could consume a newline. | Reject duplicate and missing fields; add real parser/candidate regression tests for malformed metadata, tampering, provenance, private feed and unexpected assets. Await CI evidence for the new revision. |
| Public distribution separation | Old private release URLs cannot serve anonymous end users. | Keep source private; distribute only verified signed installer assets in the public repository. No tokens in clients, no private archives or logs. Public documentation inventory passed; actual signed migration remains unverified. |

## Rule for every future change

- Reproduce the defect or identify the failing check and exact revision before editing.
- Prefer the smallest root-cause fix. Add a negative regression test that would fail on the old behavior and a positive test for valid behavior.
- Use real prepared sources and real coverage; distinguish fixture, smoke, hosted and physical-device tests. Do not lower security/quality gates or exclude production code to manufacture passing scores.
- Inspect the resulting diff, CI result, relevant security findings and release provenance. Record unresolved details and follow-up work without claiming a fix.
- Keep production release and privacy prerequisites intact, and document operational changes in the relevant repository.
