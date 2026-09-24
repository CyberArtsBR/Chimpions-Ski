import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {makeBarkTexture} from './alpineArt.js';
import {COURSE_FLAG_X} from './environmentCorridor.js';

const dummy=new THREE.Object3D(),tint=new THREE.Color();
const postGeometry=new THREE.CylinderGeometry(.14,.20,1.86,16,4);
const capGeometry=new THREE.CylinderGeometry(.17,.165,.085,16);
const snowCapGeometry=new THREE.CylinderGeometry(.19,.18,.052,16);
const footGeometry=new THREE.CylinderGeometry(.23,.20,.18,16);
const railGeometry=new RoundedBoxGeometry(.24,.23,1,2,.035);
const boltGeometry=new THREE.SphereGeometry(.042,10,6);
const plateGeometry=new RoundedBoxGeometry(.028,.32,.20,2,.012);
const hash=n=>{const x=Math.sin(n*12.9898)*43758.5453;return x-Math.floor(x);};
function put(mesh,i,x,y,z,rx=0,ry=0,rz=0,sx=1,sy=1,sz=1){
  dummy.position.set(x,y,z);dummy.rotation.set(rx,ry,rz);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
}
export function createBoundaryMarkers({world,terrainHeight,limit=COURSE_FLAG_X,countPerSide=40,spacing=7.2,woodTexture=null,decorativeShadows=true}){
  const texture=woodTexture||makeBarkTexture(256);
  const postMaterial=new THREE.MeshStandardMaterial({color:0x94704a,map:texture,bumpMap:texture,bumpScale:.035,roughness:.91});
  const railMaterial=new THREE.MeshStandardMaterial({color:0xad8355,map:texture,bumpMap:texture,bumpScale:.026,roughness:.87});
  const capMaterial=new THREE.MeshStandardMaterial({color:0x755334,map:texture,roughness:.95});
  const snowMaterial=new THREE.MeshPhysicalMaterial({color:0xf5fbff,roughness:.72,clearcoat:.05,clearcoatRoughness:.68});
  const iron=new THREE.MeshStandardMaterial({color:0x405464,roughness:.47,metalness:.7});
  const n=countPerSide*2;
  const posts=new THREE.InstancedMesh(postGeometry,postMaterial,n);
  const caps=new THREE.InstancedMesh(capGeometry,capMaterial,n);
  const snowCaps=new THREE.InstancedMesh(snowCapGeometry,snowMaterial,n);
  const feet=new THREE.InstancedMesh(footGeometry,capMaterial,n);
  const rails=new THREE.InstancedMesh(railGeometry,railMaterial,n*2);
  const plates=new THREE.InstancedMesh(plateGeometry,iron,n*2);
  const bolts=new THREE.InstancedMesh(boltGeometry,iron,n*4);
  const meshes=[posts,caps,snowCaps,feet,rails,plates,bolts];
  for(const mesh of meshes){mesh.receiveShadow=true;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);world.add(mesh);}
  function setDecorativeShadows(enabled=true){for(const m of [posts,caps,feet,rails])m.castShadow=!!enabled;return !!enabled;}
  setDecorativeShadows(decorativeShadows);
  for(let i=0;i<n;i++){
    // Instance color is a multiplier, not a second copy of the material color.
    const shade=.85+hash(i+14)*.15;tint.setRGB(shade,shade,shade);
    for(const mesh of [posts,caps,feet])mesh.setColorAt(i,tint);
    rails.setColorAt(i*2,tint);rails.setColorAt(i*2+1,tint);
  }
  const positions=new Float32Array(countPerSide);
  let travel=0;
  function refresh(){
    for(let i=0;i<countPerSide;i++)for(let sideIndex=0;sideIndex<2;sideIndex++){
      const side=sideIndex===0?-1:1,idx=sideIndex*countPerSide+i,z=positions[i];
      const x=side*(limit+.28),ground=terrainHeight(x,z-travel);
      const lean=(hash(idx+19)-.5)*.025,scale=.97+hash(idx+61)*.06;
      put(posts,idx,x,ground+.93*scale,z,0,0,lean,1,scale,1);
      put(caps,idx,x-Math.sin(lean)*1.86*scale,ground+1.90*scale,z,0,0,lean);
      put(snowCaps,idx,x-Math.sin(lean)*1.91*scale,ground+1.948*scale,z,0,0,lean,1.02,1,1.02);
      put(feet,idx,x,ground+.075,z);
      const railZ=z-spacing*.5,farGround=terrainHeight(x,z-spacing-travel);
      const angle=Math.atan2(farGround-ground,spacing);
      for(let level=0;level<2;level++){
        const h=.73+level*.57;
        put(rails,idx*2+level,x,ground+(farGround-ground)*.5+h,railZ,angle,0,0,1,1,Math.hypot(spacing,farGround-ground)+.22);
        put(plates,idx*2+level,x-side*.153,ground+h,z);
        for(let b=0;b<2;b++)put(bolts,idx*4+level*2+b,x-side*.175,ground+h+(b?1:-1)*.085,z,0,0,0,.4,1,1);
      }
    }
    for(const mesh of meshes)mesh.instanceMatrix.needsUpdate=true;
  }
  function reset(){travel=0;for(let i=0;i<countPerSide;i++)positions[i]=-8-i*spacing;refresh();}
  function update(dt,speed){if(!speed)return;const dz=speed*dt;travel+=dz;for(let i=0;i<countPerSide;i++){positions[i]+=dz;while(positions[i]>18)positions[i]-=countPerSide*spacing;}refresh();}
  reset();
  return {update,reset,limit,postMaterial,railMaterial,setDecorativeShadows,setShadowEnabled:setDecorativeShadows,blueMaterial:railMaterial,redMaterial:railMaterial};
}
