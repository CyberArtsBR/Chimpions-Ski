# Recommended Integration Order

Target baseline: `c5691fbd0d9d43a6ff13dbe2b5295ce27f237e8e`.

1. `feature/ski-clear-course-horizon`
2. `feature/ski-snowboard-rider-mode`
3. `feature/ski-tricks-air-style`

The horizon branch lands first because it is mainly environment/boundary work and establishes the visual corridor without depending on rider/trick state. Rider mode lands second because it introduces persistent ride profile, stance, equipment, and speed contracts that tricks should consume rather than duplicate. Tricks land last because they depend on the final rider visual hierarchy and are most likely to overlap `src/main.js` input, airborne state, score events, and reset behavior.

## Manual conflict hotspot: `src/main.js`

Do not accept an automatic merge just because Git reports no textual conflict. The final file must preserve all of these behaviors.

### From current main

- start screen and countdown flow
- score presentation
- course streaming/lookahead
- obstacle-clear scoring and 1.5s combo behavior
- course render batching/object pooling
- audio hooks and local music behavior
- gamepad handling and edge semantics
- environment update/reset
- `resetRunState`
- `activeRamp` lifecycle and ramp robustness

### From rider mode

- SKI/SNOWBOARD selection step
- selected mode persistence
- mode-specific speed profile (SKI 160→210, SNOWBOARD 180→230)
- rider visual stance/pose
- skis vs one snowboard equipment switching
- no Chimpion GLB refetch when only sport changes

### From tricks

- trick input intent (`DOWN + Jump`, airborne second Jump, `UP + Jump`)
- trick visual state/pivot
- failed-trick state
- trick score event (+200 360 / +400 backflip)
- no double-jump / no vertical-velocity injection from second airborne Jump

### From environment

Only the smallest required horizon/boundary hook, if any. Do not let environment integration own rider, trick, score, audio, selector, or input state.

## After each merge

Run the standalone QA scripts/checks before the next merge. A missing future feature may be `PENDING`; a regression in an already-present feature is `FAIL`. After all three features are present, feature-related `PENDING` results should be resolved.
