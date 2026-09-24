import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {makeBarkTexture} from './alpineArt.js';
import {COURSE_FLAG_X} from './environmentCorridor.js';

const dummy=new THREE.Object3D(),tint=new THREE.Color(),ledTint=new THREE.Color();
const postGeometry=new THREE.CylinderGeometry(.14,.20,1.86,16,4);
const capGeometry=new THREE.CylinderGeometry(.17,.165,.085,16);
const snowCapGeometry=new THREE.CylinderGeometry(.19,.18,.052,16);
const footGeometry=new THREE.CylinderGeometry(.23,.20,.18,16);
const railGeometry=new RoundedBoxGeometry(.30,.25,1,2,.042);
const ledRailGeometry=new RoundedBoxGeometry(.070,.095,1,2,.020);
const ledGlowGeometry=new RoundedBoxGeometry(.20,.22,1,2,.045);
const boltGeometry=new THREE.SphereGeometry(.042,10,6);
const plateGeometry=new RoundedBoxGeometry(.028,.32,.20,2,.012);
const hash=n=>{const x=Math.sin(n*12.9898)*43758.5453;return x-Math.floor(x);};
function put(mesh,i,x,y,z,rx=0,ry=0,rz=0,sx=1,sy=1,sz=1){
  dummy.position.set(x,y,z);dummy.rotation.set(rx,ry,rz);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
}
export function createBoundaryMarkers({world,terrainHeight,limit=COURSE_FLAG_X,countPerSide=40,spacing=7.2,woodTexture=null,decorativeShadows=true}){
  const texture=woodTexture||makeBarkTexture(256);
  const postMaterial=new THREE.MeshStandardMaterial({color:0x493b35,map:texture,bumpMap:texture,bumpScale:.028,roughness:.66,metalness:.16});
  const railMaterial=new THREE.MeshStandardMaterial({color:0x142b38,roughness:.27,metalness:.76,emissive:0x04131b,emissiveIntensity:.34});
  const capMaterial=new THREE.MeshStandardMaterial({color:0x263946,map:texture,roughness:.48,metalness:.42});
  const snowMaterial=new THREE.MeshPhysicalMaterial({color:0xf7fcff,roughness:.60,clearcoat:.16,clearcoatRoughness:.42,sheen:.24,sheenColor:new THREE.Color(0xcdefff)});
  const iron=new THREE.MeshStandardMaterial({color:0x526b78,roughness:.34,metalness:.78});
  const ledCoreMaterial=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false});
  const ledGlowMaterial=new THREE.MeshBasicMaterial({
    color:0xffffff,
    transparent:true,
    opacity:.34,
    depthWrite:false,
    toneMapped:false,
    blending:THREE.AdditiveBlending
  });
  const n=countPerSide*2;
  const posts=new THREE.InstancedMesh(postGeometry,postMaterial,n);
  const caps=new THREE.InstancedMesh(capGeometry,capMaterial,n);
  const snowCaps=new THREE.InstancedMesh(snowCapGeometry,snowMaterial,n);
  const feet=new THREE.InstancedMesh(footGeometry,capMaterial,n);
  const rails=new THREE.InstancedMesh(railGeometry,railMaterial,n*2);
  const ledRails=new THREE.InstancedMesh(ledRailGeometry,ledCoreMaterial,n*2);
  const ledGlows=new THREE.InstancedMesh(ledGlowGeometry,ledGlowMaterial,n*2);
  const plates=new THREE.InstancedMesh(plateGeometry,iron,n*2);
  const bolts=new THREE.InstancedMesh(boltGeometry,iron,n*4);
  const meshes=[posts,caps,snowCaps,feet,rails,ledRails,ledGlows,plates,bolts];
  for(const mesh of meshes){mesh.receiveShadow=true;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);world.add(mesh);}
  ledRails.receiveShadow=ledGlows.receiveShadow=false;
  ledGlows.renderOrder=5;
  function setDecorativeShadows(enabled=true){for(const m of [posts,caps,feet,rails])m.castShadow=!!enabled;return !!enabled;}
  setDecorativeShadows(decorativeShadows);
  for(let i=0;i<n;i++){
    const shade=.86+hash(i+14)*.14;tint.setRGB(shade,shade,shade);
    for(const mesh of [posts,caps,feet])mesh.setColorAt(i,tint);
    rails.setColorAt(i*2,tint);rails.setColorAt(i*2+1,tint);

    const sideIndex=i<countPerSide?0:1;
    ledTint.setHex(sideIndex===0?0x2fb7ff:0xff4fd8);
    ledRails.setColorAt(i*2,ledTint);ledRails.setColorAt(i*2+1,ledTint);
    ledGlows.setColorAt(i*2,ledTint);ledGlows.setColorAt(i*2+1,ledTint);
  }
  for(const mesh of [posts,caps,feet,rails,ledRails,ledGlows])if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;

  const positions=new Float32Array(countPerSide);
  let travel=0,pulseTime=0;
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
        const h=.73+level*.57,railIndex=idx*2+level;
        const railLength=Math.hypot(spacing,farGround-ground)+.22;
        put(rails,railIndex,x,ground+(farGround-ground)*.5+h,railZ,angle,0,0,1,1,railLength);
        const innerX=x-side*.168;
        put(ledGlows,railIndex,innerX,ground+(farGround-ground)*.5+h,railZ,angle,0,0,1,1,railLength*.985);
        put(ledRails,railIndex,innerX-side*.008,ground+(farGround-ground)*.5+h,railZ,angle,0,0,1,1,railLength*.98);
        put(plates,railIndex,x-side*.153,ground+h,z);
        for(let b=0;b<2;b++)put(bolts,idx*4+level*2+b,x-side*.175,ground+h+(b?1:-1)*.085,z,0,0,0,.4,1,1);
      }
    }
    for(const mesh of meshes)mesh.instanceMatrix.needsUpdate=true;
  }
  function reset(){travel=0;pulseTime=0;for(let i=0;i<countPerSide;i++)positions[i]=-8-i*spacing;refresh();}
  function update(dt,speed){
    pulseTime+=Math.max(0,Number(dt)||0);
    ledGlowMaterial.opacity=.30+Math.sin(pulseTime*2.35)*.055;
    if(!speed)return;
    const dz=speed*dt;travel+=dz;
    for(let i=0;i<countPerSide;i++){positions[i]+=dz;while(positions[i]>18)positions[i]-=countPerSide*spacing;}
    refresh();
  }
  reset();
  return {
    update,reset,limit,postMaterial,railMaterial,ledCoreMaterial,ledGlowMaterial,
    setDecorativeShadows,setShadowEnabled:setDecorativeShadows,
    blueMaterial:ledCoreMaterial,redMaterial:ledCoreMaterial
  };
}
