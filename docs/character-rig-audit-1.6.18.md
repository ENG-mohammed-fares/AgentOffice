# Per-character rig audit — 1.6.18

Source: integration `77a0318bef4a3c1f604779db2fdd14d58851269d`.
Story US-ANIMATION-001 / FR-CHAR-006. Owner: character/rendering maintainer.
This audit implements the asset inspection portion, not full animation acceptance.
Reproduce with `python scripts/audit_character_rigs.py > rig-report.json`.
The role-keyed report records exact SHA-256, hierarchy, skin influence inventory,
keyed versus numerically varying nodes for every clip, and unanimated joints.
It reuses existing GLB header/resource/clip validation. No source asset is changed.

| Character role | Skin joints | Finger joints | Clips | Non-varying joints across source clips |
|---|---:|---:|---:|---|
| Frontend Developer | 54 | 30 | 10 | 13 body/hand joints plus two eyes |
| AI Engineer | 52 | 30 | 10 | 13 |
| DevOps Engineer | 52 | 30 | 10 | 13 |
| Scrum Master | 52 | 30 | 10 | 13 |
| QA Engineer | 52 | 30 | 10 | 13 |
| Backend Developer | 52 | 30 | 10 | 13 |
| Product Owner | 52 | 30 | 10 | 13 |

All seven assets contain nonzero skin influences for every skin joint. All have
three joints for each of five fingers on each hand. The Typing source clip changes
24 non-thumb finger joints. These facts do not establish correct weights/deformation.

The common 13 non-varying joints are both toe bases, Neck, both shoulders, both
hands/wrists and all six thumb joints. Frontend additionally has non-varying eye
joints. Runtime IK can rotate shoulders/wrists, so these are source-clip gaps rather
than proof they are immobile in the live application. The 1.6.18 candidate now maps every
non-varying joint in all seven rigs to a deterministic secondary-motion category (neck,
shoulder, wrist, thumb, toe base; eyes where present). The Python audit checks that every
static name is covered by the same category patterns used in Three.js, and the runtime unit
test verifies those joints receive actual quaternion updates. This is not a substitute for
rendered review of joint limits, deformation, hand contact, foot sliding or natural motion.

Source clips already articulate many fingers; replacing them with rigid translation
would regress existing behavior. Retain original GLBs, inspect IK overrides, then tune
action-specific tracks with anatomical limits and rendered contact review. The audit
intentionally does not certify foot sliding, floor contact, hand-to-mouse contact,
collision freedom, root-motion correctness or biomechanical plausibility.

Dense embedded accessors support byte strides. Unsupported sparse/cubic interpolation
fails explicitly. Quaternion q/-q sign changes do not falsely count as movement.
The test suite exercises every GLB separately plus striding, truncation, unsupported
accessors and quaternion variation. Existing mandatory Python discovery runs these tests.

## Remaining integration acceptance

The current integration source still couples meeting requests to camera selection;
PR #30 owns that correction. PR #31 owns walking/clearance and PR #32 owns bake evidence.
Do not duplicate or overwrite those branches. Startup overlay, three workspace cameras,
labels, mouse interaction, role-specific screens, clip/IK corrections, concurrent meeting
coordination and full runtime/device acceptance remain separate implementation work.
No version, release, updater, authentication, asset hash or quality gate changed here.
