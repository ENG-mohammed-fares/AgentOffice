# Deferred features

## International phone authentication

Status: deferred on 2026-11-25; disabled in v1.6.13.

- Restore the compact phone alternative beside the email label only after production readiness.
- Support international calling codes and flags for all supported countries and territories, not just Palestine. Put the flag and dialing prefix on the right of the number field.
- Use the simplified vintage rotary-phone country selector with five visible flags, direct list selection, search by name or prefix, and a country-specific mobile-number placeholder. Validate and normalize numbers with libphonenumber to E.164; support shared prefixes and local number formats.
- Reference preview: AgentOffice_Global_Phone_Rotary_Simplified.html (the original conversation attachment); the earlier rotary preview is also retained in conversation.
- Preserve light/dark themes, localization, keyboard accessibility and existing sign-in animations.
- Evaluate Supabase SMS providers and Descope (reported free allowance: 100 SMS/voice messages per month, subject to current terms). Confirm Palestine and international delivery, limits and costs before integration. No paid services or automatic overages without explicit approval.
- Keep existing identity provider and account/workspace isolation; design safe account linking and verified phone identity if a second provider is used.
- Require server-side rate limits, abuse protection/CAPTCHA, cost caps and delivery/error handling before launch. Test using isolated fixtures; never use fixed test OTPs in production.
- Re-enable only after actual international SMS end-to-end tests and approval.

Existing phone patch definitions, UI assets and fixture tests are retained under `assets/phone-auth/`. Production phone UI is omitted and the provider defaults to disabled; explicit enablement exists only for isolated tests. Existing email, Google, GitHub and guest flows are unaffected.

## Windows code signing

Status: deferred on 2026-11-25; no application submitted.

- Keep the current proprietary license and current private-source repository. Do not relicense the project merely to qualify for free signing.
- SignPath Foundation (https://signpath.org/apply) was evaluated; current proprietary licensing does not meet its open-source eligibility requirements, and the project has limited established reputation. Revisit only if eligibility genuinely changes.
- Research legitimate free or affordable Authenticode signing options that accept proprietary software; verify certificate trust, timestamping, CI/CD integration, renewal, and total cost. No paid commitment without approval.
- Prepare a truthful privacy policy, signing policy, and project/release documentation before any eligible application. Do not claim SignPath sponsorship or signing until approved and actually implemented.
- Integrate signing into the existing GitHub Actions release pipeline, protect signing credentials, verify signatures on installers, and test updater compatibility before public distribution.

## Quality foundation follow-ups (2026-11-25)

- Trusted Windows production signing provider/certificate and managed signing integration; verification policy is prepared, not a signing identity. Public publication remains blocked until signed; do not pay or weaken signing without owner approval.
- Representative load testing for thousands of concurrent users: after the backend and workload exist; define capacity and latency budgets first.
- Centralized crash monitoring: before public beta, with explicit consent, privacy review, redaction, retention and cost controls; local diagnostics remain enabled.
- Comprehensive authorized penetration testing: before commercial launch.
- Backup and disaster recovery drills: before storing production user/project data; define RPO/RTO and verify restore.
- Server-side AI/payment provider integration, authentication/authorization, atomic per-user rate limits and usage quotas, budget caps, RLS and input validation: before enabling any paid external API; never bundle a company secret in a desktop build. No paid overages.
- High availability and horizontal scaling: when usage and service requirements justify them.

## Pending foundation blockers (not completed or silently deferred)

- Owner reported Free plan and private-project configuration complete; verify the privacy-confirmation variable via CI and rerun the full integrated Quality Gate.
- Restore native branch protection with eligible GitHub Pro/Team entitlement; confirm independent reviewer availability. CI is not native branch protection.
- Public binary-only distribution repository created; configure the scoped publishing secret; complete trusted signing and migration from the old private feed before public release.
- Run reference-device renderer performance and installed-app QA (live login, crash behavior, signed update migration). Record measured results rather than estimates.
- Complete integrated CI and review before adopting in development. Do not claim production release readiness while any applicable gate remains blocked.

- Public-facing documentation exists in the separate distribution repository; complete release-specific privacy review and third-party license notices before public distribution.

## Virtual office selective port — 2026-11-25

- PR #11's incompatible procedural room and avatar coordinates must not replace the existing optimized GLB. Port spatial movement, camera map mode, bilingual member controls, audio and optional notifications only after explicit design and real-device testing; preserve the original feature commit for reference. Do not remap old generic member task identities without verification. The current task-panel candidate is not complete feature parity.
- Owner approved temporary solo-developer PR review on 2026-11-25 (PR #10); defer independent human approval and native protection activation until an eligible reviewer and entitlement exist. Keep every automated gate.
- Post-merge SonarCloud run 45600135124 failed with non-main branch access restriction and a failing branch summary; resolve legitimately without payment or lowering thresholds. PR #10's 83.6% is PR new-code coverage, not whole development coverage.
