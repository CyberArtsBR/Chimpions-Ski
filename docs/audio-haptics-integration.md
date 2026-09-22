# Audio + haptics integration contract

This branch intentionally does **not** wire ride mode, trick, ramp, landing, oil, or crash haptics into main.js. The modules are ready for the integration owner to consume after the rider/trick branches land.

## Construction

    import {createSkiAudio} from './audio.js';
    import {createHaptics} from './haptics.js';

    const audio=createSkiAudio();
    const haptics=createHaptics();

createHaptics() is safe on browsers/controllers without vibration support. Unsupported paths are silent no-ops.

## Ride mode

Call once whenever the active ride mode changes:

    audio.setRideMode('ski');
    audio.setRideMode('snowboard');

The default is ski. Existing audio.update({speed,...}) calls remain valid. Speed is still supplied in game-world meters/second. Audio normalization converts internally to km/h and uses 160–210 km/h for ski and 180–230 km/h for snowboard.

## Trick events

Supported trick types are exactly 360 and backflip.

    audio.playTrickStart('360', eventId);
    haptics.trickStart('360');

    audio.playTrickSuccess('360', combo, eventId);
    haptics.trickSuccess('360');

    audio.playTrickFail('360', eventId);
    haptics.trickFail('360');

Equivalent backflip calls use 'backflip'.

The eventId argument is optional for API convenience, but integration should pass the stable trick event ID emitted by the trick system. The audio layer keeps a bounded recent-ID cache and ignores the same start/success/fail event if it remains visible for multiple frames. Anonymous events are also latched until the next trick start, but explicit IDs are the strongest contract for state-driven integration.

Combo is clamped to three presentation levels: combo 1 uses the normal accent, combo 2 raises pitch/energy slightly, and combo 3+ uses the capped strongest presentation. This prevents unbounded gain stacking.

## Ramp / landing / hazards

Existing ramp audio remains owned by audio.js. Add haptics at the semantic gameplay events only:

    haptics.rampTakeoff();
    haptics.land(impact01, landingQuality);
    haptics.oil();
    haptics.crash(crashType);

impact01 should be normalized approximately 0–1. landingQuality may be 'soft', 'clean', 'hard', or the existing landing-quality string. No continuous carving/speed rumble should be added.

## Run reset

Existing integration already calls:

    audio.resetRun();

Keep that call. It clears clear-event state, trick event/latch state, and transient event cooldown timestamps. Haptics are event-only and hold no timers/listeners requiring reset.

## Airborne behavior

Continue feeding air and jumpSource into audio.update. While airborne, snow contact/carve gain transitions to zero and wind is emphasized; ramp airtime receives the strongest wind lift. Do not repeatedly call ramp takeoff or trick-start APIs from frame state: call them from discrete events (or pass a stable event ID where supported).
