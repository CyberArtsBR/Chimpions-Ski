# Ski / Snowboard Trick and Speed Contract

This document describes the current integrated product, not historical rider branches.

## Speed profiles

| Contract | SKI | SNOWBOARD |
| --- | ---: | ---: |
| Start speed | 160 km/h | 180 km/h |
| Tier interval | 30 s | 30 s |
| Tier increment | +20 km/h | +20 km/h |
| Maximum speed | 300 km/h | 300 km/h |

`src/gameplayTuning.js` is authoritative for the shared tier interval, increment, and maximum. `src/rideMode.js` gives SNOWBOARD its 180 km/h base while sharing the tier increment and 300 km/h cap.

Legacy 210 km/h and 230 km/h maximums are obsolete and must not be used by landing, progression, smoke, or QA rules.

## Ramp / trick integration

- Ramp trajectory envelopes consume the current 300 km/h tuning ceiling.
- Ramp lip detection uses crossing logic rather than requiring a physics sample to land on one exact lip point.
- Physics remains tightly substepped and the late-game collision invariant exercises the current maximum speed.
- Manual and ramp trick timing is validated by `checks/trick-balance-invariants.mjs` and the dedicated trick invariants.

At 300 km/h, one 1/180-second travel interval is about 0.463 m. This figure is diagnostic only; collision correctness is not reduced to a single point-sample-width assertion because the current ramp integration uses crossing-based detection and dedicated collision safety checks.

## Course lookahead

Current tuning uses:

- minimum lookahead: 560 m
- lookahead target: 11 seconds
- maximum lookahead: 720 m

At 300 km/h the maximum 720 m frontier corresponds to about 8.64 seconds of travel. Course streaming invariants validate that generation remains ahead of the player/camera at supported speeds.

## Validation

Run:

```sh
node checks/ride-mode-invariants.mjs
node checks/trick-balance-invariants.mjs
node checks/course-collision-lategame-invariants.mjs
node scripts/simulate-ski-snowboard-tricks.mjs
```

These checks must agree on the same 160/180 start speeds, +20 km/h per 30 seconds progression, and shared 300 km/h cap.
