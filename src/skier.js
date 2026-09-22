import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {disposeAvatarObject} from './avatar-system.js';
import {SKI_TUNING} from './gameplayTuning.js';
import {RIDE_MODE,getRideSpeedFeel,normalizeRideMode} from './rideMode.js';
import {createSnowboardEquipment} from './snowboardEquipment.js';

function material(color, roughness=.72){
  return new THREE.MeshStandardMaterial({color,roughness,metalness:.04});
}
function mesh(geometry,mat,parent){
  const m=new THREE.Mesh(geometry,mat);
  m.castShadow=m.receiveShadow=true;
  parent.add(m);
  return m;
}

function makeSkiGeometry(width,length,thickness,upturn){
  const halfW=width*.5;
  const halfL=length*.5;
  const shape=new THREE.Shape();
  shape.moveTo(-halfW*.66,halfL);
  shape.lineTo(halfW*.66,halfL);
  shape.lineTo(halfW*.88,halfL*.55);
  shape.lineTo(halfW,-halfL*.48);
  shape.quadraticCurveTo(halfW*.96,-halfL*.80,halfW*.46,-halfL*.95);
  shape.quadraticCurveTo(0,-halfL*1.025,-halfW*.46,-halfL*.95);
  shape.quadraticCurveTo(-halfW*.96,-halfL*.80,-halfW,-halfL*.48);
  shape.lineTo(-halfW*.88,halfL*.55);
  shape.closePath();

  const geometry=new THREE.ExtrudeGeometry(shape,{
    depth:thickness,
    steps:1,
    bevelEnabled:true,
    bevelSegments:2,
    bevelSize:.006,
    bevelThickness:.005,
    curveSegments:8
  });
  geometry.rotateX(Math.PI/2);
  geometry.translate(0,thickness*.5,0);

  const position=geometry.attributes.position;
  const bendStart=-length*.34;
  const bendRange=length*.18;
  for(let i=0;i<position.count;i++){
    const z=position.getZ(i);
    if(z<bendStart){
      const t=THREE.MathUtils.clamp((bendStart-z)/bendRange,0,1);
      position.setY(i,position.getY(i)+upturn*t*t);
    }
  }
  position.needsUpdate=true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createSkiAssets(topColor=0x1977a5){
  const edgeGeometry=makeSkiGeometry(.148,2.18,.038,.078);
  const deckGeometry=makeSkiGeometry(.138,2.14,.030,.082);
  const stripeGeometry=new THREE.BoxGeometry(.026,.008,1.26);
  const motifGeometry=new THREE.BoxGeometry(.026,.009,.26);
  const toeGeometry=new THREE.BoxGeometry(.118,.075,.18);
  const heelGeometry=new THREE.BoxGeometry(.126,.082,.20);
  const bindingBridgeGeometry=new THREE.BoxGeometry(.105,.042,.20);

  const edgeMaterial=new THREE.MeshStandardMaterial({
    color:0x182b37,
    roughness:.30,
    metalness:.44
  });
  const topMaterial=new THREE.MeshPhysicalMaterial({
    color:topColor,
    roughness:.32,
    metalness:.04,
    clearcoat:.48,
    clearcoatRoughness:.36
  });
  const graphicMaterial=new THREE.MeshStandardMaterial({
    color:0xffd54a,
    roughness:.34,
    metalness:.04,
    emissive:0x3c2600,
    emissiveIntensity:.10
  });
  const bindingMaterial=new THREE.MeshStandardMaterial({
    color:0x17222b,
    roughness:.42,
    metalness:.20
  });
  const bindingAccentMaterial=new THREE.MeshStandardMaterial({
    color:0xe6f4fa,
    roughness:.30,
    metalness:.16
  });

  return {
    edgeGeometry,deckGeometry,stripeGeometry,motifGeometry,
    toeGeometry,heelGeometry,bindingBridgeGeometry,
    edgeMaterial,topMaterial,graphicMaterial,bindingMaterial,bindingAccentMaterial
  };
}

function createStyledSki(assets){
  const ski=new THREE.Group();

  const edge=new THREE.Mesh(assets.edgeGeometry,assets.edgeMaterial);
  edge.castShadow=edge.receiveShadow=true;
  ski.add(edge);

  const deck=new THREE.Mesh(assets.deckGeometry,assets.topMaterial);
  deck.position.y=.023;
  deck.castShadow=deck.receiveShadow=true;
  ski.add(deck);

  const stripe=new THREE.Mesh(assets.stripeGeometry,assets.graphicMaterial);
  stripe.position.set(0,.045,.12);
  ski.add(stripe);

  for(const side of [-1,1]){
    const motif=new THREE.Mesh(assets.motifGeometry,assets.bindingAccentMaterial);
    motif.position.set(side*.026,.047,-.76);
    motif.rotation.y=side*.34;
    ski.add(motif);
  }

  const toe=new THREE.Mesh(assets.toeGeometry,assets.bindingMaterial);
  toe.position.set(0,.091,-.02);
  toe.castShadow=true;
  ski.add(toe);

  const heel=new THREE.Mesh(assets.heelGeometry,assets.bindingMaterial);
  heel.position.set(0,.096,.23);
  heel.castShadow=true;
  ski.add(heel);

  const bridge=new THREE.Mesh(assets.bindingBridgeGeometry,assets.bindingAccentMaterial);
  bridge.position.set(0,.124,.105);
  bridge.castShadow=true;
  ski.add(bridge);

  return ski;
}

export function createFallbackSkier({rideMode=RIDE_MODE.SKI}={}){
  const root=new THREE.Group();
  root.name='procedural-chimpion';
  const riderVisual=new THREE.Group();
  riderVisual.name='rider-visual';
  root.add(riderVisual);

  const body=new THREE.Group();
  riderVisual.add(body);
  const fur=material(0x5a3623), skin=material(0xb98155), dark=material(0x172533,.42);
  const torso=mesh(new THREE.CapsuleGeometry(.36,.72,6,12),fur,body);torso.position.y=1.55;torso.rotation.z=.08;
  const headPivot=new THREE.Group();headPivot.position.set(0,2.25,-.03);body.add(headPivot);
  const head=mesh(new THREE.SphereGeometry(.38,20,16),fur,headPivot);
  const muzzle=mesh(new THREE.SphereGeometry(.23,18,12),skin,headPivot);muzzle.scale.set(1,.62,.78);muzzle.position.set(0,-.09,.34);
  const hip=mesh(new THREE.SphereGeometry(.34,16,12),fur,body);hip.scale.y=.7;hip.position.y=1.08;
  const arms=[],legs=[];
  for(const side of [-1,1]){
    const arm=mesh(new THREE.CapsuleGeometry(.10,.55,5,8),fur,body);arm.position.set(side*.39,1.43,.02);arm.rotation.z=side*.68;arms.push(arm);
    const leg=mesh(new THREE.CapsuleGeometry(.12,.62,5,8),fur,body);leg.position.set(side*.2,.62,0);leg.rotation.z=side*.16;legs.push(leg);
  }

  const equipmentRoot=new THREE.Group();
  riderVisual.add(equipmentRoot);
  const fallbackSkiAssets=createSkiAssets(0x235f88);
  const skis=[];
  const poles=[];
  for(const side of [-1,1]){
    const ski=createStyledSki(fallbackSkiAssets);ski.position.set(side*.22,.12,.05);ski.rotation.y=side*.035;ski.userData.restPosition=ski.position.clone();equipmentRoot.add(ski);skis.push(ski);
    const pole=mesh(new THREE.CylinderGeometry(.018,.018,1.65,8),dark,equipmentRoot);pole.position.set(side*.58,.86,.15);pole.rotation.z=side*.18;pole.rotation.x=.18;poles.push(pole);
  }
  const snowboard=createSnowboardEquipment({centerX:0,z:.04,topColor:0x7a3ec5});
  riderVisual.add(snowboard.root);

  const pose={carve:0,air:0,landing:0,speed:0};
  let currentRideMode=normalizeRideMode(rideMode);

  function setRideMode(mode){
    currentRideMode=normalizeRideMode(mode);
    const snowboardMode=currentRideMode===RIDE_MODE.SNOWBOARD;
    equipmentRoot.visible=!snowboardMode;
    snowboard.root.visible=snowboardMode;
    root.userData.rideMode=currentRideMode;
    root.userData.equipmentType=snowboardMode?'snowboard':'skis';
    root.userData.poseMode=snowboardMode?'snowboard-side-stance':'ski-a-pose';
    root.userData.trailContacts=snowboardMode?snowboard.trailContacts:skis;
    body.rotation.y=snowboardMode?1.22:0;
    headPivot.rotation.y=snowboardMode?-1.08:0;
  }

  root.userData.fallback=true;
  root.userData.rigReady=false;
  root.userData.riderVisual=riderVisual;
  root.userData.skiTrackSpacing=.22;
  root.userData.skis=skis;
  root.userData.setRideMode=setRideMode;
  root.userData.updateSkiPose=({dt=1/60,steer=0,air=false,landing=0,speed=12,time=0,verticalVelocity=0,jumpSource='',groundPitch=0,groundRoll=0,leftGround=0,rightGround=0,centerGround=0,rideMode:nextRideMode=currentRideMode}={})=>{
    if(normalizeRideMode(nextRideMode)!==currentRideMode)setRideMode(nextRideMode);
    const mix=(a,b,response)=>THREE.MathUtils.lerp(a,b,1-Math.pow(1-response,dt*60));
    const target=THREE.MathUtils.clamp(steer,-1,1);
    const reversing=Math.sign(target)!==Math.sign(pose.carve)&&Math.abs(target)>.04&&Math.abs(pose.carve)>.04;
    pose.carve=mix(pose.carve,target,reversing?SKI_TUNING.POSE_REVERSAL_BLEND:SKI_TUNING.POSE_CARVE_BLEND);
    pose.air=mix(pose.air,air?1:0,air?.24:.16);
    pose.landing=mix(pose.landing,THREE.MathUtils.clamp(landing,0,1),landing>pose.landing?.48:.18);
    pose.speed=mix(pose.speed,getRideSpeedFeel(currentRideMode,speed),.08);
    const ascent=air?THREE.MathUtils.clamp(verticalVelocity/11,0,1):0;
    const descent=air?THREE.MathUtils.clamp(-verticalVelocity/11,0,1):0;
    const apex=air?THREE.MathUtils.clamp(1-Math.abs(verticalVelocity)/4.6,0,1):0;
    const rampAir=air&&jumpSource==='ramp';
    const airScale=rampAir?1:.72;
    const snowboardMode=currentRideMode===RIDE_MODE.SNOWBOARD;

    const crouch=pose.speed*.06+pose.landing*.12+pose.air*.025+descent*.045*airScale;
    riderVisual.rotation.z=mix(riderVisual.rotation.z,-pose.carve*.11,.18);
    riderVisual.rotation.x=mix(riderVisual.rotation.x,.035+pose.speed*.025-ascent*.070*airScale+descent*.052*airScale,.14);
    riderVisual.position.y=-crouch+pose.air*.055+Math.sin(time*5)*.006;

    torso.rotation.x=mix(torso.rotation.x,.05+pose.speed*.035-ascent*.055*airScale+descent*.040*airScale,.16);
    hip.position.y=mix(hip.position.y,1.08-crouch,.18);
    headPivot.rotation.z=mix(headPivot.rotation.z,pose.carve*.018,.14);
    arms.forEach((arm,index)=>{
      const side=index===0?-1:1;
      const baseAngle=snowboardMode?.62:.70;
      arm.rotation.z=mix(arm.rotation.z,side*(baseAngle-pose.speed*.035)+pose.carve*.025,.16);
      arm.rotation.x=mix(arm.rotation.x,-.08-ascent*.10*airScale+apex*.025+descent*.055*airScale,.16);
    });
    legs.forEach((leg,index)=>{
      const side=index===0?-1:1;
      const outside=Math.max(0,pose.carve*-side);
      const inside=Math.max(0,pose.carve*side);
      leg.rotation.z=mix(leg.rotation.z,side*((snowboardMode?.23:.16)+inside*.045-outside*.025),.18);
      leg.rotation.x=mix(leg.rotation.x,-.10-pose.speed*.04-ascent*.055*airScale-apex*.085*airScale-descent*.15*airScale-pose.landing*.12,.18);
    });
    if(snowboardMode){
      const board=snowboard.root;
      const rest=board.userData.restPosition;
      board.rotation.y=mix(board.rotation.y,-pose.carve*.04,.18);
      board.rotation.z=mix(board.rotation.z,-pose.carve*.08+groundRoll*.16,.18);
      board.rotation.x=mix(board.rotation.x,ascent*.09*airScale+apex*.02-descent*.07*airScale-pose.landing*.025+groundPitch*.28,.18);
      board.position.y=mix(board.position.y,rest.y+pose.air*.025-pose.landing*.012,.18);
    }else{
      skis.forEach((ski,index)=>{
        const side=index===0?-1:1;
        ski.rotation.y=mix(ski.rotation.y,-pose.carve*.065+side*.018,.18);
        ski.rotation.z=mix(ski.rotation.z,-pose.carve*.075+groundRoll*.16,.18);
        ski.rotation.x=mix(ski.rotation.x,ascent*.105*airScale+apex*.022-descent*.075*airScale-pose.landing*.025+groundPitch*.28,.18);
        const localGround=(side<0?leftGround:rightGround)-centerGround;
        ski.position.y=mix(ski.position.y,.12+pose.air*.025-pose.landing*.012+THREE.MathUtils.clamp(localGround*.18,-.018,.018),.18);
      });
    }
  };
  setRideMode(currentRideMode);
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

function addSkiEquipment(root,rig,placement=footBasedSkiPlacement(root,rig)){
  const skis=[];
  const assets=createSkiAssets(0x176f9d);
  for(const side of [-1,1]){
    const ski=createStyledSki(assets);
    ski.position.set(placement.centerX+side*placement.spacing,.055,placement.z);
    ski.userData.restPosition=ski.position.clone();
    root.add(ski);
    skis.push(ski);
  }
  root.userData.skis=skis;
  root.userData.skiTrackSpacing=placement.spacing;
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
  let currentRideMode=RIDE_MODE.SKI;

  let poseDt=1/60;
  const modelBaseY=model.position.y;
  function rotate(key,x=0,y=0,z=0,response=.20){
    const b=rig[key];if(!b)return;
    targetQ.copy(rest.get(b));
    targetQ.multiply(delta.setFromAxisAngle(axisX,x));
    targetQ.multiply(delta.setFromAxisAngle(axisY,y));
    targetQ.multiply(delta.setFromAxisAngle(axisZ,z));
    b.quaternion.slerp(targetQ,1-Math.pow(1-response,poseDt*60));
  }

  const update=({dt=1/60,steer=0,air=false,landing=0,speed=12,time=0,verticalVelocity=0,jumpSource='',rideMode=currentRideMode}={})=>{
    poseDt=dt;
    currentRideMode=normalizeRideMode(rideMode);
    const snowboardMode=currentRideMode===RIDE_MODE.SNOWBOARD;
    const mix=(a,b,response)=>THREE.MathUtils.lerp(a,b,1-Math.pow(1-response,dt*60));
    const targetCarve=THREE.MathUtils.clamp(steer,-1,1);
    const reversing=Math.sign(targetCarve)!==Math.sign(pose.carve)&&Math.abs(targetCarve)>.035&&Math.abs(pose.carve)>.035;
    pose.carve=mix(pose.carve,targetCarve,reversing?SKI_TUNING.POSE_REVERSAL_BLEND:SKI_TUNING.POSE_CARVE_BLEND);
    pose.speed=mix(pose.speed,getRideSpeedFeel(currentRideMode,speed),.08);
    pose.air=mix(pose.air,air?1:0,air?.24:.15);
    const landingTarget=THREE.MathUtils.clamp(landing,0,1);
    pose.landing=mix(pose.landing,landingTarget,landingTarget>pose.landing?.52:.20);

    const carve=pose.carve;
    const speedCrouch=pose.speed;
    const airBlend=pose.air;
    const landingBlend=pose.landing;
    const ascent=air?THREE.MathUtils.clamp(verticalVelocity/11,0,1):0;
    const descent=air?THREE.MathUtils.clamp(-verticalVelocity/11,0,1):0;
    const apex=air?THREE.MathUtils.clamp(1-Math.abs(verticalVelocity)/4.6,0,1):0;
    const rampAir=air&&jumpSource==='ramp';
    const airScale=rampAir?1:.72;
    const stance=1-airBlend;

    const hipFlex=.08+speedCrouch*.045+landingBlend*.11-ascent*.045*airScale+descent*.075*airScale;
    const hipLean=-carve*.10*stance;
    if(snowboardMode){
      // Side-on visual stance only: gameplay root/collision remain aligned downhill.
      rotate('hips',hipFlex,.86+carve*.025,hipLean,.22);
      rotate('spine',-.065-speedCrouch*.03,.30+carve*.012,carve*.045*stance,.18);
      rotate('chest',-.035-speedCrouch*.018,.20+carve*.012,carve*.030*stance,.18);
      // Counter-yaw neck/head so the rider looks downhill while the torso remains sideways.
      rotate('neck',.025+speedCrouch*.01,-.56,-carve*.010,.17);
      rotate('head',.012,-.56,-carve*.012,.15);
    }else{
      rotate('hips',hipFlex,0,hipLean,.22);
      rotate('spine',-.055-speedCrouch*.03-ascent*.030*airScale+apex*.018+descent*.038*airScale,carve*.016,carve*.055*stance,.18);
      rotate('chest',-.028-speedCrouch*.018-ascent*.024*airScale+apex*.014+descent*.032*airScale,carve*.018,carve*.038*stance,.18);
      rotate('neck',.022+speedCrouch*.01,0,-carve*.012,.16);
      rotate('head',.012,0,-carve*.014,.14);
    }

    for(const [side,sideSign] of [['left',-1],['right',1]]){
      const outside=Math.max(0,carve*-sideSign);
      const inside=Math.max(0,carve*sideSign);

      const thigh=(snowboardMode?-.35:-.30)-speedCrouch*.07-landingBlend*.12-ascent*.055*airScale-apex*.070*airScale-descent*.13*airScale+outside*.045-inside*.055;
      const shin=(snowboardMode?.62:.54)+speedCrouch*.08+landingBlend*.20+ascent*.075*airScale+apex*.11*airScale+descent*.19*airScale-outside*.065+inside*.075;
      const foot=-.20+speedCrouch*.025+ascent*.060*airScale-descent*.055*airScale-carve*.025;

      rotate(side+'Thigh',thigh,snowboardMode?sideSign*.14:0,sideSign*((snowboardMode?.085:.025)+inside*.018),.22);
      rotate(side+'Shin',shin,0,0,.22);
      rotate(side+'Foot',foot,snowboardMode?sideSign*.08:0,-carve*.035,.20);

      // Rest rigs are commonly T-posed. ~0.8 rad Z rotation lowers upper arms
      // into a stable A-pose with hands around waist/upper-hip height.
      const armPull=speedCrouch*.055;
      const aPose=snowboardMode?.74:.86;
      rotate(side+'Shoulder',0,0,sideSign*.035+carve*.012,.17);
      rotate(side+'UpperArm',-.20-armPull-ascent*.10*airScale+apex*.035+descent*.045*airScale+outside*.025,0,sideSign*(aPose-armPull*.10)+carve*.014,.18);
      rotate(side+'Forearm',-.42-speedCrouch*.035+ascent*.045*airScale+apex*.070*airScale+descent*.060*airScale-inside*.045,0,0,.18);
      rotate(side+'Hand',.035,0,sideSign*carve*.008,.16);
    }

    model.position.y=modelBaseY+Math.sin(time*5.2)*.004-landingBlend*.042+airBlend*.010+apex*.010*airScale;
  };
  update.rig=rig;
  update.pose=pose;
  update.setRideMode=mode=>{currentRideMode=normalizeRideMode(mode);};
  update.getRideMode=()=>currentRideMode;
  return update;
}

export async function loadSkier(url='/models/default.glb',{rideMode=RIDE_MODE.SKI}={}){
  let loadedModel=null,loadedRoot=null;
  try{
    const gltf=await new GLTFLoader().loadAsync(url);
    const model=gltf.scene;loadedModel=model;
    model.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;o.frustumCulled=false;}});
    fitModel(model);
    const updateRig=makeRigController(model);
    const root=new THREE.Group();loadedRoot=root;

    // Dedicated visual root: future tricks can rotate rider/equipment without
    // touching the gameplay transform, collision or camera root.
    const riderVisual=new THREE.Group();
    riderVisual.name='rider-visual';
    root.add(riderVisual);

    // Collection GLBs use +Z as visual forward; gameplay travels downhill toward -Z.
    const modelCarrier=new THREE.Group();
    modelCarrier.rotation.y=Math.PI;
    modelCarrier.add(model);
    riderVisual.add(modelCarrier);

    const placement=footBasedSkiPlacement(riderVisual,updateRig?.rig);
    const skiEquipmentRoot=new THREE.Group();
    skiEquipmentRoot.name='ski-equipment';
    riderVisual.add(skiEquipmentRoot);
    const skis=addSkiEquipment(skiEquipmentRoot,updateRig?.rig,placement);
    const snowboard=createSnowboardEquipment({centerX:placement.centerX,z:placement.z,topColor:0x7b3fc7});
    riderVisual.add(snowboard.root);

    let currentRideMode=normalizeRideMode(rideMode);
    function setRideMode(mode){
      currentRideMode=normalizeRideMode(mode);
      const snowboardMode=currentRideMode===RIDE_MODE.SNOWBOARD;
      skiEquipmentRoot.visible=!snowboardMode;
      snowboard.root.visible=snowboardMode;
      updateRig?.setRideMode?.(currentRideMode);
      root.userData.rideMode=currentRideMode;
      root.userData.equipmentType=snowboardMode?'snowboard':'skis';
      root.userData.poseMode=snowboardMode?'snowboard-side-stance':'ski-a-pose';
      root.userData.trailContacts=snowboardMode?snowboard.trailContacts:skis;
      return currentRideMode;
    }

    root.userData.modelForwardAxis='-Z';
    root.userData.fallback=false;
    root.userData.rigReady=!!updateRig;
    root.userData.riderVisual=riderVisual;
    root.userData.skis=skis;
    root.userData.skiTrackSpacing=placement.spacing;
    root.userData.setRideMode=setRideMode;
    root.userData.updateSkiPose=(state={})=>{
      const requestedMode=normalizeRideMode(state.rideMode??currentRideMode);
      if(requestedMode!==currentRideMode)setRideMode(requestedMode);
      const dt=state.dt??1/60;
      const mix=(a,b,response)=>THREE.MathUtils.lerp(a,b,1-Math.pow(1-response,dt*60));
      updateRig?.({...state,rideMode:currentRideMode});
      const pose=updateRig?.pose;
      const carve=pose?.carve??THREE.MathUtils.clamp(state.steer||0,-1,1);
      const air=pose?.air??Number(!!state.air);
      const landing=pose?.landing??THREE.MathUtils.clamp(state.landing||0,0,1);
      const speed=pose?.speed??getRideSpeedFeel(currentRideMode,state.speed);
      const verticalVelocity=state.verticalVelocity||0;
      const ascent=state.air?THREE.MathUtils.clamp(verticalVelocity/11,0,1):0;
      const descent=state.air?THREE.MathUtils.clamp(-verticalVelocity/11,0,1):0;
      const apex=state.air?THREE.MathUtils.clamp(1-Math.abs(verticalVelocity)/4.6,0,1):0;
      const airScale=state.jumpSource==='ramp'?1:.72;

      const groundPitch=THREE.MathUtils.clamp(state.groundPitch||0,-.18,.18);
      const groundRoll=THREE.MathUtils.clamp(state.groundRoll||0,-.18,.18);
      const leftGround=state.leftGround??state.centerGround??0;
      const rightGround=state.rightGround??state.centerGround??0;
      const centerGround=state.centerGround??0;

      if(currentRideMode===RIDE_MODE.SNOWBOARD){
        const board=snowboard.root;
        const rest=board.userData.restPosition;
        board.rotation.y=mix(board.rotation.y,-carve*.040,.18);
        board.rotation.z=mix(board.rotation.z,-carve*.085+groundRoll*.16,.18);
        board.rotation.x=mix(board.rotation.x,ascent*.095*airScale+apex*.020-descent*.072*airScale-landing*.026+groundPitch*.28,.18);
        board.position.x=mix(board.position.x,rest.x,.18);
        board.position.y=mix(board.position.y,rest.y+air*.026-landing*.012-speed*.004,.18);
        board.position.z=mix(board.position.z,rest.z+air*.012,.18);
      }else{
        skis.forEach((ski,index)=>{
          const side=index===0?-1:1;
          const rest=ski.userData.restPosition;
          const outside=Math.max(0,carve*-side);
          const inside=Math.max(0,carve*side);
          const localGround=(side<0?leftGround:rightGround)-centerGround;

          ski.rotation.y=mix(ski.rotation.y,-carve*.065+side*.012,.18);
          ski.rotation.z=mix(ski.rotation.z,-carve*.075+groundRoll*.16,.18);
          ski.rotation.x=mix(ski.rotation.x,ascent*.105*airScale+apex*.022-descent*.075*airScale-landing*.026+groundPitch*.28,.18);
          ski.position.x=mix(ski.position.x,rest.x+side*(inside*.012-outside*.006),.18);
          ski.position.y=mix(ski.position.y,rest.y+air*.026-landing*.012-speed*.004+THREE.MathUtils.clamp(localGround*.18,-.018,.018),.18);
          ski.position.z=mix(ski.position.z,rest.z+air*.018,.18);
        });
      }
    };

    setRideMode(currentRideMode);
    return root;
  }catch(error){
    disposeAvatarObject(loadedRoot?.children.length?loadedRoot:loadedModel);
    console.info('Using procedural skier until a Chimpion GLB is installed:',error.message);
    return createFallbackSkier({rideMode});
  }
}
