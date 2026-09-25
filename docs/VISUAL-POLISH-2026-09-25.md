# Ski presentation update — 2026-09-25

- Boot and loading screens conceal the procedural placeholder; only committed avatars appear in the scene.
- Opaque alpine menu background shared by main menu, pause, results, settings and selector backdrop.
- Start portal replaces START lettering with cyan/violet HDR LED geometry on both faces.
- Snow groove edges emit cyan light into the High/Max bloom pass; low profiles retain emissive surfaces.
- Ski and snowboard animation adds asymmetric arm balance, edge weight transfer, knee compression and torso counterrotation, using existing frame-independent pose blending.
- To install a custom loading JPG, add it under public/start/loading.jpg and change --ski-loading-art in src/alpineMenus.css to url('/start/loading.jpg'). Suggested size: 1920×1080, no embedded buttons; loading status is drawn separately.

No tests or benchmarks were run, as requested. Production build only; gameplay and visual acceptance are left to the user.
