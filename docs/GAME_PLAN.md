# Chimpions Ski — Game Plan

## Core loop
1. Spawn with a Chimpion skier.
2. Automatically descend the mountain.
3. Carve left/right to avoid obstacles.
4. Collect bananas and hit ramps.
5. Speed increases gradually.
6. Collision causes a wipeout.
7. Restart quickly and chase a better distance.

## v0.1 systems
- endless recycled snow tiles
- perspective downhill camera
- keyboard, controller and touch steering
- tree / rock / banana / ramp procedural course objects
- basic airtime physics
- distance, banana and speed HUD
- local best-distance persistence
- GLB-ready skier loader with procedural fallback
- CI and Render configuration

## Next
- install real Chimpion GLB catalog
- skiing-specific procedural rig animation
- snow trails and particles
- terrain undulation and authored slope chunks
- richer obstacle distribution / safe-route generation
- jump tricks and combo scoring
- avalanche / yeti chase events
- biome and weather transitions
- audio and music
- production browser audit
