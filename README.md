# AgentOffice

**A living 3D software company where autonomous AI agents collaborate, code, test, and ship real projects.**

## Windows Desktop — v1.1.0

This repository builds a Windows x64 installer for an early **3D office prototype**. It features seven themed office rooms, interactive camera controls and demo character interactions. **AI agents and photorealistic character models are not yet implemented.**

### Build the installer using GitHub Actions

1. Download `AgentOffice-Source.zip` from the project handoff and upload it to the **root of this repository**, retaining that exact filename.
2. Commit the ZIP to the `main` branch. The workflow at [`.github/workflows/windows-release.yml`](.github/workflows/windows-release.yml) starts automatically.
3. Open **Actions** and inspect the Windows build result.
4. If the workflow succeeds, open **Releases** and install `AgentOffice-Setup-1.1.0-x64.exe`.

The installed application checks **public GitHub Releases** for newer versions. Updates are downloaded and applied on restart. Keep this repo **Public** for unauthenticated update downloads.

**To publish a future version:** increase the version inside the source ZIP's `package.json`, replace `AgentOffice-Source.zip` in `main`, and allow the workflow to publish a new release. Do not reuse an existing version number. Never upload API keys or secrets.

The installer is currently unsigned and may show a Windows SmartScreen warning. Release packaging and auto-update functionality remain unverified until a successful Windows Actions build and installation test.

### Local source development

Unzip `AgentOffice-Source.zip`, install Node.js 22 or later and run:

```bash
npm install
npm run dev
```

Tech stack: Electron, Vite, Three.js, electron-builder, electron-updater, GitHub Actions.

License: MIT (see [LICENSE](LICENSE)).
