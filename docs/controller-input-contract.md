# Controller input / haptics integration contract

## Authoritative controller ownership

`src/input.js` is the single owner of active-controller selection and takeover. Every `readPad(...)` result exposes:

- `activeIndex`, `activeKey`, `id`, and `mapping` for diagnostics.
- `activeGamepad` as the exact browser `Gamepad` object selected for that frame.

No haptic or UI layer should scan `navigator.getGamepads()` and choose another device independently.

`src/main.js` forwards `pad.activeGamepad` to `haptics.setActiveGamepad(...)` once per frame, before any controller-driven UI/gameplay event can fire.

## Haptic API

`createHaptics()` exposes named compatibility methods plus `emit(event, data)`.

Supported semantic routes:

- `pickup` / `banana`
- `rampLaunch` / `rampTakeoff`
- `landing` with `impact` and optional `quality`
- `trickStart`, `trickSuccess`, `trickFail`
- `softHazard` / `oil`
- `edgeScrape`
- `crash`

Semantic `intensity` values are clamped to 0..1 before reaching hardware.

The hardware layer supports `GamepadHapticActuator.playEffect('dual-rumble', ...)` and a conservative `pulse(...)` fallback. A rejected/throwing method is quarantined for that actuator so later frames do not repeatedly create rejected promises.

## Semantic menu input

`src/menuInputRepeat.js` owns controller repeat timing only. It never manipulates DOM focus.

Create it with an adapter:

```js
const menuInput=createMenuInputRepeat({
  adapter:{
    move(direction){ /* 'up' | 'down' | 'left' | 'right' */ },
    confirm(){},
    cancel(){},
    menu(){}
  }
});
```

Call `menuInput.update(pad)` with the authoritative `readPad(...)` state while a menu is active. Call `menuInput.reset()` when changing to a UI surface that has its own semantic state.

Current `src/ui.js` wires this contract for pause, results, leave confirmation, and the main overlay while keeping focus/selection semantics inside UI code.

## Assistant 4 / Assistant 10 integration

If Assistant 4 replaces the menu implementation, preserve the adapter boundary above rather than reintroducing raw axis latches or a second controller poller.

For avatar/ride-mode selection and any revised start screen, the integration engineer should route their semantic move/confirm/cancel actions through `createMenuInputRepeat` (or an equivalent adapter built on it), then remove their local axis-repeat state. Gameplay steering must continue reading `pad.axis` directly every frame.

Do not move controller ownership into UI code and do not make haptics rediscover a controller by array position.
