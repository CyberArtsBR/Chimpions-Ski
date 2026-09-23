const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));

export const HAPTIC_PATTERNS=Object.freeze({
  menuMove:Object.freeze({duration:28,weakMagnitude:.075,strongMagnitude:.035}),
  menuConfirm:Object.freeze({duration:46,weakMagnitude:.13,strongMagnitude:.11}),
  banana:Object.freeze({duration:42,weakMagnitude:.22,strongMagnitude:.10}),
  rampTakeoff:Object.freeze({duration:58,weakMagnitude:.18,strongMagnitude:.28}),
  landSoft:Object.freeze({duration:44,weakMagnitude:.12,strongMagnitude:.20}),
  landClean:Object.freeze({duration:66,weakMagnitude:.20,strongMagnitude:.32}),
  landHard:Object.freeze({duration:112,weakMagnitude:.42,strongMagnitude:.68}),
  trick360Start:Object.freeze({duration:44,weakMagnitude:.12,strongMagnitude:.19}),
  trickBackflipStart:Object.freeze({duration:62,weakMagnitude:.16,strongMagnitude:.31}),
  trick360Success:Object.freeze({duration:72,weakMagnitude:.24,strongMagnitude:.38}),
  trickBackflipSuccess:Object.freeze({duration:92,weakMagnitude:.30,strongMagnitude:.54}),
  trickFail:Object.freeze({duration:108,weakMagnitude:.36,strongMagnitude:.60}),
  oil:Object.freeze({duration:105,weakMagnitude:.48,strongMagnitude:.22}),
  crash:Object.freeze({duration:155,weakMagnitude:.68,strongMagnitude:.94})
});

const CONTINUOUS_INTERVAL=.085;

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

function safePattern(pattern){
  return {
    duration:Math.max(0,Math.min(180,Math.round(Number(pattern?.duration)||0))),
    weakMagnitude:clamp(Number(pattern?.weakMagnitude)||0),
    strongMagnitude:clamp(Number(pattern?.strongMagnitude)||0)
  };
}

export function createHaptics({navigatorObject=globalThis.navigator}={}){
  let eventLock=0;
  let continuousClock=0;

  function play(pattern,{lock=true}={}){
    const safe=safePattern(pattern);
    if(!safe.duration||(!safe.weakMagnitude&&!safe.strongMagnitude))return false;
    try{
      const actuator=getActuator(getConnectedPad(navigatorObject));
      if(!actuator)return false;
      if(lock)eventLock=Math.max(eventLock,safe.duration/1000+.025);
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

  function update(dt,feel={}){
    const step=Math.max(0,Math.min(.1,Number(dt)||0));
    eventLock=Math.max(0,eventLock-step);
    continuousClock+=step;
    if(continuousClock<CONTINUOUS_INTERVAL)return false;
    continuousClock=0;

    if(feel.mode!=='playing'||feel.air)return false;

    const speed=Math.max(0,Number(feel.speed)||0);
    const maxSpeed=Math.max(speed,Number(feel.maxSpeed)||83.3333);
    const baseSpeed=Math.max(1,Number(feel.baseSpeed)||44.4444);
    const speedProgress=clamp((speed-baseSpeed)/Math.max(.001,maxSpeed-baseSpeed));
    const carve=clamp(Math.abs(Number(feel.edge)||0));
    const terrain=clamp(Math.abs(Number(feel.groundRoll)||0)*2.6+Math.abs(Number(feel.groundPitch)||0)*1.1);
    const oil=Number(feel.oilSlipTime)>0;
    const time=Number(feel.time)||0;

    // Continuous snow feel is deliberately subtle. Event pulses (landing,
    // tricks, crashes) temporarily suppress it so important impacts stay clear.
    if(eventLock>0)return false;

    let weak=.035+speedProgress*.060+carve*.095+terrain*.035;
    let strong=.025+speedProgress*.052+carve*.070+terrain*.055;

    if(speedProgress>.96){
      const maxBlend=clamp((speedProgress-.96)/.04);
      weak+=.025*maxBlend;
      strong+=.035*maxBlend;
    }
    if(oil){
      const wobble=.5+.5*Math.sin(time*31);
      weak+=.12+.11*wobble;
      strong+=.045+.035*(1-wobble);
    }

    weak=clamp(weak,0,.32);
    strong=clamp(strong,0,.30);
    return play({duration:96,weakMagnitude:weak,strongMagnitude:strong},{lock:false});
  }

  function menuMove(){return play(HAPTIC_PATTERNS.menuMove,{lock:false});}
  function menuConfirm(){return play(HAPTIC_PATTERNS.menuConfirm);}
  function banana(){return play(HAPTIC_PATTERNS.banana);}
  function rampTakeoff(){return play(HAPTIC_PATTERNS.rampTakeoff);}
  function land(impact=0,quality='normal'){
    const amount=clamp(Number(impact)||0);
    if(quality==='hard'||amount>=.72)return play(HAPTIC_PATTERNS.landHard);
    if(quality==='clean'||amount>=.35)return play(HAPTIC_PATTERNS.landClean);
    return play(HAPTIC_PATTERNS.landSoft);
  }
  function trickStart(type){
    return play(type==='backflip'?HAPTIC_PATTERNS.trickBackflipStart:HAPTIC_PATTERNS.trick360Start);
  }
  function trickSuccess(type){
    return play(type==='backflip'?HAPTIC_PATTERNS.trickBackflipSuccess:HAPTIC_PATTERNS.trick360Success);
  }
  function trickFail(){return play(HAPTIC_PATTERNS.trickFail);}
  function oil(){return play(HAPTIC_PATTERNS.oil);}
  function crash(kind='tree'){
    const base=HAPTIC_PATTERNS.crash;
    const multiplier=kind==='rock'?1:kind==='wideLog'||kind==='log'?.94:.88;
    return play({
      duration:base.duration,
      weakMagnitude:base.weakMagnitude*multiplier,
      strongMagnitude:base.strongMagnitude*multiplier
    });
  }

  return {
    update,
    menuMove,
    menuConfirm,
    banana,
    rampTakeoff,
    land,
    trickStart,
    trickSuccess,
    trickFail,
    oil,
    crash
  };
}
