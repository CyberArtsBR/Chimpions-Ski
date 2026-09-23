import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

export const START_CROWD_COUNT=50;
const SOURCE_MODEL_COUNT=START_CROWD_COUNT;
// These are the 50 smallest distinct GLBs in the current collection. Keeping
// the crowd on this lightweight pool preserves 50 unique 3D Chimpions while
// avoiding the very large character files during the short start sequence.
const CROWD_LIGHTWEIGHT_IDS=new Set([
  '56','53','179','185','181','208','124','114','100','13',
  '75','95','136','180','166','73','86','6','141','50',
  '126','extra-thefirstborn','182','142','67','109','149','20','189','165',
  '130','52','155','157','41','15','21','209','203','218',
  '99','145','94','28','37','159','89','88','113','116'
]);
const CROWD_HEIGHT=1.72;
const ROWS=[
  {count:10,z:6.05,rise:.22},
  {count:10,z:7.42,rise:.61},
  {count:10,z:8.79,rise:1.00},
  {count:10,z:10.16,rise:1.39},
  {count:10,z:11.53,rise:1.78}
];

const ARM_ALIASES={
  Shoulder:['shoulder','clavicle','collar'],
  UpperArm:['upperarm','arm','uparm'],
  Forearm:['forearm','lowerarm','elbow'],
  Hand:['hand','wrist']
};

function nameParts(name=''){
  let value=name.replace(/([a-z0-9])([A-Z])/g,'$1 $2').toLowerCase()
    .replace(/mixamorig\d*[:_ ]*/g,'').replace(/cc[_ ]*base[_ ]*/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  let words=value.split(/\s+/).filter(Boolean);
  let side=words.includes('left')||words.includes('l')?'left':words.includes('right')||words.includes('r')?'right':'';
  let core=words.filter(word=>!['left','right','l','r','bone','def','bip','bip001'].includes(word)).join('');
  if(!side&&/^(left|right)/.test(core)){
    side=core.startsWith('left')?'left':'right';
    core=core.slice(side.length);
  }
  return {side,core};
}

function mapArmRig(model){
  const bones=[];
  model.traverse(object=>{if(object.isBone)bones.push(object);});
  const rig={};
  for(const side of ['left','right']){
    for(const kind of ['Shoulder','UpperArm','Forearm','Hand']){
      const matches=bones.filter(bone=>{
        const parsed=nameParts(bone.name);
        return parsed.side===side&&ARM_ALIASES[kind].includes(parsed.core);
      });
      if(matches.length===1)rig[side+kind]=matches[0];
    }
  }
  return rig;
}

function fitTemplate(model,targetHeight=CROWD_HEIGHT){
  model.updateWorldMatrix(true,true);
  const firstBox=new THREE.Box3().setFromObject(model);
  const size=firstBox.getSize(new THREE.Vector3());
  model.scale.setScalar(targetHeight/Math.max(.001,size.y));
  model.updateWorldMatrix(true,true);
  const fitted=new THREE.Box3().setFromObject(model);
  const center=fitted.getCenter(new THREE.Vector3());
  model.position.x-=center.x;
  model.position.z-=center.z;
  model.position.y-=fitted.min.y;
  model.updateWorldMatrix(true,true);
}

function poseCheeringArms(model){
  const rig=mapArmRig(model);
  const required=['leftUpperArm','leftForearm','rightUpperArm','rightForearm'];
  if(required.some(key=>!rig[key]))return false;

  model.updateWorldMatrix(true,true);
  const rest=new Map();
  const restDirections=new Map();
  const sample=new THREE.Vector3();
  for(const key of Object.keys(rig))rest.set(rig[key],rig[key].quaternion.clone());
  for(const [key,childKey] of [
    ['leftUpperArm','leftForearm'],['rightUpperArm','rightForearm'],
    ['leftForearm','leftHand'],['rightForearm','rightHand']
  ]){
    const bone=rig[key],child=rig[childKey];
    if(!bone||!child)continue;
    child.getWorldPosition(sample);
    const direction=bone.worldToLocal(sample).normalize().clone();
    if(direction.lengthSq()>.5)restDirections.set(key,direction);
  }

  const modelQ=new THREE.Quaternion();
  const parentQ=new THREE.Quaternion();
  const inverseParentQ=new THREE.Quaternion();
  const baseWorldQ=new THREE.Quaternion();
  const alignWorldQ=new THREE.Quaternion();
  const targetWorldQ=new THREE.Quaternion();
  const targetLocalQ=new THREE.Quaternion();
  const baseline=new THREE.Vector3();
  const right=new THREE.Vector3();
  const up=new THREE.Vector3();
  const forward=new THREE.Vector3();
  const desired=new THREE.Vector3();

  model.getWorldQuaternion(modelQ);
  right.set(1,0,0).applyQuaternion(modelQ).normalize();
  up.set(0,1,0).applyQuaternion(modelQ).normalize();
  forward.set(0,0,1).applyQuaternion(modelQ).normalize();

  // Different Chimpion rigs do not all author LEFT/RIGHT on the same local X.
  // Derive each arm's outward side from the untouched GLB rest pose, exactly
  // like the playable rider, so cheering never folds hands across the chest.
  const armOutwardSigns=new Map();
  const sideProbe=new THREE.Vector3();
  for(const [side,fallback] of [['left',-1],['right',1]]){
    const upper=rig[side+'UpperArm']||rig[side+'Shoulder'];
    if(!upper){
      armOutwardSigns.set(side,fallback);
      continue;
    }
    upper.getWorldPosition(sideProbe);
    model.worldToLocal(sideProbe);
    armOutwardSigns.set(side,Math.sign(sideProbe.x)||fallback);
  }

  function aim(key,target){
    const bone=rig[key],restDirection=restDirections.get(key);
    if(!bone?.parent||!restDirection)return false;
    bone.parent.getWorldQuaternion(parentQ);
    baseWorldQ.copy(parentQ).multiply(rest.get(bone));
    baseline.copy(restDirection).applyQuaternion(baseWorldQ).normalize();
    alignWorldQ.setFromUnitVectors(baseline,target.normalize());
    targetWorldQ.copy(alignWorldQ).multiply(baseWorldQ);
    inverseParentQ.copy(parentQ).invert();
    targetLocalQ.copy(inverseParentQ).multiply(targetWorldQ);
    bone.quaternion.copy(targetLocalQ);
    bone.updateWorldMatrix(true,true);
    return true;
  }

  for(const [side,sideSign] of [['left',-1],['right',1]]){
    const authoredOutSign=armOutwardSigns.get(side)??sideSign;
    const shoulder=rig[side+'Shoulder'];
    if(shoulder&&rest.has(shoulder))shoulder.quaternion.copy(rest.get(shoulder));

    desired.copy(right).multiplyScalar(authoredOutSign*.78)
      .addScaledVector(up,1.02)
      .addScaledVector(forward,.08)
      .normalize();
    aim(side+'UpperArm',desired);

    desired.copy(right).multiplyScalar(authoredOutSign*.62)
      .addScaledVector(up,1.08)
      .addScaledVector(forward,.06)
      .normalize();
    aim(side+'Forearm',desired);

    const hand=rig[side+'Hand'];
    if(hand&&rest.has(hand))hand.quaternion.copy(rest.get(hand));
  }
  model.updateWorldMatrix(true,true);
  return true;
}


function chooseSources(entries=[],count=SOURCE_MODEL_COUNT){
  const seen=new Set();
  const usable=[];
  for(const entry of entries){
    const key=String(entry?.id||entry?.url||'');
    if(!entry?.url||!key||seen.has(key))continue;
    seen.add(key);
    usable.push(entry);
  }
  if(!usable.length)return [];

  const lightweight=[];
  const fallback=[];
  for(const entry of usable){
    if(CROWD_LIGHTWEIGHT_IDS.has(String(entry.id)))lightweight.push(entry);
    else fallback.push(entry);
  }

  // Preserve the exact 50 lightweight distinct characters when the current
  // catalog contains them. Fallback remains unique and only fills missing IDs.
  const selected=[...lightweight,...fallback].slice(0,Math.min(count,usable.length));
  return selected;
}

export function createStartCrowd({world,terrainHeight=()=>0,maxSpectators=START_CROWD_COUNT}={}){
  const crowdCount=Math.max(1,Math.min(START_CROWD_COUNT,Math.floor(Number(maxSpectators)||START_CROWD_COUNT)));
  const root=new THREE.Group();
  root.name='start-crowd';
  world?.add(root);

  const actors=[];
  const loader=new GLTFLoader();
  let loadedCount=0;
  let posedCount=0;
  let modelSourceCount=0;
  let loadGeneration=0;
  let clock=0;
  let built=false;
  let released=false;
  let lastEntries=[];
  let loadingPromise=null;

  function collectMaterialTextures(material,textures){
    if(!material)return;
    for(const value of Object.values(material)){
      if(value?.isTexture)textures.add(value);
      else if(value?.value?.isTexture)textures.add(value.value);
      else if(Array.isArray(value)){
        for(const item of value)if(item?.isTexture)textures.add(item);
      }
    }
  }

  function disposeNodeResources(nodes){
    const geometries=new Set();
    const materials=new Set();
    const textures=new Set();
    const skeletons=new Set();

    for(const node of nodes){
      node?.traverse?.(object=>{
        if(object.geometry)geometries.add(object.geometry);
        if(object.skeleton)skeletons.add(object.skeleton);
        const mats=Array.isArray(object.material)?object.material:[object.material];
        for(const material of mats){
          if(!material)continue;
          materials.add(material);
          collectMaterialTextures(material,textures);
        }
      });
    }

    for(const skeleton of skeletons)skeleton.dispose?.();
    for(const texture of textures)texture.dispose?.();
    for(const material of materials)material.dispose?.();
    for(const geometry of geometries)geometry.dispose?.();
  }

  function buildStructure(){
    if(built)return;

    const bleacherMaterial=new THREE.MeshStandardMaterial({color:0x7b5638,roughness:.86,metalness:.01});
    const railMaterial=new THREE.MeshStandardMaterial({color:0xdce8ec,roughness:.42,metalness:.58});
    const seatGeometry=new THREE.BoxGeometry(18.4,.18,1.02);
    const railGeometry=new THREE.BoxGeometry(18.4,.08,.08);

    let actorIndex=0;
    for(let rowIndex=0;rowIndex<ROWS.length;rowIndex++){
      const row=ROWS[rowIndex];
      const rowGround=terrainHeight(0,row.z);
      const deckY=rowGround+row.rise;

      const seat=new THREE.Mesh(seatGeometry,bleacherMaterial);
      seat.position.set(0,deckY,row.z);
      seat.castShadow=false;
      seat.receiveShadow=true;
      root.add(seat);

      const rearRail=new THREE.Mesh(railGeometry,railMaterial);
      rearRail.position.set(0,deckY+1.95,row.z+.55);
      root.add(rearRail);

      for(const railX of [-9.05,9.05]){
        const upright=new THREE.Mesh(new THREE.BoxGeometry(.08,2,.08),railMaterial);
        upright.position.set(railX,deckY+.96,row.z+.55);
        root.add(upright);
      }

      for(let column=0;column<row.count;column++){
        if(actorIndex>=crowdCount)break;
        const t=row.count===1?.5:column/(row.count-1);
        const rowOffset=rowIndex%2===0?-.10:.10;
        const x=THREE.MathUtils.lerp(-8.05,8.05,t)+rowOffset;
        const actor=new THREE.Group();
        actor.name='start-spectator-'+actorIndex;
        const baseY=deckY+.10;
        actor.position.set(x,baseY,row.z-.04);

        const energy=actorIndex%6===0?0:(.055+(actorIndex%5)*.027);
        actor.userData.baseY=baseY;
        actor.userData.jumpAmplitude=energy;
        actor.userData.jumpHz=.52+(actorIndex%7)*.085;
        actor.userData.phase=(actorIndex*.61803398875%1)*Math.PI*2;
        actor.userData.sway=(actorIndex%2?-1:1)*(.010+(actorIndex%4)*.004);
        actors.push(actor);
        root.add(actor);
        actorIndex++;
      }
    }

    built=true;
    released=false;
    root.visible=true;
  }

  async function loadTemplate(entry){
    const url=entry?.url?('/'+String(entry.url).replace(/^\/+/,'')):'/models/default.glb';
    const gltf=await loader.loadAsync(url);
    const model=gltf.scene;
    model.rotation.y=Math.PI;
    model.traverse(object=>{
      if(object.isMesh){
        object.castShadow=false;
        object.receiveShadow=false;
        object.frustumCulled=true;
      }
    });
    fitTemplate(model);
    return model;
  }

  function clearActorModels({dispose=true}={}){
    if(dispose)disposeNodeResources(actors);
    for(const actor of actors)actor.clear();
    loadedCount=0;
    posedCount=0;
    modelSourceCount=0;
  }

  async function loadSpectators(entries=[]){
    lastEntries=Array.isArray(entries)?entries:lastEntries;
    buildStructure();

    const generation=++loadGeneration;
    const sources=chooseSources(lastEntries,crowdCount);
    let templates=[];

    if(sources.length){
      const results=new Array(sources.length);
      let cursor=0;
      const workerCount=Math.min(8,sources.length);
      const workers=Array.from({length:workerCount},async()=>{
        while(generation===loadGeneration){
          const index=cursor++;
          if(index>=sources.length)break;
          try{results[index]=await loadTemplate(sources[index]);}
          catch{}
          // Parsing rigged GLBs is main-thread heavy. Yield between models so
          // selector/menu rendering never freezes behind the 50-model preload.
          await new Promise(resolve=>setTimeout(resolve,0));
        }
      });
      await Promise.all(workers);
      templates=results.filter(Boolean);
    }
    if(!templates.length){
      try{templates=[await loadTemplate({url:'models/default.glb'})];}
      catch(error){console.warn('Could not load 3D start crowd:',error);return 0;}
    }
    if(generation!==loadGeneration){
      disposeNodeResources(templates);
      return loadedCount;
    }

    clearActorModels({dispose:true});
    const uniqueTemplates=templates.slice(0,actors.length);
    modelSourceCount=uniqueTemplates.length;
    for(let index=0;index<uniqueTemplates.length;index++){
      if(generation!==loadGeneration)break;
      const instance=uniqueTemplates[index];
      const actor=actors[index];
      instance.name='crowd-glb-'+index;
      const scaleJitter=.94+(index%5)*.025;
      instance.scale.multiplyScalar(scaleJitter);
      actor.add(instance);
      if(poseCheeringArms(instance))posedCount++;
      loadedCount++;
      if(index%4===3)await new Promise(resolve=>setTimeout(resolve,0));
    }
    root.updateMatrixWorld(true);
    released=false;
    root.visible=true;
    return loadedCount;
  }

  function setSpectators(entries=[]){
    if(loadingPromise)return loadingPromise;
    const pending=loadSpectators(entries);
    let wrapped=null;
    wrapped=pending.finally(()=>{
      if(loadingPromise===wrapped)loadingPromise=null;
    });
    loadingPromise=wrapped;
    return wrapped;
  }

  async function ensureLoaded(entries=lastEntries){
    if(!released&&built&&loadedCount===crowdCount)return loadedCount;
    if(loadingPromise)return loadingPromise;
    return setSpectators(entries);
  }

  function release(){
    if(released&&!built)return false;
    loadGeneration++;
    disposeNodeResources([root]);
    root.clear();
    actors.length=0;
    loadedCount=0;
    posedCount=0;
    modelSourceCount=0;
    built=false;
    released=true;
    root.visible=false;
    root.position.z=0;
    return true;
  }

  function reset(){
    buildStructure();
    root.position.z=0;
    root.visible=true;
    clock=0;
    for(const actor of actors){
      actor.position.y=actor.userData.baseY;
      actor.rotation.z=0;
    }
  }

  function update(dt,{mode='menu',worldDistance=0}={}){
    if(!built||released){
      root.visible=false;
      return;
    }

    root.position.z+=Math.max(0,Number(worldDistance)||0);

    // Once the start area is safely behind the camera, release every crowd GLB,
    // skeleton, geometry, material, texture and bleacher resource from GPU memory.
    if(mode==='playing'&&root.position.z>=30){
      release();
      return;
    }

    root.visible=root.position.z<28;
    if(!root.visible)return;

    const cheering=mode==='countdown'||(mode==='playing'&&root.position.z<13);
    if(cheering)clock+=Math.max(0,Number(dt)||0);
    for(const actor of actors){
      const amp=cheering?actor.userData.jumpAmplitude:0;
      const wave=Math.sin(clock*actor.userData.jumpHz*Math.PI*2+actor.userData.phase);
      const jump=amp*Math.pow(Math.max(0,wave),3);
      actor.position.y=actor.userData.baseY+jump;
      actor.rotation.z=cheering?Math.sin(clock*(1.35+actor.userData.jumpHz)+actor.userData.phase)*actor.userData.sway:0;
    }
  }

  buildStructure();

  return {
    setSpectators,
    ensureLoaded,
    release,
    reset,
    update,
    get count(){return actors.length;},
    get loadedCount(){return loadedCount;},
    get posedCount(){return posedCount;},
    get modelSourceCount(){return modelSourceCount;},
    get visible(){return root.visible;},
    get released(){return released;}
  };
}
