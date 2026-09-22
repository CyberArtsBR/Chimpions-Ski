import * as THREE from 'three';

const _dummy=new THREE.Object3D();
const _flagGeometry=new THREE.BufferGeometry();
_flagGeometry.setAttribute('position',new THREE.Float32BufferAttribute([
  0,0,0,
  .72,-.14,0,
  0,-.46,0
],3));
_flagGeometry.computeVertexNormals();

const _poleGeometry=new THREE.CylinderGeometry(.026,.036,1.62,7);
const _baseGeometry=new THREE.CylinderGeometry(.065,.085,.10,8);

function setInstance(mesh,index,x,y,z,ry=0,sx=1,sy=1,sz=1){
  _dummy.position.set(x,y,z);
  _dummy.rotation.set(0,ry,0);
  _dummy.scale.set(sx,sy,sz);
  _dummy.updateMatrix();
  mesh.setMatrixAt(index,_dummy.matrix);
}

export function createBoundaryMarkers({world,terrainHeight,limit=11.3,countPerSide=18,spacing=15.5}){
  const count=countPerSide*2;
  const poleMaterial=new THREE.MeshStandardMaterial({
    color:0xf4f8fb,roughness:.58,metalness:.12
  });
  const blueMaterial=new THREE.MeshStandardMaterial({
    color:0x1d68d8,roughness:.42,metalness:.02,
    emissive:0x0a2456,emissiveIntensity:.26,side:THREE.DoubleSide
  });
  const redMaterial=new THREE.MeshStandardMaterial({
    color:0xd94445,roughness:.42,metalness:.02,
    emissive:0x551315,emissiveIntensity:.24,side:THREE.DoubleSide
  });
  const baseMaterial=new THREE.MeshStandardMaterial({
    color:0xc9d9e2,roughness:.90,metalness:0
  });

  const poles=new THREE.InstancedMesh(_poleGeometry,poleMaterial,count);
  const bases=new THREE.InstancedMesh(_baseGeometry,baseMaterial,count);
  const blueFlags=new THREE.InstancedMesh(_flagGeometry,blueMaterial,countPerSide);
  const redFlags=new THREE.InstancedMesh(_flagGeometry,redMaterial,countPerSide);

  for(const mesh of [poles,bases,blueFlags,redFlags]){
    mesh.castShadow=true;
    mesh.receiveShadow=true;
    mesh.frustumCulled=false;
    world.add(mesh);
  }

  const zPositions=new Float32Array(countPerSide);
  let travel=0;

  function reset(){
    travel=0;
    for(let i=0;i<countPerSide;i++){
      zPositions[i]=-8-i*spacing;
    }
    refresh();
  }

  function refresh(){
    for(let i=0;i<countPerSide;i++){
      const z=zPositions[i];
      for(let sideIndex=0;sideIndex<2;sideIndex++){
        const side=sideIndex===0?-1:1;
        const x=side*limit;
        const ground=terrainHeight(x,z-travel);
        const index=sideIndex*countPerSide+i;
        const lean=(i%3-1)*.012*side;
        setInstance(poles,index,x,ground+.81,z,lean);
        setInstance(bases,index,x,ground+.045,z,0,1,1,1);

        const flagMesh=side<0?blueFlags:redFlags;
        const flagFacing=side<0?.10:Math.PI-.10;
        setInstance(flagMesh,i,x,ground+1.49,z,flagFacing,1,1,1);
      }
    }
    poles.instanceMatrix.needsUpdate=true;
    bases.instanceMatrix.needsUpdate=true;
    blueFlags.instanceMatrix.needsUpdate=true;
    redFlags.instanceMatrix.needsUpdate=true;
  }

  function update(dt,worldSpeed){
    if(worldSpeed!==0){
      const dz=worldSpeed*dt;
      travel+=dz;
      const span=countPerSide*spacing;
      for(let i=0;i<countPerSide;i++){
        zPositions[i]+=dz;
        if(zPositions[i]>18)zPositions[i]-=span;
      }
      refresh();
    }
  }

  reset();
  return {update,reset,blueMaterial,redMaterial};
}
