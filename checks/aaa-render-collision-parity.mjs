import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BATCHED_COURSE_KINDS,createCourseRenderBatches} from '../src/courseRenderBatches.js';

function prototype(){
  const root=new THREE.Group();
  const geometry=new THREE.BoxGeometry(1,1,1);
  const material=new THREE.MeshBasicMaterial();
  const mesh=new THREE.Mesh(geometry,material);
  root.add(mesh);
  root.userData={radiusX:.5,radiusZ:.5,clearance:.5};
  return root;
}
const world=new THREE.Scene();
const prototypes=Object.fromEntries(BATCHED_COURSE_KINDS.map(kind=>[kind,prototype()]));
const capacity=4;
const batches=createCourseRenderBatches({world,prototypes,capacity,renderMinZ:-10,renderMaxZ:10});
const course=[];
function add(kind,z,x=0){
  const item=batches.createHandle(kind);item.position.set(x,0,z);batches.activate(item);course.push(item);return item;
}
for(const kind of BATCHED_COURSE_KINDS){
  add(kind,-6,-1);add(kind,0,0);add(kind,6,1);add(kind,-30,2);
}
let d=batches.sync(course,true);
const visibleLogical=BATCHED_COURSE_KINDS.length*3;
assert.equal(d.activeLogical,BATCHED_COURSE_KINDS.length*4,'active logical count drifted');
assert.equal(d.renderedInstances,visibleLogical,'every in-range batched logical hazard must have one rendered instance');
assert.equal(d.overflow,0,'unexpected batch overflow in parity baseline');
for(const kind of BATCHED_COURSE_KINDS)assert.equal(d.kindCounts[kind],3,kind+' visible instance count drifted');
const renderedMeshInstances=world.children.filter(x=>x.isInstancedMesh).reduce((sum,mesh)=>sum+mesh.count,0);
assert.equal(renderedMeshInstances,visibleLogical,'InstancedMesh counts diverged from logical visible hazards');

add('tree',-4,3);add('tree',4,-3);
d=batches.sync(course,true);
assert.equal(d.overflow,1,'overflow diagnostic failed to detect a visible logical hazard without batch capacity');
assert.equal(d.kindCounts.tree,capacity,'tree batch count exceeded capacity');
assert.equal(d.renderedInstances,visibleLogical+1,'overflow must reduce rendered-instance parity by exactly the overflow count in this synthetic case');

console.log(JSON.stringify({check:'aaa-render-collision-parity',batchedKinds:BATCHED_COURSE_KINDS,capacity,baselineVisibleLogical:visibleLogical,baselineRendered:renderedMeshInstances,overflowProbe:d}));
