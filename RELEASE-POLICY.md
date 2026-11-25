# AgentOffice release policy — integration candidate

This branch proposes the public distribution workflow; it is not yet the production branch. The private development branch remains the source of future official builds. Only a higher stable version, current source head, reviewed dependency lock, exact tested candidate, verified hashes, trusted installer signature and all required CI/security/quality gates can qualify for public publication.

The public [AgentOffice-Releases](https://github.com/ENG-mohammed-fares/AgentOffice-Releases) repository exists and has end-user documentation. No public installer has yet been published. Publish only the verified installer, blockmap and update metadata; never private source, build logs or the private candidate manifest. Keep a least-privilege destination publishing credential in Actions secrets only. The public tag must reference the destination repository's own commit.

The signing provider, publishing credential, actual installed update migration, reference hardware QA and outstanding quality gates must be confirmed before public release. Do not lower security requirements, overwrite releases, or bump the version for documentation-only changes. See [public update channel](docs/public-update-channel.md), [integration notes](docs/foundation-integration.md), and [deferred backlog](DEFERRED.md).
