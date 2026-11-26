# AgentOffice requirements baseline

Owner/approver: product owner. Maintainer updates this specification with behavior changes.
Source: owner's rendering requirements and engineering master prompt, 2026-11-25.
Scope: Electron desktop workspace, managed authentication, local task demonstration,
rendered office and existing updates. Actual multi-user agent execution is outside the
implemented task demo. Server-at-home/managed-server deployment remains a future decision.

Canonical machine-readable status and test mapping: [traceability.json](traceability.json).
`accepted` records an explicit owner requirement, not acceptance of an implementation.
`proposed` needs a product decision. Test references identify validation mechanisms; they
are not proof those tests passed on a later revision.

## User stories and acceptance scenarios

| Requirement | Story | Given / When / Then |
|---|---|---|
| FR-AUTH-001 | As a user I can enter and leave my workspace safely | Given supported authentication, when sign-in/out completes, then the corresponding destination appears; failed logout preserves the session UI |
| FR-OFFICE-001 | As a user I see a complete office after startup | Given loading assets, when initialization is incomplete, then a genuine preview remains visible; failed WebGL has a usable fallback |
| FR-STARTUP-001 | As an authenticated user I enter the office without an unnecessary intro | Given sign-in succeeds, when required workspace assets and the first usable frame are not ready, then a blurred office with an indeterminate circular loader remains only until actual readiness; no fixed delay or fabricated progress is used |
| FR-OFFICE-002 | As a user I can visit the meeting room | Given the workspace, when I choose Meeting room and return, then the authored views and doorway navigation remain intact |
| FR-TASK-001 | As a user I can manage demonstration tasks | Given a valid task title/role, when I submit, then local task state updates; the demo is not described as real AI execution |
| DR-QUALITY-001 | As the owner I retain engineering controls | Given a candidate change, when any required gate fails, then it cannot be treated as merge/release ready |
| NFR-PERF-001 | As a user I get responsive clear camera motion | Given capable reference hardware, when navigating at native FHD, then target 60 FPS / 16.67 ms with reported p95 intervals and resolution; measurement remains pending |
| NFR-IDLE-001 | As a user I avoid unnecessary idle GPU work | Given no camera or animation changes, when settled, then no additional scene frames are submitted |
| FR-MOTION-001 | As a user I see credible office activity | Given a seated avatar, when meeting is requested, then chair pull precedes standing, skeletal walking crosses the doorway, seating/return restores chair position |

Constraints: no paid services, no secret exposure, no redesign, preserve authentication,
updates and original assets, no mandatory signing reintroduced, no publication before
validation. Existing code-review/release documents contain older signing wording; resolve
that conflict explicitly before release rather than silently changing a workflow.

## Quality measurement plan

| Attribute | Environment / method | Threshold / actual baseline | Acceptance owner |
|---|---|---|---|
| Camera performance | Same Windows GPU/driver/power mode/viewport; 3 runs per revision using existing benchmark | Owner target 60 FPS, ~16.67 ms; physical baseline TBD | Owner |
| Image quality | Native 1920x1080 or higher render, approved cameras/material comparison | No upscale; preview replacement and baked-light acceptance pending | Owner |
| Startup | Separate cold/warm start, decode, compilation, poster-to-live | Budgets proposed after baseline; no measured claim | Maintainer + owner |
| Memory/cleanup | Repeated mount/navigation/logout; geometry/texture counts and process memory | No accumulating owned resources; numeric budget TBD | Maintainer |
| Security | History, dependency, static and packaged scans; IPC negative cases | Existing blocking controls preserved | Maintainer |
| Reliability | Asset failure, cancellation, context loss, failed authentication | Safe fallback/cleanup; real Electron smoke and negative tests | Maintainer |
| Scalability | Actual backend workload, concurrency and bounded execution | Deferred; no supported agent/user capacity claim | Owner |
| Recovery | Isolated update failure and data restore drill | RPO/RTO proposed only after storage design | Owner |

Change control: PR records requirement ID, rationale, canonical implementation, test changes,
security/release impact and owner decision if behavior changes. Keep unresolved assumptions
in the backlog and risk register, not in fabricated implementation claims.
