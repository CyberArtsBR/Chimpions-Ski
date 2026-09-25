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

function collectComponentSpecs(prototype){
  prototype.updateMatrixWorld(true);
  _inverseRoot.copy(prototype.matrixWorld).invert();
  const specs=[];

  prototype.traverse(node=>{
    if(!node.isMesh)return;
    node.updateWorldMatrix(true,false);
    specs.push({
      geometry:node.geometry,
      material:node.material,
      relative:new THREE.Matrix4().multiplyMatrices(_inverseRoot,node.matrixWorld),
      castShadow:node.castShadow,
      receiveShadow:node.receiveShadow,
      renderOrder:node.renderOrder
    });
  });
  return specs;
}

function createPage(world,kind,variantIndex,pageIndex,specs,capacity){
  const components=specs.map((spec,componentIndex)=>{
    const batch=new THREE.InstancedMesh(spec.geometry,spec.material,capacity);
    batch.name=`course-batch-${kind}-v${variantIndex}-p${pageIndex}-c${componentIndex}`;
    batch.count=0;
    batch.castShadow=spec.castShadow;
    batch.receiveShadow=spec.receiveShadow;
    batch.renderOrder=spec.renderOrder;
    batch.frustumCulled=false;
    batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    batch.userData.courseBatchKind=kind;
    batch.userData.courseBatchVariant=variantIndex;
    batch.userData.courseBatchPage=pageIndex;
    world.add(batch);
    return {mesh:batch,relative:spec.relative};
  });
  return {components,count:0};
}

function collectVariant(world,kind,prototype,capacity,variantIndex){
  const specs=collectComponentSpecs(prototype);
  return {
    specs,
    baseQuaternion:prototype.quaternion.clone(),
    baseScale:prototype.scale.clone(),
    pages:[createPage(world,kind,variantIndex,0,specs,capacity)],
    count:0,
    kind,
    variantIndex
  };
}

export function createCourseRenderBatches({
  world,
  prototypes,
  capacity=512,
  renderMinZ=-315,
  renderMaxZ=28
}){
  const pageCapacity=Math.max(1,Math.trunc(Number(capacity)||512));
  const kinds={};
  const kindCounts={};
  const pagesByKind={};
  const capacityByKind={};
  let serial=0;
  let dirty=true;
  let growthEvents=0;
  let peakRenderedInstances=0;
  const lastDiagnostics={
    activeLogical:0,
    visibleLogical:0,
    renderedInstances:0,
    batchDrawCalls:0,
    legacyDrawCalls:0,
    overflow:0,
    overflowPrevented:0,
    growthEvents:0,
    activePages:0,
    allocatedPages:0,
    totalCapacity:0,
    peakRenderedInstances:0,
    capacity:pageCapacity,
    pageCapacity,
    renderMinZ,
    renderMaxZ,
    kindCounts,
    pagesByKind,
    capacityByKind
  };

  for(const kind of BATCHED_COURSE_KINDS){
    const prototype=prototypes[kind];
    if(!prototype)throw new Error('Missing course batch prototype for '+kind);
    const variants=(prototype.userData.visualVariants||[prototype])
      .map((visual,index)=>collectVariant(world,kind,visual,pageCapacity,index));
    kinds[kind]={variants,metadata:copyGameplayMetadata(prototype,kind),count:0};
    kindCounts[kind]=0;
    pagesByKind[kind]=variants.length;
    capacityByKind[kind]=variants.length*pageCapacity;
  }

  function isBatchedKind(kind){
    return BATCHED_KIND_SET.has(kind);
  }

  function ensurePage(variant,pageIndex){
    while(variant.pages.length<=pageIndex){
      variant.pages.push(createPage(
        world,
        variant.kind,
        variant.variantIndex,
        variant.pages.length,
        variant.specs,
        pageCapacity
      ));
      growthEvents++;
    }
    return variant.pages[pageIndex];
  }

  function createHandle(kind){
    const info=kinds[kind];
    if(!info)throw new Error('Unsupported batched course kind '+kind);
    const id=++serial;
    const item={
      position:new THREE.Vector3(),
      visible:false,
      userData:{
        ...info.metadata,
        batchSerial:id,
        batchRendered:false,
        batchPage:-1,
        batchInstance:-1,
        visualVariant:Math.floor(hash01(id*4.73)*info.variants.length)
      }
    };

    if(kind==='rock'){
      item.userData.visualYaw=(hash01(id*1.71)-.5)*.54;
      item.userData.visualScaleX=.92+hash01(id*2.37)*.16;
      item.userData.visualScaleZ=.93+hash01(id*3.11)*.14;
    }else{
      item.userData.visualYaw=kind==='tree'?hash01(id*2.17)*Math.PI*2:0;
      item.userData.visualScaleX=1;
      item.userData.visualScaleZ=1;
    }
    return item;
  }

  function activate(item){
    item.visible=true;
    item.userData.batchRendered=false;
    dirty=true;
  }

  function deactivate(item){
    item.visible=false;
    item.userData.batchRendered=false;
    item.userData.batchPage=-1;
    item.userData.batchInstance=-1;
    dirty=true;
  }

  function sync(course,force=false){
    if(!dirty&&!force)return lastDiagnostics;

    for(const kind of BATCHED_COURSE_KINDS){
      kinds[kind].count=0;
      for(const variant of kinds[kind].variants){
        variant.count=0;
        for(const page of variant.pages){
          page.count=0;
          for(const component of page.components)component.mesh.count=0;
        }
      }
    }

    let activeLogical=0;
    let visibleLogical=0;
    let renderedInstances=0;
    let overflowPrevented=0;

    for(let i=0;i<course.length;i++){
      const item=course[i];
      const info=kinds[item?.userData?.kind];
      if(!info)continue;
      item.userData.batchRendered=false;
      item.userData.batchPage=-1;
      item.userData.batchInstance=-1;
      if(!item.visible)continue;
      activeLogical++;
      if(item.position.z<renderMinZ||item.position.z>renderMaxZ)continue;

      visibleLogical++;
      info.count++;
      const variantIndex=Math.min(
        info.variants.length-1,
        Math.max(0,Math.trunc(item.userData.visualVariant||0))
      );
      const variant=info.variants[variantIndex];
      const ordinal=variant.count++;
      const pageIndex=Math.floor(ordinal/pageCapacity);
      const index=ordinal%pageCapacity;
      const page=ensurePage(variant,pageIndex);
      page.count=Math.max(page.count,index+1);
      if(pageIndex>0)overflowPrevented++;

      _extraYaw.setFromAxisAngle(_yAxis,item.userData.visualYaw||0);
      _composedQuaternion.copy(variant.baseQuaternion).multiply(_extraYaw);
      _composedScale.set(
        variant.baseScale.x*(item.userData.visualScaleX||1),
        variant.baseScale.y,
        variant.baseScale.z*(item.userData.visualScaleZ||1)
      );
      _rootMatrix.compose(item.position,_composedQuaternion,_composedScale);

      for(const component of page.components){
        _instanceMatrix.multiplyMatrices(_rootMatrix,component.relative);
        component.mesh.setMatrixAt(index,_instanceMatrix);
      }

      item.userData.batchRendered=true;
      item.userData.batchPage=pageIndex;
      item.userData.batchInstance=index;
      renderedInstances++;
    }

    let batchDrawCalls=0;
    let legacyDrawCalls=0;
    let activePages=0;
    let allocatedPages=0;
    let totalCapacity=0;

    for(const kind of BATCHED_COURSE_KINDS){
      const info=kinds[kind];
      kindCounts[kind]=info.count;
      pagesByKind[kind]=0;
      capacityByKind[kind]=0;
      for(const variant of info.variants){
        const componentCount=variant.specs.length;
        legacyDrawCalls+=variant.count*componentCount;
        pagesByKind[kind]+=variant.pages.length;
        capacityByKind[kind]+=variant.pages.length*pageCapacity;
        allocatedPages+=variant.pages.length;
        totalCapacity+=variant.pages.length*pageCapacity;
        for(const page of variant.pages){
          for(const component of page.components){
            component.mesh.count=page.count;
            if(page.count>0)component.mesh.instanceMatrix.needsUpdate=true;
          }
          if(page.count>0){
            activePages++;
            batchDrawCalls+=componentCount;
          }
        }
      }
    }

    peakRenderedInstances=Math.max(peakRenderedInstances,renderedInstances);
    lastDiagnostics.activeLogical=activeLogical;
    lastDiagnostics.visibleLogical=visibleLogical;
    lastDiagnostics.renderedInstances=renderedInstances;
    lastDiagnostics.batchDrawCalls=batchDrawCalls;
    lastDiagnostics.legacyDrawCalls=legacyDrawCalls;
    lastDiagnostics.overflow=0;
    lastDiagnostics.overflowPrevented=overflowPrevented;
    lastDiagnostics.growthEvents=growthEvents;
    lastDiagnostics.activePages=activePages;
    lastDiagnostics.allocatedPages=allocatedPages;
    lastDiagnostics.totalCapacity=totalCapacity;
    lastDiagnostics.peakRenderedInstances=peakRenderedInstances;
    dirty=false;
    return lastDiagnostics;
  }

  function getDiagnostics(){
    return lastDiagnostics;
  }

  function getComponentCounts(){
    const result={};
    for(const kind of BATCHED_COURSE_KINDS)result[kind]=kinds[kind].variants[0].specs.length;
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
