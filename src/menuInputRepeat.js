export const MENU_INPUT_DEFAULTS=Object.freeze({
  enterThreshold:.62,
  neutralThreshold:.35,
  initialRepeatDelayMs:320,
  repeatIntervalMs:120
});

const clockNow=()=>globalThis.performance?.now?.()??Date.now();
const directionSign=direction=>direction==='left'||direction==='up'?-1:1;
const directionAxis=direction=>direction==='left'||direction==='right'?'x':'y';

function dpadDirection(dpad={}){
  const vertical=Number(!!dpad.down)-Number(!!dpad.up);
  if(vertical)return vertical>0?'down':'up';
  const horizontal=Number(!!dpad.right)-Number(!!dpad.left);
  if(horizontal)return horizontal>0?'right':'left';
  return null;
}

function strongAnalogDirection(pad,enterThreshold){
  const x=Number(pad?.axis)||0;
  const y=Number(pad?.axisY)||0;
  const ax=Math.abs(x),ay=Math.abs(y);
  if(ax<enterThreshold&&ay<enterThreshold)return null;
  if(ay>=ax)return y>0?'down':'up';
  return x>0?'right':'left';
}

function directionStillHeld(pad,direction,neutralThreshold){
  const dpad=pad?.dpad||{};
  if(direction==='up'&&dpad.up)return true;
  if(direction==='down'&&dpad.down)return true;
  if(direction==='left'&&dpad.left)return true;
  if(direction==='right'&&dpad.right)return true;
  const value=directionAxis(direction)==='x'?(Number(pad?.axis)||0):(Number(pad?.axisY)||0);
  return Math.abs(value)>neutralThreshold&&Math.sign(value)===directionSign(direction);
}

function navigationNeutral(pad,neutralThreshold){
  const dpad=pad?.dpad||{};
  if(dpad.up||dpad.down||dpad.left||dpad.right)return false;
  return Math.abs(Number(pad?.axis)||0)<=neutralThreshold&&Math.abs(Number(pad?.axisY)||0)<=neutralThreshold;
}

export function createMenuInputRepeat({
  adapter={},
  enterThreshold=MENU_INPUT_DEFAULTS.enterThreshold,
  neutralThreshold=MENU_INPUT_DEFAULTS.neutralThreshold,
  initialRepeatDelayMs=MENU_INPUT_DEFAULTS.initialRepeatDelayMs,
  repeatIntervalMs=MENU_INPUT_DEFAULTS.repeatIntervalMs,
  clock=clockNow
}={}){
  const enter=Math.max(.1,Math.min(1,Number(enterThreshold)||MENU_INPUT_DEFAULTS.enterThreshold));
  const neutral=Math.max(0,Math.min(enter-.01,Number(neutralThreshold)||MENU_INPUT_DEFAULTS.neutralThreshold));
  const repeatDelay=Math.max(0,Number(initialRepeatDelayMs)||0);
  const repeatInterval=Math.max(30,Number(repeatIntervalMs)||MENU_INPUT_DEFAULTS.repeatIntervalMs);
  let heldDirection=null;
  let nextRepeatAt=0;
  let armed=false;

  function call(action,...args){
    const fn=adapter?.[action];
    if(typeof fn==='function')fn(...args);
  }
  function reset({requireNeutral=true}={}){
    heldDirection=null;
    nextRepeatAt=0;
    armed=!requireNeutral;
  }
  function resolveDirection(pad){
    return dpadDirection(pad?.dpad)||
      strongAnalogDirection(pad,enter)||
      (heldDirection&&directionStillHeld(pad,heldDirection,neutral)?heldDirection:null);
  }
  function update(pad={},nowMs=clock()){
    const events=[];
    if(!pad?.connected){
      reset();
      return events;
    }

    const pressed=pad?.edges?.pressed||{};
    if(pressed.menu){call('menu');events.push('menu');}
    if(pressed.cancel){call('cancel');events.push('cancel');}
    if(pressed.confirm){call('confirm');events.push('confirm');}

    if(navigationNeutral(pad,neutral)){
      heldDirection=null;
      nextRepeatAt=0;
      armed=true;
      return events;
    }
    if(!armed)return events;

    const direction=resolveDirection(pad);
    if(!direction)return events;

    const now=Number(nowMs)||0;
    if(direction!==heldDirection){
      heldDirection=direction;
      nextRepeatAt=now+repeatDelay;
      call('move',direction);
      events.push(direction);
      return events;
    }

    if(now>=nextRepeatAt){
      nextRepeatAt=now+repeatInterval;
      call('move',direction);
      events.push(direction);
    }
    return events;
  }
  function getState(){
    return {armed,heldDirection,nextRepeatAt};
  }

  return {update,reset,getState};
}
