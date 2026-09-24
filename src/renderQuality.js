const MODE_NAMES=Object.freeze(['auto','high','max','medium','low']);
const PROFILE_ORDER=Object.freeze(['high','medium','low']);

const HIGH=Object.freeze({
  profile:'high',
  dprCap:1.50,
  snowSurfaceDetailDensity:1,
  environmentDecorationDensity:1,
  distantSceneryDetail:1,
  distantSceneryUpdateHz:0
});

const MEDIUM=Object.freeze({
  profile:'medium',
  dprCap:1.15,
  snowSurfaceDetailDensity:.72,
  environmentDecorationDensity:.72,
  distantSceneryDetail:.74,
  distantSceneryUpdateHz:30
});

const LOW=Object.freeze({
  profile:'low',
  dprCap:.90,
  snowSurfaceDetailDensity:.48,
  environmentDecorationDensity:.48,
  distantSceneryDetail:.52,
  distantSceneryUpdateHz:18
});

export const QUALITY_PROFILES=Object.freeze({
  high:HIGH,
  max:Object.freeze({...HIGH,profile:'max',dprCap:2}),
  medium:MEDIUM,
  low:LOW
});
export const QUALITY_PROFILE_NAMES=MODE_NAMES;

const AUTO_RESOLUTION_FLOOR=Object.freeze({high:.80,medium:.82,low:.84});
const AUTO_RESOLUTION_STEP_DOWN=.06;
const AUTO_RESOLUTION_STEP_UP=.04;
const AUTO_RESOLUTION_DOWN_SCORE=72;
const AUTO_RESOLUTION_UP_SCORE=180;
const AUTO_PROFILE_DOWN_SCORE=150;
const AUTO_PROFILE_UP_SCORE=480;
const AUTO_RESOLUTION_DOWN_COOLDOWN_MS=1800;
const AUTO_RESOLUTION_UP_COOLDOWN_MS=2500;
const AUTO_PROFILE_DOWN_COOLDOWN_MS=5000;
const AUTO_PROFILE_UP_COOLDOWN_MS=12000;

export function resolveQualityProfile(value,fallback='auto'){
  const normalized=String(value??'').trim().toLowerCase();
  if(normalized==='reduced')return 'medium';
  if(MODE_NAMES.includes(normalized))return normalized;
  const normalizedFallback=String(fallback??'').trim().toLowerCase();
  if(normalizedFallback==='reduced')return 'medium';
  return MODE_NAMES.includes(normalizedFallback)?normalizedFallback:'auto';
}

function readInitialProfile(){
  if(typeof window==='undefined')return 'auto';
  try{
    return resolveQualityProfile(new URLSearchParams(window.location.search).get('quality'),'auto');
  }catch{
    return 'auto';
  }
}

const listeners=new Set();
const resolutionListeners=new Set();
let current=readInitialProfile();
let active=current==='auto'?'high':current;
let frameEmaMs=16.7;
let slowScore=0;
let fastScore=0;
let autoReason=current==='auto'?'startup-high':'manual';
let autoResolutionScale=1;
let autoResolutionReason=current==='auto'?'startup-native':'manual';
let lastSwitchAt=0;
let lastResolutionChangeAt=0;

const downThreshold=Object.freeze({high:20.5,medium:25.0,low:30.0});
const upThreshold=Object.freeze({high:-Infinity,medium:15.7,low:17.2});

function now(){
  return globalThis.performance?.now?.()??Date.now();
}
function clamp(value,min,max){
  return Math.max(min,Math.min(max,value));
}
function autoResolutionFloor(profile=active){
  return AUTO_RESOLUTION_FLOOR[profile]??1;
}
function notify(){
  const settings=QUALITY_PROFILES[active];
  for(const listener of listeners)listener(settings,current);
}
function notifyResolution(){
  for(const listener of resolutionListeners)listener(autoResolutionScale,current,active);
}
function setAutoResolutionScale(next,reason,stamp=now()){
  if(current!=='auto')return false;
  const floor=autoResolutionFloor();
  const normalized=clamp(Number(next)||1,floor,1);
  if(Math.abs(normalized-autoResolutionScale)<.005)return false;
  autoResolutionScale=normalized;
  autoResolutionReason=reason;
  lastResolutionChangeAt=stamp;
  slowScore=0;
  fastScore=0;
  notifyResolution();
  return true;
}
function switchAutoProfile(next,reason,stamp=now(),nextResolutionScale=autoResolutionScale){
  if(current!=='auto'||next===active||!PROFILE_ORDER.includes(next))return false;
  active=next;
  autoReason=reason;
  slowScore=0;
  fastScore=0;
  lastSwitchAt=stamp;
  const floor=autoResolutionFloor(next);
  const normalizedScale=clamp(Number(nextResolutionScale)||1,floor,1);
  const resolutionChanged=Math.abs(normalizedScale-autoResolutionScale)>=.005;
  autoResolutionScale=normalizedScale;
  if(resolutionChanged){
    autoResolutionReason='profile-transition-balance';
    lastResolutionChangeAt=stamp;
  }
  notify();
  if(resolutionChanged)notifyResolution();
  return true;
}

export const quality={
  get current(){return current;},
  get active(){return active;},
  getSettings(){return QUALITY_PROFILES[active];},
  getResolutionScale(){return current==='auto'?autoResolutionScale:1;},
  getPixelRatio(nativeDpr=1){
    const native=Math.max(.5,Number(nativeDpr)||1);
    const cap=Math.min(native,QUALITY_PROFILES[active].dprCap);
    if(current!=='auto')return cap;
    return Math.min(native,Math.max(.75,cap*autoResolutionScale));
  },
  getDiagnostics(){
    return {
      qualityMode:current,
      activeQualityProfile:active,
      autoQualityProfile:current==='auto'?active:null,
      autoQualityReason:autoReason,
      autoFrameEmaMs:Math.round(frameEmaMs*100)/100,
      autoSlowScore:Math.round(slowScore*10)/10,
      autoFastScore:Math.round(fastScore*10)/10,
      autoResolutionScale:current==='auto'?Math.round(autoResolutionScale*1000)/1000:1,
      autoResolutionFloor:current==='auto'?autoResolutionFloor():1,
      autoResolutionReason,
      effectiveDprCap:Math.round(QUALITY_PROFILES[active].dprCap*(current==='auto'?autoResolutionScale:1)*1000)/1000
    };
  },
  setProfile(profile){
    const next=resolveQualityProfile(profile,current);
    if(next===current)return QUALITY_PROFILES[active];
    current=next;
    if(next==='auto'){
      active='high';
      autoReason='manual-auto-start-high';
      autoResolutionScale=1;
      autoResolutionReason='manual-auto-native';
      slowScore=0;
      fastScore=0;
      lastSwitchAt=now();
      lastResolutionChangeAt=lastSwitchAt;
    }else{
      active=next;
      autoReason='manual';
      autoResolutionScale=1;
      autoResolutionReason='manual';
      slowScore=0;
      fastScore=0;
    }
    notify();
    notifyResolution();
    return QUALITY_PROFILES[active];
  },
  observeFrame(frameMs,stamp=now()){
    const sample=Number(frameMs);
    if(current!=='auto'||!Number.isFinite(sample)||sample<=0||sample>100)return active;
    if(typeof document!=='undefined'&&document.hidden)return active;

    frameEmaMs=frameEmaMs*.94+sample*.06;
    const profileElapsed=Math.max(0,stamp-lastSwitchAt);
    const resolutionElapsed=Math.max(0,stamp-lastResolutionChangeAt);
    const index=PROFILE_ORDER.indexOf(active);
    const isSlow=frameEmaMs>downThreshold[active];
    const isFast=frameEmaMs<upThreshold[active];

    if(isSlow){
      slowScore+=1;
      fastScore=Math.max(0,fastScore-1.5);

      if(
        slowScore>=AUTO_RESOLUTION_DOWN_SCORE&&
        resolutionElapsed>=AUTO_RESOLUTION_DOWN_COOLDOWN_MS&&
        autoResolutionScale>autoResolutionFloor()+.005
      ){
        setAutoResolutionScale(
          autoResolutionScale-AUTO_RESOLUTION_STEP_DOWN,
          `sustained-frame-time-${Math.round(frameEmaMs)}ms`,
          stamp
        );
        return active;
      }

      if(
        index<PROFILE_ORDER.length-1&&
        autoResolutionScale<=autoResolutionFloor()+.005&&
        slowScore>=AUTO_PROFILE_DOWN_SCORE&&
        profileElapsed>=AUTO_PROFILE_DOWN_COOLDOWN_MS
      ){
        switchAutoProfile(
          PROFILE_ORDER[index+1],
          `sustained-frame-time-${Math.round(frameEmaMs)}ms`,
          stamp,
          Math.min(1,autoResolutionScale+.10)
        );
      }
      return active;
    }

    slowScore=Math.max(0,slowScore-.45);
    if(isFast)fastScore+=1;
    else fastScore=Math.max(0,fastScore-.65);

    if(
      isFast&&
      autoResolutionScale<.995&&
      fastScore>=AUTO_RESOLUTION_UP_SCORE&&
      resolutionElapsed>=AUTO_RESOLUTION_UP_COOLDOWN_MS
    ){
      setAutoResolutionScale(
        autoResolutionScale+AUTO_RESOLUTION_STEP_UP,
        `sustained-headroom-${Math.round(frameEmaMs)}ms`,
        stamp
      );
      return active;
    }

    if(
      isFast&&
      index>0&&
      autoResolutionScale>=.995&&
      fastScore>=AUTO_PROFILE_UP_SCORE&&
      profileElapsed>=AUTO_PROFILE_UP_COOLDOWN_MS
    ){
      const next=PROFILE_ORDER[index-1];
      switchAutoProfile(
        next,
        `sustained-headroom-${Math.round(frameEmaMs)}ms`,
        stamp,
        Math.max(autoResolutionFloor(next),.92)
      );
    }
    return active;
  },
  subscribe(listener,{immediate=false}={}){
    if(typeof listener!=='function')throw new TypeError('quality subscriber must be a function');
    listeners.add(listener);
    if(immediate)listener(QUALITY_PROFILES[active],current);
    return ()=>listeners.delete(listener);
  },
  subscribeResolution(listener,{immediate=false}={}){
    if(typeof listener!=='function')throw new TypeError('quality resolution subscriber must be a function');
    resolutionListeners.add(listener);
    if(immediate)listener(autoResolutionScale,current,active);
    return ()=>resolutionListeners.delete(listener);
  }
};

export function qualityCount(capacity,density,min=1){
  const max=Math.max(0,Math.floor(Number(capacity)||0));
  if(max===0)return 0;
  const scaled=Math.round(max*Math.max(0,Math.min(1,Number(density)||0)));
  return Math.max(Math.min(max,Math.floor(min)||0),Math.min(max,scaled));
}
