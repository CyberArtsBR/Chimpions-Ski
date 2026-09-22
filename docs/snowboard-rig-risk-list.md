# Snowboard / rig manual-test priority

Baseline: `c5691fbd0d9d43a6ff13dbe2b5295ce27f237e8e`

## HIGH PRIORITY MANUAL TEST

- **The Ritualist.glb** — duplicated Mixamo-style skeleton aliases across two skins make current runtime bone selection ambiguous. Test ski A-pose, snowboard foot attachment, sideways carrier rotation, and neck/head counter-rotation only after the mapper behavior is intentionally resolved.
- **The Rocker.glb** — complete rig mapping, but extreme rest bounds (0.074 × 11.218 × 2.362, 11.218× median-dimension ratio) make it the primary 360/backflip orbit, camera and clipping test.

## SECONDARY COVERAGE

- **The Ranched.glb** — next-highest bounds diagonal (1.735); useful camera/trick smoke-test coverage.
- **The Encased.glb** — next-highest bounds diagonal (1.674); useful camera/trick smoke-test coverage.
- **The Technician.glb** — next-highest bounds diagonal (1.669); useful camera/trick smoke-test coverage.
- **The Spelunker.glb** — next-highest bounds diagonal (1.66); useful camera/trick smoke-test coverage.
- **The Youtfull.glb** — next-highest bounds diagonal (1.647); useful camera/trick smoke-test coverage.
- **The Adolescent.glb** — high joint-count coverage (71 joints).
- **The Agitator.glb** — high joint-count coverage (71 joints).
- **The Almagamation.glb** — high joint-count coverage (71 joints).
- **The Powder Monkey.glb** — high geometry coverage (112413 vertices).
- **The AntiPaladin.glb** — high geometry coverage (76453 vertices).
- **The Archon.glb** — high geometry coverage (62182 vertices).

## WHAT TO WATCH

- Ski: shoulders/upper arms should settle into the intended A-pose without inversion, hand flip or shoulder collapse.
- Snowboard: both feet should remain attached to the board, knees should bend in the expected direction, legs should not cross, torso should remain stable and head should face downhill.
- 360/backflip: rider should rotate in place around the visual carrier without a wide orbital arc; accessories should not cause camera framing or snow clipping surprises.

All unlisted avatars passed the conservative static structural checks; still sample several ordinary avatars after integration because static GLB inspection cannot replace rendered motion testing.

