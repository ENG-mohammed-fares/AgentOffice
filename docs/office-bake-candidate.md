# Office Cycles bake experiment (review only)

This branch is stacked on PR #20. It does not change the production renderer, the original GLB generation, the original preview images, the release version or the release pipeline.

The new candidate workflow regenerates the source GLB from the committed procedural scene, then uses Blender Cycles on the hosted CPU to render all three authored cameras at 1920x1080 and produce a linear EXR diffuse lighting atlas with a separate lightmap UV layer. The original triangles and secondary UV presence are checked before reporting a candidate. All outputs are artifacts, not release assets. Ubuntu's packaged Blender version is logged; record it when reproducing. Thirty-two samples and a 1024 atlas are an initial feasibility experiment, not production asset quality.

The Blender lamp power mapping and environment are approximate; the rendered views need comparison to the original approved WebP images. The initial atlas must be inspected for overlapping islands, bleeding, insufficient texel density and valid nonzero illumination. Do not accept a GLB just because its triangle count matches. Verify vertex positions/normals, UV0, materials, transparency and camera framing. The current runtime remains on the verified original KTX2 asset path until a dedicated review integrates a validated lightmap with correctly configured secondary UVs and linear color management, retains specular/environment lighting, avoids double lighting, and maintains an original-renderer fallback.

No avatars are included. Hosted CPU render timings are not the user's GPU FPS. A real Windows baseline and comparison using the existing renderer benchmark are required. Keep the version unchanged and do not merge or publish until these checks are complete.

Local Blender invocation, after regenerating the original GLB and scene JSON:

```powershell
blender --background --factory-startup --python-exit-code 1 --python assets/agile-office/bake-office-candidate.py -- --source assets/agile-office/office.glb --layout assets/agile-office/scene.json --output office-candidates --samples 32 --atlas 1024
```

The Ubuntu Blender package reports `Build without OpenImageDenoiser` if Cycles denoising is enabled. The candidate uses raw CPU samples with denoising disabled; this does not disable any quality or security gate. Inspect noise before accepting the previews.
