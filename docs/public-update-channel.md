# AgentOffice release channel

The public source repository and Windows update channel are both
[ENG-mohammed-fares/AgentOffice](https://github.com/ENG-mohammed-fares/AgentOffice).
The separate AgentOffice-Releases repository is not used.

The development workflow builds the Windows installer and runs tests, local security scans, and the blocking SonarCloud Quality Gate. It verifies the candidate commit, run ID, version, dependency lock and asset hashes before publishing.

The publish job uses the workflow's scoped GitHub token with `contents: write`. It creates a draft release in the same repository, uploads only the installer, blockmap and `latest.yml`, downloads them to confirm byte hashes, then publishes the draft as the latest release. The manifest remains a CI artifact. It never overwrites an existing release or publishes if development has moved.

The packaged updater targets the same public repository. Unsigned Windows installers may trigger an unknown publisher warning. The installer is not represented as code signed. Existing installs that point to an older feed may require one manual installation to switch channels.

The repository is public. Keep secrets out of application bundles and source files.
