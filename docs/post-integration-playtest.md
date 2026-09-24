# Post-Integration Public Playtest

Use a clean page load, then repeat critical items after at least one restart and one avatar/ride-mode change.

## SKI

- Starts at 160 km/h.
- Gains +20 km/h every 30 seconds.
- Caps at 300 km/h.
- Rider arms remain in the intended pose.
- Keyboard and gamepad steering remain responsive without drift.
- Normal manual Jump performs no trick unless trick input is given.
- Ramps still launch reliably; `activeRamp` does not retrigger or become stale.

## SNOWBOARD

- Starts at 180 km/h.
- Gains +20 km/h every 30 seconds.
- Caps at 300 km/h.
- Rider is visibly sideways while gameplay/camera heading remains stable.
- Exactly one snowboard is aligned to the rider; skis are not simultaneously visible.
- Landing/recovery paths respect the current 300 km/h shared cap.
- Switching only ride mode keeps the selected Chimpion loaded.

## Roster / bandwidth

- The selector exposes exactly these 10 built-ins: The Archon, The Heretic, The Commodore, The Pioneer, The Punk, The Street Fighter, The Bosun, The Adolescent, The Angsty, The Apologetic.
- Fresh boot performs zero character GLB requests.
- Normal built-in gameplay loads only the selected rider GLB.
- The spectator GLB crowd remains disabled with zero model sources.
- Local GLB upload stays local-only and does not add server GLB traffic.

## Tricks

- Manual 360 succeeds and awards the current configured points.
- Ramp 360 succeeds.
- Manual backflip follows current landing validation.
- Ramp backflip can complete with enough airtime.
- Second Jump while airborne starts 360 without adding height/vertical velocity.
- Normal Jump still performs no trick.

## Environment / course

- Central horizon stays open/clean.
- Mountains frame the course rather than the obstacle corridor.
- Gameplay hazards remain inside boundary flags with visible margin.
- Dense irregular hazard gameplay remains intact.
- FOREST and ROCK SLALOM sections around 132 m pass the section-specific release contract.
- Genuinely implausible section lengths continue to fail QA.

## Regressions

- Selector search and keyboard/gamepad navigation work.
- A/B used in selector does not leak into gameplay Jump/trick.
- Local music still plays without a runtime hotlink to another deployment.
- Oil hazard, airborne scoring, combo presentation, pause/resume, restart and results remain stable.
- Run multiple consecutive sessions and watch for duplicated input/equipment, stale ramp/trick state, or worsening performance.
