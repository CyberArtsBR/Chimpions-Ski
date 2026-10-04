import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSnowboardSoleClearance} from '../src/snowboardSoleClearance.js';
const model=new THREE.Group(),left=new THREE.Bone(),right=new THREE.Bone();
model.add(left,right);left.position.x=-.2;right.position.x=.2;
const geometry=new THREE.BufferGeometry();
geometry.setAttribute('position',new THREE.Float32BufferAttribute([-.2,-.1,0,.2,-.1,0],3));
geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute([0,0,0,0,1,0,0,0],4));
geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0],4));
const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial());model.add(mesh);
model.updateMatrixWorld(true);mesh.bind(new THREE.Skeleton([left,right]));
const board=new THREE.Group();model.add(board);board.userData.deckTopOffset=.064;
const solve=createSnowboardSoleClearance(model,{leftFoot:left,rightFoot:right},board);
assert.equal(solve.sampleCount,2);
for(const roll of [0,.2,-.2]){
 board.position.y=0;board.rotation.z=roll;solve.update();
 const point=new THREE.Vector3();
 for(let i=0;i<2;i++){mesh.getVertexPosition(i,point);mesh.localToWorld(point);board.worldToLocal(point);assert.ok(point.y>=.072-1e-6,'sole must clear deck');}
 const y=board.position.y;solve.update();assert.ok(Math.abs(board.position.y-y)<1e-6,'correction must not drift');
}
console.log('Snowboard sole clearance and stability passed');
