import assert from 'node:assert/strict';
import * as THREE from 'three';
import {terrainHeight} from '../src/terrainContact.js';
import {createSkiTrails} from '../src/snowTrails.js';
import {createSnowParticles} from '../src/snowParticles.js';

for(const z of [-12,-80,-160]){
  for(const side of [-1,1]){
    const edge=terrainHeight(side*13.8,z);
    assert(Math.abs(terrainHeight(side*13.801,z)-edge)<.002,'off-piste shoulder has a seam at the flags');
  }
  assert(Number.isFinite(terrainHeight(-120,z))&&Number.isFinite(terrainHeight(120,z)),'outer snow terrain is invalid');
}

const tracks=createSkiTrails({world:new THREE.Group(),terrainHeight:()=>0,capacity:8});
tracks.emit({x:0,z:2.3,travel:0,rideMode:'snowboard'});
tracks.emit({x:.12,z:1.8,travel:.5,edge:.9,rideMode:'snowboard'});
const geometry=tracks.mesh.geometry;
const position=geometry.getAttribute('position');
const alpha=geometry.getAttribute('aAlpha');
assert.equal(geometry.index.count,16*36,'track mesh topology exceeded its bounded pool');
assert([...geometry.index.array].every(index=>index<position.count),'track mesh contains an out-of-range vertex');
assert(alpha.array.slice(0,14).every(value=>value>0),'the snowboard segment was not emitted');
assert(position.getY(1)>position.getY(3)+.045,'snow was not displaced into the berm');
tracks.update(1/60,40);
assert(Math.abs(position.getZ(3)-2.78-40/60)<.02,'snow marks did not move with the course');
tracks.reset();
assert(alpha.array.every(value=>value===0),'snow marks survived a restart');
tracks.emit({x:0,z:2.3,travel:0,rideMode:'ski'});
tracks.emit({x:0,z:1.8,travel:.5,rideMode:'ski'});
assert(alpha.array[0]>0&&alpha.array[8*14]>0,'two skis must leave separate grooves');

const particles=createSnowParticles({scene:new THREE.Scene(),densityMultiplier:0});
particles.setDensityMultiplier(.72);
for(let i=0;i<120;i++){
  particles.spray(1/60,12,0,2.2,55,.82,false,0,true,'snowboard');
  particles.update(1/60,55);
}
assert(particles.getDiagnostics().active>0,'powder spray stays disabled while carving');
particles.reset();
assert.equal(particles.getDiagnostics().active,0,'powder particles survived a restart');

console.log('Powder snow invariants OK');
