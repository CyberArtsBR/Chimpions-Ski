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
  edgeScrape:Object.freeze({duration:54,weakMagnitude:.20,strongMagnitude:.12}),
  crash:Object.freeze({duration:155,weakMagnitude:.68,strongMagnitude:.94})
});

const CONTINUOUS_INTERVAL=.085;

function getActuator(pad){
  if(!pad)return null;
  if(pad.vibrationActuator)return pad.vibrationActuator;
  const actuators=pad.hapticActuators;
  if(actuators?.length)return actuators[0]||null;
  return null;
}

function safePattern(pattern,intensity=1){
  const amount=clamp(Number(intensity)||0);
  return {
    duration:Math.max(0,Math.min(180,Math.round(Number(pattern?.duration)||0))),
    weakMagnitude:clamp((Number(pattern?.weakMagnitude)||0)*amount),
    strongMagnitude:clamp((Number(pattern?.strongMagnitude)||0)*amount)
  };
}

function supportsDualRumble(actuator){
  if(typeof actuator?.playEffect!=='function')return false;
  try{
    const effects=Array.from(actuator.effects||[]);
    return !effects.length||effects.includes('dual-rumble');
  }catch{
    return true;
  }
}

export function createHaptics({getActiveGamepad=null}={}){
  let activeGamepad=null;
  let eventLock=0;
  let continuousClock=0;
  const failedMethods=new WeakMap();

  function failureSet(actuator){
    if(!actuator||(typeof actuator!=='object'&&typeof actuator!=='function'))return null;
    let set=failedMethods.get(actuator);
    if(!set){
      set=new Set();
      failedMethods.set(actuator,set);
    }
    return set;
  }
  function methodFailed(actuator,method){
    return !!failedMethods.get(actuator)?.has(method);
  }
  function markFailed(actuator,method){
    failureSet(actuator)?.add(method);
  }
  function invoke(actuator,method,args){
    if(methodFailed(actuator,method)||typeof actuator?.[method]!=='function')return false;
    try{
      const result=actuator[method](...args);
      result?.catch?.(()=>markFailed(actuator,method));
      return true;
    }catch{
      markFailed(actuator,method);
      return false;
    }
  }
  function resolveActiveGamepad(){
    let candidate=activeGamepad;
    if(!candidate&&typeof getActiveGamepad==='function'){
      try{candidate=getActiveGamepad()||null;}catch{}
    }
    if(candidate?.connected===false)return null;
    return candidate||null;
  }
  function setActiveGamepad(gamepad){
    activeGamepad=gamepad&&gamepad.connected!==false?gamepad:null;
    return activeGamepad;
  }
  function clearActiveGamepad(){activeGamepad=null;}
  function getActiveGamepad(){return resolveActiveGamepad();}

  function play(pattern,{lock=true,intensity=1}={}){
    const safe=safePattern(pattern,intensity);
    if(!safe.duration||(!safe.weakMagnitude&&!safe.strongMagnitude))return false;

    const pad=resolveActiveGamepad();
    const actuator=getActuator(pad);
    if(!actuator)return false;

    let played=false;
    if(supportsDualRumble(actuator)&&!methodFailed(actuator,'playEffect')){
      played=invoke(actuator,'playEffect',['dual-rumble',{
        duration:safe.duration,
        startDelay:0,
        weakMagnitude:safe.weakMagnitude,
        strongMagnitude:safe.strongMagnitude
      }]);
    }
    if(!played&&!methodFailed(actuator,'pulse')){
      played=invoke(actuator,'pulse',[
        Math.max(safe.weakMagnitude,safe.strongMagnitude),
        safe.duration
      ]);
    }
    if(played&&lock)eventLock=Math.max(eventLock,safe.duration/1000+.025);
    return played;
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
    const oilActive=Number(feel.oilSlipTime)>0;
    const time=Number(feel.time)||0;

    if(eventLock>0)return false;

    let weak=.035+speedProgress*.060+carve*.095+terrain*.035;
    let strong=.025+speedProgress*.052+carve*.070+terrain*.055;

    if(speedProgress>.96){
      const maxBlend=clamp((speedProgress-.96)/.04);
      weak+=.025*maxBlend;
      strong+=.035*maxBlend;
    }
    if(oilActive){
      const wobble=.5+.5*Math.sin(time*31);
      weak+=.12+.11*wobble;
      strong+=.045+.035*(1-wobble);
    }

    weak=clamp(weak,0,.32);
    strong=clamp(strong,0,.30);
    return play({duration:96,weakMagnitude:weak,strongMagnitude:strong},{lock:false});
  }

  function menuMove(intensity=1){return play(HAPTIC_PATTERNS.menuMove,{lock:false,intensity});}
  function menuConfirm(intensity=1){return play(HAPTIC_PATTERNS.menuConfirm,{intensity});}
  function banana(intensity=1){return play(HAPTIC_PATTERNS.banana,{intensity});}
  function rampTakeoff(intensity=1){return play(HAPTIC_PATTERNS.rampTakeoff,{intensity});}
  function land(impact=0,quality='normal'){
    const amount=clamp(Number(impact)||0);
    const intensity=clamp(.45+amount*.55);
    if(quality==='hard'||amount>=.72)return play(HAPTIC_PATTERNS.landHard,{intensity});
    if(quality==='clean'||amount>=.35)return play(HAPTIC_PATTERNS.landClean,{intensity});
    return play(HAPTIC_PATTERNS.landSoft,{intensity});
  }
  function trickStart(type,intensity=1){
    return play(type==='backflip'?HAPTIC_PATTERNS.trickBackflipStart:HAPTIC_PATTERNS.trick360Start,{intensity});
  }
  function trickSuccess(type,intensity=1){
    return play(type==='backflip'?HAPTIC_PATTERNS.trickBackflipSuccess:HAPTIC_PATTERNS.trick360Success,{intensity});
  }
  function trickFail(type='360',intensity=1){
    void type;
    return play(HAPTIC_PATTERNS.trickFail,{intensity});
  }
  function oil(intensity=1){return play(HAPTIC_PATTERNS.oil,{intensity});}
  function edgeScrape(intensity=.5){return play(HAPTIC_PATTERNS.edgeScrape,{lock:false,intensity});}
  function crash(kind='tree',intensity=1){
    const base=HAPTIC_PATTERNS.crash;
    let multiplier=.88;
    if(kind==='rock')multiplier=1;
    else if(kind==='wideLog'||kind==='log')multiplier=.94;
    return play({
      duration:base.duration,
      weakMagnitude:base.weakMagnitude*multiplier,
      strongMagnitude:base.strongMagnitude*multiplier
    },{intensity});
  }
  function emit(event,data={}){
    const intensity=data.intensity??1;
    switch(event){
      case 'pickup':
      case 'banana':return banana(intensity);
      case 'rampLaunch':
      case 'rampTakeoff':return rampTakeoff(intensity);
      case 'landing':return land(data.impact??intensity,data.quality||'normal');
      case 'trickStart':return trickStart(data.type,intensity);
      case 'trickSuccess':return trickSuccess(data.type,intensity);
      case 'trickFail':return trickFail(data.type,intensity);
      case 'softHazard':
      case 'oil':return oil(intensity);
      case 'edgeScrape':return edgeScrape(intensity);
      case 'crash':return crash(data.kind,intensity);
      default:return false;
    }
  }
  function diagnostics(){
    const pad=resolveActiveGamepad();
    return {
      activeIndex:Number.isInteger(pad?.index)?pad.index:null,
      activeId:String(pad?.id||''),
      hasActuator:!!getActuator(pad)
    };
  }

  return {
    setActiveGamepad,
    clearActiveGamepad,
    getActiveGamepad,
    emit,
    diagnostics,
    update,
    menuMove,
    menuConfirm,
    pickup:banana,
    banana,
    rampLaunch:rampTakeoff,
    rampTakeoff,
    land,
    trickStart,
    trickSuccess,
    trickFail,
    softHazard:oil,
    oil,
    edgeScrape,
    crash
  };
}
