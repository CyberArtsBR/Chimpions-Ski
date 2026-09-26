const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;

function speedProgress(feel={}){
  if(Number.isFinite(Number(feel.speed01)))return clamp(Number(feel.speed01));
  const speed=Math.max(0,finite(feel.speed));
  const base=Math.max(0,finite(feel.baseSpeed));
  const max=Math.max(base+.001,finite(feel.maxSpeed,Math.max(speed,83.3333)));
  return clamp((speed-base)/(max-base));
}

export function calculateCarveFeedback(feel={}){
  const air=!!feel.air||feel.grounded===false;
  const edge=clamp(Math.abs(finite(feel.edgeMagnitude,finite(feel.edge,finite(feel.carve)))));
  const load=clamp(Math.abs(finite(feel.carveLoad,edge)));
  const speed01=speedProgress(feel);
  const speed=Math.max(0,finite(feel.speed));
  const lateralVelocity=Math.abs(finite(feel.lateralVelocity,finite(feel.vx)));
  const lateralForce=clamp(Math.abs(finite(feel.lateralForce,lateralVelocity/Math.max(7.5,speed*.24))));
  const terrain=clamp(Math.abs(finite(feel.groundRoll))*2.8+Math.abs(finite(feel.groundPitch))*1.25);
  const landingGripLoss=clamp(finite(feel.landingGripLoss));
  const contact=air?0:clamp(1-landingGripLoss*.38);
  const shapedEdge=edge<=.055?0:Math.pow((edge-.055)/.945,.90);
  const intensity=air?0:clamp((shapedEdge*.36+load*.31+lateralForce*.19+speed01*.10+terrain*.04)*contact);
  return {
    intensity,
    snowSpray:clamp(intensity*.88+shapedEdge*speed01*.12),
    edge:shapedEdge,
    load,
    lateralForce,
    speed:speed01,
    terrain,
    contact
  };
}

const LANDING_QUALITY_BIAS=Object.freeze({clean:0,solid:.045,rough:.10,hard:.20,air:0,none:0});

export function calculateLandingFeedback(landing={}){
  const impact=Math.max(
    0,
    Math.abs(finite(landing.impact)),
    Math.abs(finite(landing.verticalVelocity))
  );
  const quality=String(landing.quality||'clean');
  const impact01=clamp((impact-2.4)/17.6);
  const jumpHeight=clamp(finite(landing.jumpHeight)/7.5);
  const sourceBoost=landing.jumpSource==='ramp'?.055:landing.jumpSource==='manual'?.018:0;
  const qualityBias=LANDING_QUALITY_BIAS[quality]??.04;
  const intensity=clamp(impact01*.78+qualityBias+jumpHeight*.12+sourceBoost);
  const tiny=intensity<.16;
  const band=quality==='hard'||intensity>=.80?'hard'
    :quality==='rough'||intensity>=.61?'rough'
    :quality==='solid'||intensity>=.39?'solid'
    :tiny?'tiny':'clean';
  const hard=band==='hard';
  const rough=band==='rough';
  const gainBase={tiny:.20,clean:.32,solid:.43,rough:.50,hard:.58}[band];
  const gainScale={tiny:.18,clean:.34,solid:.38,rough:.40,hard:.36}[band];
  const rateBase={tiny:1.075,clean:1.025,solid:.985,rough:.945,hard:.895}[band];
  return {
    intensity,
    impact,
    quality,
    band,
    sound:hard||rough?'hardLand':'land',
    audioGain:clamp(gainBase+intensity*gainScale,.18,.94),
    rateScale:clamp(rateBase-intensity*(hard?.035:rough?.025:.012),.84,1.08),
    particleBurst:tiny?0:clamp((intensity-.12)/.88),
    equipmentImpact:tiny?0:clamp((intensity-.08)/.92),
    cameraKick:intensity<.26?0:clamp((intensity-.24)/.76)*.72,
    hapticStrength:intensity<.08?0:clamp(.08+intensity*.92),
    dramatic:band==='solid'||rough||hard
  };
}

export function calculateCrashFeedback(crash={}){
  const velocity=crash.velocity||{};
  const forward=Math.abs(finite(velocity.z,finite(crash.speed)));
  const lateral=Math.abs(finite(velocity.x,finite(crash.lateralVelocity)));
  const vertical=Math.abs(finite(velocity.y,finite(crash.verticalVelocity)));
  const speed01=clamp((forward*3.6-90)/210);
  const lateral01=clamp(lateral/18);
  const vertical01=clamp(vertical/18);
  const kind=String(crash.kind||'tree');
  const kindBoost=kind==='rock'?.10:kind==='log'?.07:kind==='trick_wipeout'?.05:.04;
  const intensity=clamp(.42+speed01*.37+lateral01*.10+vertical01*.07+kindBoost);
  return {
    intensity,
    kind,
    audioGain:clamp(.54+intensity*.42,.54,.96),
    rateScale:clamp(1.04-intensity*.09,.90,1.04),
    snowBurst:clamp(.42+intensity*.58),
    cameraPunch:clamp(.34+intensity*.58,0,.90),
    hapticStrength:clamp(.52+intensity*.48),
    timeResponseSeconds:intensity>.82?.055:0
  };
}

export function calculateEdgeContactFeedback(edgeContactIntensity=0){
  const intensity=clamp(finite(edgeContactIntensity));
  return {
    intensity,
    audioGain:intensity<.08?0:clamp(.12+intensity*.42,0,.54),
    rateScale:clamp(.90+intensity*.18,.90,1.08),
    hapticStrength:intensity<.10?0:clamp(.08+intensity*.52,0,.60),
    snowBurst:intensity<.22?0:clamp((intensity-.20)/.80)*.28
  };
}

export function createEdgeContactGate({cooldownSeconds=.115}={}){
  let lastAt=-Infinity;
  function request(edgeContactIntensity,timeSeconds=0){
    const feedback=calculateEdgeContactFeedback(edgeContactIntensity);
    const now=finite(timeSeconds);
    if(feedback.intensity<.08||now-lastAt<cooldownSeconds)return {...feedback,play:false};
    lastAt=now;
    return {...feedback,play:true};
  }
  function reset(){lastAt=-Infinity;}
  return {request,reset};
}
