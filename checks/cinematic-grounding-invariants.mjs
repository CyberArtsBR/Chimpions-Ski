import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createCinematicGrounding} from '../src/cinematicGrounding.js';
import {QUALITY_PROFILES} from '../src/renderQuality.js';

const pipeline=readFileSync(new URL('../src/renderPipeline.js',import.meta.url),'utf8');
const environment=readFileSync(new URL('../src/environment.js',import.meta.url),'utf8');

assert.equal(QUALITY_PROFILES.high.shadows,false,'HIGH must stay close to baseline shadow cost');
assert.equal(QUALITY_PROFILES.max.shadows,true,'MAX should own the near-field directional shadow');
assert(QUALITY_PROFILES.max.shadowMapSize<=2048,'MAX shadow map must stay bounded');
assert(QUALITY_PROFILES.max.shadowRadius<=24,'MAX shadow coverage must remain near-field');
assert(QUALITY_PROFILES.max.shadowUpdateHz>0&&QUALITY_PROFILES.max.shadowUpdateHz<=30,'MAX shadows must be throttled');
assert.equal(QUALITY_PROFILES.high.contactGrounding,true,'HIGH should retain cheap local grounding');
assert.equal(QUALITY_PROFILES.max.contactGrounding,true,'MAX should retain local grounding');
assert.equal(QUALITY_PROFILES.medium.contactGrounding,false,'MEDIUM cannot inherit cinematic grounding');
assert.equal(QUALITY_PROFILES.low.contactGrounding,false,'LOW cannot inherit cinematic grounding');

for(const profile of Object.values(QUALITY_PROFILES)){
  assert.equal(profile.ambientOcclusion,false,'GTAO must remain disabled');
  assert.equal(profile.screenSpaceReflections,false,'SSR must remain disabled');
}

assert(pipeline.includes('renderer.shadowMap.autoUpdate=false'),'shadow maps must be manually scheduled');
assert(pipeline.includes('scheduleShadowUpdate'),'shadow throttling scheduler missing');
assert(!pipeline.includes('GTAOPass'),'GTAO was reintroduced');
assert(!pipeline.includes('SSRPass'),'SSR was reintroduced');
assert(environment.includes('createCinematicGrounding'),'environment does not use the new grounding module');
assert(!environment.includes('makeContactShadow(scene)'),'legacy synthetic contact shadow returned');

const scene=new THREE.Scene();
const grounding=createCinematicGrounding({scene});
grounding.setProfile(QUALITY_PROFILES.high);
assert.equal(grounding.getDiagnostics().enabled,true);
assert.equal(grounding.getDiagnostics().renderTargets,0);
assert.equal(grounding.getDiagnostics().textureAllocations,0);
assert.equal(grounding.update({dt:1/60,x:0,y:.12,z:2.2,groundY:.12,running:true,rideMode:'ski'}),true);
assert.equal(grounding.mesh.visible,true);

grounding.setProfile(QUALITY_PROFILES.medium);
assert.equal(grounding.getDiagnostics().enabled,false);
assert.equal(grounding.mesh.visible,false);

const mesh=grounding.mesh;
grounding.dispose();
assert(!scene.children.includes(mesh),'grounding resources were not detached on dispose');

console.log(JSON.stringify({
  check:'cinematic-grounding-invariants',
  high:{
    shadows:QUALITY_PROFILES.high.shadows,
    contactGrounding:QUALITY_PROFILES.high.contactGrounding
  },
  max:{
    shadows:QUALITY_PROFILES.max.shadows,
    shadowMapSize:QUALITY_PROFILES.max.shadowMapSize,
    shadowRadius:QUALITY_PROFILES.max.shadowRadius,
    shadowUpdateHz:QUALITY_PROFILES.max.shadowUpdateHz,
    contactGrounding:QUALITY_PROFILES.max.contactGrounding
  }
}));
