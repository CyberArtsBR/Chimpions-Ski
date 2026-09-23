import {TRICK_TYPE} from './trickSystem.js';

export const TRICK_AXIS_THRESHOLD=.45;

export function readTrickIntent(keys,pad={}){
  const keyUp=!!keys?.has?.('ArrowUp')||!!keys?.has?.('KeyW');
  const keyDown=!!keys?.has?.('ArrowDown')||!!keys?.has?.('KeyS');
  const axisY=Number(pad?.axisY)||0;
  const padUp=!!pad?.dpad?.up||axisY<=-TRICK_AXIS_THRESHOLD;
  const padDown=!!pad?.dpad?.down||axisY>=TRICK_AXIS_THRESHOLD;
  const up=keyUp||padUp;
  const down=keyDown||padDown;
  if(up===down)return null;
  return up?TRICK_TYPE.BACKFLIP:TRICK_TYPE.SPIN_360;
}

export function readAirborneTrickIntent(keys,pad={}){
  // Directional + Jump keeps its explicit meaning in air. A plain second
  // airborne Jump remains the arcade shortcut for a 360.
  return readTrickIntent(keys,pad)||TRICK_TYPE.SPIN_360;
}
