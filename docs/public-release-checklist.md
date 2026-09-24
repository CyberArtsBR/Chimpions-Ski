# Chimpions Ski — Public Release Checklist

Use this checklist against the deployment that is intended to be public. The same smoke tooling works with Render or Vercel.

## Production target

Set `PRODUCTION_URL` to the deployment being released. If it is unset, the shared tooling fallback is `https://chimpions-ski.onrender.com`.

```sh
PRODUCTION_URL=https://your-production-host.example node scripts/smoke-ski-production.mjs
STRICT=1 PRODUCTION_URL=https://your-production-host.example node scripts/smoke-ski-production.mjs
STRICT=1 PRODUCTION_URL=https://your-production-host.example SMOKE_JSON=/tmp/chimpions-ski-smoke.json SMOKE_SCREENSHOT=/tmp/chimpions-ski-smoke.png node scripts/smoke-ski-production.mjs
```

For a local preview, use `BASE_URL=http://127.0.0.1:4173`.

## Deploy

- Confirm the intended commit is deployed and `version.json` is reachable.
- Open the configured production URL in a clean/private browser window.
- There must be no provider error page, redirect loop, blank screen, or missing JS/CSS.
- Run the strict smoke command and retain its console/JSON with the release notes.

## Start screen

- Artwork loads without broken or stretched presentation.
- START GAME exists and becomes clickable after boot readiness.
- Back to the Game selection still points to `https://chimp-jump.onrender.com/`.
- The legacy START SKIING control is not exposed over the artwork.
- Starting opens the Chimpion selector and proceeds without a fatal error.

## Selector / roster

- The built-in roster contains exactly 10 cards, in the canonical order:
  The Archon, The Heretic, The Commodore, The Pioneer, The Punk,
  The Street Fighter, The Bosun, The Adolescent, The Angsty, The Apologetic.
- Exactly one local GLB upload action is available.
- Search changes results and clearing search restores the roster.
- Selecting a built-in character requests only that selected character GLB.
- Fresh boot performs zero character GLB requests.
- Spectator crowd count/model sources remain zero.
- Selecting a Chimpion transitions to the SKI / SNOWBOARD step.

## Speed contract

### SKI

- Start speed: 150 km/h.
- Progression: +10 km/h every 30 seconds.
- Maximum: 300 km/h.
- `window.chimpionsSki().rideMode` is `ski`.
- Exposed `baseSpeed` and `maxSpeed` match 150 and 300 km/h.

### SNOWBOARD

- Start speed: 150 km/h.
- Progression: +10 km/h every 30 seconds.
- Maximum: 300 km/h.
- `window.chimpionsSki().rideMode` is `snowboard`.
- Exposed `baseSpeed` and `maxSpeed` match 150 and 300 km/h.

Do not spend several minutes waiting to reach the cap during smoke testing; static invariants validate the 30-second / +10 km/h progression.

## Tricks

- Normal SPACE still performs the ordinary jump.
- A second airborne SPACE does not add an extra vertical boost.
- UP + SPACE exposes 360 intent/event.
- DOWN + SPACE exposes BACKFLIP intent/event.
- `CLEAN LANDING` legacy text does not return.

## Audio

- `music-full.mp3` is loaded from the Chimpions Ski origin after user interaction.
- There is no gameplay request to `https://chimp-jump.onrender.com/audio/music-full.mp3`.
- There are no repeated MP3 floods or required audio 404s.

## Course / environment

- The center horizon stays readable and the playable corridor remains visually clear.
- Hazards remain inside the intended course corridor.
- `courseAhead` remains near/ahead of `courseLookaheadTarget`.
- Course rendering diagnostics are finite/non-negative.
- `courseBatchOverflow` is not true.
- Current FOREST and ROCK SLALOM sections around 132 m are valid; the invariant still rejects section lengths outside their section-specific contract.

## Restart / results

- Pause/resume and restart complete without reload.
- Restart clears score/trick/ramp temporary state.
- Controls, camera, selector, and audio remain responsive.

## Sign-off

Release is ready for human sign-off when:

- `npm run check`, `npm run build`, and `node checks/assets.mjs` pass.
- Strict public smoke has 0 FAIL results.
- No uncaught exception, repeated console error, JS/CSS failure, required GLB failure, or audio 404 remains.
- Any WARN has a documented explanation.

Do not weaken a current safety invariant solely to make CI green.
