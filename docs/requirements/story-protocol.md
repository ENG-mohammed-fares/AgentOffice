# User-story-first development

Owner: product owner and maintainer. Accepted owner instruction, 2026-11-26.
Canonical story records live in `traceability.json` under `stories`; do not create
parallel issues or Markdown copies with independent status.

Before implementation: read the request, preserve its meaning and constraints,
present a concise Arabic story/acceptance summary, record stories here, map
requirements and tests, then implement and verify. The owner need not write tickets.
A clear request authorizes its scope; only material unresolved decisions need clarification.

Each story uses `US-AREA-001`, source, actor/goal/value statement, proposed or owner
priority, requirement IDs, AC IDs with Given/When/Then, scope, constraints, assumptions,
dependencies, impact, canonical implementation paths, test references and evidence.
Use statuses proposed, ready, in progress, verified, blocked or done. Verified/done
requires evidence and review; unit success alone cannot establish product acceptance.

CI checks structure, references and coverage of changed implementation paths using
the trusted GitHub base/head SHAs. It does not prove business meaning, chronology,
test adequacy, independent review or physical GPU performance. Review those explicitly.
Existing files need story mapping when changed; documentation-only changes are exempt
from changed-code mapping. Stories are not authorization controls.

Current technical stories (recorded before implementation):
- US-QUALITY-001: maintainer can translate owner requests into recorded stories and
  acceptance criteria before implementation; AGENTS and PR template require this order.
- US-QUALITY-002: CI rejects changed implementation files lacking a valid story/test
  mapping and rejects malformed criteria or unsupported completion claims.

Scope: first delivery slice is protocol/enforcement and PR #23 reconciliation.
Runtime refactoring, flags, recovery, physical-device validation and scalability remain
separate backlog items. No release/version/update or authentication changes in this slice.
