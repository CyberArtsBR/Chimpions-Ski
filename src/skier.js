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
  const arms=[],legs=[],skis=[];
  for(const side of [-1,1]){
    const arm=mesh(new THREE.CapsuleGeometry(.10,.55,5,8),fur,root);arm.position.set(side*.39,1.52,.02);arm.rotation.z=side*(.5);arms.push(arm);
    const leg=mesh(new THREE.CapsuleGeometry(.12,.62,5,8),fur,root);leg.position.set(side*.2,.62,0);leg.rotation.z=side*.16;legs.push(leg);
    const ski=mesh(new THREE.BoxGeometry(.11,.055,1.85),gear,root);ski.position.set(side*.22,.12,.05);ski.rotation.y=side*.035;skis.push(ski);
    const pole=mesh(new THREE.CylinderGeometry(.018,.018,1.65,8),dark,root);pole.position.set(side*.58,.86,.15);pole.rotation.z=side*.18;pole.rotation.x=.18;
  }
  const pose={carve:0,air:0,landing:0,speed:0};
  root.userData.fallback=true;
  root.userData.updateSkiPose=({steer=0,air=false,landing=0,speed=12,time=0,groundPitch=0,groundRoll=0,leftGround=0,rightGround=0,centerGround=0}={})=>{
    const target=THREE.MathUtils.clamp(steer,-1,1);
    const reversing=Math.sign(target)!==Math.sign(pose.carve)&&Math.abs(target)>.04&&Math.abs(pose.carve)>.04;
    pose.carve=THREE.MathUtils.lerp(pose.carve,reversing?0:target,reversing?.24:.14);
    pose.air=THREE.MathUtils.lerp(pose.air,air?1:0,air?.24:.16);
    pose.landing=THREE.MathUtils.lerp(pose.landing,THREE.MathUtils.clamp(landing,0,1),landing>pose.landing?.48:.18);
    pose.speed=THREE.MathUtils.lerp(pose.speed,THREE.MathUtils.clamp((speed-12)/19,0,1),.08);

    const crouch=pose.speed*.06+pose.landing*.12+pose.air*.035;
    root.rotation.z=THREE.MathUtils.lerp(root.rotation.z,-pose.carve*.11,.18);
    root.rotation.x=THREE.MathUtils.lerp(root.rotation.x,.035-pose.air*.05+pose.speed*.025,.14);
    root.position.y=-crouch+pose.air*.055+Math.sin(time*5)*.006;

    torso.rotation.x=THREE.MathUtils.lerp(torso.rotation.x,.05+pose.speed*.035-pose.air*.025,.16);
    hip.position.y=THREE.MathUtils.lerp(hip.position.y,1.08-crouch,.18);
    head.rotation.z=THREE.MathUtils.lerp(head.rotation.z,pose.carve*.018,.14);
    arms.forEach((arm,index)=>{
      const side=index===0?-1:1;
      arm.rotation.z=THREE.MathUtils.lerp(arm.rotation.z,side*(.48-pose.speed*.04)+pose.carve*.035,.16);
      arm.rotation.x=THREE.MathUtils.lerp(arm.rotation.x,-.08-pose.air*.08,.16);
    });
    legs.forEach((leg,index)=>{
      const side=index===0?-1:1;
      const outside=Math.max(0,pose.carve*-side);
      const inside=Math.max(0,pose.carve*side);
      leg.rotation.z=THREE.MathUtils.lerp(leg.rotation.z,side*(.16+inside*.045-outside*.025),.18);
      leg.rotation.x=THREE.MathUtils.lerp(leg.rotation.x,-.10-pose.speed*.04-pose.air*.08-pose.landing*.12,.18);
    });
    skis.forEach((ski,index)=>{
      const side=index===0?-1:1;
      ski.rotation.y=THREE.MathUtils.lerp(ski.rotation.y,-pose.carve*.065+side*.018,.18);
      ski.rotation.z=THREE.MathUtils.lerp(ski.rotation.z,-pose.carve*.075+groundRoll*.16,.18);
      ski.rotation.x=THREE.MathUtils.lerp(ski.rotation.x,pose.air*.055-pose.landing*.025+groundPitch*.28,.18);
      const localGround=(side<0?leftGround:rightGround)-centerGround;
      ski.position.y=THREE.MathUtils.lerp(ski.position.y,.12+pose.air*.025-pose.landing*.012+THREE.MathUtils.clamp(localGround*.18,-.018,.018),.18);
    });
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

function footBasedSkiPlacement(root,rig){
  const fallback={centerX:0,spacing:.22,z:.02};
  if(!rig?.leftFoot||!rig?.rightFoot)return fallback;
  root.updateWorldMatrix(true,true);
  const left=root.worldToLocal(rig.leftFoot.getWorldPosition(new THREE.Vector3()));
  const right=root.worldToLocal(rig.rightFoot.getWorldPosition(new THREE.Vector3()));
  const rawSpacing=Math.abs(right.x-left.x)*.5;
  return {
    centerX:THREE.MathUtils.clamp((left.x+right.x)*.5,-.08,.08),
    spacing:THREE.MathUtils.clamp(rawSpacing,.18,.34),
    z:THREE.MathUtils.clamp((left.z+right.z)*.5,-.22,.22)
  };
}

function addSkiEquipment(root,rig){
  const skiMat=new THREE.MeshStandardMaterial({color:0x1c5f86,roughness:.38,metalness:.16});
  const edgeMat=new THREE.MeshStandardMaterial({color:0xd8f3ff,roughness:.28,metalness:.28});
  const bindingMat=new THREE.MeshStandardMaterial({color:0x152431,roughness:.48,metalness:.16});
  const skis=[];
  const placement=footBasedSkiPlacement(root,rig);
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
    ski.position.set(placement.centerX+side*placement.spacing,.055,placement.z);
    ski.userData.restPosition=ski.position.clone();
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
  const targetQ=new THREE.Quaternion(),delta=new THREE.Quaternion();
  const axisX=new THREE.Vector3(1,0,0),axisY=new THREE.Vector3(0,1,0),axisZ=new THREE.Vector3(0,0,1);
  const pose={carve:0,speed:0,air:0,landing:0};

  function rotate(key,x=0,y=0,z=0,response=.20){
    const b=rig[key];if(!b)return;
    targetQ.copy(rest.get(b));
    targetQ.multiply(delta.setFromAxisAngle(axisX,x));
    targetQ.multiply(delta.setFromAxisAngle(axisY,y));
    targetQ.multiply(delta.setFromAxisAngle(axisZ,z));
    b.quaternion.slerp(targetQ,response);
  }

  const update=({steer=0,air=false,landing=0,speed=12,time=0}={})=>{
    const targetCarve=THREE.MathUtils.clamp(steer,-1,1);
    const reversing=Math.sign(targetCarve)!==Math.sign(pose.carve)&&Math.abs(targetCarve)>.035&&Math.abs(pose.carve)>.035;
    pose.carve=THREE.MathUtils.lerp(pose.carve,reversing?0:targetCarve,reversing?.22:.12);
    pose.speed=THREE.MathUtils.lerp(pose.speed,THREE.MathUtils.clamp((speed-12)/19,0,1),.08);
    pose.air=THREE.MathUtils.lerp(pose.air,air?1:0,air?.24:.15);
    const landingTarget=THREE.MathUtils.clamp(landing,0,1);
    pose.landing=THREE.MathUtils.lerp(pose.landing,landingTarget,landingTarget>pose.landing?.52:.20);

    const carve=pose.carve;
    const speedCrouch=pose.speed;
    const airBlend=pose.air;
    const landingBlend=pose.landing;
    const stance=1-airBlend;

    // Neutral stance: light knee flex, low hips, gentle forward body angle.
    const hipFlex=.08+speedCrouch*.045+landingBlend*.11-airBlend*.04;
    const hipLean=-carve*.10*stance;
    rotate('hips',hipFlex,0,hipLean,.22);
    rotate('spine',-.055-speedCrouch*.03+airBlend*.025,carve*.016,carve*.055*stance,.18);
    rotate('chest',-.028-speedCrouch*.018+airBlend*.015,carve*.018,carve*.038*stance,.18);
    rotate('neck',.022+speedCrouch*.01,0,-carve*.012,.16);
    rotate('head',.012,0,-carve*.014,.14);

    for(const [side,sideSign] of [['left',-1],['right',1]]){
      const outside=Math.max(0,carve*-sideSign);
      const inside=Math.max(0,carve*sideSign);

      // Outside leg lengthens slightly; inside leg compresses while both retain a safe base flex.
      const thigh=-.30-speedCrouch*.07-landingBlend*.12-airBlend*.08+outside*.045-inside*.055;
      const shin=.54+speedCrouch*.08+landingBlend*.20+airBlend*.13-outside*.065+inside*.075;
      const foot=-.20+speedCrouch*.025+airBlend*.035-carve*.025;

      rotate(side+'Thigh',thigh,0,sideSign*(.025+inside*.018),.22);
      rotate(side+'Shin',shin,0,0,.22);
      rotate(side+'Foot',foot,0,-carve*.035,.20);

      // Arms stay compact and controlled; airborne pose opens only enough for balance.
      const armPull=speedCrouch*.055;
      rotate(side+'Shoulder',0,0,sideSign*(.10-armPull)+carve*.014,.17);
      rotate(side+'UpperArm',-.27-armPull-airBlend*.12+outside*.035,0,sideSign*.085+carve*.018,.18);
      rotate(side+'Forearm',-.46-speedCrouch*.045+airBlend*.10-inside*.055,0,0,.18);
      rotate(side+'Hand',.045,0,sideSign*carve*.01,.16);
    }

    // Keep vertical movement subtle: landing compresses, airtime lifts the tucked pose.
    model.position.y=Math.sin(time*5.2)*.004-landingBlend*.042+airBlend*.014;
  };
  update.rig=rig;
  update.pose=pose;
  return update;
}

export async function loadSkier(url='/models/default.glb'){
  try{
    const gltf=await new GLTFLoader().loadAsync(url);
    const model=gltf.scene;
    model.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;o.frustumCulled=false;}});
    fitModel(model);
    const updateRig=makeRigController(model);
    const root=new THREE.Group();
    // Collection GLBs use +Z as visual forward; gameplay travels downhill toward -Z.
    // Rotate only the imported model carrier so controls, skis and rig animation remain unchanged.
    const modelCarrier=new THREE.Group();
    modelCarrier.rotation.y=Math.PI;
    modelCarrier.add(model);
    root.add(modelCarrier);
    const skis=addSkiEquipment(root,updateRig?.rig);
    root.userData.modelForwardAxis='-Z';
    root.userData.fallback=false;
    root.userData.rigReady=!!updateRig;
    root.userData.updateSkiPose=(state={})=>{
      updateRig?.(state);
      const pose=updateRig?.pose;
      const carve=pose?.carve??THREE.MathUtils.clamp(state.steer||0,-1,1);
      const air=pose?.air??Number(!!state.air);
      const landing=pose?.landing??THREE.MathUtils.clamp(state.landing||0,0,1);
      const speed=pose?.speed??THREE.MathUtils.clamp(((state.speed||12)-12)/19,0,1);

      const groundPitch=THREE.MathUtils.clamp(state.groundPitch||0,-.18,.18);
      const groundRoll=THREE.MathUtils.clamp(state.groundRoll||0,-.18,.18);
      const leftGround=state.leftGround??state.centerGround??0;
      const rightGround=state.rightGround??state.centerGround??0;
      const centerGround=state.centerGround??0;
      skis.forEach((ski,index)=>{
        const side=index===0?-1:1;
        const rest=ski.userData.restPosition;
        const outside=Math.max(0,carve*-side);
        const inside=Math.max(0,carve*side);
        const localGround=(side<0?leftGround:rightGround)-centerGround;

        // Yaw follows the carve, roll provides a visible but restrained edge angle.
        ski.rotation.y=THREE.MathUtils.lerp(ski.rotation.y,-carve*.065+side*.012,.18);
        ski.rotation.z=THREE.MathUtils.lerp(ski.rotation.z,-carve*.075+groundRoll*.16,.18);
        ski.rotation.x=THREE.MathUtils.lerp(ski.rotation.x,air*.055-landing*.026+groundPitch*.28,.18);

        // Preserve avatar-specific spacing while allowing a tiny terrain-contact correction.
        ski.position.x=THREE.MathUtils.lerp(ski.position.x,rest.x+side*(inside*.012-outside*.006),.18);
        ski.position.y=THREE.MathUtils.lerp(ski.position.y,rest.y+air*.026-landing*.012-speed*.004+THREE.MathUtils.clamp(localGround*.18,-.018,.018),.18);
        ski.position.z=THREE.MathUtils.lerp(ski.position.z,rest.z+air*.018,.18);
      });
    };
    return root;
  }catch(error){
    console.info('Using procedural skier until a Chimpion GLB is installed:',error.message);
    return createFallbackSkier();
  }
}
