# Chimpions Ski — External AI Audit Brief

Source baseline: a9275d34ea5facb58e5b409d1c6442d841644115
Production game: https://chimpions-ski.onrender.com

## Goal
Audit the current desktop Three.js endless downhill skiing game and propose/fix high-value improvements without rewriting working systems.

## Current player feedback / requested direction
- Start speed should be 120 km/h, then continue increasing every 30 seconds.
- Obstacles must remain challenging across the full track, including near both edges, but should NOT be packed into repetitive walls or placed too close together longitudinally.
- Airborne steering should be as controllable as steering on snow.
- Ramp jumps must NOT cause the following course to become visually empty. Hazards should remain present after takeoff while preserving a controllable landing route.
- Ramps should be able to appear across the full course width, including far-left and far-right positions.
- Use the actual Chimp Jump music.
- Add more individually scattered bananas at random positions; do not create long banana trails.
- Keep more hazard variety (trees, rocks, logs) while preserving fair moving gaps.
- Generate/preload substantially more course ahead of the player to avoid late population/pop-in at high speed.
- Make the slope/presentation feel more clearly downhill.
- Preserve the 206 real Chimpion GLB pipeline, random startup, selector, keyboard/controller support, manual jump, monster ramp jump, snow trails, cinematic start orbit, UI/audio settings, Render deployment and endless course.

## Current implementation notes
- Playable half-width remains ±11.3.
- Course objects can occupy almost the full width.
- Current start-speed target is 120 km/h.
- Speed tiers remain +10 km/h every 30 seconds with a 210 km/h cap.
- Collision simulation uses high-frequency substeps for high-speed reliability.
- Course is authored procedurally in sections and must remain endless.
- Chimp Jump music is referenced from the live Chimp Jump production asset, with procedural music retained as fallback.

## Audit priorities
1. Gameplay feel and fairness at 120–210 km/h.
2. Steering responsiveness on ground and in air.
3. Obstacle spacing, safe-route movement and edge coverage.
4. Ramp placement/landing continuity.
5. Long-run course generation, recycling and preload.
6. Collision tunneling and frame-rate independence.
7. Camera/downhill presentation.
8. Snow trails, particles and rendering performance.
9. Character switching / GLB memory lifecycle.
10. Audio behavior and Chimp Jump music integration.

## Constraints
- Desktop high-quality target.
- Do not convert the game into separate courses/stages.
- Do not remove real Chimpions.
- Do not remove controller support.
- Do not create permanent safe edges.
- Do not create dense unavoidable walls.
- Do not create long banana trails.
- Prefer targeted fixes over architecture rewrites.

The package intentionally excludes the hundreds of binary GLB models to keep it compact.
