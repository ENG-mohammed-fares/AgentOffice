# AgentOffice Desktop v1.3.0

A 3D workspace for organizing a virtual software team. This is an early-stage **desktop prototype**, not an autonomous coding service.

## What is functional

- Account creation and sign-in on Windows (local, salted `scrypt` password hashes). Browser mode supports guest preview only.
- A redesigned dashboard, task list, local task create/edit/delete/status, live search, and editable project brief.
- Seven role profiles and an explorable 3D office rendered in real time with Three.js.
- Desktop update checking and publishing through GitHub Releases (Electron Updater).
- Workspace tasks stored in local application data; guest tasks are also saved in browser-local storage.

## What is not implemented

- Autonomous AI agents, tool execution, shared AI memories, and agent messaging.
- Account sync, cloud logins, password recovery, multi-device workspaces.
- Photorealistic characters and production-grade 3D furniture models. This 3D environment is a custom procedural visualization.

## Run it

Install Node.js 22+, then:

```bash
npm install
npm run dev
```

To preview without the Electron app (guest only): `npm run dev:browser`.

Build Windows installer on Windows:

```powershell
npm install
npm run package:win
```

Or publish the source ZIP to the `AgentOffice` GitHub repository; `.github/workflows/windows-release.yml` builds a Windows installer for each tagged version.

## Art direction and design system

The visual design tokens live in `src/tokens.css`. The interface uses **Segoe UI Variable**, **Georgia**, terracotta orange and rich petrol/forest green. A single Lucide-style stroke-icon family is defined in `src/icons.js`.

We intentionally avoid purple gradients, testimonial placeholders, stock photography, random emoji icons, decorative arrow-only CTAs, repetitive three-card grids, and compulsory animation.

UI interactions are implemented and tested, but the 3D visual fidelity needs a dedicated artist-led asset pipeline to match a cinematic production reference.

## Project status

Version `1.3.0` — interface redesign, real local tasks and a fresh procedural office scene. Proprietary software; see the repository LICENSE. Previously granted MIT rights and third-party licenses are preserved.
