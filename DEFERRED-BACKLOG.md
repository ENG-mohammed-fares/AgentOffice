# AgentOffice — Deferred backlog
Updated 2026-11-24. Budget $0; no paid service or subscription without explicit owner approval. This file records deferred work and conditional future proposals, not completed features. Active v1.7.0 requirements stay in ROADMAP-1.7.0.md. Revisit items when their trigger is met; no automatic promotion to production.

## Explicit earlier deferrals
- Sign in with Apple: defer until owner approves a genuinely zero-cost eligible route or changes budget; Apple Developer membership cost is not authorized.
- SMTP configuration, live six-digit email confirmation/recovery codes, resend and end-to-end mail delivery: previously deferred. Existing local recovery fixtures are not evidence of live delivery. For cloud auth, choose safe supported identity flows now; do not enable a password recovery or email signup flow that cannot be verified. Revisit mail before offering those flows publicly.
- Full cinematic office-opening intro/video: deferred; distinct from the existing short intro and active robot sign-in door animation. Separate preview work (including v1.7.1 motion preview) is not merged/published; reuse only after owner review.
- Full seven-agent team (Product Owner, Scrum Master, Architect, Frontend, Backend, QA, DevOps), role/persona and stack customization, high-fidelity 3D offices and characters, camera/navigation and cinematic experience: after validated single-agent MVP.
- Complete production agent runtime and integration into desktop UI, local agent generating a new project, isolated execution with actual tests/logs, user review/accept/reject and persistence: resume in dedicated agent/MVP phase after current foundation. Windows isolation feasibility and original develop/v2 work must be verified, not assumed complete.
- Central hosted GPU inference and execution, multi-user remote agent service: future scale phase; no paid GPU now. Local Ollama experiments remain separate. Python/FastAPI AI engine is proposed for that phase, not a rewrite of the current JS desktop app.

## Engineering — defer until the trigger
| Item | Trigger / reason |
| --- | --- |
| Full Playwright browser/Electron E2E suite | Existing Electron smoke tests cover critical paths now; expand when workflows stabilize. Critical auth/data/update E2E remains active. |
| Prettier repository-wide formatting | After tracked-source migration; avoid unrelated large diffs now. |
| CycloneDX SBOM and release attestations | Before larger public distribution or customer compliance needs; dependency audit remains mandatory now. |
| Sentry / hosted observability | Once privacy policy, scrubbed telemetry and opt-in decisions are settled; basic local/redacted diagnostics now. |
| Grafana k6 advanced load and soak tests (100/1,000/10,000 concurrent as feasible) | Once cloud API exists and authorized staging capacity is known. Start with modest baseline now. Never load-test public production without authorization or exceed provider terms. |
| Advanced caching, distributed rate limiting, connection pooling tuning | Profiling identifies bottleneck; use appropriate indexes, pagination and server-side limits from day one. |
| Durable agent task queues, idempotent job execution, circuit breakers | Before asynchronous agent jobs/remote workers; basic bounded retries/timeouts and safe mutations now. |
| Multi-region, replicas, autoscaling, load balancers, microservices, Kubernetes | Measured demand and budget justify them. Start modular and avoid premature complexity. |
| Automated multi-region backups, PITR, disaster recovery drills and formal SLO/on-call | After data volume/business risk requires them and approved resources exist; basic export/restore verification now. |
| Advanced DAST, penetration testing, compliance certifications | Before enterprise customers or risk warrants. Baseline threat model, access tests, static checks and secure configuration now. |
| Paid signing, paid cloud tiers, premium services, paid assets | Explicit owner approval only. Free signing application remains active in v1.7.0; no assurance of acceptance or SmartScreen suppression. |

## Proprietary source and distribution — owner-approved deferral
- After the current security and quality foundation, move the canonical source and history to a private repository and distribute installers, release notes and update metadata through a separate public repository with no source history.
- Review zero-cost private-repository security alternatives, release credentials, CI/CD and automatic updater migration before changing visibility; verify existing users can update safely.
- Assess proprietary licensing, disable distributed production source maps, and consider obfuscation and server-side isolation of sensitive logic. No guarantee against reverse engineering or copies made while public.

## Active, not deferred
Current release: GitHub protections, CodeQL, Dependabot, secrets safeguards, source migration, ESLint, Sonar quality gates, coverage/testing, Supabase Cloud and RLS, essential reliability, basic recovery, robot login transition, free signing feasibility, final batch QA. No local database as the primary user data store. No standalone feature releases. Production remains v1.6.4 until the verified batch is promoted.

No capacity, availability, external service approval or deadline is guaranteed by this backlog. Record actual evidence and review trade-offs at each phase.
