# Ski / Snowboard Trick Balance Audit

Independent mathematical/source-level audit for the future integrated SKI, SNOWBOARD, JUMP, 360, BACKFLIP, RAMP and COLLISION systems. This branch does not modify runtime code.

## Audited revisions

- Baseline: c5691fbd0d9d43a6ff13dbe2b5295ce27f237e8e
- Rider mode: 20a4ec36f6e4bc05a58ecd407f980ec8be5c5b5f
- Tricks: a7c5e24abb9675e5e0257e11864a8d3e5928f436
- Horizon was read-only context: 8cc9db2724d6e13e19aa124d7c91a3994d9430b3
- Audio/haptics was read-only context: 85c50fb976dd585e8894aeea9ef73d020bf06bf1

## Real constants and source locations

| Value | Actual value | Source |
|---|---:|---|
| Ski base speed | 44.4444 m/s ~= 160 km/h | baseline src/gameplayTuning.js:9 |
| Ski tier time | 30 s | baseline src/gameplayTuning.js:10 |
| Ski tier increment | 2.7778 m/s ~= 10 km/h | baseline src/gameplayTuning.js:11 |
| Ski max speed | 58.3333 m/s ~= 210 km/h | baseline src/gameplayTuning.js:12 |
| Snowboard base speed | 180 km/h | rider src/rideMode.js:21 |
| Snowboard tier time | 30 s | rider src/rideMode.js:22 |
| Snowboard tier increment | 10 km/h | rider src/rideMode.js:23 |
| Snowboard max speed | 230 km/h | rider src/rideMode.js:24 |
| Gravity | 17.8 m/s^2 | baseline src/gameplayTuning.js:57 |
| Manual jump velocity | 5.9 m/s | baseline src/gameplayTuning.js:58 |
| Manual takeoff offset | +0.045 m above ground | rider src/skiPhysics.js:202 |
| Ramp jump base velocity | 13.4 m/s | baseline src/gameplayTuning.js:59 |
| Ramp jump speed factor | 0.095 * speed(m/s) | baseline src/gameplayTuning.js:60; rider src/skiPhysics.js:277 |
| Ramp retrigger grace | 0.85 s | baseline src/gameplayTuning.js:61 |
| Physics max substep | 1/180 s | baseline src/main.js:480-481 |
| 360 angular speed | 620 deg/s | tricks src/trickSystem.js:20 |
| Backflip angular speed | 300 deg/s | tricks src/trickSystem.js:21 |
| Trick completion epsilon | 8 deg | tricks src/trickSystem.js:22,119,134 |
| Ramp engage interval | approachDepth 1.72 to 0.45 m | baseline src/main.js:610 |
| Ramp lip crossing | -1.42 m | baseline src/main.js:615-626 |
| Landing corridor half-width | 4.15 m | baseline src/gameplayTuning.js:73 |
| Lookahead | min 560 m, 11 s adaptive, max 660 m | baseline src/gameplayTuning.js:76-78, src/courseStreaming.js |

Collision Z radii and airborne clearance thresholds come from baseline src/main.js: tree 0.68 / 3.70 m, rock 0.58 / 0.78 m, log 0.48 / 0.60 m, wideLog 0.58 / 0.82 m, oil 0.74 / 0.10 m. Runtime adds 0.20 m to the Z collision window before testing contact.

A critical integration detail is unchanged on the rider head: src/rampTrajectory.js:6 clamps course-envelope speed to T.MAX_SPEED, which is the ski tuning max (210 km/h). The actual ramp physics in rider src/skiPhysics.js:277 does **not** clamp snowboard speed before computing takeoff velocity.

## Speed matrix

Course consumption is the physical downhill stream rate (state.speed), not the HUD distance multiplier.

| Mode | km/h | m/s | distance/frame @60 | distance/substep @180 Hz | course m/s |
|---|---:|---:|---:|---:|---:|
| SKI | 160 | 44.444 | 0.741 | 0.247 | 44.444 |
| SKI | 170 | 47.222 | 0.787 | 0.262 | 47.222 |
| SKI | 180 | 50.000 | 0.833 | 0.278 | 50.000 |
| SKI | 190 | 52.778 | 0.880 | 0.293 | 52.778 |
| SKI | 200 | 55.556 | 0.926 | 0.309 | 55.556 |
| SKI | 210 | 58.333 | 0.972 | 0.324 | 58.333 |
| SNOWBOARD | 180 | 50.000 | 0.833 | 0.278 | 50.000 |
| SNOWBOARD | 190 | 52.778 | 0.880 | 0.293 | 52.778 |
| SNOWBOARD | 200 | 55.556 | 0.926 | 0.309 | 55.556 |
| SNOWBOARD | 210 | 58.333 | 0.972 | 0.324 | 58.333 |
| SNOWBOARD | 220 | 61.111 | 1.019 | 0.340 | 61.111 |
| SNOWBOARD | 230 | 63.889 | 1.065 | 0.355 | 63.889 |

## Manual jump

Using the actual launch offset and constant-acceleration trajectory:

- Airtime: **0.670463 s**
- Apex time: **0.331461 s**
- Maximum height above ground: **1.022809 m**

| Speed | Horizontal travel during one manual jump |
|---:|---:|
| 160 km/h | 29.798 m |
| 170 km/h | 31.661 m |
| 180 km/h | 33.523 m |
| 190 km/h | 35.386 m |
| 200 km/h | 37.248 m |
| 210 km/h | 39.110 m |
| 220 km/h | 40.973 m |
| 230 km/h | 42.835 m |

The manual jump cannot clear the full tree silhouette (3.70 m) by height, consistent with the source comment. It can clear low hazards if lateral/Z overlap and the runtime clearance test are satisfied.

## Ramp jump

Actual launch velocity is 13.4 + speed(m/s) * 0.095. The runtime raises the rider onto the ramp deck before launch using the lip geometry, so this audit models a touchdown **range** from exact -1.42 m lip crossing through the maximum possible 180 Hz crossing overshoot. Height is relative to local terrain at takeoff.

| km/h | takeoff vy | actual airtime range | max height range | touchdown range | course protected range | rear margin |
|---:|---:|---:|---:|---:|---:|---:|
| 160 | 17.622 | 2.019-2.022 s | 9.426-9.470 m | 89.738-89.846 m | 77.668-104.323 m | 14.478 m |
| 170 | 17.886 | 2.048-2.051 s | 9.689-9.736 m | 96.721-96.840 m | 84.360-111.587 m | 14.747 m |
| 180 | 18.150 | 2.077-2.080 s | 9.956-10.006 m | 103.866-103.998 m | 91.216-119.016 m | 15.018 m |
| 190 | 18.414 | 2.106-2.109 s | 10.227-10.279 m | 111.174-111.319 m | 98.238-126.610 m | 15.291 m |
| 200 | 18.678 | 2.136-2.138 s | 10.502-10.557 m | 118.644-118.802 m | 105.424-134.368 m | 15.566 m |
| 210 | 18.942 | 2.165-2.168 s | 10.781-10.839 m | 126.276-126.449 m | 112.774-142.291 m | 15.842 m |
| 220 | 19.206 | 2.194-2.197 s | 11.063-11.124 m | 134.072-134.259 m | 112.774-142.291 m | 8.032 m |
| 230 | 19.469 | 2.223-2.226 s | 11.350-11.414 m | 142.030-142.232 m | 112.774-142.291 m | **0.059 m** |

The course's authored envelope uses a zero-height symmetric flight estimate and clamps safeSpeed to 210 km/h. At 230 km/h the real ramp physics still lands inside the current protected end in this level-terrain model, but only by about **5.9 cm** in the worst legal lip crossing. Terrain variation or integration changes can erase that margin.

## 360 analysis

- Physical 360 time at 620 deg/s: **0.580645 s**.
- Runtime success threshold is 352 deg because of the 8 deg completion epsilon: **0.567742 s**.
- Manual jump success margin when the 360 starts at takeoff: **102.7 ms** to the accepted threshold, or **89.8 ms** to a physical 360.
- Ramp jumps are comfortably long enough; even the 160 km/h ramp has more than 1.45 s of actual-airtime margin to the accepted threshold.

| Second jump press delay | Remaining air time | Rotation by touchdown | Accepted margin | Classification |
|---:|---:|---:|---:|---|
| 0 ms | 0.670 s | 360 deg | +102.7 ms | SAFE |
| 100 ms | 0.570 s | 353.7 deg | **+2.7 ms** | MARGINAL |
| 200 ms | 0.470 s | 291.7 deg | -97.3 ms | IMPOSSIBLE |
| 300 ms | 0.370 s | 229.7 deg | -197.3 ms | IMPOSSIBLE |

A manual 360 is therefore mathematically completable when started on takeoff via the directional trick intent. The special **second-press** 360 is much less forgiving: a 100 ms second press has less than one 180 Hz physics substep of accepted margin; 200 ms is already impossible. That second-press UX is effectively an immediate double-tap, not a relaxed mid-air input.

## Backflip analysis

- Physical 360 backflip time at 300 deg/s: **1.200000 s**.
- Runtime accepted threshold (352 deg): **1.173333 s**.
- Manual jump reaches only **201.1 deg** by touchdown, so the intended manual-backflip failure is preserved.

| Ramp speed | Accepted timing margin |
|---:|---:|
| 160 km/h | +845.8 ms |
| 170 km/h | +874.9 ms |
| 180 km/h | +904.0 ms |
| 190 km/h | +933.1 ms |
| 200 km/h | +962.3 ms |
| 210 km/h | +991.4 ms |
| 220 km/h | +1020.6 ms |
| 230 km/h | +1049.7 ms |

Snowboard at 230 km/h does not threaten backflip completion; it increases the available timing margin.

## Landing tolerance and FPS

trickSystem marks a trick complete at 352 deg, snaps rotation to 360 deg, and normalizes the visual target. There is no post-360 overspin window to miss. The successful final pre-snap range is therefore **352-360 deg**.

| Render FPS | 8 deg spin tolerance in render frames | 8 deg backflip tolerance in render frames |
|---:|---:|---:|
| 30 | 0.387 | 0.800 |
| 60 | 0.774 | 1.600 |
| 90 | 1.161 | 2.400 |
| 120 | 1.548 | 3.200 |
| 144 | 1.858 | 3.840 |

Those render-frame equivalents would look FPS-sensitive in a render-tick-only system, but the integrated gameplay advances tricks inside the physics loop whose timestep is capped at 1/180 s. The 8 deg window equals about **2.32 physics substeps for 360** and **4.80 physics substeps for backflip**, so the source design is not materially dependent on render FPS.

## Second-jump 360 safety

Source-level checks on the trick head:

- startSecondPress360() immediately rejects when physicsState.air is false.
- It clears jumpBufferTime and jumpBuffered on **every airborne second press**, even when a trick is already active.
- It never writes vy, so it cannot add vertical impulse.
- main.js handles pressedThisStep && state.air before the tryManualJump() path, so the same input cannot both start a 360 and trigger a manual jump.
- If the player has already landed before the next input sample, the press is a new grounded jump by design, not a carried airborne buffer.

Edge case: the 100 ms manual second-press timing margin is only ~2.7 ms. Safety is correct, but the input timing is very tight.

## Speed-profile landing audit

Rider src/skiPhysics.js uses getRideProfile(state.rideMode) for progression and landing outcomes:

- clean: Math.min(rideProfile.maxSpeed, state.speed + .22) (:252)
- rough: lower bound rideProfile.baseSpeed * .90 (:258)
- hard: lower bound rideProfile.baseSpeed * .90 (:264)
- progression target: Math.min(profile.maxSpeed, profile.baseSpeed + tier * profile.tierIncrement)
- final progression clamp: profile max, not ski max

Therefore a clean snowboard landing at 230 km/h remains 230 km/h, rough/hard landings use snowboard bounds, and progression stops at the intended per-mode max. No hardcoded 210 km/h landing clamp was found in the rider physics.

## Collision safety at 230 km/h

Maximum 230 km/h movement per 1/180 s substep is **0.354938 m**.

| Target | Effective Z window / crossing width | Window / step | Result |
|---|---:|---:|---|
| rock | 0.780 m | 2.198x | SAFE |
| oil | 0.940 m | 2.648x | SAFE |
| log | 0.680 m | 1.916x | SAFE |
| wideLog | 0.780 m | 2.198x | SAFE |
| tree | 0.880 m | 2.479x | SAFE |
| ramp engagement (1.72 to 0.45) | 1.270 m | 3.578x | SAFE |
| lip to ramp collision boundary (-1.42 to -1.78) | 0.360 m | **1.014x** | MARGINAL |

The ordinary hazards cannot be tunneled at 230 km/h with the current substep cap. Ramp engagement cannot be skipped because the 1.27 m engage interval spans more than three worst-case substeps. Lip launch uses crossing detection (previousApproachDepth > -1.42 && approachDepth <= -1.42) rather than an exact sample window.

The ramp lip remains only barely inside the ramp collision-processing boundary: 0.360 m available versus 0.354938 m maximum movement, about **5.1 mm** of geometric/substep headroom. This remains safe at exactly 230 km/h with the current constants, but it is appropriately classified MARGINAL.

The same ramp cannot launch twice: it is marked consumed=true before launchRamp, deactivated, removed from activeRamp, and the launch itself sets ramp retrigger grace.

## Course lookahead

| Speed | Lookahead | Minimum time to generated frontier |
|---:|---:|---:|
| 160 | 560.0 m | 12.60 s |
| 170 | 560.0 m | 11.86 s |
| 180 | 560.0 m | 11.20 s |
| 190 | 580.6 m | 11.00 s |
| 200 | 611.1 m | 11.00 s |
| 210 | 641.7 m | 11.00 s |
| 220 | 660.0 m | 10.80 s |
| 230 | 660.0 m | **10.33 s** |

The 660 m max clamp reduces the nominal 11 s lookahead slightly at snowboard top speed, but more than ten seconds of course remains available. Since generation emits whole course sections, the actual authored frontier is commonly beyond the minimum target. This is comfortable.

## SAFE

- Ski 160-210 and snowboard 180-230 speed profiles are internally coherent.
- Manual jump is ~0.670 s / 1.023 m and cannot accidentally support a backflip.
- Ramp backflip is possible with at least ~846 ms accepted timing margin at 160 km/h and ~1.05 s at 230 km/h.
- 230 km/h physical hazards remain wider than one worst-case physics substep.
- Ramp engagement and crossing-based lip detection prevent ordinary tunneling at 230 km/h.
- Second-airborne-jump handling consumes the jump buffer and does not add vy.
- Snowboard clean/rough/hard landing logic is profile-driven; no 210 km/h clamp is present in rider physics.
- 660 m lookahead provides ~10.33 s at 230 km/h.

## MARGINAL

- Ramp lip containment has only about 5.1 mm of substep headroom at 230 km/h (0.360 - 0.354938 m).
- A manual **second-press** 360 delayed by 100 ms has only ~2.7 ms of accepted completion margin; 200 ms is impossible.

## ACTION REQUIRED

- **Make rampTrajectory.js ride-profile aware before/with final integration.** It still clamps envelope calculations to the ski T.MAX_SPEED (210 km/h). At snowboard 230 km/h, modeled worst-case touchdown is ~142.232 m while current protectedEnd is ~142.291 m: only **~0.059 m** remains. The runtime ramp physics uses the full 230 km/h speed, so course protection and physics are no longer derived from the same maximum.
- **Review the intended UX for second-press manual 360.** The implementation is safe, but it requires the second jump press essentially immediately after takeoff. If the design goal is a forgiving mid-air second press, the current 620 deg/s / manual airtime combination does not provide that.
