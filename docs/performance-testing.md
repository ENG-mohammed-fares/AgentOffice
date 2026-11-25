# Performance testing

The existing Windows CI job tests the scheduling and adaptive-resolution policies, preserves the actual 117,254 model triangles and transparent materials during batching, and validates the 14 compressed texture maps. These are deterministic regression gates, not a GPU benchmark.

## Real Electron renderer benchmark

Use a fresh checkout of this branch on the reference Windows machine. Prepare the exact source and assets using the checkout, source extraction, branding/auth, office preparation, compressed texture and dependency steps from [.github/workflows/ci.yml](../.github/workflows/ci.yml). The prepared `app/` tree must contain the live renderer, original GLB, installed dependencies and (for the compressed path) verified KTX2 GLB plus local Basis transcoder. Do not reuse an older extracted app directory.

From that prepared checkout:

```powershell
cd app
$env:AGENTOFFICE_REQUIRE_KTX2 = '1'
npx --no-install electron ../scripts/office-runtime-benchmark.cjs
```

For an intentional original-texture fallback comparison, unset the requirement and prepare a separate fixture without the compressed asset. Never remove production assets.

The harness builds the **same live renderer module** with Vite, serves the isolated harness only on loopback, and launches an Electron window at 1280 x 800 content size. It does not sign in, use real credentials, alter source files permanently, or access the user's production workspace. It records local GPU metadata in `office-performance-report.json`; review this before sharing. The report includes:

- Mount-to-first-render submission time (not complete application startup or physical display presentation).
- Four cross-room camera transitions, observed render-loop FPS and p95 intervals (not GPU presentation or a frame-by-frame GPU profiler).
- Draw calls, rendered triangles, batch counts, instance count, final pixel ratio and texture format.
- Idle frame counts and context-loss status.

The benchmark fails on missing live rendering, context loss, ineffective batching, missing transition frames, idle rendering after settling, or non-KTX2 rendering when explicitly required.

## Reference-machine acceptance

Run three times with the same machine, power mode, viewport, display settings and app source revision. Save all reports. Record the median first-render time, observed FPS and p95 intervals. Repeat with the preceding version under identical conditions before selecting numeric regression budgets. Do not declare a performance improvement without measured results. No universal hardware FPS threshold is imposed yet.

This is a renderer benchmark, not an installed-app startup, memory-leak, long-running soak or multi-agent load test. Add these when representative workload and hardware baselines are available.

## CI

The optional benchmark is wired into Windows CI via the repository Actions variable `AGENTOFFICE_RUN_RENDER_BENCHMARK=true`. Hosted runners may use software rendering or lack WebGL2; their numbers must never be treated as user hardware results. The deterministic policy tests remain mandatory. The optional JSON artifact is retained for 14 days.

The benchmark does not publish a release. Run the PR checks and verify a reference-device report before merging the change into the auto-publishing development branch.
