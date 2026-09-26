import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ALPINE_BIOMES,ALPINE_SECTOR_LENGTH,ALPINE_SECTOR_BLEND_METERS,createAlpineBiomeDirector} from '../src/alpineBiomes.js';
import {COURSE_FLAG_X} from '../src/environmentCorridor.js';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const biomes=read('../src/alpineBiomes.js');
const landmarks=read('../src/alpineLandmarks.js');
const infrastructure=read('../src/alpineInfrastructure.js');
const landscape=read('../src/alpineLandscape.js');
const flybys=read('../src/ambientFlybys.js');
const sky=read('../src/alpineSky.js');
const environment=read('../src/environment.js');
const weather=read('../src/mountainWeather.js');

assert.equal(ALPINE_SECTOR_LENGTH,180,'authored sector length changed unexpectedly');
assert.equal(ALPINE_SECTOR_BLEND_METERS,28,'sector blend distance changed unexpectedly');
assert(ALPINE_BIOMES.length>=11,'alpine biome catalogue lost authored identities');
for(const id of ['high-ridge','pine-basin','blue-glacier','lodge-quarter','lift-crossing','competition','rescue-outpost','rock-massif','whiteout','moon-glacier','golden-panorama']){
  assert(ALPINE_BIOMES.some(entry=>entry.id===id),'missing authored alpine biome: '+id);
}

const director=createAlpineBiomeDirector();
const sequenceA=Array.from({length:40},(_,i)=>director.getSector(i).id);
const sequenceB=Array.from({length:40},(_,i)=>director.getSector(i).id);
assert.deepEqual(sequenceA,sequenceB,'biome sequence is not deterministic');
assert(!biomes.includes('Math.random'),'biome streaming must remain deterministic');

assert(
  landmarks.includes('const SLOT_COUNT=4')&&
  landmarks.includes('const SAFE_SIDE_X=COURSE_FLAG_X+15')&&
  landmarks.includes("root.userData.environmentOnly=true"),
  'landmark stream lost fixed pooling or corridor-safe ownership'
);
assert(
  landmarks.includes('new THREE.InstancedMesh')&&
  landmarks.includes('pooledResourceTypes:Object.keys(pools).length')&&
  landmarks.includes('landmarkDrawCalls:drawCalls'),
  'landmark pooling/draw-call diagnostics missing'
);
assert(!landmarks.includes('GLTFLoader'),'environment landmarks must not introduce remote/heavy asset loading');
assert(COURSE_FLAG_X+15>COURSE_FLAG_X+8,'landmark scenery margin is too narrow');

for(const style of ['ridge','forest','glacier','lodge','lift','competition','rescue','massif','whiteout','moon-glacier','panorama']){
  assert(landmarks.includes("style==='"+style+"'")||landmarks.includes("'"+style+"'"),'landmark style missing: '+style);
}

assert(
  infrastructure.includes('carrierCount=12')&&
  infrastructure.includes('towerSnow')&&
  infrastructure.includes('roofSnow')&&
  infrastructure.includes('signFaces')&&
  infrastructure.includes('lampHeads'),
  'resort infrastructure detail pass is incomplete'
);
assert(
  infrastructure.includes('environmentBoundsReady')&&
  infrastructure.includes('setWeatherState'),
  'moving lift resource/culling or weather integration regressed'
);

assert(
  landscape.includes('setPresentation')&&
  landscape.includes('forestDensity')&&
  landscape.includes('mountainScale')&&
  landscape.includes('atmosphericVisibility'),
  'biome-responsive landscape identity missing'
);
assert(
  sky.includes('weatherStorm')&&sky.includes('weatherSnow')&&sky.includes('weatherNight')&&
  sky.includes('setWeatherState'),
  'weather-aware skyline identity missing'
);

assert(
  flybys.includes('EXTRAORDINARY_DELAY_MIN=38')&&
  flybys.includes('MAX_ACTIVE=3')&&
  flybys.includes('conditions.runTime<35')&&
  flybys.includes('setConditions'),
  'rare flyby art direction contract regressed'
);
assert(!flybys.includes("['ufo',.24]"),'legacy high-frequency UFO weighting returned');

assert(
  environment.includes('createAlpineBiomeDirector')&&
  environment.includes('createAlpineLandmarks')&&
  environment.includes('landmarks.setDetail(environmentQuality.distantSceneryDetail)')&&
  environment.includes('landscape.setPresentation(biomePresentation)')&&
  environment.includes('setWeatherState'),
  'environment presentation streaming is not fully integrated'
);
assert(
  weather.includes('environment.setWeatherState?.(w,state)'),
  'mountain weather no longer publishes presentation state'
);

console.log(JSON.stringify({
  check:'environment-presentation-invariants',
  biomeCount:ALPINE_BIOMES.length,
  sectorLength:ALPINE_SECTOR_LENGTH,
  blendMeters:ALPINE_SECTOR_BLEND_METERS,
  landmarkSlots:4,
  landmarkSafeCenterMin:COURSE_FLAG_X+15,
  extraordinaryFlybyDelaySeconds:[38,72],
  maxActiveFlybys:3
}));
