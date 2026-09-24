# Production graphics integration
The local Chimpions-Ski checkout was based on 7ee5dde and was 459 commits behind origin/main at release time. The production integration starts from 0a7eeca to preserve the newer game.

The newer production tree already contains the snow materials, mountain/forest art, batching, powder/contact shading and adaptive quality work. Those systems are retained. The new weather renderer, weather state, static reflection asset, atmosphere controls, wetness and delayed weather audio are integrated into their existing interfaces. Max adds a manual 2x DPR option while leaving Auto's normal high/medium/low ladder intact.

No tests, benchmarks or gameplay checks were run, per explicit user instruction. CI is skipped for this release commit. Render still performs the build required to publish the site. User will test the resulting deployment.

The old dirty checkout is left untouched. Release integration uses codex/high-alpine-graphics in Chimpions-Ski-Graphics-Release. No force push or historical rollback.
