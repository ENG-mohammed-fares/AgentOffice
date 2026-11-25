# AgentOffice | Engineering

**Private source repository — authorized maintainers and collaborators only.**

AgentOffice is an experimental Windows desktop workspace with a live 3D office. The planned team of seven autonomous AI agents is not connected yet.

## Repository responsibilities

| Repository | Purpose |
| --- | --- |
| AgentOffice (this private repository) | Source, architecture, implementation, QA, internal documentation and build/release automation |
| [AgentOffice-Releases](https://github.com/ENG-mohammed-fares/AgentOffice-Releases) (public) | End-user documentation, official Windows installers and update metadata when published |

Do not copy source archives, credentials, internal logs, private build artifacts or repository history into the distribution repository. Its README and support documentation are written for customers rather than developers.

## Engineering workflow

- `main`: default branch and historical baseline. Do not assume that it contains the newest application source.
- `development`: active application development and release source. Consult the release policy and actual workflow at the checked-out revision.
- Feature and quality branches: isolated changes and integration testing before adoption.
- `quality/foundation-integration`: candidate consolidation of quality and security changes; refer to the live [integration PR](https://github.com/ENG-mohammed-fares/AgentOffice/pull/10) for verified status.

## Build and validation

The repository contains the versioned baseline `AgentOffice-Source.zip` and preparation scripts. The exact build procedure depends on the checked-out branch; follow `.github/workflows/ci.yml` and its preparation, dependency-lock, testing and packaging steps. Use the committed lockfile and avoid packaging unprepared baseline source as an official release. The desktop stack includes Electron, Vite, Three.js and electron-updater. Supabase supports authentication; future agent execution and external AI services remain separate work.

Never place privileged API keys in desktop bundles, public environment variables or logs. Use scoped secrets and server-side services where required. The integration candidate adds additional quality/security gates; passing individual branches does not establish production readiness.

## Internal documentation

- [Release policy](RELEASE-POLICY.md)
- [Authentication setup](AUTH-SETUP.md)
- [Security policy](SECURITY.md)
- [Deferred engineering backlog](DEFERRED.md)
- [Historical changelog](CHANGELOG.md)
- [Documentation index](docs/README.md)

## Distribution and licensing

End users should be directed to the [public distribution repository](https://github.com/ENG-mohammed-fares/AgentOffice-Releases/releases), not this private repository. The public channel is created but publication requires verified integration, scoped distribution access and trusted signing. Earlier private releases are not a public download channel.

See [LICENSE](LICENSE) and [historical MIT notice](docs/legacy-mit-notice.txt). Previously granted rights and third-party licenses remain unaffected.
