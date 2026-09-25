import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeEnvironmentQuality} from '../src/environmentQuality.js';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const env=read('../src/environment.js');
const snow=read('../src/snowMaterial.js');
const particles=read('../src/snowParticles.js');
const surface=read('../src/snowSurfaceDetail.js');
const boundary=read('../src/boundaryMarkers.js');
const flybys=read('../src/ambientFlybys.js');
const premium=read('../src/premiumObstacles.js');
const sky=read('../src/alpineSky.js');
const landscape=read('../src/alpineLandscape.js');
const courseSurface=read('../src/courseSurfaceVisuals.js');
const main=read('../src/main.js');

const defaults=normalizeEnvironmentQuality();
assert.deepEqual(defaults,{
  decorativeDensity:1,
  distantSceneryDetail:1,
  snowDetailLevel:1
});
const clamped=normalizeEnvironmentQuality({
  decorativeDensity:-2,
  distantSceneryDetail:.35,
  snowDetailLevel:4
});
assert.equal(clamped.decorativeDensity,0);
assert.equal(clamped.distantSceneryDetail,.35);
assert.equal(clamped.snowDetailLevel,1);

assert(
  premium.includes("root.userData.visualPrototype='premium-bare-'+kind")&&
  premium.includes("trees:Array.from({length:4}"),
  'shared gameplay tree prototype polish missing'
);
assert(
  premium.includes("rocks:Array.from({length:4}")&&premium.includes('function makeRock(variant)'),
  'rock prototype polish missing'
);
assert(
  courseSurface.includes('function rampSurface()')&&
  courseSurface.includes("visualPrototype='competition-tech-kicker-v6-hdr'")&&
  courseSurface.includes('export function createRampVisual()')&&
  courseSurface.includes('underglow')&&
  courseSurface.includes('bloom')&&
  main.includes("import {createOilVisual,createRampVisual} from './courseSurfaceVisuals.js'")&&
  main.includes('const g=createRampVisual();'),
  'competition ramp readability prototype/integration missing'
);
assert(
  premium.includes('log:makeLog(false),wideLog:makeLog(true)')&&
  premium.includes('return library??='),
  'shared log prototypes are missing'
);
assert(!premium.includes('_logKnotGeometry'),'per-log knot component geometry returned');
assert(!premium.includes('_logBandGeometry'),'per-log band component geometry returned');
assert(env.includes('setQualityProfile'),'environment quality hook missing');
assert(sky.includes('uniform float time,sceneryDetail'),'skyline quality hook missing');
assert(
  env.includes('landscape.setDetail(environmentQuality.distantSceneryDetail)')&&
  landscape.includes('function setDetail(value)'),
  'distant alpine scenery is not quality-scaled'
);
assert(!env.includes("import {createMountainBands} from './mountainBands.js'"),'heavy mountain runtime import returned');
assert(env.includes('realtimeDirectionalLights:3'),'lighting rig should remain limited to sun, rim and one useful fill');
assert(landscape.includes('forestChunkCount=6'),'distant forest must stay coarsely chunked for frustum culling');
assert(landscape.includes('mesh.frustumCulled=true'),'distant scenery frustum culling is not enabled');
assert(landscape.includes('computeBoundingSphere()'),'dynamic scenery chunks must refresh their culling bounds');

assert(snow.includes('setDetailLevel'),'snow material detail hook missing');
assert(particles.includes('setDensityMultiplier'),'snow particle density hook missing');
assert(surface.includes('setDetailLevel'),'snow surface detail hook missing');
assert(boundary.includes('woodTexture=null'),'fence does not consume shared wood texture');
assert(boundary.includes('setDecorativeShadows'),'fence shadow quality hook missing');
assert(
  flybys.includes('const prototypes={')&&
  flybys.includes('plane:makePlane()')&&
  flybys.includes('birds:makeBirdFlock()')&&
  flybys.includes('zeppelin:makeZeppelin()')&&
  flybys.includes('ufo:makeUfo()')&&
  flybys.includes('fighter:makeFighter()'),
  'ambient flybys do not reuse shared prototypes'
);
assert(flybys.includes('sharedPrototypeCount:Object.keys(prototypes).length'),'ambient flyby diagnostics missing shared resource count');

console.log(JSON.stringify({
  check:'environment-visual-invariants',
  qualityHooks:Object.keys(defaults),
  sharedFlybyPrototypes:5,
  skyline:'shader-side-ridges',
  heavyMountainGeometry:false
}));
