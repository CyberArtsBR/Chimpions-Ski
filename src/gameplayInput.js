import {TRICK_TYPE} from './trickSystem.js';
import {readAirborneTrickIntent,readStyleHoldIntent,readTrickIntent} from './trickInput.js';

const EDITABLE='input,textarea,select,[contenteditable="true"]';

function clamp(value,min=-1,max=1){
  return Math.max(min,Math.min(max,Number(value)||0));
}
function editableTarget(target){
  return !!target?.closest?.(EDITABLE);
}

export function createGameplayInput({windowRef=globalThis.window,documentRef=globalThis.document}={}){
  const keys=new Set();
  const touchTricks=new Set();
  let touchSteer=0;
  let touchJump=false;
  let touchTuck=false;
  let touchBrake=false;
  let jumpQueued=false;
  let specialQueued=false;
  let cameraQueued=false;
  let cameraMotionQueued=false;
  let pauseQueued=false;
  let touchTrickIntent=null;

  function onKeyDown(event){
    if(editableTarget(event.target))return;
    keys.add(event.code);
    if(event.code==='Space'&&!event.repeat){
      jumpQueued=true;
      event.preventDefault?.();
    }
    if(event.code==='KeyQ'&&!event.repeat)specialQueued=true;
    if(event.code==='KeyE'&&!event.repeat)cameraQueued=true;
    if(event.code==='KeyR'&&!event.repeat)cameraMotionQueued=true;
    if(event.code==='Escape'&&!event.repeat)pauseQueued=true;
  }
  function onKeyUp(event){
    keys.delete(event.code);
  }
  function setTouchSteer(value){
    touchSteer=clamp(value);
  }
  function setTouchJump(pressed){
    const next=!!pressed;
    if(next&&!touchJump)jumpQueued=true;
    touchJump=next;
  }
  function setTouchTuck(pressed){
    touchTuck=!!pressed;
  }
  function setTouchBrake(pressed){
    touchBrake=!!pressed;
  }
  function setTouchTrick(type,pressed){
    const normalized=type===TRICK_TYPE.BACKFLIP?TRICK_TYPE.BACKFLIP:TRICK_TYPE.SPIN_360;
    if(pressed){
      if(!touchTricks.has(normalized)){
        touchTricks.add(normalized);
        touchTrickIntent=normalized;
        jumpQueued=true;
      }
    }else{
      touchTricks.delete(normalized);
    }
  }
  function requestPause(){
    pauseQueued=true;
  }
  function resetTransient(){
    touchSteer=0;
    touchJump=false;
    touchTuck=false;
    touchBrake=false;
    touchTricks.clear();
    touchTrickIntent=null;
    jumpQueued=false;
    specialQueued=false;
    cameraQueued=false;
    cameraMotionQueued=false;
    pauseQueued=false;
    keys.clear();
  }
  function read(pad={}){
    const keyboardSteer=
      Number(keys.has('ArrowRight')||keys.has('KeyD'))-
      Number(keys.has('ArrowLeft')||keys.has('KeyA'));
    const steer=Math.abs(touchSteer)>.01
      ?touchSteer
      :(keyboardSteer||Number(pad.axis)||0);
    const padJumpPressed=!!pad?.edges?.pressed?.jump;
    const jumpPressed=jumpQueued||padJumpPressed;
    const jumpHeld=touchJump||touchTricks.size>0||keys.has('Space')||!!pad.jump;
    const authoredTrick=touchTrickIntent;
    const trickIntent=authoredTrick||(jumpPressed?readTrickIntent(keys,pad):null);
    const airborneTrickIntent=authoredTrick||(jumpPressed?readAirborneTrickIntent(keys,pad):null);
    const specialPressed=specialQueued||!!pad?.edges?.pressed?.special;
    const cameraPressed=cameraQueued||!!pad?.edges?.pressed?.camera;
    const cameraMotionPressed=cameraMotionQueued||!!pad?.edges?.pressed?.cameraMotion;
    const pausePressed=pauseQueued||!!pad?.edges?.pressed?.menu;
    const tuckHeld=touchTuck||keys.has('ShiftLeft')||keys.has('ShiftRight')||!!pad?.tuck;
    const styleHeld=readStyleHoldIntent({tuckHeld});
    const brakeHeld=touchBrake||keys.has('ControlLeft')||keys.has('ControlRight')||!!pad?.brake;

    jumpQueued=false;
    specialQueued=false;
    cameraQueued=false;
    cameraMotionQueued=false;
    pauseQueued=false;
    touchTrickIntent=null;

    return {
      steer:clamp(steer),
      jumpPressed,
      jumpHeld,
      trickIntent,
      airborneTrickIntent,
      specialPressed,
      cameraPressed,
      cameraMotionPressed,
      pausePressed,
      tuckHeld,
      styleHeld,
      brakeHeld,
      keyboardActive:keyboardSteer!==0||keys.has('Space')||keys.has('KeyQ')||keys.has('KeyE')||keys.has('KeyR')||keys.has('ShiftLeft')||keys.has('ShiftRight')||keys.has('ControlLeft')||keys.has('ControlRight'),
      touchActive:Math.abs(touchSteer)>.01||touchJump||touchTuck||touchBrake||touchTricks.size>0,
      keys
    };
  }
  function getDiagnostics(){
    return {
      keyboardKeys:[...keys],
      touchSteer,
      touchJump,
      touchTuck,
      touchBrake,
      specialQueued,
      cameraQueued,
      cameraMotionQueued,
      touchTricks:[...touchTricks]
    };
  }

  windowRef?.addEventListener?.('keydown',onKeyDown);
  windowRef?.addEventListener?.('keyup',onKeyUp);
  windowRef?.addEventListener?.('blur',resetTransient);
  documentRef?.addEventListener?.('visibilitychange',()=>{if(documentRef.hidden)resetTransient();});

  return {
    keys,
    read,
    setTouchSteer,
    setTouchJump,
    setTouchTuck,
    setTouchBrake,
    setTouchTrick,
    requestPause,
    resetTransient,
    getDiagnostics
  };
}
