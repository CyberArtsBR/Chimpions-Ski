import * as THREE from 'three';
import {COURSE_FLAG_X} from './environmentCorridor.js';

const _dummy=new THREE.Object3D();
const _postGeometry=new THREE.CylinderGeometry(.10,.145,1.72,10);
const _postCapGeometry=new THREE.CylinderGeometry(.15,.145,.10,10);
const _railGeometry=new THREE.BoxGeometry(.18,.16,1);
const _railSnowGeometry=new THREE.BoxGeometry(.19,.035,1);
const _postSnowGeometry=new THREE.SphereGeometry(.17,10,6);

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
    color:0x704729,roughness:.86,metalness:0
  });
  const railMaterial=new THREE.MeshStandardMaterial({
    color:0x986038,roughness:.83,metalness:0
  });
  const capMaterial=new THREE.MeshStandardMaterial({
    color:0x4d301d,roughness:.92,metalness:0
  });
  const snowMaterial=new THREE.MeshPhysicalMaterial({
    color:0xf8fcff,roughness:.86,metalness:0,
    clearcoat:.055,clearcoatRoughness:.74
  });

  const posts=new THREE.InstancedMesh(_postGeometry,postMaterial,postCount);
  const caps=new THREE.InstancedMesh(_postCapGeometry,capMaterial,postCount);
  const rails=new THREE.InstancedMesh(_railGeometry,railMaterial,railCount);
  const postSnow=new THREE.InstancedMesh(_postSnowGeometry,snowMaterial,postCount);
  const railSnow=new THREE.InstancedMesh(_railSnowGeometry,snowMaterial,railCount);

  for(const mesh of [posts,caps,rails,postSnow,railSnow]){
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

        setInstance(posts,postIndex,x,postGround+.86,z);
        setInstance(caps,postIndex,x,postGround+1.75,z);
        setInstance(postSnow,postIndex,x,postGround+1.82,z,0,0,0,1,.42,1);

        const railBase=(sideIndex*countPerSide+i)*2;
        setInstance(rails,railBase,x,railGround+.73,railZ,0,0,0,1,1,railLength);
        setInstance(rails,railBase+1,x,railGround+1.24,railZ,0,0,0,1,1,railLength);
        setInstance(railSnow,railBase,x,railGround+.825,railZ,0,0,0,1,1,railLength);
        setInstance(railSnow,railBase+1,x,railGround+1.335,railZ,0,0,0,1,1,railLength);
      }
    }

    posts.instanceMatrix.needsUpdate=true;
    caps.instanceMatrix.needsUpdate=true;
    rails.instanceMatrix.needsUpdate=true;
    postSnow.instanceMatrix.needsUpdate=true;
    railSnow.instanceMatrix.needsUpdate=true;
  }

  reset();
  return {
    update,
    reset,
    limit,
    postMaterial,
    railMaterial,
    snowMaterial,
    // Compatibility aliases for callers that previously tinted left/right flags.
    blueMaterial:railMaterial,
    redMaterial:railMaterial
  };
}
