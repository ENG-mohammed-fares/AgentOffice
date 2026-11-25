# Windows code signing

This change adds a release verification gate, not a production signing identity. It never creates or distributes a self-signed production certificate. The existing license is proprietary; public source visibility alone is not eligibility for the SignPath Foundation open-source program. Do not change the license or buy a certificate without approval.

## Current behavior

Ordinary PR/QA builds remain unsigned, and Windows CI exercises the signature verification policy. The test signs an isolated PowerShell fixture with a short-lived self-signed certificate in the runner's personal certificate store; it must remain untrusted and is removed with its key. No root certificate is installed and the test fixture is never uploaded.

On development, the release workflow still verifies candidate hashes, lockfile, commit, version and metadata first. If the version is eligible for publication, it now also requires a Windows-valid embedded Authenticode installer signature, the exact configured publisher certificate subject, an optional configured certificate thumbprint, and a timestamp certificate. The publishing job repeats the verification against the downloaded installer. Missing configuration or an unsigned/untrusted candidate fails closed; unchanged versions still skip publication. Existing released versions are not changed.

**Merging this gate will prevent future unsigned public releases.** This is intentional, but do not merge until the release owner accepts the impact and a real signing provider can be configured, or explicitly accepts that releases will pause. There is no automatic signing service connected at present.

## Remaining production setup

1. Choose an eligible publicly trusted signing provider. A free self-signed test certificate cannot establish public publisher trust. Microsoft Store distribution is a separate packaging/distribution decision, not a free certificate for the existing NSIS installer.
2. Configure the provider's supported electron-builder 26.18.0 Windows signing integration in a protected development-only build context. Never export a production private key to a repository or chat; use the provider's hardware-backed or managed signing mechanism. Do not give signing credentials to PRs or untrusted forks.
3. Configure repository Actions variable AGENTOFFICE_SIGNING_PUBLISHER to the exact certificate subject returned by Windows. Optionally set AGENTOFFICE_SIGNING_THUMBPRINT to the expected 40-character certificate thumbprint when the provider uses a stable certificate; managed providers can rotate leaf certificates, so plan rotations explicitly.
4. Ensure the application executable and NSIS installer are signed during packaging, before electron-builder creates blockmap and update metadata. Do not sign or mutate the candidate after hashing. Enable and validate electron-updater publisher verification in the actual packaged configuration and test migration from the previously unsigned release on a disposable Windows installation. Do not disable signature checking to make updates pass.
5. Verify the actual packaged executable and installer signatures and timestamp, tamper rejection and signed-to-signed update; validate the existing CI release gate and exact artifact identity before public release.

The automated policy tests cover valid synthetic policy data, wrong publisher/thumbprint, missing timestamp, catalog signatures, invalid signature statuses, and rejection of real unsigned/self-signed Windows script fixtures. They do not establish that a production executable has been signed. Windows SmartScreen reputation is separate from valid Authenticode.

No version bump, paid service, secret, certificate purchase or published release is part of this PR.
