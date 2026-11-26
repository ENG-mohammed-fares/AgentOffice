# AgentOffice 1.6.18 Office Light-Bake Review

## Status

**Review-only candidate. Not enabled in the application and not approved for release.**

The normal renderer continues to load the original compressed PBR office asset. The bakedCandidate renderer option defaults to false; no production release or updater configuration has been changed.

## Canonical scene baseline

The 1.6.18 scene baseline is **116,332 triangles**. The previous baseline was 117,254 triangles. The 922-triangle difference is the retired Software Architect desk-sign glyph after the role was renamed to AI Engineer. The authored office shell, walls, floor, furniture, lights, monitor geometry and chair geometry remain unchanged. The AI Engineer identity is rendered above the avatar in the live character layer; the obsolete desk-sign text is not exported.

The bake candidate must preserve the 116,332-triangle source geometry through UV generation and lightmap embedding. The baseline is not a performance target and must not be silently changed for unrelated geometry edits.

## Candidate pipeline

assets/agile-office/bake-office-candidate.py uses Blender Cycles to produce review-only previews and lightmap candidates:

- Generates four authored camera previews at 1920 × 1080: Desk View, Overview, Team View and Meeting Room.
- Generates a secondary UV channel for selected static meshes.
- Excludes movable desk and meeting chairs from the static bake.
- Excludes glass and sky from the diffuse candidate; the combined/unlit candidate also excludes screens, displays and mirrors.
- Produces separate diffuse and combined candidates so their material and lighting trade-offs can be reviewed.
- Keeps the baked candidate separate from the default runtime asset.

The seven animated characters are separate GLB assets and are not included in the office static bake. Movable chairs remain dynamic so their pull, return and meeting-seat animations are not frozen into the atlas.

## Release gates

The candidate remains blocked until all of the following are verified on rendered output:

1. No visible UV seams, stretching, atlas bleeding or missing faces.
2. Original material color, wood grain, stone texture, metal response and roughness remain visually acceptable.
3. Glass, mirrors, screens and reflective surfaces retain their intended dynamic/PBR behavior.
4. Static lighting is not applied twice; there is no double-lighting or washed-out exposure.
5. Movable chairs and all seven animated characters remain dynamically lit and fully animated.
6. Shadows remain stable through all four camera views and during character/chair movement.
7. Four 1920 × 1080 preview captures are inspected side by side against the original PBR render.
8. A real-hardware comparison records frame time, GPU memory, draw calls, texture memory and startup time on at least one supported low/mid/high device class.

A successful Blender bake or a passing unit test is not visual acceptance. Do not change the default runtime asset until the visual review and real-device benchmark are signed off.

## Known risks

- A combined baked atlas can lose dynamic response and may flatten normal/roughness behavior on surfaces that should remain reflective.
- Atlas packing can create edge bleeding at mip levels if padding is insufficient.
- Baked shadows can become stale if geometry or lighting changes without rebaking.
- A high-quality 1920 × 1080 render on a hosted CI runner is evidence of the authored view and bake candidate, not a hardware-performance benchmark.
