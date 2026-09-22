# Post-Integration Public Playtest

Use a clean page load, then repeat critical items after at least one restart and one avatar/ride-mode change.

## SKI

- Starts at 160 km/h and progresses +10 km/h every 30s to 210 km/h max.
- Rider arms sit in A-pose, not T-pose/high-open arms.
- Keyboard and gamepad steering remain responsive without drift.
- Normal manual Jump performs no trick unless trick input is given.
- Ramps still launch reliably; activeRamp does not retrigger or become stale.

## SNOWBOARD

- Starts at 180 km/h and progresses to 230 km/h max.
- Rider is visibly sideways while gameplay/camera heading remains stable.
- Exactly one snowboard is aligned to the rider; skis are not simultaneously visible.
- Clean/rough/hard landing never clamps snowboard speed to the ski 210 km/h max.
- Switching only ride mode keeps the selected Chimpion loaded; no visible GLB refetch/reload.

## TRICKS

- Manual 360 succeeds and awards +200.
- Ramp 360 succeeds and awards +200.
- Manual backflip fails landing and awards 0 trick points.
- Ramp backflip succeeds and awards +400.
- Second Jump while airborne starts 360 without adding height/vertical velocity.
- Normal Jump still performs no trick.
- Crash/restart clears failed trick and visual rotation; next run starts normalized.

## ENVIRONMENT

- Central horizon stays open/clean.
- Mountains frame both left and right sides instead of the obstacle corridor.
- Mountains do not visually clip through the central course.
- Gameplay hazards remain inside boundary flags with visible margin.
- No obstacle course continues outside flags; side area may contain scenery only.
- Course challenge/density still feels like baseline; readability was not achieved by deleting hazards.

## REGRESSIONS

- Avatar selector still exposes the full Chimpion catalog and remains lazy/chunk-rendered.
- Selector keyboard navigation works; gamepad A selects and B backs out by step.
- A/B used in selector does not leak into a gameplay Jump/trick.
- Local Chimp Jump music still plays; no runtime dependency on another Render deployment.
- Oil hazard still behaves correctly.
- Airborne obstacle scoring and combo presentation still work; combo window remains 1.5s.
- `CLEAN LANDING` gameplay text does not return.
- Restart, crash/results, pause/resume, and multiple consecutive runs remain stable.
- Run several minutes with repeated selector open/close, mode switches, jumps, ramps, tricks, and restarts; watch for duplicated input, duplicated equipment, growing visual pivots, or worsening performance.
