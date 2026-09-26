const clamp01=value=>Math.max(0,Math.min(1,Number(value)||0));

export const ALPINE_SECTOR_LENGTH=180;
export const ALPINE_SECTOR_BLEND_METERS=28;

export const ALPINE_BIOMES=Object.freeze([
  Object.freeze({id:'high-ridge',label:'High Alpine Ridge',style:'ridge',forestDensity:.18,infrastructureDensity:.28,landmarkDensity:.78,mountainScale:1.18,ice:.08,warmth:.08,lights:.16,clearing:1}),
  Object.freeze({id:'pine-basin',label:'Dense Pine Basin',style:'forest',forestDensity:1.18,infrastructureDensity:.24,landmarkDensity:.40,mountainScale:.96,ice:.02,warmth:.10,lights:.10,clearing:.26}),
  Object.freeze({id:'blue-glacier',label:'Blue Ice Wall',style:'glacier',forestDensity:.12,infrastructureDensity:.16,landmarkDensity:1.0,mountainScale:1.12,ice:1,warmth:.02,lights:.18,clearing:.92}),
  Object.freeze({id:'lodge-quarter',label:'Mountain Lodge Sector',style:'lodge',forestDensity:.52,infrastructureDensity:1.12,landmarkDensity:.94,mountainScale:.90,ice:.03,warmth:1,lights:.88,clearing:.74}),
  Object.freeze({id:'lift-crossing',label:'Lift Station Crossing',style:'lift',forestDensity:.44,infrastructureDensity:1.20,landmarkDensity:.90,mountainScale:.92,ice:.04,warmth:.44,lights:.62,clearing:.82}),
  Object.freeze({id:'competition',label:'Floodlit Competition Sector',style:'competition',forestDensity:.22,infrastructureDensity:.92,landmarkDensity:1,mountainScale:.88,ice:.02,warmth:.26,lights:1,clearing:1}),
  Object.freeze({id:'rescue-outpost',label:'Remote Rescue Station',style:'rescue',forestDensity:.34,infrastructureDensity:.74,landmarkDensity:.82,mountainScale:1.04,ice:.08,warmth:.62,lights:.70,clearing:.82}),
  Object.freeze({id:'rock-massif',label:'Broken Rock Massif',style:'massif',forestDensity:.20,infrastructureDensity:.14,landmarkDensity:.92,mountainScale:1.28,ice:.04,warmth:.04,lights:.06,clearing:.96}),
  Object.freeze({id:'whiteout',label:'Whiteout Traverse',style:'whiteout',forestDensity:.16,infrastructureDensity:.52,landmarkDensity:.54,mountainScale:.92,ice:.14,warmth:.06,lights:.56,clearing:1}),
  Object.freeze({id:'moon-glacier',label:'Moonlit Glacial Valley',style:'moon-glacier',forestDensity:.10,infrastructureDensity:.22,landmarkDensity:.92,mountainScale:1.14,ice:.92,warmth:.12,lights:.76,clearing:.95}),
  Object.freeze({id:'golden-panorama',label:'Golden Panorama',style:'panorama',forestDensity:.38,infrastructureDensity:.42,landmarkDensity:.72,mountainScale:1.20,ice:.06,warmth:.82,lights:.30,clearing:.86})
]);

const BY_ID=new Map(ALPINE_BIOMES.map(entry=>[entry.id,entry]));
const AUTHORED_SEQUENCE=Object.freeze([
  'high-ridge','pine-basin','blue-glacier','lodge-quarter','lift-crossing','competition',
  'rescue-outpost','rock-massif','whiteout','moon-glacier','golden-panorama','pine-basin',
  'high-ridge','lift-crossing','blue-glacier','rescue-outpost'
]);

function hash32(value){
  let x=(value|0)+0x9e3779b9;
  x=Math.imul(x^(x>>>16),0x21f0aaad);
  x=Math.imul(x^(x>>>15),0x735a2d97);
  return (x^(x>>>15))>>>0;
}

function sectorForIndex(index){
  const n=Math.max(0,index|0);
  if(n<AUTHORED_SEQUENCE.length)return BY_ID.get(AUTHORED_SEQUENCE[n]);
  const a=hash32(n),b=hash32(n-1);
  let pick=(a+n*3)%ALPINE_BIOMES.length;
  const previous=(b+(n-1)*3)%ALPINE_BIOMES.length;
  if(pick===previous)pick=(pick+3)%ALPINE_BIOMES.length;
  return ALPINE_BIOMES[pick];
}

function weatherIdentity(weather={}){
  const preset=String(weather.preset||weather.mode||'day');
  const night=clamp01(weather.night);
  const storm=clamp01(Math.max(Number(weather.rain)||0,(Number(weather.cloud)||0)-.45));
  const snow=clamp01(weather.snowfall);
  const wet=clamp01(weather.wet);
  const visibility=clamp01(1-(Number(weather.fogDensity)||0)*34-storm*.14-snow*.12);
  return Object.freeze({preset,night,storm,snow,wet,visibility});
}

export function createAlpineBiomeDirector(){
  let detail=1;
  let weather=weatherIdentity();
  let lastSector=-1;
  let state=null;

  function getSector(index){return sectorForIndex(index);}
  function setDetail(value=1){detail=clamp01(value);return detail;}
  function setWeatherState(next={}){weather=weatherIdentity(next);return weather;}
  function sample(travel=0,runTime=0){
    const meters=Math.max(0,Number(travel)||0);
    const sectorIndex=Math.floor(meters/ALPINE_SECTOR_LENGTH);
    const local=meters-sectorIndex*ALPINE_SECTOR_LENGTH;
    const current=getSector(sectorIndex),next=getSector(sectorIndex+1);
    const blendStart=ALPINE_SECTOR_LENGTH-ALPINE_SECTOR_BLEND_METERS;
    const blend=clamp01((local-blendStart)/ALPINE_SECTOR_BLEND_METERS);
    const presentation=Object.freeze({
      ...current,
      sectorIndex,
      nextId:next.id,
      transition:blend,
      detail,
      runTime:Math.max(0,Number(runTime)||0),
      weather
    });
    state=presentation;
    lastSector=sectorIndex;
    return presentation;
  }
  function update(travel=0,runTime=0){return sample(travel,runTime);}
  function reset(){lastSector=-1;state=null;return sample(0,0);}
  function getDiagnostics(){
    const current=state||sample(0,0);
    return {
      sectorIndex:lastSector,
      biome:current.id,
      nextBiome:current.nextId,
      sectorMeters:ALPINE_SECTOR_LENGTH,
      transition:current.transition,
      detail,
      weatherPreset:weather.preset,
      authoredBiomeCount:ALPINE_BIOMES.length
    };
  }
  reset();
  return {update,reset,setDetail,setWeatherState,getSector,getState:()=>state,getDiagnostics};
}
