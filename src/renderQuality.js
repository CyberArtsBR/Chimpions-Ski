const MODE_NAMES=Object.freeze(['auto','high','medium','low']);
const PROFILE_ORDER=Object.freeze(['high','medium','low']);

const HIGH=Object.freeze({
  profile:'high',
  dprCap:1.50,
  shadowMapSize:2048,
  decorativeShadowCasting:true,
  snowLayerDensity:1,
  snowParticleDensity:.88,
  snowSurfaceDetailDensity:1,
  environmentDecorationDensity:1,
  distantSceneryDetail:1,
  crowdMaxSpectators:42,
  distantSceneryUpdateHz:0
});

const MEDIUM=Object.freeze({
  profile:'medium',
  dprCap:1.15,
  shadowMapSize:1024,
  decorativeShadowCasting:false,
  snowLayerDensity:.66,
  snowParticleDensity:.58,
  snowSurfaceDetailDensity:.72,
  environmentDecorationDensity:.72,
  distantSceneryDetail:.74,
  crowdMaxSpectators:28,
  distantSceneryUpdateHz:30
});

const LOW=Object.freeze({
  profile:'low',
  dprCap:.90,
  shadowMapSize:512,
  decorativeShadowCasting:false,
  snowLayerDensity:.38,
  snowParticleDensity:.34,
  snowSurfaceDetailDensity:.48,
  environmentDecorationDensity:.48,
  distantSceneryDetail:.52,
  crowdMaxSpectators:18,
  distantSceneryUpdateHz:18
});

export const QUALITY_PROFILES=Object.freeze({high:HIGH,medium:MEDIUM,low:LOW});
export const QUALITY_PROFILE_NAMES=MODE_NAMES;

export function resolveQualityProfile(value,fallback='auto'){
  const normalized=String(value??'').trim().toLowerCase();
  if(MODE_NAMES.includes(normalized))return normalized;
  return MODE_NAMES.includes(fallback)?fallback:'auto';
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
let current=readInitialProfile();
let active=current==='auto'?'high':current;
let frameEmaMs=16.7;
let slowScore=0;
let fastScore=0;
let autoReason=current==='auto'?'startup-high':'manual';
let lastSwitchAt=0;

const downThreshold=Object.freeze({high:20.5,medium:25.0,low:Infinity});
const upThreshold=Object.freeze({high:-Infinity,medium:15.7,low:17.2});

function now(){
  return globalThis.performance?.now?.()??Date.now();
}
function notify(){
  const settings=QUALITY_PROFILES[active];
  for(const listener of listeners)listener(settings,current);
}
function switchAutoProfile(next,reason,stamp=now()){
  if(current!=='auto'||next===active||!PROFILE_ORDER.includes(next))return false;
  active=next;
  autoReason=reason;
  slowScore=0;
  fastScore=0;
  lastSwitchAt=stamp;
  notify();
  return true;
}

export const quality={
  get current(){return current;},
  get active(){return active;},
  getSettings(){return QUALITY_PROFILES[active];},
  getDiagnostics(){
    return {
      qualityMode:current,
      activeQualityProfile:active,
      autoQualityProfile:current==='auto'?active:null,
      autoQualityReason:autoReason,
      autoFrameEmaMs:Math.round(frameEmaMs*100)/100,
      autoSlowScore:Math.round(slowScore*10)/10,
      autoFastScore:Math.round(fastScore*10)/10
    };
  },
  setProfile(profile){
    const next=resolveQualityProfile(profile,current);
    if(next===current)return QUALITY_PROFILES[active];
    current=next;
    if(next==='auto'){
      active='high';
      autoReason='manual-auto-start-high';
      slowScore=0;
      fastScore=0;
      lastSwitchAt=now();
    }else{
      active=next;
      autoReason='manual';
      slowScore=0;
      fastScore=0;
    }
    notify();
    return QUALITY_PROFILES[active];
  },
  observeFrame(frameMs,stamp=now()){
    const sample=Number(frameMs);
    if(current!=='auto'||!Number.isFinite(sample)||sample<=0||sample>100)return active;
    frameEmaMs=frameEmaMs*.94+sample*.06;
    const elapsed=Math.max(0,stamp-lastSwitchAt);
    const index=PROFILE_ORDER.indexOf(active);

    if(frameEmaMs>downThreshold[active]){
      slowScore+=1;
      fastScore=Math.max(0,fastScore-1.5);
    }else{
      slowScore=Math.max(0,slowScore-.45);
      if(frameEmaMs<upThreshold[active])fastScore+=1;
      else fastScore=Math.max(0,fastScore-.65);
    }

    if(index<PROFILE_ORDER.length-1&&slowScore>=120&&elapsed>=3500){
      switchAutoProfile(PROFILE_ORDER[index+1],`sustained-frame-time-${Math.round(frameEmaMs)}ms`,stamp);
    }else if(index>0&&fastScore>=480&&elapsed>=12000){
      switchAutoProfile(PROFILE_ORDER[index-1],`sustained-headroom-${Math.round(frameEmaMs)}ms`,stamp);
    }
    return active;
  },
  subscribe(listener,{immediate=false}={}){
    if(typeof listener!=='function')throw new TypeError('quality subscriber must be a function');
    listeners.add(listener);
    if(immediate)listener(QUALITY_PROFILES[active],current);
    return ()=>listeners.delete(listener);
  }
};

export function qualityCount(capacity,density,min=1){
  const max=Math.max(0,Math.floor(Number(capacity)||0));
  if(max===0)return 0;
  const scaled=Math.round(max*Math.max(0,Math.min(1,Number(density)||0)));
  return Math.max(Math.min(max,Math.floor(min)||0),Math.min(max,scaled));
}
