import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

function material(color, roughness=.72){
  return new THREE.MeshStandardMaterial({color,roughness,metalness:.04});
}
function mesh(geometry,mat,parent){
  const m=new THREE.Mesh(geometry,mat);
  m.castShadow=m.receiveShadow=true;
  parent.add(m);
  return m;
}

export function createFallbackSkier(){
  const root=new THREE.Group();
  root.name='procedural-chimpion';
  const fur=material(0x5a3623), skin=material(0xb98155), gear=material(0x235a83,.5), dark=material(0x172533,.42);
  const torso=mesh(new THREE.CapsuleGeometry(.36,.72,6,12),fur,root);torso.position.y=1.55;torso.rotation.z=.08;
  const head=mesh(new THREE.SphereGeometry(.38,20,16),fur,root);head.position.set(0,2.25,-.03);
  const muzzle=mesh(new THREE.SphereGeometry(.23,18,12),skin,root);muzzle.scale.set(1,.62,.78);muzzle.position.set(0,2.16,.31);
  const hip=mesh(new THREE.SphereGeometry(.34,16,12),fur,root);hip.scale.y=.7;hip.position.y=1.08;
  for(const side of [-1,1]){
    const arm=mesh(new THREE.CapsuleGeometry(.10,.55,5,8),fur,root);arm.position.set(side*.39,1.52,.02);arm.rotation.z=side*(.5);
    const leg=mesh(new THREE.CapsuleGeometry(.12,.62,5,8),fur,root);leg.position.set(side*.2,.62,0);leg.rotation.z=side*.16;
    const ski=mesh(new THREE.BoxGeometry(.11,.055,1.85),gear,root);ski.position.set(side*.22,.12,.05);ski.rotation.y=side*.035;
    const pole=mesh(new THREE.CylinderGeometry(.018,.018,1.65,8),dark,root);pole.position.set(side*.58,.86,.15);pole.rotation.z=side*.18;pole.rotation.x=.18;
  }
  root.userData.fallback=true;
  return root;
}

function fitModel(root){
  root.updateWorldMatrix(true,true);
  const box=new THREE.Box3().setFromObject(root);
  const size=box.getSize(new THREE.Vector3());
  const scale=2.45/Math.max(.001,size.y);
  root.scale.setScalar(scale);
  root.updateWorldMatrix(true,true);
  const fitted=new THREE.Box3().setFromObject(root);
  const center=fitted.getCenter(new THREE.Vector3());
  root.position.x-=center.x;
  root.position.z-=center.z;
  root.position.y-=fitted.min.y;
}

export async function loadSkier(url='/models/default.glb'){
  try{
    const gltf=await new GLTFLoader().loadAsync(url);
    const root=gltf.scene;
    root.traverse(o=>{
      if(o.isMesh){o.castShadow=o.receiveShadow=true;}
    });
    fitModel(root);
    root.userData.fallback=false;
    return root;
  }catch(error){
    console.info('Using procedural skier until a Chimpion GLB is installed:',error.message);
    return createFallbackSkier();
  }
}
