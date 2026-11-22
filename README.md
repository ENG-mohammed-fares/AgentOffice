# AgentOffice

**A desktop workspace for a virtual software team.**

AgentOffice is an experimental Windows application that combines local work management with a live 3D office. The eventual goal is a team of seven connected AI development agents. **The AI agents are not connected yet.**

## What's new in 1.3.0

- A completely redesigned interface: petrol-green, terracotta orange, cream, deliberate typography, and one consistent icon family.
- Professional local Sign In / Sign Up for Windows and a guest preview.
- A real dashboard for managing a project and task list.
- Create, edit, delete, search and progress tasks; edit your project brief.
- Seven role profiles, with clear labels that these are planned AI-agent personas.
- A new interactive procedural 3D studio — the rendered scene is still a prototype rather than cinematic final art.
- A clear separation between real working features and future AI functions.

Local account credentials are stored in the desktop app using salted scrypt hashes. The app does not offer cloud login, email recovery, account sync or hosted AI execution.

## Download and install

**[Download the latest Windows installer](https://github.com/ENG-mohammed-fares/AgentOffice/releases/latest)**

AgentOffice checks GitHub Releases for updates. In an installed release, restart the app when an update has downloaded to install it. The executable is currently unsigned and Windows SmartScreen may display a warning.

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

## Design principles

The design aims to feel like a crafted tool, not a generated landing page. It avoids purple gradients, all-caps shouting, placeholder testimonials, stock product photos, random emoji icons, unnecessary fade-ins, and generic 3-card layouts. Colors and fonts are defined in `src/tokens.css` in the source package.

## Roadmap

The next major work is dedicated to real 3D production assets, animation and character modeling, then a secure agent runtime with distinct roles, tools, task assignments and reviews. Current role previews must not be mistaken for independently working AI employees.

MIT License — see [LICENSE](LICENSE).
