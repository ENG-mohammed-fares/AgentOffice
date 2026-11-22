# AgentOffice

**A living 3D software company where autonomous AI agents collaborate, code, test, and ship real projects.**

## AgentOffice Desktop — v1.1.1

AgentOffice is an early Windows 3D office prototype with seven rooms, camera interactions, and demo character animations. The software-development AI agents and photorealistic character models are **not yet implemented**.

### Download / Install

Download the current Windows installer from [GitHub Releases](https://github.com/ENG-mohammed-fares/AgentOffice/releases/latest).

The installed app checks for new public GitHub Releases automatically. When an update finishes downloading, use **Restart & install** to upgrade the same application without uninstalling it. Windows may cache the old shortcut icon until the desktop/Explorer refreshes.

**v1.1.1 branding update:** adopts the approved orange robot logo with white face/collar and petrol-blue tie as the Windows executable, desktop shortcut, window and in-app icon. Main 3D features are unchanged.

### Release pipeline

- `AgentOffice-Source.zip` is the original desktop source baseline.
- `assets/agentoffice-icon.webp.b64` contains the approved icon artwork.
- `release-version.txt` controls the release version.
- `scripts/apply-branding.py` applies the approved icon, sidebar logo, favicon and version **after** extracting the source baseline.
- [`.github/workflows/windows-release.yml`](.github/workflows/windows-release.yml) builds Windows x64 NSIS with Electron Builder and publishes one release with the installer, `latest.yml`, and `.blockmap` metadata.

To make a later release, update the baseline ZIP or branding script as needed and bump `release-version.txt`. Never publish another installer under the same version. A new commit to the release inputs triggers a GitHub Actions build.

### Developer usage

For local development, extract the baseline ZIP and run:

```bash
npm install
npm run dev
```

The branding applied by CI is available in `scripts/apply-branding.py`. Windows builds are not currently code-signed; Microsoft SmartScreen may warn until the application is signed and builds trust.

Tech stack: Electron, Vite, Three.js, electron-updater, electron-builder, GitHub Actions.

License: MIT (see [LICENSE](LICENSE)).
