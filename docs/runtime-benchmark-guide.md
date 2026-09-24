# Chimpions Ski runtime benchmark guide

This benchmark is intentionally non-invasive. It runs from `scripts/`, reads the existing browser/runtime diagnostics, and never patches `src/`, `public/`, package metadata, deployment files, or the game balance.

## Prerequisites

Use the repository dependencies already declared in `package.json`. The harness dynamically imports `@playwright/test`. If Playwright is unavailable it writes/reports `UNAVAILABLE` and stops; it does not install packages or mutate package files.

For a local production preview, start the project normally in another terminal and target the preview URL:

```bash
BASE_URL=http://localhost:4173 node scripts/benchmark-ski-runtime.mjs
```

The same harness can target a public deployment without a branch merge:

```bash
BASE_URL="$PRODUCTION_URL" node scripts/benchmark-ski-runtime.mjs
```

No credentials are required or accepted by the harness.


## Rendering quality profiles

The runtime now exposes one authoritative rendering-quality service from `src/renderQuality.js`:

- `quality.current` — `high` or `reduced`.
- `quality.getSettings()` — immutable settings for the current profile.
- `quality.setProfile(name)` — switch profile without throwing on the supported values.
- `quality.subscribe(listener)` — integration hook for renderer/environment/crowd systems.

HIGH remains the default. No device is silently downgraded. For deterministic benchmark runs, use the benchmark-only environment selector, which appends the matching `?quality=` query parameter:

```bash
QUALITY_PROFILE=high BASE_URL=http://localhost:4173 RESULTS_PATH=benchmark-high.json node scripts/benchmark-ski-runtime.mjs
QUALITY_PROFILE=reduced BASE_URL=http://localhost:4173 RESULTS_PATH=benchmark-reduced.json node scripts/benchmark-ski-runtime.mjs
node scripts/compare-performance-results.mjs benchmark-baseline.json benchmark-high.json benchmark-reduced.json benchmark-comparison.json
```

The reduced profile materially lowers DPR, shadow-map size, snow workload, decorative instance workload, the crowd budget hook and distant-scenery update frequency. It does not alter collision reliability, physics substeps, course generation, game balance or camera behavior.

## Hotspot telemetry

The runtime diagnostics expose rolling CPU timings for the areas called out by the audit: course traversal/collision, course batch synchronization and environment update work. The benchmark samples both average and p95 rolling values without changing gameplay. These timings are intended to decide whether an optimization is justified; a suspected hotspot should not be rewritten solely because it appears expensive in source code.

Frame summaries also include browser Long Task observations when Chromium exposes the Long Tasks API. Missing Long Task support is treated as unavailable instrumentation rather than a benchmark failure.

## Benchmark phases

The machine-readable report contains these independent phases:

- **A initial page load** — navigation timing, wall time to `window.chimpionsSki().ready`, rAF frame summary, startup DOM/heap snapshot.
- **B start screen idle** — idle frame-time behavior before gameplay.
- **C character selector opening** — open latency, selector DOM nodes, `.chimpion-card` count, IMG count, frame timing.
- **D avatar search/filter** — several search terms with update latency and rendered card/image counts.
- **E gameplay first window** — defaults to 30 seconds, with periodic course/runtime sampling.
- **F extended gameplay** — controlled by `LONG_RUN_SECONDS`.
- **G repeated restart** — pause/restart cycles with timing and memory/DOM snapshots.
- **H repeated selector open/close** — measures repeated dialog churn when accessible.
- **I SKI mode**, **J SNOWBOARD mode**, **K trick-heavy run** — feature detected. On runtimes without the future rider/trick integration these are `PENDING`, not failures.

The future mode comparison records natural speeds and speed bins. It does **not** force 160/180/300 km/h or alter balance. A 300 km/h cap comparison is produced only when that speed is naturally observed in configured runs.

## Frame metrics

A very small `requestAnimationFrame` probe records only frame deltas. Per phase the report includes average frame time/FPS, median FPS, approximate 1% low FPS (from p99 frame time), p95/p99 frame time, counts above 16.7/25/33/50 ms, and first-quarter vs last-quarter frame-time degradation.

Treat results as comparative measurements. Browser version, GPU, thermal state, power mode, background tabs, Render cold starts, and headless/headed execution all affect absolute numbers. Compare runs on the same machine/browser configuration when possible.

## THREE.js / course diagnostics

Where `window.chimpionsSki()` exposes them, gameplay samples include:

`activeCourseObjects`, `pooledObjects`, `courseDrawCallsEstimate`, `courseLegacyDrawCallsEstimate`, `courseBatchDrawCalls`, `batchedCourseInstances`, `courseAhead`, `courseLookaheadTarget`, `physicsSubsteps`, `activeRamp`, renderer calls/triangles/geometries/textures, and speed.

Unavailable fields stay null/UNAVAILABLE rather than causing a benchmark failure. The report summarizes min/max/median, start/end, slope per minute, and monotonic-up fraction for core course metrics. Sustained meaningful monotonic growth is flagged as suspicious for investigation; it is not automatically proof of a leak.

## Selector interpretation

The harness does not assume a fixed catalog size. It measures the implementation actually served by the target:

- cards and IMG elements while open;
- selector-local and total DOM node counts;
- open latency and rAF timing;
- search/filter update latency across `SEARCH_TERMS`;
- repeated open/close state.

The current optimized selector is expected to render a small initial window (currently about 36 cards) and incremental chunks rather than the entire catalog. A changed catalog or tuning should not make the harness fail merely because the count changes. Closed-state counts are measured, not hardcoded to zero.

## Memory and DOM

Snapshots are taken at startup, after selector work, after one gameplay run, after repeated restarts, and after the long run. Every snapshot records total DOM node count.

When Chromium exposes `performance.memory`, the harness records `usedJSHeapSize`, `totalJSHeapSize`, and heap limit, plus long-run heap delta. Heap metrics are explicitly optional: browsers that do not expose them are valid benchmark targets and must not fail solely for missing heap data.

## Network audit

Chrome DevTools Protocol network events are observed without modifying the app. The report includes request count, encoded transferred bytes where available, GLB requests/unique URLs, selector portrait requests, audio requests, HTTP/loading failures, and duplicate identical resource URLs.

The audit specifically checks `/audio/music-full.mp3` against the benchmark target origin and detects the forbidden legacy runtime dependency:

`chimp-jump.onrender.com/audio/music-full.mp3`

If the music file is never requested during a run, the locality result is `PENDING` rather than a false pass. A request to the forbidden host is `FAIL`.

## Environment variables

| Variable | Default | Purpose |
| --- | ---: | --- |
| `BASE_URL` | `http://localhost:4173` | Any HTTP(S) local or public target |
| `HEADLESS` | `1` | Chromium headless mode |
| `VIEWPORT_WIDTH` / `VIEWPORT_HEIGHT` | `1440` / `900` | Browser viewport |
| `READY_TIMEOUT_MS` | `45000` | Wait for exposed ready diagnostic |
| `IDLE_SECONDS` | `3` | Start-screen idle phase |
| `GAMEPLAY_SECONDS` | `30` | First gameplay window |
| `LONG_RUN_SECONDS` | `60` | Extended run; `0` skips it |
| `MODE_RUN_SECONDS` | `20` | Future SKI/SNOWBOARD sample window |
| `TRICK_RUN_SECONDS` | `20` | Future trick-heavy sample window |
| `SAMPLE_INTERVAL_MS` | `1000` | Course/runtime sample interval |
| `RESTART_ITERATIONS` | `3` | Restart repetitions |
| `SELECTOR_ITERATIONS` | `3` | Selector open/close repetitions |
| `AUTO_JUMP_MS` | `2500` | Normal gameplay jump cadence; 0 disables |
| `TRICK_JUMP_MS` | `1700` | Trick workload cadence |
| `SEARCH_TERMS` | `the,alpha,zzzz-no-match` | Comma-separated selector searches |
| `WRITE_RESULTS` | `1` | Write JSON output |
| `RESULTS_PATH` | `benchmark-results.json` | Machine-readable output path |

Generated `benchmark-results.json` is run-specific output and should not be committed by default.

## Long-run profiles

Five-minute run:

```bash
BASE_URL=http://localhost:4173 LONG_RUN_SECONDS=300 node scripts/benchmark-ski-runtime.mjs
```

Ten-minute public run:

```bash
BASE_URL="$PRODUCTION_URL" LONG_RUN_SECONDS=600 node scripts/benchmark-ski-runtime.mjs
```

For a lightweight smoke benchmark set `LONG_RUN_SECONDS=0`, lower selector/restart iterations, or shorten the optional future-mode windows. Keep `GAMEPLAY_SECONDS` long enough to represent the requested first gameplay phase.

## Future snowboard and trick support

When `.ride-mode-card[data-ride-mode="ski"]` and `.ride-mode-card[data-ride-mode="snowboard"]` are present, the harness selects each mode through the UI and records FPS, frame percentiles, course churn, pool growth, draw-call estimate, physics substeps, speed bins, initial speed, base speed, and max speed diagnostics.

When `trickState` diagnostics exist, the trick-heavy workload attempts repeated manual 360 inputs using `ArrowDown + Space` while preserving normal steering/recovery behavior. It compares frame time, DOM feedback counts, heap delta, trick-state observations, and any exposed trick/score counter diagnostics. Pivot/timer/event-reference accumulation checks remain `PENDING` when the runtime does not expose a safe observable counter; the harness never patches runtime code to manufacture one.

## Status meanings

- `PASS`: the phase/measurement ran and produced data, or an explicit invariant was satisfied.
- `PENDING`: the target does not yet expose an optional/future feature or an event (for example the local music request) was not observed.
- `UNAVAILABLE`: the browser/runtime cannot expose an optional metric such as heap memory, or a required external dependency such as Playwright is absent.
- `FAIL`: a concrete check failed, such as detecting the forbidden remote music dependency or a fatal benchmark execution error.

Warnings such as suspicious monotonic course growth are investigation signals, not automatic claims of a memory leak or gameplay defect.

## Harness self-check

Run:

```bash
node --check scripts/benchmark-ski-runtime.mjs
node --check scripts/benchmark/core.mjs
node --check scripts/benchmark/selector.mjs
node --check scripts/benchmark/gameplay.mjs
node --check checks/runtime-benchmark-harness-invariants.mjs
node checks/runtime-benchmark-harness-invariants.mjs
```

The invariant verifies configurable `BASE_URL`, local/public usage, configurable long run, machine-readable output, absence of hardcoded credential patterns, no package/runtime mutation primitives, and feature detection for future ride modes/tricks.
