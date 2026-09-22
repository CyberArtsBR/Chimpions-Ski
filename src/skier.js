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
  root.userData.updateSkiPose=({steer=0,air=false,landing=0,time=0}={})=>{
    root.rotation.z=THREE.MathUtils.lerp(root.rotation.z,-steer*.16,.18);
    root.rotation.x=THREE.MathUtils.lerp(root.rotation.x,air?-.12:.03,.12);
    root.position.y=(air?.04:0)-landing*.06+Math.sin(time*5)*.008;
  };
  return root;
}

const SLOT_ALIASES={
  hips:['hips','hip','pelvis'],
  spine:['spine','spine0','spine1','spine01'],
  chest:['chest','upperchest','spine2','spine02','spine3'],
  neck:['neck','neck1','necktwist01'],
  head:['head'],
  Shoulder:['shoulder','clavicle','collar'],
  UpperArm:['upperarm','arm','uparm'],
  Forearm:['forearm','lowerarm','elbow'],
  Hand:['hand','wrist'],
  Thigh:['thigh','upleg','upperleg'],
  Shin:['shin','calf','leg','lowerleg','knee'],
  Foot:['foot','ankle']
};

function nameParts(name){
  let s=name.replace(/([a-z0-9])([A-Z])/g,'$1 $2').toLowerCase()
    .replace(/mixamorig\d*[:_ ]*/g,'').replace(/cc[_ ]*base[_ ]*/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  let words=s.split(/\s+/);
  let side=words.includes('left')||words.includes('l')?'left':words.includes('right')||words.includes('r')?'right':'';
  let core=words.filter(w=>!['left','right','l','r','bone','def','bip','bip001'].includes(w)).join('');
  if(!side&&/^(left|right)/.test(core)){side=core.startsWith('left')?'left':'right';core=core.slice(side.length);}
  return {side,core};
}
function isDescendant(child,ancestor){for(let p=child.parent;p;p=p.parent)if(p===ancestor)return true;return false;}

function mapRig(model){
  const bones=[];model.traverse(o=>{if(o.isBone)bones.push(o)});
  const rig={},used=new Set();
  const slots=['hips','spine','chest','neck','head','leftShoulder','leftUpperArm','leftForearm','leftHand','rightShoulder','rightUpperArm','rightForearm','rightHand','leftThigh','leftShin','leftFoot','rightThigh','rightShin','rightFoot'];
  for(const key of slots){
    const side=key.startsWith('left')?'left':key.startsWith('right')?'right':'';
    const kind=side?key.slice(side.length):key;
    let matches=bones.filter(b=>{
      const p=nameParts(b.name);
      return p.side===side && SLOT_ALIASES[kind]?.includes(p.core);
    });
    if(key==='hips'&&matches.length>1)matches=matches.filter(b=>matches.every(other=>other===b||isDescendant(other,b)));
    if((key==='spine'||key==='chest')&&matches.length>1){
      matches=matches.filter(b=>matches.every(other=>other===b||(key==='spine'?isDescendant(other,b):isDescendant(b,other))));
    }
    if(matches.length===1&&!used.has(matches[0])){rig[key]=matches[0];used.add(matches[0]);}
  }
  return {rig,bones};
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

function addSkiEquipment(root){
  const skiMat=new THREE.MeshStandardMaterial({color:0x1c5f86,roughness:.38,metalness:.16});
  const edgeMat=new THREE.MeshStandardMaterial({color:0xd8f3ff,roughness:.28,metalness:.28});
  const bindingMat=new THREE.MeshStandardMaterial({color:0x152431,roughness:.48,metalness:.16});
  const skis=[];
  for(const side of [-1,1]){
    const ski=new THREE.Group();
    const deck=new THREE.Mesh(new THREE.BoxGeometry(.115,.045,2.12),skiMat);
    deck.position.z=.08;deck.castShadow=true;deck.receiveShadow=true;ski.add(deck);
    const edge=new THREE.Mesh(new THREE.BoxGeometry(.125,.018,2.04),edgeMat);
    edge.position.set(0,-.028,.04);ski.add(edge);
    const binding=new THREE.Mesh(new THREE.BoxGeometry(.18,.10,.34),bindingMat);
    binding.position.set(0,.075,.14);binding.castShadow=true;ski.add(binding);
    const tip=new THREE.Mesh(new THREE.BoxGeometry(.11,.04,.34),skiMat);
    tip.position.set(0,.08,-1.02);tip.rotation.x=-.30;tip.castShadow=true;ski.add(tip);
    ski.position.set(side*.22,.055,.02);
    root.add(ski);skis.push(ski);
  }
  root.userData.skis=skis;
  return skis;
}

function makeRigController(model){
  const {rig,bones}=mapRig(model);
  const required=['hips','leftThigh','rightThigh','leftShin','rightShin','leftFoot','rightFoot'];
  if(required.some(k=>!rig[k]))return null;
  const rest=new Map();
  for(const b of bones)rest.set(b,b.quaternion.clone());
  const q=new THREE.Quaternion(),delta=new THREE.Quaternion();
  const axisX=new THREE.Vector3(1,0,0),axisY=new THREE.Vector3(0,1,0),axisZ=new THREE.Vector3(0,0,1);

  function resetBone(key){
    const b=rig[key];if(b&&rest.has(b))b.quaternion.copy(rest.get(b));
  }
  function rotate(key,x=0,y=0,z=0){
    const b=rig[key];if(!b)return;
    q.copy(rest.get(b));
    q.multiply(delta.setFromAxisAngle(axisX,x));
    q.multiply(delta.setFromAxisAngle(axisY,y));
    q.multiply(delta.setFromAxisAngle(axisZ,z));
    b.quaternion.slerp(q,.24);
  }
  return ({steer=0,air=false,landing=0,speed=0,time=0}={})=>{
    for(const key of Object.keys(rig))resetBone(key);
    const crouch=air?.15:.5+Math.min(.18,speed/160);
    const carve=THREE.MathUtils.clamp(steer,-1,1);
    rotate('hips',.12+crouch*.16,0,-carve*.18);
    rotate('spine',-.12-crouch*.08,carve*.035,carve*.08);
    rotate('chest',-.06,carve*.04,carve*.12);
    rotate('neck',.05,0,-carve*.035);
    rotate('head',.03,0,-carve*.05);
    for(const [side,sign] of [['left',1],['right',-1]]){
      const outer=carve*sign;
      rotate(side+'Thigh',-.38-crouch*.22+outer*.16,0,sign*.05);
      rotate(side+'Shin',.68+crouch*.25-Math.max(0,outer)*.14,0,0);
      rotate(side+'Foot',-.28+crouch*.08,0,-carve*.05);
      rotate(side+'Shoulder',0,0,sign*(.16+carve*.05));
      rotate(side+'UpperArm',-.35+outer*.18,0,sign*.12);
      rotate(side+'Forearm',-.58-Math.max(0,-outer)*.15,0,0);
      rotate(side+'Hand',.08,0,0);
    }
    if(air){
      rotate('hips',-.04,0,-carve*.10);
      rotate('spine',-.04,0,carve*.05);
      for(const [side,sign] of [['left',1],['right',-1]]){
        rotate(side+'Thigh',-.16+sign*carve*.05);
        rotate(side+'Shin',.42);
        rotate(side+'UpperArm',-.62-sign*carve*.09,0,sign*.18);
        rotate(side+'Forearm',-.3);
      }
    }
    if(landing>.01){
      const c=Math.min(1,landing);
      rotate('hips',.25*c,0,-carve*.12);
      rotate('spine',.18*c,0,carve*.08);
      rotate('leftThigh',-.55*c);rotate('rightThigh',-.55*c);
      rotate('leftShin',.95*c);rotate('rightShin',.95*c);
    }
    model.position.y=Math.sin(time*5.2)*.006-(landing*.055);
  };
}

export async function loadSkier(url='/models/default.glb'){
  try{
    const gltf=await new GLTFLoader().loadAsync(url);
    const model=gltf.scene;
    model.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;o.frustumCulled=false;}});
    fitModel(model);
    const updateRig=makeRigController(model);
    const root=new THREE.Group();root.add(model);
    const skis=addSkiEquipment(root);
    root.userData.fallback=false;
    root.userData.rigReady=!!updateRig;
    root.userData.updateSkiPose=(state={})=>{
      updateRig?.(state);
      const carve=THREE.MathUtils.clamp(state.steer||0,-1,1);
      const air=!!state.air;
      skis.forEach((ski,index)=>{
        const sign=index===0?-1:1;
        ski.rotation.y=THREE.MathUtils.lerp(ski.rotation.y,-carve*.10+sign*.018,.24);
        ski.rotation.x=THREE.MathUtils.lerp(ski.rotation.x,air?.12:0,.20);
        ski.position.y=.055+(air?.02:0);
      });
    };
    return root;
  }catch(error){
    console.info('Using procedural skier until a Chimpion GLB is installed:',error.message);
    return createFallbackSkier();
  }
}
