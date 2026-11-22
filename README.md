# AgentOffice

**A living 3D software company where autonomous AI agents collaborate, code, test, and ship real projects.**

## AgentOffice Desktop — v1.2.0

AgentOffice is an early Windows 3D office prototype with seven rooms, camera interactions, and demo character animations. The software-development AI agents and photorealistic character models are **not yet implemented**.

### Download / Install

Download the current Windows installer from [GitHub Releases](https://github.com/ENG-mohammed-fares/AgentOffice/releases/latest).

The installed app checks for new public GitHub Releases automatically. When an update finishes downloading, use **Restart & install** to upgrade the same application without uninstalling it. Windows may cache the old shortcut icon until the desktop/Explorer refreshes.

**v1.2.0 workspace access:** adds professional sign-in and sign-up screens, custom orange-and-petrol brand identity, password visibility controls, form validation, a demo guest option, and account sign-out. Local Windows accounts use a salted scrypt password hash. These are **device-local accounts**, not a production cloud identity service: there is no email verification, account recovery, cross-device sync or remote storage yet. The 3D office remains a technical prototype.

**v1.1.1 branding update:** adopted the approved orange robot icon.

### Release pipeline

- `AgentOffice-Source.zip` is the original desktop source baseline.
- `assets/agentoffice-icon.webp.b64` contains the approved icon artwork.
- `release-version.txt` controls the release version (currently 1.2.0).
- `scripts/apply-branding.py` applies the approved icon, sidebar logo, favicon and version **after** extracting the source baseline.
- `assets/auth-overlay-v1.2.0.tgz.b64` and `scripts/apply-auth.py` layer the v1.2.0 authentication implementation on the baseline source. Future baselines with auth already included skip the overlay.
- [`.github/workflows/windows-release.yml`](.github/workflows/windows-release.yml) builds Windows x64 NSIS with Electron Builder and publishes one release with the installer, `latest.yml`, and `.blockmap` metadata.

To make a later release, update the baseline ZIP or branding script as needed, bump `release-version.txt`, and trigger the workflow using the updated source ZIP or workflow file. Never publish another installer under the same version. A new commit to the release inputs triggers a GitHub Actions build.

### Developer usage

For local development, extract the baseline ZIP and run:

```bash
npm install
npm run dev
```

The branding applied by CI is available in `scripts/apply-branding.py`. Windows builds are not currently code-signed; Microsoft SmartScreen may warn until the application is signed and builds trust.

Tech stack: Electron, Vite, Three.js, electron-updater, electron-builder, GitHub Actions.

License: MIT (see [LICENSE](LICENSE)).
