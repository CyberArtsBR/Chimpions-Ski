# Chimpions Ski

Chimpions Ski is a Three.js/Vite endless downhill game with SKI and SNOWBOARD ride modes, procedural hazards, ramps, tricks, controller/keyboard support, and local Chimpion GLB selection.

## Current product contract

The built-in playable roster is exactly 10 Chimpions:

1. The Archon
2. The Heretic
3. The Commodore
4. The Pioneer
5. The Punk
6. The Street Fighter
7. The Bosun
8. The Adolescent
9. The Angsty
10. The Apologetic

Only those 10 built-in character GLBs are deployed. Players may also choose a local `.glb` file through the selector; local uploads stay local to the browser. The start-line spectator GLB crowd is intentionally disabled and performs zero spectator character GLB requests.

Speed is defined by the current ride profiles:

- SKI starts at 150 km/h.
- SNOWBOARD starts at 150 km/h.
- Both gain +10 km/h every 30 seconds.
- Both cap at 300 km/h.

## Release verification

The release contract is exercised with:

```sh
npm install
npm run check
npm run build
node checks/assets.mjs
```

The main GitHub Actions workflow also runs the desktop browser audit and the local release smoke after starting the built preview.

## Production URL

Production smoke/audit tooling uses the `PRODUCTION_URL` environment or GitHub repository variable. It can point to either the active Render or Vercel deployment. If it is unset, tooling falls back to `https://chimpions-ski.onrender.com`.

For a local preview smoke, `BASE_URL` can override the target, for example `BASE_URL=http://127.0.0.1:4173`.

This repository remains separate from Chimp Jump while reusing compatible Chimpion assets and web-game architecture.

## Mountain atmosphere graphics update
The bottom-right **Mountain atmosphere** control selects daylight, golden hour, moonlight, windblown snow, night rain or thunderstorms. Changing skies transitions automatically. Gentle lightning reduces flashes and hides the bolt. Weather sound follows the existing SFX/master controls. High and Max are available alongside the existing adaptive Auto, Balanced/Medium and Low profiles.

This release integrates camera-local GPU rain/snow, cloud cover, moon/stars, local mist/splashes, delayed thunder, selective wetness, static environment reflections and warm course lights into the current production scenery and snow systems. Existing ski/snowboard physics, collision, touch controls, avatar selection, tricks, audio and settings are preserved. No screen-space AO/reflections, full-screen post-processing, ray tracing or ray-marched clouds are included.

Current releases are expected to pass the repository's automated checks, build, asset validation, and browser smoke contract before sign-off. Preview a storm with `?quality=high&weather=storm`.
