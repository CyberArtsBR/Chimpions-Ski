import assert from 'node:assert/strict';
import * as THREE from 'three';
import {getPremiumObstacleLibrary} from '../src/premiumObstacles.js';
import {createOilVisual,createRampVisual} from '../src/courseSurfaceVisuals.js';
import {createBananaVisual} from '../src/collectibleVisuals.js';
import {OBSTACLE_TUNING} from '../src/obstacleTuning.js';

const halfExtents=object=>{
  object.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(object);
  const size=box.getSize(new THREE.Vector3());
  return {x:size.x*.5,y:size.y*.5,z:size.z*.5,box};
};
const meshCount=object=>{
  let count=0;
  object.traverse(node=>{if(node.isMesh)count++;});
  return count;
};

// Collision values are the immutable gameplay contract for this visual-only pass.
assert.equal(OBSTACLE_TUNING.log.collisionHalfWidth,1.34);
assert.equal(OBSTACLE_TUNING.log.radiusZ,.48);
assert.equal(OBSTACLE_TUNING.log.clearance,.60);
assert.equal(OBSTACLE_TUNING.wideLog.collisionHalfWidth,3.00);
assert.equal(OBSTACLE_TUNING.wideLog.radiusZ,.58);
assert.equal(OBSTACLE_TUNING.wideLog.clearance,.82);
assert.equal(OBSTACLE_TUNING.oil.collisionHalfWidth,1.92);
assert.equal(OBSTACLE_TUNING.oil.radiusZ,.74);
assert.equal(OBSTACLE_TUNING.oil.clearance,.10);

const library=getPremiumObstacleLibrary();
assert.equal(library.trees.length,4,'tree variant count changed');
assert.equal(library.rocks.length,4,'rock variant count changed');
assert.equal(library.logs.length,3,'log variant count changed');
assert.equal(library.wideLogs.length,3,'wide-log variant count changed');

// Preserve batch component counts: added snow/contact detail must merge into
// existing components rather than becoming a draw call per hazard.
for(const tree of library.trees)assert.equal(meshCount(tree),2,'tree batch component count increased');
for(const rock of library.rocks)assert.equal(meshCount(rock),1,'rock batch component count increased');
for(const log of library.logs)assert.equal(meshCount(log),3,'log batch component count increased');
for(const log of library.wideLogs)assert.equal(meshCount(log),3,'wide-log batch component count increased');

for(const tree of library.trees){
  const b=halfExtents(tree);
  assert(b.y>1.65,'tree lost its tall vertical read');
  assert(b.x<1.0&&b.z<1.0,'tree visual overhang became misleading versus collision');
}
for(const rock of library.rocks){
  const b=halfExtents(rock);
  assert(b.y>.37&&b.y<.55,'rock lost compact grounded silhouette');
  assert(b.x<.74&&b.z<.68,'rock visual overhang became misleading versus collision');
}
for(const log of library.logs){
  const b=halfExtents(log);
  assert(b.x<=OBSTACLE_TUNING.log.visualHalfWidth+.03,'log visual exceeds tuned visual half-width');
  assert(b.x>=OBSTACLE_TUNING.log.collisionHalfWidth,'log no longer communicates collision width');
  assert(b.z<=OBSTACLE_TUNING.log.radiusZ+.03,'log snow contact implies excessive depth');
}
for(const log of library.wideLogs){
  const b=halfExtents(log);
  assert(b.x<=OBSTACLE_TUNING.wideLog.visualHalfWidth+.03,'wide log visual exceeds tuned visual half-width');
  assert(b.x>=OBSTACLE_TUNING.wideLog.collisionHalfWidth,'wide log no longer communicates collision width');
  assert(b.z<=OBSTACLE_TUNING.wideLog.radiusZ+.03,'wide-log snow contact implies excessive depth');
}

const oil=createOilVisual();
assert.equal(meshCount(oil),1,'oil added a per-instance overlay draw call');
const oilBounds=halfExtents(oil);
assert(oilBounds.x<=OBSTACLE_TUNING.oil.visualHalfWidth+.01,'oil visual grew beyond tuned footprint');
assert(oilBounds.x>=OBSTACLE_TUNING.oil.collisionHalfWidth,'oil no longer covers its collision footprint');
const oilMesh=oil.children.find(node=>node.isMesh);
assert(oilMesh.material.roughness>=.40,'oil became mirror-like');
assert(oilMesh.material.clearcoat<=.45,'oil clearcoat became visually dominant');
assert.equal(oil.userData.visualRole,'hazard-oil');

const ramp=createRampVisual();
const rampBounds=halfExtents(ramp);
assert(rampBounds.x<1.30,'ramp visual implies a wider safe deck than runtime alignment');
assert(rampBounds.z<1.75,'ramp silhouette drifted beyond runtime ramp depth');
assert.equal(ramp.userData.visualRole,'safe-opportunity');
assert.equal(ramp.userData.travelDirection,'negative-z');
assert.equal(ramp.userData.edgeLightHue,'blue');
const untoneMapped=ramp.children.filter(mesh=>mesh.material?.toneMapped===false&&mesh.material?.color);
assert(untoneMapped.some(mesh=>mesh.material.color.b>mesh.material.color.g*5),'ramp lost saturated blue edge language');
assert(!untoneMapped.some(mesh=>mesh.material.color.r>2&&mesh.material.color.g>2&&mesh.material.color.b>2),'ramp contains white HDR hazard-like bloom');

const bananaMaterial=new THREE.MeshStandardMaterial({color:0xffc52a,roughness:.62});
const banana=createBananaVisual(bananaMaterial);
const bananaBounds=halfExtents(banana);
assert(bananaBounds.x<.58,'banana reward silhouette became misleadingly oversized');
assert.equal(banana.userData.visualRole,'reward-path');
assert.equal(banana.userData.readability,'warm-unlit-accent-no-bloom');

console.log(JSON.stringify({
  check:'hazard-readability-invariants',
  variants:{trees:4,rocks:4,logs:3,wideLogs:3},
  components:{tree:2,rock:1,log:3,wideLog:3,oil:1},
  collisionContract:'unchanged',
  rampRole:ramp.userData.visualRole,
  bananaRole:banana.userData.visualRole
}));
