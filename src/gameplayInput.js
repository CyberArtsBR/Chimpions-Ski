import {TRICK_TYPE} from './trickSystem.js';
import {readAirborneTrickIntent,readTrickIntent} from './trickInput.js';

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
  let jumpQueued=false;
  let pauseQueued=false;
  let touchTrickIntent=null;

  function onKeyDown(event){
    if(editableTarget(event.target))return;
    keys.add(event.code);
    if(event.code==='Space'&&!event.repeat){
      jumpQueued=true;
      event.preventDefault?.();
    }
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
    touchTricks.clear();
    touchTrickIntent=null;
    jumpQueued=false;
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
    const pausePressed=pauseQueued||!!pad?.edges?.pressed?.menu;

    jumpQueued=false;
    pauseQueued=false;
    touchTrickIntent=null;

    return {
      steer:clamp(steer),
      jumpPressed,
      jumpHeld,
      trickIntent,
      airborneTrickIntent,
      pausePressed,
      keyboardActive:keyboardSteer!==0||keys.has('Space'),
      touchActive:Math.abs(touchSteer)>.01||touchJump||touchTricks.size>0,
      keys
    };
  }
  function getDiagnostics(){
    return {
      keyboardKeys:[...keys],
      touchSteer,
      touchJump,
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
    setTouchTrick,
    requestPause,
    resetTransient,
    getDiagnostics
  };
}
