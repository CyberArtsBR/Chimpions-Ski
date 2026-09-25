import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BATCHED_COURSE_KINDS,createCourseRenderBatches} from '../src/courseRenderBatches.js';

function makePrototype(kind){
  const mesh=new THREE.Mesh(
    new THREE.BoxGeometry(1,1,1),
    new THREE.MeshBasicMaterial()
  );
  mesh.userData.kind=kind;
  mesh.userData.radiusX=.5;
  mesh.userData.radiusZ=.5;
  return mesh;
}

const world=new THREE.Group();
const prototypes=Object.fromEntries(BATCHED_COURSE_KINDS.map(kind=>[kind,makePrototype(kind)]));
const batches=createCourseRenderBatches({
  world,
  prototypes,
  capacity:2,
  renderMinZ:-30,
  renderMaxZ:10
});

const course=[];
function add(kind,z){
  const item=batches.createHandle(kind);
  item.position.set(0,0,z);
  batches.activate(item);
  course.push(item);
  return item;
}

const visibleTrees=[add('tree',-2),add('tree',-4),add('tree',-6),add('tree',-8),add('tree',-10),add('tree',-12),add('tree',-14)];
const visibleRocks=[add('rock',-3),add('rock',-5),add('rock',-7)];
const offscreen=add('tree',-80);

const diagnostics=batches.sync(course,true);
assert.equal(diagnostics.overflow,0,'batch paging must not drop visible logical hazards');
assert.equal(diagnostics.visibleLogical,visibleTrees.length+visibleRocks.length,'visible logical count drifted');
assert.equal(diagnostics.renderedInstances,diagnostics.visibleLogical,'visible collidable hazards lost render representation');
assert(diagnostics.overflowPrevented>=5,'tiny-capacity test did not exercise secondary batch pages');
assert(diagnostics.pagesByKind.tree>=4,'tree batches did not grow beyond one fixed-capacity page');
assert(diagnostics.capacityByKind.tree>=visibleTrees.length,'grown tree capacity still cannot represent active hazards');
for(const item of [...visibleTrees,...visibleRocks]){
  assert.equal(item.userData.batchRendered,true,'visible collidable hazard is not represented');
  assert(item.userData.batchPage>=0&&item.userData.batchInstance>=0,'render mapping diagnostics are missing');
}
assert.equal(offscreen.userData.batchRendered,false,'offscreen hazard should not consume visible batch capacity');

batches.deactivate(visibleTrees[0]);
batches.sync(course,true);
assert.equal(visibleTrees[0].userData.batchRendered,false,'deactivated hazard retained render representation');

console.log(JSON.stringify({
  check:'course-render-parity-invariants',
  visibleLogical:diagnostics.visibleLogical,
  renderedInstances:diagnostics.renderedInstances,
  overflow:diagnostics.overflow,
  overflowPrevented:diagnostics.overflowPrevented,
  pagesByKind:diagnostics.pagesByKind,
  capacityByKind:diagnostics.capacityByKind
}));
