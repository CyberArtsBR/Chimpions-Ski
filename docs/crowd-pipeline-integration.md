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

Production defaults remain 50 spectators, 10 start-critical models, concurrency 3, a 900 ms bounded start wait, and a 10 s per-asset network timeout. A central profile may reduce these knobs intentionally, but production is not silently reduced by this branch.

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

For browser/GPU measurement against the real 50-character path, start the production preview and run `npm run benchmark:crowd`. The benchmark intentionally does not use `?test=1`.
