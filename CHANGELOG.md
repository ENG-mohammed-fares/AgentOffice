# Historical application changelog

Historical version descriptions are retained for engineering reference; they are not a statement of current public availability or verified production readiness.

## What's new in 1.6.1

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
