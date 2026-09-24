# Final Integration Contract — Chimpions Ski

This contract defines runtime boundaries that must survive integration of the clear-horizon, rider-mode, and air-trick branches. It is a QA contract, not an implementation mandate.

## Transform hierarchy

```text
player physics root
└── skier gameplay root
    └── trick visual pivot
        └── rider-mode visual pivot
            ├── Chimpion visual model
            └── skis OR snowboard
```

Equivalent structures are acceptable only if they preserve the same ownership boundaries.

### Non-negotiable transform rules

- The physics root never rotates because of a trick.
- The collision root never rotates because of a trick.
- Camera heading/orientation never follows the trick spin or backflip.
- Rider-mode stance may rotate visually to create the snowboard sideways stance.
- The trick visual pivot may perform 360/backflip animation.
- A completed trick returns its visual pivot to normalized/identity orientation.
- A failed trick, crash, restart, mode change, or selector transition cannot leave permanent visual rotation.
- Equipment alignment follows the rider visual mode, not the physics/collision orientation.

## State ownership

Persistent selection state (`selectedAvatar` and selected ride mode/profile) survives ordinary run restart. Temporary trick state such as trick type/progress/failure/event resets on restart. `jumpSource` and `activeRamp` keep their existing gameplay meanings; trick logic may read them but must not redefine them.

The integrated runtime has one authoritative ride-mode/profile state and one authoritative trick state. Avoid parallel aliases such as `rideMode` plus `sportMode`, or `trickState` plus a second independent `activeTrick`, unless one is a derived read-only view.

## Speed profile contract

SKI starts at 160 km/h and SNOWBOARD starts at 180 km/h. Both use +20 km/h tiers every 30 seconds and both cap at 300 km/h. Landing, damping, recovery, and clamping code consume the active mode profile; legacy 210/230 km/h clamps are not part of the current product.

## Input ownership

Gameplay owns A/Cross/Space as Jump. While airborne, the second Jump edge may be interpreted as 360 intent but must not add vertical velocity or create a double-jump. UP + Jump is backflip intent; DOWN + Jump is 360 intent.

Selector context owns A = select and B = back. Selector input must not leak into gameplay. A held A/Cross used to confirm the ride-mode step must be neutralized/released before gameplay can consume another Jump/trick edge.

## Score/event ownership

Obstacle-clear scoring and trick scoring are separate event sources feeding presentation. Failed trick = 0 trick points; 360 = +200; backflip = +400. Do not reintroduce `CLEAN LANDING` gameplay text. Event objects are transient snapshots/tokens, not an ever-growing history array.

## Environment/course ownership

Mountains may frame the run on left/right, but the central gameplay horizon stays visually open. Course hazards remain inside the flag/boundary corridor with visual margin. Environment framing must not reduce authored course density to fake readability.

## Reset contract

`resetRunState` clears temporary trick state, failed-trick state, trick visual rotation, transient score events, activeRamp activation, and input edge/latch state. It preserves selected Chimpion and selected ride mode unless the user explicitly changes them.
