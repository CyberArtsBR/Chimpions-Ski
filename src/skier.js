import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {disposeAvatarObject} from './avatar-system.js';
import {SKI_TUNING} from './gameplayTuning.js';

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

export function createFallbackSkier(){
  const root=new THREE.Group();
  root.name='procedural-chimpion';
  const fur=material(0x5a3623), skin=material(0xb98155), gear=material(0x235a83,.5), dark=material(0x172533,.42);
  const torso=mesh(new THREE.CapsuleGeometry(.36,.72,6,12),fur,root);torso.position.y=1.55;torso.rotation.z=.08;
  const head=mesh(new THREE.SphereGeometry(.38,20,16),fur,root);head.position.set(0,2.25,-.03);
  const muzzle=mesh(new THREE.SphereGeometry(.23,18,12),skin,root);muzzle.scale.set(1,.62,.78);muzzle.position.set(0,2.16,.31);
  const hip=mesh(new THREE.SphereGeometry(.34,16,12),fur,root);hip.scale.y=.7;hip.position.y=1.08;
  const arms=[],legs=[],skis=[];
  const fallbackSkiAssets=createSkiAssets(0x235f88);
  for(const side of [-1,1]){
    const arm=mesh(new THREE.CapsuleGeometry(.10,.55,5,8),fur,root);arm.position.set(side*.39,1.52,.02);arm.rotation.z=side*(.5);arms.push(arm);
    const leg=mesh(new THREE.CapsuleGeometry(.12,.62,5,8),fur,root);leg.position.set(side*.2,.62,0);leg.rotation.z=side*.16;legs.push(leg);
    const ski=createStyledSki(fallbackSkiAssets);ski.position.set(side*.22,.12,.05);ski.rotation.y=side*.035;root.add(ski);skis.push(ski);
    const pole=mesh(new THREE.CylinderGeometry(.018,.018,1.65,8),dark,root);pole.position.set(side*.58,.86,.15);pole.rotation.z=side*.18;pole.rotation.x=.18;
  }
  const pose={carve:0,air:0,landing:0,speed:0};
  root.userData.fallback=true;
  root.userData.skiTrackSpacing=.22;
  root.userData.skis=skis;
  root.userData.updateSkiPose=({dt=1/60,steer=0,air=false,landing=0,speed=12,time=0,verticalVelocity=0,jumpSource='',groundPitch=0,groundRoll=0,leftGround=0,rightGround=0,centerGround=0}={})=>{
    const mix=(a,b,response)=>THREE.MathUtils.lerp(a,b,1-Math.pow(1-response,dt*60));
    const target=THREE.MathUtils.clamp(steer,-1,1);
    const reversing=Math.sign(target)!==Math.sign(pose.carve)&&Math.abs(target)>.04&&Math.abs(pose.carve)>.04;
    pose.carve=mix(pose.carve,target,reversing?SKI_TUNING.POSE_REVERSAL_BLEND:SKI_TUNING.POSE_CARVE_BLEND);
    pose.air=mix(pose.air,air?1:0,air?.24:.16);
    pose.landing=mix(pose.landing,THREE.MathUtils.clamp(landing,0,1),landing>pose.landing?.48:.18);
    pose.speed=mix(pose.speed,THREE.MathUtils.clamp((speed-12)/19,0,1),.08);
    const ascent=air?THREE.MathUtils.clamp(verticalVelocity/11,0,1):0;
    const descent=air?THREE.MathUtils.clamp(-verticalVelocity/11,0,1):0;
    const apex=air?THREE.MathUtils.clamp(1-Math.abs(verticalVelocity)/4.6,0,1):0;
    const rampAir=air&&jumpSource==='ramp';
    const airScale=rampAir?1:.72;

    const crouch=pose.speed*.06+pose.landing*.12+pose.air*.025+descent*.045*airScale;
    root.rotation.z=mix(root.rotation.z,-pose.carve*.11,.18);
    root.rotation.x=mix(root.rotation.x,.035+pose.speed*.025-ascent*.070*airScale+descent*.052*airScale,.14);
    root.position.y=-crouch+pose.air*.055+Math.sin(time*5)*.006;

    torso.rotation.x=mix(torso.rotation.x,.05+pose.speed*.035-ascent*.055*airScale+descent*.040*airScale,.16);
    hip.position.y=mix(hip.position.y,1.08-crouch,.18);
    head.rotation.z=mix(head.rotation.z,pose.carve*.018,.14);
    arms.forEach((arm,index)=>{
      const side=index===0?-1:1;
      arm.rotation.z=mix(arm.rotation.z,side*(.48-pose.speed*.04)+pose.carve*.035,.16);
      arm.rotation.x=mix(arm.rotation.x,-.08-ascent*.14*airScale+apex*.035+descent*.075*airScale,.16);
    });
    legs.forEach((leg,index)=>{
      const side=index===0?-1:1;
      const outside=Math.max(0,pose.carve*-side);
      const inside=Math.max(0,pose.carve*side);
      leg.rotation.z=mix(leg.rotation.z,side*(.16+inside*.045-outside*.025),.18);
      leg.rotation.x=mix(leg.rotation.x,-.10-pose.speed*.04-ascent*.055*airScale-apex*.085*airScale-descent*.15*airScale-pose.landing*.12,.18);
    });
    skis.forEach((ski,index)=>{
      const side=index===0?-1:1;
      ski.rotation.y=mix(ski.rotation.y,-pose.carve*.065+side*.018,.18);
      ski.rotation.z=mix(ski.rotation.z,-pose.carve*.075+groundRoll*.16,.18);
      ski.rotation.x=mix(ski.rotation.x,ascent*.105*airScale+apex*.022-descent*.075*airScale-pose.landing*.025+groundPitch*.28,.18);
      const localGround=(side<0?leftGround:rightGround)-centerGround;
      ski.position.y=mix(ski.position.y,.12+pose.air*.025-pose.landing*.012+THREE.MathUtils.clamp(localGround*.18,-.018,.018),.18);
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
  const skis=[];
  const placement=footBasedSkiPlacement(root,rig);
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

  const update=({dt=1/60,steer=0,air=false,landing=0,speed=12,time=0,verticalVelocity=0,jumpSource=''}={})=>{
    poseDt=dt;
    const mix=(a,b,response)=>THREE.MathUtils.lerp(a,b,1-Math.pow(1-response,dt*60));
    const targetCarve=THREE.MathUtils.clamp(steer,-1,1);
    const reversing=Math.sign(targetCarve)!==Math.sign(pose.carve)&&Math.abs(targetCarve)>.035&&Math.abs(pose.carve)>.035;
    pose.carve=mix(pose.carve,targetCarve,reversing?SKI_TUNING.POSE_REVERSAL_BLEND:SKI_TUNING.POSE_CARVE_BLEND);
    pose.speed=mix(pose.speed,THREE.MathUtils.clamp((speed-12)/19,0,1),.08);
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

    // Neutral stance: light knee flex, low hips, gentle forward body angle.
    const hipFlex=.08+speedCrouch*.045+landingBlend*.11-ascent*.045*airScale+descent*.075*airScale;
    const hipLean=-carve*.10*stance;
    rotate('hips',hipFlex,0,hipLean,.22);
    rotate('spine',-.055-speedCrouch*.03-ascent*.030*airScale+apex*.018+descent*.038*airScale,carve*.016,carve*.055*stance,.18);
    rotate('chest',-.028-speedCrouch*.018-ascent*.024*airScale+apex*.014+descent*.032*airScale,carve*.018,carve*.038*stance,.18);
    rotate('neck',.022+speedCrouch*.01,0,-carve*.012,.16);
    rotate('head',.012,0,-carve*.014,.14);

    for(const [side,sideSign] of [['left',-1],['right',1]]){
      const outside=Math.max(0,carve*-sideSign);
      const inside=Math.max(0,carve*sideSign);

      // Outside leg lengthens slightly; inside leg compresses while both retain a safe base flex.
      const thigh=-.30-speedCrouch*.07-landingBlend*.12-ascent*.055*airScale-apex*.070*airScale-descent*.13*airScale+outside*.045-inside*.055;
      const shin=.54+speedCrouch*.08+landingBlend*.20+ascent*.075*airScale+apex*.11*airScale+descent*.19*airScale-outside*.065+inside*.075;
      const foot=-.20+speedCrouch*.025+ascent*.060*airScale-descent*.055*airScale-carve*.025;

      rotate(side+'Thigh',thigh,0,sideSign*(.025+inside*.018),.22);
      rotate(side+'Shin',shin,0,0,.22);
      rotate(side+'Foot',foot,0,-carve*.035,.20);

      // Arms stay compact and controlled; airborne pose opens only enough for balance.
      const armPull=speedCrouch*.055;
      rotate(side+'Shoulder',0,0,sideSign*(.10-armPull)+carve*.014,.17);
      rotate(side+'UpperArm',-.27-armPull-ascent*.15*airScale+apex*.045+descent*.060*airScale+outside*.035,0,sideSign*.085+carve*.018,.18);
      rotate(side+'Forearm',-.46-speedCrouch*.045+ascent*.055*airScale+apex*.095*airScale+descent*.075*airScale-inside*.055,0,0,.18);
      rotate(side+'Hand',.045,0,sideSign*carve*.01,.16);
    }

    // Keep vertical movement subtle: landing compresses, airtime lifts the tucked pose.
    model.position.y=modelBaseY+Math.sin(time*5.2)*.004-landingBlend*.042+airBlend*.010+apex*.010*airScale;
  };
  update.rig=rig;
  update.pose=pose;
  return update;
}

export async function loadSkier(url='/models/default.glb'){
  let loadedModel=null,loadedRoot=null;
  try{
    const gltf=await new GLTFLoader().loadAsync(url);
    const model=gltf.scene;loadedModel=model;
    model.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;o.frustumCulled=false;}});
    fitModel(model);
    const updateRig=makeRigController(model);
    const root=new THREE.Group();loadedRoot=root;
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
      const dt=state.dt??1/60;
      const mix=(a,b,response)=>THREE.MathUtils.lerp(a,b,1-Math.pow(1-response,dt*60));
      updateRig?.(state);
      const pose=updateRig?.pose;
      const carve=pose?.carve??THREE.MathUtils.clamp(state.steer||0,-1,1);
      const air=pose?.air??Number(!!state.air);
      const landing=pose?.landing??THREE.MathUtils.clamp(state.landing||0,0,1);
      const speed=pose?.speed??THREE.MathUtils.clamp(((state.speed||12)-12)/19,0,1);
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
      skis.forEach((ski,index)=>{
        const side=index===0?-1:1;
        const rest=ski.userData.restPosition;
        const outside=Math.max(0,carve*-side);
        const inside=Math.max(0,carve*side);
        const localGround=(side<0?leftGround:rightGround)-centerGround;

        // Yaw follows the carve, roll provides a visible but restrained edge angle.
        ski.rotation.y=mix(ski.rotation.y,-carve*.065+side*.012,.18);
        ski.rotation.z=mix(ski.rotation.z,-carve*.075+groundRoll*.16,.18);
        ski.rotation.x=mix(ski.rotation.x,ascent*.105*airScale+apex*.022-descent*.075*airScale-landing*.026+groundPitch*.28,.18);

        // Preserve avatar-specific spacing while allowing a tiny terrain-contact correction.
        ski.position.x=mix(ski.position.x,rest.x+side*(inside*.012-outside*.006),.18);
        ski.position.y=mix(ski.position.y,rest.y+air*.026-landing*.012-speed*.004+THREE.MathUtils.clamp(localGround*.18,-.018,.018),.18);
        ski.position.z=mix(ski.position.z,rest.z+air*.018,.18);
      });
    };
    return root;
  }catch(error){
    disposeAvatarObject(loadedRoot?.children.length?loadedRoot:loadedModel);
    console.info('Using procedural skier until a Chimpion GLB is installed:',error.message);
    return createFallbackSkier();
  }
}
