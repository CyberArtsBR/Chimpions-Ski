import * as THREE from 'three';

export const BATCHED_COURSE_KINDS=Object.freeze(['tree','rock','log','wideLog','oil']);
const BATCHED_KIND_SET=new Set(BATCHED_COURSE_KINDS);
const METADATA_KEYS=['radius','radiusX','radiusZ','clearance','yOffset'];
const _rootMatrix=new THREE.Matrix4();
const _instanceMatrix=new THREE.Matrix4();
const _inverseRoot=new THREE.Matrix4();
const _extraYaw=new THREE.Quaternion();
const _composedQuaternion=new THREE.Quaternion();
const _composedScale=new THREE.Vector3();
const _yAxis=new THREE.Vector3(0,1,0);

function hash01(value){
  const x=Math.sin(value*12.9898+78.233)*43758.5453;
  return x-Math.floor(x);
}

function copyGameplayMetadata(prototype,kind){
  const userData={kind,batchedCourseRender:true};
  for(const key of METADATA_KEYS){
    if(prototype.userData[key]!=null)userData[key]=prototype.userData[key];
  }
  return userData;
}

function collectComponents(world,kind,prototype,capacity){
  prototype.updateMatrixWorld(true);
  _inverseRoot.copy(prototype.matrixWorld).invert();
  const components=[];

  prototype.traverse(node=>{
    if(!node.isMesh)return;
    node.updateWorldMatrix(true,false);
    const relative=new THREE.Matrix4().multiplyMatrices(_inverseRoot,node.matrixWorld);
    const batch=new THREE.InstancedMesh(node.geometry,node.material,capacity);
    batch.name='course-batch-'+kind+'-'+components.length;
    batch.count=0;
    batch.castShadow=node.castShadow;
    batch.receiveShadow=node.receiveShadow;
    batch.renderOrder=node.renderOrder;
    batch.frustumCulled=false;
    batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    batch.userData.courseBatchKind=kind;
    world.add(batch);
    components.push({mesh:batch,relative});
  });

  return {
    components,
    baseQuaternion:prototype.quaternion.clone(),
    baseScale:prototype.scale.clone(),
    metadata:copyGameplayMetadata(prototype,kind),
    count:0
  };
}

export function createCourseRenderBatches({
  world,
  prototypes,
  capacity=512,
  renderMinZ=-315,
  renderMaxZ=28
}){
  const kinds={};
  let serial=0;
  let dirty=true;
  let lastDiagnostics={
    activeLogical:0,
    renderedInstances:0,
    batchDrawCalls:0,
    legacyDrawCalls:0,
    overflow:0,
    capacity,
    renderMinZ,
    renderMaxZ,
    kindCounts:{}
  };

  for(const kind of BATCHED_COURSE_KINDS){
    const prototype=prototypes[kind];
    if(!prototype)throw new Error('Missing course batch prototype for '+kind);
    kinds[kind]=collectComponents(world,kind,prototype,capacity);
  }

  function isBatchedKind(kind){
    return BATCHED_KIND_SET.has(kind);
  }

  function createHandle(kind){
    const info=kinds[kind];
    if(!info)throw new Error('Unsupported batched course kind '+kind);
    const id=++serial;
    const item={
      position:new THREE.Vector3(),
      visible:false,
      userData:{...info.metadata,batchSerial:id}
    };

    if(kind==='rock'){
      item.userData.visualYaw=(hash01(id*1.71)-.5)*.54;
      item.userData.visualScaleX=.92+hash01(id*2.37)*.16;
      item.userData.visualScaleZ=.93+hash01(id*3.11)*.14;
    }else{
      item.userData.visualYaw=0;
      item.userData.visualScaleX=1;
      item.userData.visualScaleZ=1;
    }
    return item;
  }

  function activate(item){
    item.visible=true;
    dirty=true;
  }

  function deactivate(item){
    item.visible=false;
    dirty=true;
  }

  function sync(course,force=false){
    if(!dirty&&!force)return lastDiagnostics;

    for(const info of Object.values(kinds))info.count=0;
    let activeLogical=0;
    let renderedInstances=0;
    let overflow=0;

    for(let i=0;i<course.length;i++){
      const item=course[i];
      if(!item?.visible)continue;
      const info=kinds[item.userData.kind];
      if(!info)continue;
      activeLogical++;
      if(item.position.z<renderMinZ||item.position.z>renderMaxZ)continue;

      const index=info.count++;
      if(index>=capacity){
        overflow++;
        continue;
      }

      _extraYaw.setFromAxisAngle(_yAxis,item.userData.visualYaw||0);
      _composedQuaternion.copy(info.baseQuaternion).multiply(_extraYaw);
      _composedScale.set(
        info.baseScale.x*(item.userData.visualScaleX||1),
        info.baseScale.y,
        info.baseScale.z*(item.userData.visualScaleZ||1)
      );
      _rootMatrix.compose(item.position,_composedQuaternion,_composedScale);

      for(const component of info.components){
        _instanceMatrix.multiplyMatrices(_rootMatrix,component.relative);
        component.mesh.setMatrixAt(index,_instanceMatrix);
      }
      renderedInstances++;
    }

    let batchDrawCalls=0;
    let legacyDrawCalls=0;
    const kindCounts={};
    for(const [kind,info] of Object.entries(kinds)){
      const drawCount=Math.min(info.count,capacity);
      kindCounts[kind]=drawCount;
      for(const component of info.components){
        component.mesh.count=drawCount;
        component.mesh.instanceMatrix.needsUpdate=true;
      }
      if(drawCount>0)batchDrawCalls+=info.components.length;
      legacyDrawCalls+=drawCount*info.components.length;
    }

    lastDiagnostics={
      activeLogical,
      renderedInstances,
      batchDrawCalls,
      legacyDrawCalls,
      overflow,
      capacity,
      renderMinZ,
      renderMaxZ,
      kindCounts
    };
    dirty=false;
    return lastDiagnostics;
  }

  function getDiagnostics(){
    return lastDiagnostics;
  }

  function getComponentCounts(){
    const result={};
    for(const [kind,info] of Object.entries(kinds))result[kind]=info.components.length;
    return result;
  }

  return {
    isBatchedKind,
    createHandle,
    activate,
    deactivate,
    sync,
    getDiagnostics,
    getComponentCounts,
    markDirty(){dirty=true;}
  };
}
