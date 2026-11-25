# Historical application changelog

Historical descriptions do not establish current public availability or production readiness.

## What's new in 1.6.15

Office rendering is event-driven and pauses while idle or hidden. Static shadow maps are calculated once. Adaptive resolution reduces rendering cost during motion and restores full resolution at rest. Safe opaque material batching and conditional instancing preserve the source model and transparent glass. All 14 office base-color maps are built as validated UASTC KTX2, loaded from the local package, with original GLB fallback. Office lightmaps are a separate experimental bake and are not enabled.

## What's new in 1.6.14

Replaces the authenticated dashboard with the two-room Agile Office: seven individual workstations and a glass meeting room. The existing sign-in intro leads directly to this office. The scene is bundled locally, with live Three.js rendering and pre-rendered view fallback. Previous local workspace data remains intact. Full-office light baking and hardware validation are not yet complete.

## What's new in 1.6.13

Defers phone sign-in: removes the phone alternative and form from the sign-in screen and disables the production phone OTP provider. Existing email, Google, GitHub and guest sign-in remain unchanged. See [deferred backlog](DEFERRED.md).

## What's new in 1.6.12

Moves phone sign-in to a compact link beside the email field. The option is always discoverable; SMS actions remain disabled with an explicit explanation until the provider is configured. Google and GitHub retain their existing positions.

## What's new in 1.6.11

Adds phone OTP support behind an opt-in environment flag and server provider check. SMS delivery remains disabled by default pending provider setup, CAPTCHA and cost controls. GitHub sign-in detects a disabled identity provider before opening the browser.

## What's new in 1.6.10

Improved authentication readability, provider hierarchy, field validation and guest guidance. Google and GitHub sign-in remain available. Startup and loading animations, desktop branding and themes are unchanged.

## What's new in 1.6.9

Sign-in, sign-out, guest entry, OAuth entry and password reset use the original approved three-second loading intro, including its original embedded logo and animated office background. The combined startup intro, login interface, themes, language settings and Windows icon remain unchanged. The preview-only replay control is omitted in production.

## What's new in 1.6.8

The approved Warm Industrial Light palette improves the visibility of the robot scene, rings, grid, input borders and text in light mode. The original layout, dark theme, startup animation, Windows application icon, language detection and circular theme transition remain unchanged.

## What's new in 1.6.7

The approved startup splash uses the original embedded PNG at 98×98 and the original door animation. Login follows the device language (English, Arabic, French, German, Spanish or Hebrew; English fallback), with an English/device toggle. Appearance defaults to the system theme; the theme button uses a synchronized 550 ms circular reveal across both panels and Shift-click or right-click returns to System. Reduced motion is respected. Existing production authentication remains in place.

## What's new in 1.6.6

The existing intro and Windows application icon now use the approved borderless robot logo. The original intro scene, timing and authentication layout remain unchanged. The 480 ms crossfade waits for the local login screen to render without blocking on optional identity status; a bounded readiness fallback and reduced-motion behavior are retained.

## Previously in 1.6.5

The original three-second intro now crossfades into the prepared login screen over 480 ms at startup, logout and password reset. The login remains non-interactive until the fade finishes; reduced-motion mode skips the fade. A bounded readiness fallback preserves access if loading stalls. The sign-in-to-workspace sequence is unchanged.

## Previously in 1.6.4

The sign-in footer displays the actual installed app version from Electron's runtime version API, including after language changes and logout. It never substitutes the latest remote release number for the installed version.

## Previously in 1.6.3

All explicit update installations use the silent NSIS path; startup and safe idle updates relaunch automatically. The normal-exit updater remains enabled. Initial installation can still show the Windows setup wizard. Real installed-upgrade QA remains necessary.

## Previously in 1.6.1

The installed Windows app automatically checks for updates on launch, every 30 minutes, and after system resume. Downloads are automatic. A downloaded update silently installs and relaunches at the unauthenticated idle login screen (at least two minutes of system inactivity and no active authentication or recovery flow). An active workspace is never automatically restarted; the downloaded update installs on normal exit instead. Manual checking and restart remain optional.

## Previously in 1.6.0

The bundled Supabase project configuration enables the client-side OAuth integration for Google and GitHub. Both use system-browser PKCE with provider-specific local workspaces. Erica One is bundled for English authentication headings and the brand wordmark; the readable Noto fonts remain for form text and Arabic. Live sign-in depends on provider dashboard configuration and must be verified using real accounts. Email-code delivery requires the email configuration in [AUTH-SETUP.md](AUTH-SETUP.md).

## Previously in 1.5.0

Sign-in uses bundled Noto Kufi Arabic and Noto Sans fonts. The desktop client supports email-code recovery for local accounts on this device and a Google workspace through a configured Supabase Auth project. The public build currently ships without a project configuration. [Configure email and Google sign-in](AUTH-SETUP.md).

## Previously in 1.4.0

The desktop sign-in screen includes the interactive AgentOffice mascot, Arabic and English layouts, light and dark themes, and a guest entry to the workspace. Language, appearance and the optional remembered email are kept on the device.

## Previously in 1.3.0

- A completely redesigned interface: petrol-green, terracotta orange, cream, deliberate typography, and one consistent icon family.
- Professional local Sign In / Sign Up for Windows and a guest preview.
- A real dashboard for managing a project and task list.
- Create, edit, delete, search and progress tasks; edit your project brief.
- Seven role profiles, with clear labels that these are planned AI-agent personas.
- A new interactive procedural 3D studio — the rendered scene is still a prototype rather than cinematic final art.
- A clear separation between real working features and future AI functions.

Local account credentials are stored in the desktop app using salted scrypt hashes. Workspace data stays on this computer.
