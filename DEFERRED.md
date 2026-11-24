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
