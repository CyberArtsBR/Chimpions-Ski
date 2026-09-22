const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));

export const HAPTIC_PATTERNS=Object.freeze({
  rampTakeoff:Object.freeze({duration:55,weakMagnitude:.16,strongMagnitude:.24}),
  landSoft:Object.freeze({duration:42,weakMagnitude:.11,strongMagnitude:.18}),
  landClean:Object.freeze({duration:62,weakMagnitude:.18,strongMagnitude:.28}),
  landHard:Object.freeze({duration:105,weakMagnitude:.38,strongMagnitude:.62}),
  trick360Start:Object.freeze({duration:42,weakMagnitude:.10,strongMagnitude:.18}),
  trickBackflipStart:Object.freeze({duration:58,weakMagnitude:.14,strongMagnitude:.27}),
  trick360Success:Object.freeze({duration:68,weakMagnitude:.20,strongMagnitude:.34}),
  trickBackflipSuccess:Object.freeze({duration:86,weakMagnitude:.28,strongMagnitude:.48}),
  trickFail:Object.freeze({duration:100,weakMagnitude:.32,strongMagnitude:.55}),
  oil:Object.freeze({duration:92,weakMagnitude:.38,strongMagnitude:.20}),
  crash:Object.freeze({duration:145,weakMagnitude:.62,strongMagnitude:.88})
});

function getConnectedPad(navigatorObject){
  try{
    const getGamepads=navigatorObject?.getGamepads;
    if(typeof getGamepads!=='function')return null;
    const pads=getGamepads.call(navigatorObject);
    for(const pad of pads||[]){if(pad?.connected)return pad;}
  }catch{}
  return null;
}

function getActuator(pad){
  if(!pad)return null;
  if(pad.vibrationActuator)return pad.vibrationActuator;
  const actuators=pad.hapticActuators;
  if(actuators?.length)return actuators[0]||null;
  return null;
}

export function createHaptics({navigatorObject=globalThis.navigator}={}){
  function pulse(pattern){
    const safe={
      duration:Math.max(0,Math.min(160,Math.round(Number(pattern?.duration)||0))),
      weakMagnitude:clamp(Number(pattern?.weakMagnitude)||0),
      strongMagnitude:clamp(Number(pattern?.strongMagnitude)||0)
    };
    if(!safe.duration||(!safe.weakMagnitude&&!safe.strongMagnitude))return false;
    try{
      const actuator=getActuator(getConnectedPad(navigatorObject));
      if(!actuator)return false;
      if(typeof actuator.playEffect==='function'){
        const result=actuator.playEffect('dual-rumble',{
          duration:safe.duration,
          startDelay:0,
          weakMagnitude:safe.weakMagnitude,
          strongMagnitude:safe.strongMagnitude
        });
        result?.catch?.(()=>{});
        return true;
      }
      if(typeof actuator.pulse==='function'){
        const result=actuator.pulse(Math.max(safe.weakMagnitude,safe.strongMagnitude),safe.duration);
        result?.catch?.(()=>{});
        return true;
      }
    }catch{}
    return false;
  }

  function rampTakeoff(){return pulse(HAPTIC_PATTERNS.rampTakeoff);}
  function land(impact=0,quality='normal'){
    const amount=clamp(Number(impact)||0);
    if(quality==='hard'||amount>=.72)return pulse(HAPTIC_PATTERNS.landHard);
    if(quality==='clean'||amount>=.35)return pulse(HAPTIC_PATTERNS.landClean);
    return pulse(HAPTIC_PATTERNS.landSoft);
  }
  function trickStart(type){
    return pulse(type==='backflip'?HAPTIC_PATTERNS.trickBackflipStart:HAPTIC_PATTERNS.trick360Start);
  }
  function trickSuccess(type){
    return pulse(type==='backflip'?HAPTIC_PATTERNS.trickBackflipSuccess:HAPTIC_PATTERNS.trick360Success);
  }
  function trickFail(){return pulse(HAPTIC_PATTERNS.trickFail);}
  function oil(){return pulse(HAPTIC_PATTERNS.oil);}
  function crash(){return pulse(HAPTIC_PATTERNS.crash);}

  return {rampTakeoff,land,trickStart,trickSuccess,trickFail,oil,crash};
}
