# AgentOffice CI/CD release policy

## Continuous Integration
Every push and pull request runs the Windows validation workflow with read-only permissions:
source archive validation, dependency install, syntax checks, fixture-based OAuth and recovery
tests, update-policy tests, production build, Electron smoke tests and Windows NSIS packaging.
The installer, blockmap, latest.yml and checksum manifest are saved as a GitHub Actions artifact,
not a GitHub Release. A high/critical npm audit finding or missing committed lockfile blocks release
eligibility. QA artifacts may exist from a failed CI run and must never be promoted.

## Continuous Delivery (no automatic production publishing)
1. Work on feature branches and open pull requests. Merge only after review and CI success.
2. Set a new version in the source package and release-version.txt for a release candidate.
3. On main, wait for successful AgentOffice CI. Download the Windows candidate artifact and
   test on a Windows QA machine or isolated VM. Verify Google and GitHub sign-in, email OTP,
   project persistence and the actual installed-app update behavior using test accounts.
4. In Actions > Prepare AgentOffice release draft (manual only), run on main. Enter the exact
   successful CI run ID, version, and PREPARE DRAFT. The workflow verifies the exact commit,
   successful security gate, committed lock, SHA256 manifest and updater SHA512, then creates
   an unpublished GitHub Release draft. It does not rebuild or publish the installer.
5. The release owner reviews the draft assets and changelog in GitHub Releases, then explicitly
   clicks Publish release (stable, not prerelease). Only this action exposes the new stable
   release to the installed auto-updater. Until then the prior public release remains active.

## Dependency lock and security
The current baseline has no committed lockfile. Download agentoffice-dependency-lock from the
CI run, review the resolved versions and commit package-lock.json at repository root (or include
it inside the source ZIP). CI will then use npm ci. Keep it synchronized with package.json.
Do not blindly run npm audit fix --force: update affected versions deliberately, rerun the tests,
and regenerate the lock. Security issues in development/build dependencies also block promotion.

## Repository administration (owner action)
In Settings > Rules > Rulesets, create a branch ruleset for main: require pull requests,
require the AgentOffice CI / Windows build and tests status check, require branches up to date,
block force pushes and deletion, and avoid bypasses for ordinary work. Add a review requirement
when another trusted reviewer is available. Apply comparable rules to active development branches.
Configure GitHub Actions default workflow permissions to read-only.
These settings require administrator permissions and are separate from the workflow files.
This public repository's Actions artifacts are not a private staging distribution channel;
do not place secrets or private test data in artifacts. The stable installer is currently unsigned.
Rollback is a reviewed, tested fix-forward release with a higher version, never a forced downgrade.

## Distribution separation (current transition)

The public `ENG-mohammed-fares/AgentOffice-Releases` repository exists and contains user-facing documentation only. No public installer is published yet. The public-channel publishing workflow is prepared in the integration candidate, not active on this historical branch. Do not direct users to private releases or use a source-repository credential in the desktop application. Before public publication, require a reviewed signed candidate, verified metadata, scoped publishing access, real update migration QA and applicable privacy/legal notices. The existing workflow behavior above remains unchanged by documentation edits.
