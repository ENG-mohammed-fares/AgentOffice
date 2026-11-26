# Internal engineering documentation

- [Requirements and acceptance](requirements/srs.md) · [Canonical traceability matrix](requirements/traceability.json)
- [Engineering evidence, backlog and risks](engineering/foundation.md) · [Architecture and decisions](architecture/overview.md)

Validate requirement references with `python scripts/validate_traceability.py`.
The existing mandatory Python test discovery runs `scripts/test_traceability.py`,
including the repository matrix and negative fixtures. Passing this check validates
references and evidence structure, not product behavior or stakeholder acceptance.

These documents are private. Do not copy them into the public distribution repository.

- [Engineering README](../README.md) · [Release policy](../RELEASE-POLICY.md) · [Authentication configuration](../AUTH-SETUP.md) · [Security policy](../SECURITY.md) · [Deferred backlog](../DEFERRED.md) · [Historical changelog](../CHANGELOG.md)
- [Integration](foundation-integration.md) · [Performance testing](performance-testing.md) · [Coverage](code-coverage.md) · [SonarCloud gate](sonarcloud-quality-gate.md) · [Code review](code-review.md)
- [Crash monitoring](crash-monitoring.md) · [Signing](code-signing.md) · [Private repository security](private-repository-security.md) · [Public update channel](public-update-channel.md)

End-user instructions are maintained separately at [AgentOffice-Releases](https://github.com/ENG-mohammed-fares/AgentOffice-Releases). The integration candidate is not a production release.

- [Engineering lessons and prevention log](engineering-lessons.md)

- [Refactoring and maintainability gate](refactoring-quality.md)
