# Production crowd pipeline integration contract

The production crowd owns only start-area spectator acquisition, parsed-template caching, progressive population, placeholder LODs, and spectator lifecycle cleanup. It does not own the central quality-profile system or gameplay state.

## Runtime behavior

`createStartCrowd()` still exposes the existing `setSpectators()`, `ensureLoaded()`, `reset()`, `release()`, and `update()` API, so no `src/main.js` change is required for the performance fix. `ensureLoaded()` now waits only for the start-critical subset or its bounded timeout; remaining unique Chimpions populate progressively. When the crowd leaves the camera corridor, actor clones and their per-instance Skeleton resources are destroyed while parsed templates remain cached for restart.

The 50 production sources remain unique. The first ten are deliberately ordered from the smallest audited GLBs, which bounds the amount of start-critical source data. Unloaded positions are represented by a two-draw-call InstancedMesh placeholder crowd, so a slow or failed asset cannot collapse the start presentation to an empty bleacher.

## Central quality-system hook

Assistant 3 / the final integrator may map the central profile to the crowd without introducing another quality framework:

```js
startCrowd.setQuality({
  maxSpectators: profile.crowdSpectators,
  startReadyCount: profile.crowdStartReady,
  loadConcurrency: profile.crowdLoadConcurrency,
  startWaitMs: profile.crowdStartWaitMs,
  assetTimeoutMs: profile.crowdAssetTimeoutMs
});
```

Production defaults remain 50 spectator slots, 10 start-critical real-model targets, interactive parse concurrency 1, a 900 ms bounded start wait, and a 10 s per-asset network timeout. A central profile may reduce these knobs intentionally, but production is not silently reduced by this branch.

## Optional diagnostics hook

The existing `window.chimpionsSki()` diagnostics are sufficient for production count, loaded count, release state, renderer memory and benchmark timing. If the final integration wants direct cache/fetch/parse counters, add these fields to that diagnostics object rather than coupling benchmark code to internals:

```js
startCrowdPlaceholderCount: startCrowd.placeholderCount,
startCrowdFailedCount: startCrowd.failedCount,
startCrowdStartReady: startCrowd.startReady,
startCrowdFullReady: startCrowd.fullReady,
startCrowdCacheStats: startCrowd.cacheStats,
```

This hook is optional for gameplay behavior and is intentionally not applied here to avoid ownership conflicts in `src/main.js`.

## Resource ownership

The parsed-template cache owns template geometry, materials, textures and template Skeleton state. `SkeletonUtils.clone()` creates an independent actor hierarchy and Skeleton while sharing immutable geometry/material/texture resources. Race release disposes only clone Skeleton resources plus crowd-owned bleacher/placeholder resources. Cached templates survive restart. `disposeCache()` is reserved for application teardown or an explicit cache reset and must not be called on ordinary race restart.

## Offline asset budget

Run `npm run audit:crowd` after changing the production spectator pool. The audit is non-destructive and reads the master GLBs; it does not rewrite `public/model/characters`. It enforces the 50-source contract and byte budgets, and consumes `docs/avatar-asset-audit.json` when available to report texture and geometry outliers. Any future generated crowd LOD assets should live in a separate generated web directory rather than replacing master/source character files.

For browser/GPU measurement against the real 50-character path, start the production preview and run `npm run benchmark:crowd`. The benchmark intentionally does not use `?test=1`. It first measures a fresh-context cold full preparation and requires all 50 real crowd models to load, then uses a second fresh context for quick-start plus repeated warm-restart measurements. It records GLB request/failure events, Resource Timing bytes, start blocking time, frame timing, JS heap when available, and aggregate renderer geometry/texture counters.


## Measured CI baseline before countdown protection

GitHub Actions run `35884412626` on commit `7b0451659c7cef02d6d4a99da99229333616aed9` exercised the real 50-spectator path, not `?test=1`. In the cold full-population probe, only 27 of 50 GLBs completed within the time-boxed run: 31 GLB requests were observed, 48,429,072 transfer bytes were reported, and no GLB request failed. The 2-second frame sampler captured severe main-thread stalls while parsing: mean 1232.47 ms, p95 1833.20 ms, max 1866.70 ms.

That result confirms the actual bottleneck is not source selection correctness or 404 churn; it is decoding/parsing many distinct rigged GLBs on the main thread. The runtime therefore keeps full progressive preparation available while the selector is open, but once the player commits to a run it stops claiming new progressive GLBs after the start-critical wave. Already-started requests may finish; all remaining slots keep the lightweight instanced placeholder representation. This protects countdown/gameplay frame pacing without pretending the 50-source production path is cheap.

The benchmark defaults to profiling mode: incomplete full population is reported, not mislabeled as success. Set `CHIMPIONS_SKI_CROWD_STRICT_FULL=1` when a release environment explicitly requires all 50 real GLBs to complete within the configured full-population timeout.


## Interactive vs full-profile acquisition

The interactive selector path intentionally claims only the start-critical subset. This is not a fake production-count benchmark: all 50 spectator slots remain active and visible, and the production source manifest still contains 50 distinct Chimpions. Slots without a parsed model use the bounded two-draw-call instanced placeholder representation.

When the player commits to a run, the active job freezes its claim limit at the number of assets already in flight. That means no new GLB fetch/parse begins during countdown or gameplay. This is stricter than merely stopping after ten completed models and directly addresses the CI evidence that even a few additional rigged-GLB parses can starve the animation loop.

The dedicated `window.chimpionsSkiPrepareFullCrowd()` instrumentation hook is used only by the benchmark to request all 50 distinct source GLBs. It keeps full-production profiling available without making normal gameplay pay that cost.


## Deterministic lifecycle benchmark

Natural gameplay release remains part of runtime (`playing && start-crowd z >= 30`), but an automated no-input skier may crash before that threshold. The benchmark therefore records whether natural release happened, while using a query-gated `?crowdBenchmark=1` teardown hook to verify scene destruction and warm reconstruction deterministically. The hook is not installed during normal gameplay.

This separation prevents course randomness from being mistaken for a crowd-cache failure. The release implementation itself remains covered by static lifecycle invariants and by the benchmark's real teardown/rebuild cycle.


## Rider-selection priority

Crowd parsing no longer starts merely because the selector opened. The selected rider GLB is interaction-critical, so `setAvatar()` completes first. Only then does the selector confirmation start the crowd's critical-subset warmup and schedule `beginRun()`.

This prevents spectator parsing from delaying the selected rider, selector close, or ride confirmation. The crowd still retains 50 production slots and the same cache/placeholder strategy; only acquisition priority changed.
