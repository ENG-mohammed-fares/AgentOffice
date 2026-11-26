# Code review policy

## Active temporary solo-developer policy (owner-approved 2026-11-25)

Until an eligible independent reviewer is available, the owner approved PR-only integration with passing automated quality/security checks and a documented review of the exact candidate revision. This is not independent human approval or native GitHub enforcement. Do not bypass existing branch rules or claim a review by the author or an AI is independent. Re-enable the independent approval requirement when a qualified reviewer joins and the required entitlement is available. Release gates, including trusted signing and physical-device QA, remain unchanged.



Production changes enter development through a pull request, not a direct push. The existing automated release starts after an accepted merge and successful release CI. Review does not replace CI, coverage, SonarCloud or manual hardware QA.

## Configure GitHub enforcement

The existing active AgentOffice Branch Protection ruleset protects main, development and release/* against deletion and non-fast-forward updates. Keep those protections intact. A repository administrator must add a separate active review ruleset targeting development (and main if changes are accepted there).

1. Invite a trusted independent collaborator with appropriate write access before requiring approvals. GitHub authors cannot approve their own pull requests. Do not create a dummy reviewer or use the author's token to simulate approval.
2. Under Settings > Rules > Rulesets, create a branch ruleset for development (and main if appropriate), enforcement Active, with no bypass actors.
3. Enable Require a pull request before merging; set required approvals to 1; dismiss stale approvals when new commits are pushed; require approval of the most recent reviewable push by someone other than the pusher; require conversation resolution.
4. Enable Require status checks to pass and require the branch to be up to date. Select the verified PR check names from a successful run of AgentOffice CI, including Build verified compressed office textures and Windows build and tests. Confirm the latter actually enforces SonarCloud before relying on it as a required check. Do not select a release-only job.
5. Verify the rule using a disposable PR: direct push is rejected; an unapproved PR cannot merge; a new commit invalidates old approval; unresolved review conversations and failed required checks block merge. Confirm that an independently approved, passing PR is eligible to merge. Do not test by pushing unreviewed changes to production.

For a solo developer without a second eligible reviewer, independent mandatory approval would block all development merges. Do not claim that a checklist, self-review, automated scan, or AI review comment satisfies it. An interim PR-only policy with required checks and documented review is possible, but is not mandatory independent review.

The repository connector can read rulesets but cannot update repository administration settings. This documentation and the PR template are preparation, not enforcement. Activate only after the existing coverage and SonarCloud changes are verified and integrated, and confirm a qualified reviewer is available. No subscription purchase is authorized.
