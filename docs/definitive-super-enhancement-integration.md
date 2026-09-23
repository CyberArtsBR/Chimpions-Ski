# Definitive Ski enhancement integration

Base main: `924120cd81bc8d94eedf38a2423c55fdb861449d`.

Pinned specialist deliveries integrated:
- performance/quality: `4e37136ec52f80d5d9833fe86daaa2ba892cf2c3`
- production crowd: `c17e50c2a3afa92eef56fae9981c3c7b3d27b02b`
- avatar rig compatibility: `526742fedba80b7ee3de311ad4effd7c246c0284`
- course/collision/late game: `3f92e0030660c94211b52dd1cdfff6770d90dc78`
- camera/airborne readability: `6bdb529f5abe72c2863decf3d80b0374102165c5`
- environment/hazard visuals: `0065e227bd314ce1245536274d538dea056ec270`
- UI/UX/results/responsive: `a530feb112f27ae297e0d58fbec3f34d6caede37`
- controller/haptics/input: `4662676231cf7a8b0339e3635bd26c5708c9b57a`
- audio/game feel: `0f13f328da015ecaf5bf448c69bac2feb27f3dfe`

The crowd branch later moved by one QA-only commit; this integration intentionally uses the supplied `c17e50...` delivery SHA.

## Runtime contracts

`renderQuality` is the single quality authority. HIGH keeps the premium/full workload. REDUCED lowers DPR, shadow resolution, decorative density, snow FX and crowd capacity. The pause-menu quality control calls the same profile setter; environment and crowd are updated through integration-owned adapters.

`readPad()` remains the controller owner. UI receives normalized semantic edges/axes only. `menuInputRepeat` owns repeat/dead-zone timing and forwards semantic actions to `menuNavigation`. The active pad is explicitly forwarded to haptics.

Avatar entries carry compatibility metadata. Unsupported rigs stay visible for diagnosis but do not enter the ride flow. Equipment/pose setup remains in avatar/skier modules rather than global hacks.

The production crowd warms only after the selected rider is loaded; the run waits for the start-ready subset and the rest can complete progressively. Warm restarts reuse the asset cache.

## Validation

- `npm run check`: static syntax + invariant suites from all specialist branches.
- `npm run build`: production build.
- `npm run smoke:production`: non-test browser smoke against an already-running preview.
- `npm run audit:crowd`: strict crowd asset audit.
- `npm run benchmark:crowd`: production crowd benchmark.
- `npm run check:performance`: quality/telemetry/harness invariants.
- `node scripts/benchmark-ski-runtime.mjs`: runtime benchmark; set `QUALITY_PROFILE=high` or `reduced`.

The production smoke selects a supported avatar and Ski, completes countdown, verifies full production crowd start readiness, movement/course/HUD, pause/resume and restart, and rejects runtime errors or required 404s.

## Manual release verification

Automated checks do not replace rendered character/camera/art review or physical haptics. Before release, cover Ritualist, Rocker, Powder Monkey, AntiPaladin plus representative ordinary/high-joint/small/large rigs in Ski and Snowboard; inspect shoulders, wrists, feet/bindings, board drift, 360/backflip transforms and restart accumulation. Repeat representative HIGH/REDUCED runs on integrated and dedicated GPUs and 60/120/144 Hz displays. Physical vibration, disconnect/reconnect and two-pad takeover require real hardware.
