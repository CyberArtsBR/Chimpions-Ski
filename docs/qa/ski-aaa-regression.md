# Chimpions Ski — AAA Regression Suite

This branch adds non-invasive QA and production-readiness coverage. It intentionally does not redesign gameplay, rendering, physics, course generation, or art.

## Baseline

- Repository: `CyberArtsBR/Chimpions-Ski`
- Audited main: `c4d445569584e792981bada3d71689473dfc42d2`
- Target branch: `test/ski-aaa-regression`
- Known deterministic baseline failure remains authoritative:
  `implausible section length: RAMP 283.5567383947582m outside 20-281m`

The QA suite does not loosen that threshold or create a second magic-number jump contract. `checks/course-invariants.mjs` remains the authoritative jump-section length gate until the course specialist lands the shared contract fix.

## Coverage map

| Area | Coverage |
| --- | --- |
| Course generation | Existing authoritative invariant + multi-phase deterministic many-seed stress |
| RAMP / LOG JUMP | Approach/metadata, protected landing corridor, recovery sequencing, route reachability |
| Physics | Existing physics invariants plus 30/60/120 render-frame equivalence over a 180 Hz physics substep model |
| Tricks / scoring | Existing trick, trick-system, airborne-scoring, input/collision suites included in aggregate runner |
| Built-in Chimpions | Existing roster/compatibility/release smoke retained; browser run selects a real built-in |
| Local GLB | Existing production smoke validates invalid and valid local GLBs without remote GLB traffic |
| Quality profiles | AUTO/MAX/HIGH/MEDIUM/LOW contract, AUTO degradation/recovery/hysteresis, runtime DPR comparison |
| Render/collision parity | Browser runtime fails on any course InstancedMesh overflow in the visible gameplay window |
| Visual QA | Deterministic start/profile screenshots plus ski neutral, left carve, right carve, manual jump |
| Responsive UI | Desktop wide/small, mobile portrait and landscape HUD bounds |
| Pause / lifecycle | Blur pause + resume; restart soak |
| Resource stability | Renderer geometry/texture budgets across gameplay soak, restarts, and quality switching |
| Weather | All deterministic weather presets, storm lightning lifecycle, reduced-flash safety |
| Performance | Existing p50/p95/p99/max telemetry consumed via runtime diagnostics; batching and resource budgets |
| Browser | Chromium on every branch push; Firefox/WebKit scheduled or manually requested |
| Long-run | Short Chromium soak on branch pushes; 30-minute scheduled/manual Chromium soak |
| Release smoke | Existing production smoke executed after the new Chromium runtime regression |

## Commands

Core deterministic validation:

```bash
npm ci
npm run check
npm run build
node checks/assets.mjs
AAA_SEEDS=64 AAA_SECTIONS=200 node scripts/run-aaa-regression.mjs
```

Local browser validation after building:

```bash
npm run preview -- --host 127.0.0.1
AAA_BROWSER=chromium AAA_SOAK_SECONDS=20 node checks/aaa-browser-regression.mjs
npm run smoke:production
```

Heavier course stress:

```bash
AAA_SEEDS=256 AAA_SECTIONS=300 node checks/aaa-course-stress.mjs
```

Extended soak:

```bash
AAA_BROWSER=chromium AAA_SOAK_SECONDS=1800 node checks/aaa-browser-regression.mjs
```

## Failure diagnostics

Procedural failures include the deterministic seed, seed index, section index, phase, and section type. The aggregate runner records command exit status, duration, stdout, and stderr in `artifacts/qa/aaa-core-report.json`. Browser runs write `aaa-browser-report.json` and screenshots under `artifacts/qa/<browser>/`.

A real assertion failure is a failure. Missing coverage is not converted to PASS.

## Explicit NOT TESTABLE IN CI cases

The browser report records these as NOT TESTABLE rather than pretending they passed:

- true physical Gamepad timing and haptics;
- real OS/browser tab lifecycle transitions;
- forced driver-level WebGL context loss/restoration without a production recovery seam;
- deterministic browser screenshots for every weather mode without a production QA weather override;
- deterministic ramp/360/backflip screenshot timing without a production state-forcing seam.

The deterministic weather model and trick/physics logic are still covered by non-visual invariant suites.

## CI structure

Normal branch/PR validation runs the core deterministic matrix and Chromium browser smoke. Cross-browser and the 30-minute soak are separated into scheduled/manual jobs so ordinary commits are not blocked for half an hour.

The core job deliberately runs `npm run check` and the aggregate AAA runner with diagnostic continuation, then applies a final gate. This allows later steps and artifacts to be produced even when the known course invariant fails, while preserving a red result until the real course contract defect is fixed.
