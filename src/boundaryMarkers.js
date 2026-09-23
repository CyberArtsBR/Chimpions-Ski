import * as THREE from 'three';
import {COURSE_FLAG_X} from './environmentCorridor.js';

const _dummy=new THREE.Object3D();
const _postGeometry=new THREE.CylinderGeometry(.09,.12,1.66,8);
const _postCapGeometry=new THREE.CylinderGeometry(.13,.13,.08,8);
const _railGeometry=new THREE.BoxGeometry(.14,.13,1);

function setInstance(mesh,index,x,y,z,rx=0,ry=0,rz=0,sx=1,sy=1,sz=1){
  _dummy.position.set(x,y,z);
  _dummy.rotation.set(rx,ry,rz);
  _dummy.scale.set(sx,sy,sz);
  _dummy.updateMatrix();
  mesh.setMatrixAt(index,_dummy.matrix);
}

export function createBoundaryMarkers({
  world,
  terrainHeight,
  limit=COURSE_FLAG_X,
  countPerSide=40,
  spacing=7.2
}){
  const postCount=countPerSide*2;
  const railCount=postCount*2;
  const postMaterial=new THREE.MeshStandardMaterial({
    color:0x6b4328,roughness:.91,metalness:0
  });
  const railMaterial=new THREE.MeshStandardMaterial({
    color:0x8b5a33,roughness:.88,metalness:0
  });
  const capMaterial=new THREE.MeshStandardMaterial({
    color:0x51311e,roughness:.94,metalness:0
  });

  const posts=new THREE.InstancedMesh(_postGeometry,postMaterial,postCount);
  const caps=new THREE.InstancedMesh(_postCapGeometry,capMaterial,postCount);
  const rails=new THREE.InstancedMesh(_railGeometry,railMaterial,railCount);

  for(const mesh of [posts,caps,rails]){
    mesh.castShadow=true;
    mesh.receiveShadow=true;
    mesh.frustumCulled=false;
    world.add(mesh);
  }

  const zPositions=new Float32Array(countPerSide);
  const fenceOffset=.24;
  const railLength=spacing+.30;
  let travel=0;

  function update(dt,worldSpeed){
    if(worldSpeed===0)return;
    const dz=worldSpeed*dt;
    travel+=dz;
    const span=countPerSide*spacing;
    for(let i=0;i<countPerSide;i++){
      zPositions[i]+=dz;
      if(zPositions[i]>18)zPositions[i]-=span;
    }
    refresh();
  }

  function reset(){
    travel=0;
    for(let i=0;i<countPerSide;i++)zPositions[i]=-8-i*spacing;
    refresh();
  }

  function refresh(){
    for(let i=0;i<countPerSide;i++){
      const z=zPositions[i];
      const railZ=z-spacing*.5;
      for(let sideIndex=0;sideIndex<2;sideIndex++){
        const side=sideIndex===0?-1:1;
        const x=side*(limit+fenceOffset);
        const postGround=terrainHeight(x,z-travel);
        const railGround=terrainHeight(x,railZ-travel);
        const postIndex=sideIndex*countPerSide+i;

        setInstance(posts,postIndex,x,postGround+.83,z);
        setInstance(caps,postIndex,x,postGround+1.70,z);

        const railBase=(sideIndex*countPerSide+i)*2;
        setInstance(rails,railBase,x,railGround+.72,railZ,0,0,0,1,1,railLength);
        setInstance(rails,railBase+1,x,railGround+1.22,railZ,0,0,0,1,1,railLength);
      }
    }

    posts.instanceMatrix.needsUpdate=true;
    caps.instanceMatrix.needsUpdate=true;
    rails.instanceMatrix.needsUpdate=true;
  }

  reset();
  return {
    update,
    reset,
    limit,
    postMaterial,
    railMaterial,
    // Compatibility aliases for callers that previously tinted left/right flags.
    blueMaterial:railMaterial,
    redMaterial:railMaterial
  };
}
