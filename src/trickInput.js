import {TRICK_TYPE} from './trickSystem.js';

export const TRICK_AXIS_THRESHOLD=.45;
export const STYLE_HOLD_CONTROL=Object.freeze({
  keyboard:'SHIFT',
  controller:'LT',
  touch:'TUCK'
});

export function readTrickIntent(keys,pad={}){
  const keyUp=!!keys?.has?.('ArrowUp')||!!keys?.has?.('KeyW');
  const keyDown=!!keys?.has?.('ArrowDown')||!!keys?.has?.('KeyS');
  const axisY=Number(pad?.axisY)||0;
  const padUp=!!pad?.dpad?.up||axisY<=-TRICK_AXIS_THRESHOLD;
  const padDown=!!pad?.dpad?.down||axisY>=TRICK_AXIS_THRESHOLD;
  const up=keyUp||padUp;
  const back=keyDown||padDown;
  if(up===back)return null;
  // Arcade mapping: UP + Jump spins; BACK/DOWN + Jump backflips.
  // FRONT FLIP intentionally has no normal-control route.
  return up?TRICK_TYPE.SPIN_360:TRICK_TYPE.BACKFLIP;
}

export function readAirborneTrickIntent(keys,pad={}){
  // Directional + Jump keeps the same mapping in air. A plain second airborne
  // Jump remains the arcade shortcut for a 360, subject to airtime gating.
  return readTrickIntent(keys,pad)||TRICK_TYPE.SPIN_360;
}

export function readStyleHoldIntent({tuckHeld=false}={}){
  // Reuse the existing tuck control instead of adding another trick button.
  // Ground: tuck. Air: physics-neutral style/grab hold.
  return !!tuckHeld;
}
