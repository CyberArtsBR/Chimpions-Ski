const PROFILE_NAMES=Object.freeze(['high','reduced']);

const HIGH=Object.freeze({
  profile:'high',
  dprCap:1.75,
  shadowMapSize:4096,
  decorativeShadowCasting:true,
  snowLayerDensity:1,
  snowParticleDensity:1,
  snowSurfaceDetailDensity:1,
  environmentDecorationDensity:1,
  crowdMaxSpectators:50,
  distantSceneryUpdateHz:0
});

const REDUCED=Object.freeze({
  profile:'reduced',
  dprCap:1.15,
  shadowMapSize:2048,
  decorativeShadowCasting:false,
  snowLayerDensity:.48,
  snowParticleDensity:.50,
  snowSurfaceDetailDensity:.55,
  environmentDecorationDensity:.58,
  crowdMaxSpectators:24,
  distantSceneryUpdateHz:30
});

export const QUALITY_PROFILES=Object.freeze({high:HIGH,reduced:REDUCED});
export const QUALITY_PROFILE_NAMES=PROFILE_NAMES;

export function resolveQualityProfile(value,fallback='high'){
  const normalized=String(value??'').trim().toLowerCase();
  if(PROFILE_NAMES.includes(normalized))return normalized;
  return PROFILE_NAMES.includes(fallback)?fallback:'high';
}

function readInitialProfile(){
  if(typeof window==='undefined')return 'high';
  try{
    return resolveQualityProfile(new URLSearchParams(window.location.search).get('quality'),'high');
  }catch{
    return 'high';
  }
}

let current=readInitialProfile();
const listeners=new Set();

export const quality={
  get current(){return current;},
  getSettings(){return QUALITY_PROFILES[current];},
  setProfile(profile){
    const next=resolveQualityProfile(profile,current);
    if(next===current)return QUALITY_PROFILES[current];
    current=next;
    const settings=QUALITY_PROFILES[current];
    for(const listener of listeners)listener(settings,current);
    return settings;
  },
  subscribe(listener,{immediate=false}={}){
    if(typeof listener!=='function')throw new TypeError('quality subscriber must be a function');
    listeners.add(listener);
    if(immediate)listener(QUALITY_PROFILES[current],current);
    return ()=>listeners.delete(listener);
  }
};

export function qualityCount(capacity,density,min=1){
  const max=Math.max(0,Math.floor(Number(capacity)||0));
  if(max===0)return 0;
  const scaled=Math.round(max*Math.max(0,Math.min(1,Number(density)||0)));
  return Math.max(Math.min(max,Math.floor(min)||0),Math.min(max,scaled));
}
