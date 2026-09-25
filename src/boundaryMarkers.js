import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {makeBarkTexture} from './alpineArt.js';
import {COURSE_FLAG_X} from './environmentCorridor.js';

const dummy=new THREE.Object3D(),tint=new THREE.Color(),ledTint=new THREE.Color();
const postGeometry=new THREE.CylinderGeometry(.15,.21,1.90,16,4);
const capGeometry=new THREE.CylinderGeometry(.175,.17,.09,16);
const footGeometry=new THREE.CylinderGeometry(.25,.21,.18,16);
const railGeometry=new RoundedBoxGeometry(.32,.26,1,2,.045);
const ledRailGeometry=new RoundedBoxGeometry(.060,.090,1,2,.020);
const ledGlowGeometry=new RoundedBoxGeometry(.205,.235,1,2,.048);
const postLedGeometry=new RoundedBoxGeometry(.060,1.30,.060,2,.018);
const postGlowGeometry=new RoundedBoxGeometry(.17,1.42,.13,2,.035);
const plateGeometry=new RoundedBoxGeometry(.032,.34,.22,2,.012);
const hash=n=>{const x=Math.sin(n*12.9898)*43758.5453;return x-Math.floor(x);};
function put(mesh,i,x,y,z,rx=0,ry=0,rz=0,sx=1,sy=1,sz=1){dummy.position.set(x,y,z);dummy.rotation.set(rx,ry,rz);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}

export function createBoundaryMarkers({world,terrainHeight,limit=COURSE_FLAG_X,countPerSide=64,spacing=6.4,woodTexture=null,decorativeShadows=true}){
  const texture=woodTexture||makeBarkTexture(256);
  const postMaterial=new THREE.MeshStandardMaterial({color:0x102631,bumpMap:texture,bumpScale:.004,roughness:.31,metalness:.82,emissive:0x020b10,emissiveIntensity:.32});
  const railMaterial=new THREE.MeshStandardMaterial({color:0x071a24,roughness:.24,metalness:.88,emissive:0x03131c,emissiveIntensity:.42});
  const capMaterial=new THREE.MeshStandardMaterial({color:0x183644,roughness:.28,metalness:.74});
  const iron=new THREE.MeshStandardMaterial({color:0x6d8794,roughness:.29,metalness:.88});
  const ledCoreMaterial=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(.20,1.62,7.80),toneMapped:false});
  const ledGlowMaterial=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(.06,.72,4.10),transparent:true,opacity:.36,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending});
  const n=countPerSide*2;
  const posts=new THREE.InstancedMesh(postGeometry,postMaterial,n),caps=new THREE.InstancedMesh(capGeometry,capMaterial,n),feet=new THREE.InstancedMesh(footGeometry,capMaterial,n);
  const rails=new THREE.InstancedMesh(railGeometry,railMaterial,n*2),ledRails=new THREE.InstancedMesh(ledRailGeometry,ledCoreMaterial,n*2),ledGlows=new THREE.InstancedMesh(ledGlowGeometry,ledGlowMaterial,n*2);
  const postLeds=new THREE.InstancedMesh(postLedGeometry,ledCoreMaterial,n),postGlows=new THREE.InstancedMesh(postGlowGeometry,ledGlowMaterial,n);
  const plates=new THREE.InstancedMesh(plateGeometry,iron,n*2);
  const meshes=[posts,caps,feet,rails,ledRails,ledGlows,postLeds,postGlows,plates];
  for(const mesh of meshes){mesh.receiveShadow=true;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);world.add(mesh);}
  ledRails.receiveShadow=ledGlows.receiveShadow=postLeds.receiveShadow=postGlows.receiveShadow=false;ledGlows.renderOrder=postGlows.renderOrder=5;ledRails.renderOrder=postLeds.renderOrder=6;
  function setDecorativeShadows(enabled=true){for(const m of [posts,caps,feet,rails])m.castShadow=!!enabled;return !!enabled;}setDecorativeShadows(decorativeShadows);
  ledTint.setRGB(.36,.82,1);
  for(let i=0;i<n;i++){const shade=.88+hash(i+14)*.12;tint.setRGB(shade,shade,shade);for(const mesh of [posts,caps,feet])mesh.setColorAt(i,tint);rails.setColorAt(i*2,tint);rails.setColorAt(i*2+1,tint);postLeds.setColorAt(i,ledTint);postGlows.setColorAt(i,ledTint);for(const mesh of [ledRails,ledGlows]){mesh.setColorAt(i*2,ledTint);mesh.setColorAt(i*2+1,ledTint);}}
  for(const mesh of [posts,caps,feet,rails,ledRails,ledGlows,postLeds,postGlows])if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  const positions=new Float32Array(countPerSide);let travel=0,pulseTime=0;
  function refresh(){for(let i=0;i<countPerSide;i++)for(let sideIndex=0;sideIndex<2;sideIndex++){const side=sideIndex===0?-1:1,idx=sideIndex*countPerSide+i,z=positions[i],x=side*(limit+.28),ground=terrainHeight(x,z-travel),lean=(hash(idx+19)-.5)*.020,scale=.98+hash(idx+61)*.04;
    put(posts,idx,x,ground+.95*scale,z,0,0,lean,1,scale,1);put(caps,idx,x-Math.sin(lean)*1.90*scale,ground+1.94*scale,z,0,0,lean);put(feet,idx,x,ground+.075,z);
    const innerPostX=x-side*.19;put(postGlows,idx,innerPostX,ground+1.06*scale,z-side*.005,0,0,lean,1,scale,1);put(postLeds,idx,innerPostX-side*.008,ground+1.06*scale,z-side*.008,0,0,lean,1,scale,1);
    const railZ=z-spacing*.5,farGround=terrainHeight(x,z-spacing-travel),angle=Math.atan2(farGround-ground,spacing);
    for(let level=0;level<2;level++){const h=.73+level*.57,railIndex=idx*2+level,railLength=Math.hypot(spacing,farGround-ground)+.22;put(rails,railIndex,x,ground+(farGround-ground)*.5+h,railZ,angle,0,0,1,1,railLength);const innerX=x-side*.171;put(ledGlows,railIndex,innerX,ground+(farGround-ground)*.5+h,railZ,angle,0,0,1,1,railLength*.987);put(ledRails,railIndex,innerX-side*.009,ground+(farGround-ground)*.5+h,railZ,angle,0,0,1,1,railLength*.982);put(plates,railIndex,x-side*.157,ground+h,z);}}
    for(const mesh of meshes)mesh.instanceMatrix.needsUpdate=true;
  }
  function reset(){travel=0;pulseTime=0;for(let i=0;i<countPerSide;i++)positions[i]=-8-i*spacing;refresh();}
  function update(dt,speed){pulseTime+=Math.max(0,Number(dt)||0);ledGlowMaterial.opacity=.34+Math.sin(pulseTime*2.1)*.045;if(!speed)return;const dz=speed*dt;travel+=dz;for(let i=0;i<countPerSide;i++){positions[i]+=dz;while(positions[i]>18)positions[i]-=countPerSide*spacing;}refresh();}
  reset();return {update,reset,limit,postMaterial,railMaterial,ledCoreMaterial,ledGlowMaterial,setDecorativeShadows,setShadowEnabled:setDecorativeShadows,blueMaterial:ledCoreMaterial,redMaterial:ledCoreMaterial};
}
