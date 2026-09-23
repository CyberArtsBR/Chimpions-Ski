import * as THREE from 'three';
import {COURSE_FLAG_X} from './environmentCorridor.js';

const _dummy=new THREE.Object3D();
const _postGeometry=new THREE.CylinderGeometry(.125,.185,1.82,12);
const _postCapGeometry=new THREE.CylinderGeometry(.165,.155,.12,12);
const _postFootGeometry=new THREE.CylinderGeometry(.22,.19,.16,12);
const _railGeometry=new THREE.BoxGeometry(.24,.19,1);
const _railSnowGeometry=new THREE.BoxGeometry(.205,.045,1);
const _postSnowGeometry=new THREE.SphereGeometry(.18,12,7);
const _boltGeometry=new THREE.SphereGeometry(.046,8,6);

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
  spacing=7.2,
  woodTexture=null,
  decorativeShadows=true
}){
  const postCount=countPerSide*2;
  const railCount=postCount*2;
  const postMaterial=new THREE.MeshStandardMaterial({
    color:0x71472d,map:woodTexture,roughness:.76,metalness:0,flatShading:true
  });
  const railMaterial=new THREE.MeshStandardMaterial({
    color:0x9a633c,map:woodTexture,roughness:.74,metalness:0,flatShading:true
  });
  const capMaterial=new THREE.MeshStandardMaterial({
    color:0x432b1d,map:woodTexture,roughness:.88,metalness:0,flatShading:true
  });
  const snowMaterial=new THREE.MeshPhysicalMaterial({
    color:0xf8fcff,roughness:.76,metalness:0,
    clearcoat:.12,clearcoatRoughness:.62,sheen:.16,sheenColor:new THREE.Color(0xdff5ff)
  });
  const boltMaterial=new THREE.MeshStandardMaterial({
    color:0x7f929d,roughness:.36,metalness:.68
  });

  const posts=new THREE.InstancedMesh(_postGeometry,postMaterial,postCount);
  const caps=new THREE.InstancedMesh(_postCapGeometry,capMaterial,postCount);
  const feet=new THREE.InstancedMesh(_postFootGeometry,capMaterial,postCount);
  const rails=new THREE.InstancedMesh(_railGeometry,railMaterial,railCount);
  const postSnow=new THREE.InstancedMesh(_postSnowGeometry,snowMaterial,postCount);
  const railSnow=new THREE.InstancedMesh(_railSnowGeometry,snowMaterial,railCount);
  const bolts=new THREE.InstancedMesh(_boltGeometry,boltMaterial,postCount*2);

  const allMeshes=[posts,caps,feet,rails,postSnow,railSnow,bolts];
  const shadowMeshes=[posts,caps,feet,rails];
  for(const mesh of allMeshes){
    mesh.castShadow=false;
    mesh.receiveShadow=true;
    mesh.frustumCulled=false;
    world.add(mesh);
  }

  function setDecorativeShadows(enabled=true){
    const active=!!enabled;
    for(const mesh of shadowMeshes)mesh.castShadow=active;
    postSnow.castShadow=false;
    railSnow.castShadow=false;
    bolts.castShadow=false;
    return active;
  }
  setDecorativeShadows(decorativeShadows);

  const tint=new THREE.Color();
  for(let i=0;i<countPerSide;i++){
    const postShade=.92+(i%5)*.018;
    const railShade=.94+((i+2)%4)*.018;
    for(let sideIndex=0;sideIndex<2;sideIndex++){
      const postIndex=sideIndex*countPerSide+i;
      tint.copy(postMaterial.color).multiplyScalar(postShade);
      posts.setColorAt(postIndex,tint);
      tint.copy(capMaterial.color).multiplyScalar(.96+(i%3)*.016);
      caps.setColorAt(postIndex,tint);
      feet.setColorAt(postIndex,tint);
      const railBase=postIndex*2;
      tint.copy(railMaterial.color).multiplyScalar(railShade);
      rails.setColorAt(railBase,tint);
      rails.setColorAt(railBase+1,tint);
    }
  }
  for(const mesh of [posts,caps,feet,rails]){
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  }

  const zPositions=new Float32Array(countPerSide);
  const fenceOffset=.24;
  const railLength=spacing+.42;
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

        setInstance(posts,postIndex,x,postGround+.91,z);
        setInstance(caps,postIndex,x,postGround+1.88,z);
        setInstance(feet,postIndex,x,postGround+.08,z);
        setInstance(postSnow,postIndex,x,postGround+1.96,z,0,0,0,1,.38,1);

        const railBase=(sideIndex*countPerSide+i)*2;
        setInstance(rails,railBase,x,railGround+.75,railZ,0,0,0,1,1,railLength);
        setInstance(rails,railBase+1,x,railGround+1.30,railZ,0,0,0,1,1,railLength);
        setInstance(railSnow,railBase,x,railGround+.86,railZ,0,0,0,1,1,railLength);
        setInstance(railSnow,railBase+1,x,railGround+1.41,railZ,0,0,0,1,1,railLength);

        const inwardX=x-side*.135;
        const boltBase=postIndex*2;
        setInstance(bolts,boltBase,inwardX,postGround+.75,z,0,0,0,1,.92,.92);
        setInstance(bolts,boltBase+1,inwardX,postGround+1.30,z,0,0,0,1,.92,.92);
      }
    }

    posts.instanceMatrix.needsUpdate=true;
    caps.instanceMatrix.needsUpdate=true;
    feet.instanceMatrix.needsUpdate=true;
    rails.instanceMatrix.needsUpdate=true;
    postSnow.instanceMatrix.needsUpdate=true;
    railSnow.instanceMatrix.needsUpdate=true;
    bolts.instanceMatrix.needsUpdate=true;
  }

  reset();
  return {
    update,
    reset,
    limit,
    postMaterial,
    railMaterial,
    snowMaterial,
    setDecorativeShadows,
    // Compatibility aliases for callers that previously tinted left/right flags.
    blueMaterial:railMaterial,
    redMaterial:railMaterial
  };
}
