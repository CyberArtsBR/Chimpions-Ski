import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createBoundaryMarkers} from '../src/boundaryMarkers.js';
import {createRampVisual} from '../src/courseSurfaceVisuals.js';
import {createFallbackSkier} from '../src/skier.js';

const luminance=color=>color.r*.2126+color.g*.7152+color.b*.0722;
const threshold=1.55;
const world=new THREE.Group();
const fences=createBoundaryMarkers({world,terrainHeight:()=>0,woodTexture:new THREE.Texture(),countPerSide:2});
const highlights=world.children.filter(mesh=>mesh.material?.color?.b>5);
assert.equal(highlights.length,2,'fences need bloom accents on both posts and rails');
for(const mesh of highlights){
  mesh.geometry.computeBoundingBox();
  assert(mesh.geometry.boundingBox.getSize(new THREE.Vector3()).x<.025,'a fence bloom accent covers more than a narrow line');
  assert(luminance(mesh.material.color)>threshold,'fence bloom accent cannot cross the HDR threshold');
}
assert(highlights.some(mesh=>mesh.geometry.boundingBox.getSize(new THREE.Vector3()).y>1.7),'fence posts must glow from base to cap');
assert(luminance(fences.ledCoreMaterial.color)<threshold,'the main blue LED blooms into a white bar');
assert(luminance(fences.ledCoreMaterial.color)>.40,'fence core cannot be seen at a distance');

const ramp=createRampVisual();
const rampHighlight=ramp.children.filter(mesh=>mesh.material?.color?.b>5);
assert.equal(rampHighlight.length,1,'ramps need an HDR outline visible from afar');
const rampAccent=rampHighlight[0];
rampAccent.geometry.computeBoundingBox();
assert(rampAccent.geometry.boundingBox.getSize(new THREE.Vector3()).z>2.8,'ramp HDR outline must run the full length');
assert(luminance(rampAccent.material.color)>threshold*2,'ramp HDR outline must reach the distant bloom pass');
assert(rampAccent.material.color.b>rampAccent.material.color.g*5,'ramp bloom must remain blue');

for(const mode of ['ski','snowboard']){
  const rider=createFallbackSkier({rideMode:mode});
  const equipment=mode==='ski'?rider.userData.skis:rider.getObjectByName('snowboard-equipment').children;
  const strips=[];
  for(const item of equipment)item.traverse(mesh=>{
    if(mesh.isMesh&&mesh.material?.color?.b>5)strips.push(mesh);
  });
  assert.equal(strips.length,2,`${mode} needs two narrow special-bloom accents`);
  assert(strips.every(mesh=>!mesh.visible),`${mode} blooms before the special is ready`);
  rider.userData.setPowerGlow(1,0);
  assert(strips.every(mesh=>mesh.visible&&luminance(mesh.material.color)>threshold),`${mode} does not bloom when the special is ready`);
  rider.userData.setPowerGlow(0,0);
  assert(strips.every(mesh=>!mesh.visible),`${mode} keeps blooming after the special ends`);
}

console.log('Blue bloom invariants OK');
