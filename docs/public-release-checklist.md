# Chimpions Ski — Public Release Checklist

Use this after Render finishes deploying the integrated runtime. It is designed to take about 5–10 minutes.

## One-command smoke

Normal mode is safe against the current pre-integration baseline. Future snowboard/trick requirements appear as PENDING:

    BASE_URL=https://chimpions-ski.onrender.com/ node scripts/smoke-ski-production.mjs

For the final integrated release, make future ride/trick requirements mandatory:

    STRICT=1 BASE_URL=https://chimpions-ski.onrender.com/ node scripts/smoke-ski-production.mjs

Optional machine report and screenshot:

    STRICT=1 BASE_URL=https://chimpions-ski.onrender.com/ SMOKE_JSON=/tmp/chimpions-ski-smoke.json SMOKE_SCREENSHOT=/tmp/chimpions-ski-smoke.png node scripts/smoke-ski-production.mjs

Preview/local builds use the same runner, for example BASE_URL=http://localhost:4173/.

## DEPLOY

- Confirm Render shows the intended integrated commit as deployed and healthy.
- Open https://chimpions-ski.onrender.com/ once in a clean/private browser window.
- There should be no Render error page, redirect loop, blank screen, or obvious missing JS/CSS.
- Run the strict smoke command above and keep its console/JSON with release notes.

## START SCREEN

- Artwork fills the start screen and is not broken, stretched, or hidden behind runtime UI.
- Start Game exists and becomes clickable after the Chimpion is ready.
- Back to the Game selection points exactly to https://chimp-jump.onrender.com/.
- Legacy START SKIING is not visibly layered over the artwork.
- Start Game enters countdown/gameplay without a fatal error.

## SELECTOR

- Open CHOOSE CHIMPION.
- Catalog feels complete; automated smoke expects more than 180 entries.
- A real Chimpion appears; fallback is not used unexpectedly.
- Search changes results and clearing search restores them.
- Initial open does not render the entire catalog at once.
- Scroll briefly: no broken-image flood.
- Close and reopen once.
- Integrated release: selecting a Chimpion transitions to SKI / SNOWBOARD instead of immediately finishing.

## SKI

- Select SKI and start a run.
- Starting speed is roughly 160 km/h.
- window.chimpionsSki().rideMode should be ski when that field is exposed.
- If max profile is exposed it should be about 210 km/h.
- Do not wait several minutes just to naturally reach max speed during smoke testing.

## SNOWBOARD

- Change Chimpion/ride and select SNOWBOARD.
- Starting speed is roughly 180 km/h.
- window.chimpionsSki().rideMode should be snowboard.
- If max profile is exposed it should be about 230 km/h, not the ski max.
- Character/equipment should visibly remain a snowboard setup after countdown begins.

## TRICKS

- Tap normal SPACE: ordinary jump still works.
- While airborne, tap SPACE once again: no extra vertical/double-jump boost.
- Restart if needed, then press DOWN + SPACE: diagnostics/event should identify 360.
- Restart if needed, then press UP + SPACE: diagnostics/event should identify BACKFLIP.
- This is a smoke check; do not require a random course path to produce a successful landing every time.
- Presentation may show 360, BACKFLIP, TRICK FAILED, or AIR TIME.
- CLEAN LANDING must not appear.

## AUDIO

- Start gameplay with sound enabled.
- Network should show music-full.mp3 from the Chimpions Ski origin.
- There must be no gameplay request to https://chimp-jump.onrender.com/audio/music-full.mp3.
- No audio 404s and no repeated MP3 request flood.

## ENVIRONMENT

- Look straight down the course during an ordinary run.
- The center horizon remains open/clean.
- Mountains frame left/right rather than occupying the gameplay corridor.
- Hazards should not look embedded inside central mountains.
- Side scenery may continue beyond the flags while gameplay obstacles stay in the intended course corridor.
- If SMOKE_SCREENSHOT was used, inspect that image before sign-off.

## COURSE

In DevTools console:

    window.chimpionsSki()

Check:
- courseAhead remains comfortably near/ahead of courseLookaheadTarget.
- activeCourseObjects is positive; the course is not obviously empty.
- courseDrawCallsEstimate, courseLegacyDrawCallsEstimate, courseBatchDrawCalls, and batchedCourseInstances are finite/non-negative when exposed.
- courseBatchOverflow is not true.
- No sustained blank stretch caused by a streaming failure.

## RESTART

- Pause and choose RESTART RUN once, or restart once from a wipeout screen.
- Countdown/run starts again without reload or fatal error.
- Score/trick temporary state is cleared.
- window.chimpionsSki().activeRamp is not stale after restart.
- Controls, camera, selector, and audio remain responsive.

## RESULTS

Release is ready for human sign-off when:
- Strict smoke has 0 FAIL results.
- Integrated release has no unexpected PENDING result for ride/trick features.
- No uncaught exception, repeated console error, JS/CSS failure, GLB failure, or audio 404 is listed under ACTION REQUIRED.
- Every WARN has been reviewed with a concrete reason.
- Environment screenshot/manual horizon check looks correct.

If strict smoke fails, keep the JSON report and fix the failing subsystem. Do not weaken a check merely to obtain a green release result.
