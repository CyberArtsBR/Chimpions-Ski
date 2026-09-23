import * as THREE from 'three';
import {createCrowdAssetCache,disposeCrowdClone} from './crowdAssetCache.js';
import {
  START_CROWD_COUNT,
  chooseCrowdSources,
  crowdSourceKey
} from './crowdManifest.js';

export {START_CROWD_COUNT};

export const DEFAULT_CROWD_QUALITY=Object.freeze({
  maxSpectators:START_CROWD_COUNT,
  startReadyCount:10,
  loadConcurrency:3,
  startWaitMs:900,
  assetTimeoutMs:10000
});

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

function clampInt(value,min,max,fallback){
  const parsed=Math.floor(Number(value));
  return Number.isFinite(parsed)?Math.max(min,Math.min(max,parsed)):fallback;
}

export function normalizeCrowdQuality(input={}){
  const maxSpectators=clampInt(input.maxSpectators,1,START_CROWD_COUNT,DEFAULT_CROWD_QUALITY.maxSpectators);
  return {
    maxSpectators,
    startReadyCount:clampInt(input.startReadyCount,1,maxSpectators,Math.min(DEFAULT_CROWD_QUALITY.startReadyCount,maxSpectators)),
    loadConcurrency:clampInt(input.loadConcurrency,1,6,DEFAULT_CROWD_QUALITY.loadConcurrency),
    startWaitMs:clampInt(input.startWaitMs,0,5000,DEFAULT_CROWD_QUALITY.startWaitMs),
    assetTimeoutMs:clampInt(input.assetTimeoutMs,500,30000,DEFAULT_CROWD_QUALITY.assetTimeoutMs)
  };
}

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

function prepareTemplate(model){
  model.rotation.y=Math.PI;
  model.traverse(object=>{
    if(object.isMesh){
      object.castShadow=false;
      object.receiveShadow=false;
      object.frustumCulled=true;
    }
  });
  fitTemplate(model);
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
      .addScaledVector(up,1.02).addScaledVector(forward,.08).normalize();
    aim(side+'UpperArm',desired);

    desired.copy(right).multiplyScalar(authoredOutSign*.62)
      .addScaledVector(up,1.08).addScaledVector(forward,.06).normalize();
    aim(side+'Forearm',desired);

    const hand=rig[side+'Hand'];
    if(hand&&rest.has(hand))hand.quaternion.copy(rest.get(hand));
  }
  model.updateWorldMatrix(true,true);
  return true;
}

function browserYield(){
  return new Promise(resolve=>{
    if(typeof requestIdleCallback==='function')requestIdleCallback(()=>resolve(),{timeout:34});
    else setTimeout(resolve,0);
  });
}

function delay(ms){
  return new Promise(resolve=>setTimeout(resolve,Math.max(0,ms||0)));
}

export function createStartCrowd({
  world,
  terrainHeight=()=>0,
  maxSpectators,
  quality,
  assetCache=createCrowdAssetCache()
}={}){
  let qualityState=normalizeCrowdQuality({
    ...(quality||{}),
    ...(maxSpectators==null?{}:{maxSpectators})
  });
  let crowdCount=qualityState.maxSpectators;

  const root=new THREE.Group();
  root.name='start-crowd';
  world?.add(root);

  const actors=[];
  const structureResources={geometries:new Set(),materials:new Set()};
  const placeholderDummy=new THREE.Object3D();
  let placeholderBodies=null;
  let placeholderHeads=null;
  let loadedCount=0;
  let posedCount=0;
  let modelSourceCount=0;
  let failedCount=0;
  let loadGeneration=0;
  let clock=0;
  let built=false;
  let released=false;
  let lastEntries=[];
  let activeJob=null;

  function trackGeometry(geometry){structureResources.geometries.add(geometry);return geometry;}
  function trackMaterial(material){structureResources.materials.add(material);return material;}

  function disposeStructureResources(){
    for(const material of structureResources.materials)material.dispose?.();
    for(const geometry of structureResources.geometries)geometry.dispose?.();
    structureResources.materials.clear();
    structureResources.geometries.clear();
  }

  function createPlaceholders(){
    const bodyGeometry=trackGeometry(new THREE.CylinderGeometry(.22,.30,.82,6));
    const headGeometry=trackGeometry(new THREE.SphereGeometry(.27,7,5));
    const material=trackMaterial(new THREE.MeshStandardMaterial({color:0xffffff,roughness:.82,metalness:0,vertexColors:true}));
    placeholderBodies=new THREE.InstancedMesh(bodyGeometry,material,crowdCount);
    placeholderHeads=new THREE.InstancedMesh(headGeometry,material,crowdCount);
    placeholderBodies.name='start-crowd-progressive-placeholder-bodies';
    placeholderHeads.name='start-crowd-progressive-placeholder-heads';
    placeholderBodies.castShadow=placeholderHeads.castShadow=false;
    placeholderBodies.receiveShadow=placeholderHeads.receiveShadow=false;
    const color=new THREE.Color();
    for(let index=0;index<crowdCount;index++){
      color.setHSL((index*.173)%1,.48,.54+(index%3)*.035);
      placeholderBodies.setColorAt(index,color);
      placeholderHeads.setColorAt(index,color);
    }
    root.add(placeholderBodies,placeholderHeads);
  }

  function updatePlaceholder(index,forceHidden=false){
    const actor=actors[index];
    if(!actor||!placeholderBodies||!placeholderHeads)return;
    const hidden=forceHidden||!!actor.userData.model;
    const scale=hidden?0:(.90+(index%5)*.025);

    placeholderDummy.position.set(actor.position.x,actor.position.y+.51,actor.position.z);
    placeholderDummy.rotation.set(0,0,actor.rotation.z);
    placeholderDummy.scale.setScalar(scale);
    placeholderDummy.updateMatrix();
    placeholderBodies.setMatrixAt(index,placeholderDummy.matrix);

    placeholderDummy.position.y=actor.position.y+1.02;
    placeholderDummy.scale.setScalar(scale);
    placeholderDummy.updateMatrix();
    placeholderHeads.setMatrixAt(index,placeholderDummy.matrix);
  }

  function flushPlaceholderMatrices(){
    if(!placeholderBodies||!placeholderHeads)return;
    for(let index=0;index<actors.length;index++)updatePlaceholder(index);
    placeholderBodies.instanceMatrix.needsUpdate=true;
    placeholderHeads.instanceMatrix.needsUpdate=true;
    if(placeholderBodies.instanceColor)placeholderBodies.instanceColor.needsUpdate=true;
    if(placeholderHeads.instanceColor)placeholderHeads.instanceColor.needsUpdate=true;
  }

  function buildStructure(){
    if(built)return;

    const bleacherMaterial=trackMaterial(new THREE.MeshStandardMaterial({color:0x7b5638,roughness:.86,metalness:.01}));
    const railMaterial=trackMaterial(new THREE.MeshStandardMaterial({color:0xdce8ec,roughness:.42,metalness:.58}));
    const seatGeometry=trackGeometry(new THREE.BoxGeometry(18.4,.18,1.02));
    const railGeometry=trackGeometry(new THREE.BoxGeometry(18.4,.08,.08));
    const uprightGeometry=trackGeometry(new THREE.BoxGeometry(.08,2,.08));

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
        const upright=new THREE.Mesh(uprightGeometry,railMaterial);
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
        actor.userData.model=null;
        actor.userData.sourceKey='';
        actors.push(actor);
        root.add(actor);
        actorIndex++;
      }
    }

    createPlaceholders();
    flushPlaceholderMatrices();
    built=true;
    released=false;
    root.visible=true;
  }

  function clearActorModels(){
    for(const actor of actors){
      const model=actor.userData.model;
      if(model){
        actor.remove(model);
        disposeCrowdClone(model);
      }
      actor.userData.model=null;
      actor.userData.sourceKey='';
    }
    loadedCount=0;
    posedCount=0;
    failedCount=0;
    flushPlaceholderMatrices();
  }

  function attachModel(index,model,entry,generation){
    if(generation!==loadGeneration||released||!built){
      disposeCrowdClone(model);
      return false;
    }
    const actor=actors[index];
    if(!actor){
      disposeCrowdClone(model);
      return false;
    }

    if(actor.userData.model){
      actor.remove(actor.userData.model);
      disposeCrowdClone(actor.userData.model);
    }else loadedCount++;

    model.name='crowd-glb-'+index;
    const scaleJitter=.94+(index%5)*.025;
    model.scale.multiplyScalar(scaleJitter);
    actor.add(model);
    actor.userData.model=model;
    actor.userData.sourceKey=crowdSourceKey(entry);
    if(poseCheeringArms(model))posedCount++;
    updatePlaceholder(index,true);
    placeholderBodies.instanceMatrix.needsUpdate=true;
    placeholderHeads.instanceMatrix.needsUpdate=true;
    return true;
  }

  function startLoad(entries=lastEntries){
    lastEntries=Array.isArray(entries)?entries:lastEntries;
    buildStructure();

    if(activeJob&&activeJob.generation===loadGeneration){
      if(!activeJob.done)return activeJob;
      if(failedCount===0&&loadedCount>=modelSourceCount)return activeJob;
    }

    const sources=chooseCrowdSources(lastEntries,crowdCount);
    modelSourceCount=sources.length;
    const generation=++loadGeneration;
    const job={generation,sources,cursor:0,done:false,fullPromise:null,stopAfterStartReady:false};
    activeJob=job;

    const worker=async()=>{
      while(generation===loadGeneration&&!released){
        const startReadyLimit=Math.min(qualityState.startReadyCount,sources.length);
        if(job.stopAfterStartReady&&job.cursor>=startReadyLimit)break;
        const index=job.cursor++;
        if(index>=sources.length)break;
        const entry=sources[index];
        const actor=actors[index];
        if(actor?.userData.model&&actor.userData.sourceKey===crowdSourceKey(entry))continue;
        try{
          const {model}=await assetCache.instantiate(entry,{
            prepareTemplate,
            timeoutMs:qualityState.assetTimeoutMs
          });
          attachModel(index,model,entry,generation);
        }catch(error){
          if(generation===loadGeneration){
            failedCount++;
            console.warn('Could not load start crowd asset:',entry?.name||entry?.id||entry?.url,error?.message||error);
          }
        }
        await browserYield();
      }
    };

    const workers=Array.from({length:Math.min(qualityState.loadConcurrency,Math.max(1,sources.length))},worker);
    job.fullPromise=Promise.all(workers).then(()=>{
      job.done=true;
      return loadedCount;
    });
    return job;
  }

  function setSpectators(entries=[]){
    const job=startLoad(entries);
    return job.fullPromise;
  }

  async function waitForStartReady(job){
    const target=Math.min(qualityState.startReadyCount,Math.max(1,job.sources.length));
    if(loadedCount>=target||job.done)return loadedCount;
    const deadline=Date.now()+qualityState.startWaitMs;
    while(job.generation===loadGeneration&&!job.done&&loadedCount<target&&Date.now()<deadline){
      await delay(16);
    }
    return loadedCount;
  }

  async function ensureLoaded(entries=lastEntries){
    const job=startLoad(entries);
    // Once the player commits to a run, do not begin more progressive GLB parses.
    // Any already-started request may finish and populate its slot, while the
    // remaining actors stay represented by the two-draw-call placeholder crowd.
    job.stopAfterStartReady=true;
    if(!released&&built&&loadedCount>=Math.min(qualityState.startReadyCount,crowdCount))return loadedCount;
    return waitForStartReady(job);
  }

  function release(){
    if(released&&!built)return false;
    loadGeneration++;
    activeJob=null;
    clearActorModels();
    root.clear();
    actors.length=0;
    placeholderBodies=null;
    placeholderHeads=null;
    disposeStructureResources();
    loadedCount=0;
    posedCount=0;
    modelSourceCount=0;
    failedCount=0;
    built=false;
    released=true;
    root.visible=false;
    root.position.z=0;
    // Parsed templates intentionally remain in assetCache for warm restart.
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
    flushPlaceholderMatrices();
  }

  function setQuality(next={}){
    const previousCount=crowdCount;
    qualityState=normalizeCrowdQuality({...qualityState,...next});
    crowdCount=qualityState.maxSpectators;
    if(crowdCount!==previousCount){
      loadGeneration++;
      activeJob=null;
      clearActorModels();
      root.clear();
      actors.length=0;
      placeholderBodies=null;
      placeholderHeads=null;
      disposeStructureResources();
      built=false;
      released=false;
      buildStructure();
      if(lastEntries.length)startLoad(lastEntries);
    }
    return {...qualityState};
  }

  function update(dt,{mode='menu',worldDistance=0}={}){
    if(!built||released){
      root.visible=false;
      return;
    }

    root.position.z+=Math.max(0,Number(worldDistance)||0);

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
    flushPlaceholderMatrices();
  }

  buildStructure();

  return {
    setSpectators,
    ensureLoaded,
    release,
    reset,
    update,
    setQuality,
    disposeCache:()=>assetCache.disposeAll(),
    get count(){return actors.length;},
    get loadedCount(){return loadedCount;},
    get placeholderCount(){return Math.max(0,actors.length-loadedCount);},
    get posedCount(){return posedCount;},
    get failedCount(){return failedCount;},
    get modelSourceCount(){return modelSourceCount;},
    get startReady(){return loadedCount>=Math.min(qualityState.startReadyCount,Math.max(1,modelSourceCount||crowdCount));},
    get fullReady(){return modelSourceCount>0&&loadedCount>=modelSourceCount;},
    get cacheStats(){return assetCache.getStats();},
    get progressivePaused(){return !!activeJob?.stopAfterStartReady;},
    get quality(){return {...qualityState};},
    get visible(){return root.visible;},
    get released(){return released;}
  };
}
