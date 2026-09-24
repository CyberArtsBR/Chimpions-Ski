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

const defaults=normalizeEnvironmentQuality();
assert.deepEqual(defaults,{
  particleDensityMultiplier:1,
  decorativeDensity:1,
  distantSceneryDetail:1,
  decorativeShadows:true,
  snowDetailLevel:1
});
const clamped=normalizeEnvironmentQuality({
  particleDensityMultiplier:9,
  decorativeDensity:-2,
  distantSceneryDetail:.35,
  decorativeShadows:false,
  snowDetailLevel:4
});
assert.equal(clamped.particleDensityMultiplier,1.5);
assert.equal(clamped.decorativeDensity,0);
assert.equal(clamped.distantSceneryDetail,.35);
assert.equal(clamped.decorativeShadows,false);
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
assert(env.includes("visualPrototype='readable-ramp-v2'"),'ramp readability prototype missing');
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

assert(snow.includes('setDetailLevel'),'snow material detail hook missing');
assert(particles.includes('setDensityMultiplier'),'snow particle density hook missing');
assert(surface.includes('setDetailLevel'),'snow surface detail hook missing');
assert(boundary.includes('woodTexture=null'),'fence does not consume shared wood texture');
assert(boundary.includes('setDecorativeShadows'),'fence shadow quality hook missing');
assert(flybys.includes('const prototypes={plane:makePlane(),ufo:makeUfo()}'),'ambient flybys do not reuse shared prototypes');
assert(flybys.includes('sharedPrototypeCount:2'),'ambient flyby diagnostics missing shared resource count');

console.log(JSON.stringify({
  check:'environment-visual-invariants',
  qualityHooks:Object.keys(defaults),
  sharedFlybyPrototypes:2,
  skyline:'shader-side-ridges',
  heavyMountainGeometry:false
}));
