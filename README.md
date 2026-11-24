# AgentOffice

**A desktop workspace for a virtual software team.**

AgentOffice is an experimental Windows application that combines local work management with a live 3D office. The eventual goal is a team of seven connected AI development agents. **The AI agents are not connected yet.**

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

## Download and install

**[Download the latest Windows installer](https://github.com/ENG-mohammed-fares/AgentOffice/releases/latest)**

AgentOffice checks GitHub Releases for updates. In 1.6.1 and later, installation is automatic at a safe idle sign-in screen or on ordinary exit. Earlier releases install downloaded updates on ordinary exit. The executable is currently unsigned and Windows SmartScreen may display a warning.

## Source and build

The complete baseline source is available as [AgentOffice-Source.zip](AgentOffice-Source.zip). The release pipeline extracts that ZIP, adds the approved brand icon from `assets/agentoffice-icon.webp.b64` via `scripts/apply-branding.py`, and packages the app using Electron Builder.

To run locally, extract the source and run:

```sh
npm install
npm run dev
```

To build a Windows installer:

```sh
npm run package:win
```

The codebase uses Vite, Three.js, Electron and electron-updater.

## CI/CD — approval-controlled delivery

[AgentOffice CI](https://github.com/ENG-mohammed-fares/AgentOffice/actions/workflows/ci.yml) runs on pushes and pull requests, validates source and dependencies, tests the application, and packages Windows QA candidates as Actions artifacts. High and critical dependency findings and a missing committed lockfile block release eligibility. No push publishes a GitHub Release. A manually dispatched delivery workflow prepares only an unpublished draft from an exact successful CI run; the release owner must explicitly publish the reviewed draft. The installed auto-updater continues to track stable published releases. See [release policy and QA checklist](RELEASE-POLICY.md).

## Design principles

The design aims to feel like a crafted tool, not a generated landing page. It avoids purple gradients, all-caps shouting, placeholder testimonials, stock product photos, random emoji icons, unnecessary fade-ins, and generic 3-card layouts. Colors and fonts are defined in `src/tokens.css` in the source package.

## Roadmap

The next major work is dedicated to real 3D production assets, animation and character modeling, then a secure agent runtime with distinct roles, tools, task assignments and reviews. Current role previews must not be mistaken for independently working AI employees.

**License:** Proprietary — see [LICENSE](LICENSE). Previously granted MIT rights and third-party licenses are preserved; see [historical MIT notice](docs/legacy-mit-notice.txt). Public GitHub viewing and forking remain subject to GitHub's terms. Source availability does not grant additional rights to newly proprietary code.
