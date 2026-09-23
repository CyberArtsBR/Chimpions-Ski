import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {crowdAssetUrl} from './crowdManifest.js';

const DEFAULT_TIMEOUT_MS=10000;

function nowMs(){
  return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();
}

function assetBasePath(url){
  const index=String(url).lastIndexOf('/');
  return index>=0?String(url).slice(0,index+1):'/';
}

function collectMaterialTextures(material,textures){
  if(!material)return;
  for(const value of Object.values(material)){
    if(value?.isTexture)textures.add(value);
    else if(value?.value?.isTexture)textures.add(value.value);
    else if(Array.isArray(value))for(const item of value)if(item?.isTexture)textures.add(item);
  }
}

export function disposeCrowdTemplate(root){
  if(!root)return;
  const geometries=new Set();
  const materials=new Set();
  const textures=new Set();
  const skeletons=new Set();
  root.traverse?.(object=>{
    if(object.geometry)geometries.add(object.geometry);
    if(object.skeleton)skeletons.add(object.skeleton);
    const list=Array.isArray(object.material)?object.material:[object.material];
    for(const material of list){
      if(!material)continue;
      materials.add(material);
      collectMaterialTextures(material,textures);
    }
  });
  for(const skeleton of skeletons)skeleton.dispose?.();
  for(const texture of textures)texture.dispose?.();
  for(const material of materials)material.dispose?.();
  for(const geometry of geometries)geometry.dispose?.();
}

export function disposeCrowdClone(root){
  // SkeletonUtils.clone intentionally shares immutable geometry/material/texture
  // resources with the cached template. Only per-clone Skeleton state belongs to
  // the actor and may be disposed during a race lifecycle reset.
  const skeletons=new Set();
  root?.traverse?.(object=>{if(object.skeleton)skeletons.add(object.skeleton);});
  for(const skeleton of skeletons)skeleton.dispose?.();
}

export function createCrowdAssetCache({loader=new GLTFLoader()}={}){
  const records=new Map();
  let lifecycleGeneration=0;
  const stats={
    fetchCount:0,
    parseCount:0,
    cacheHits:0,
    cloneCount:0,
    failureCount:0,
    abortCount:0,
    bytesLoaded:0,
    fetchMs:0,
    parseMs:0
  };

  async function fetchAndParse(url,timeoutMs){
    const timeout=Math.max(250,Number(timeoutMs)||DEFAULT_TIMEOUT_MS);
    const controller=typeof AbortController!=='undefined'?new AbortController():null;
    const timer=controller?setTimeout(()=>controller.abort(),timeout):null;
    const fetchStarted=nowMs();
    stats.fetchCount++;
    try{
      const response=await fetch(url,{signal:controller?.signal,cache:'force-cache'});
      if(!response.ok)throw new Error(`Crowd asset ${response.status}: ${url}`);
      const bytes=await response.arrayBuffer();
      stats.fetchMs+=nowMs()-fetchStarted;
      stats.bytesLoaded+=bytes.byteLength;

      const parseStarted=nowMs();
      const gltf=await loader.parseAsync(bytes,assetBasePath(url));
      stats.parseMs+=nowMs()-parseStarted;
      stats.parseCount++;
      return {url,scene:gltf.scene,bytes:bytes.byteLength,prepared:false};
    }catch(error){
      if(error?.name==='AbortError')stats.abortCount++;
      stats.failureCount++;
      throw error;
    }finally{
      if(timer)clearTimeout(timer);
    }
  }

  function getRecord(url,{timeoutMs=DEFAULT_TIMEOUT_MS}={}){
    const existing=records.get(url);
    if(existing){
      stats.cacheHits++;
      return existing;
    }

    const generation=lifecycleGeneration;
    const record={url,status:'loading',template:null,error:null,promise:null,generation};
    record.promise=fetchAndParse(url,timeoutMs).then(template=>{
      if(generation!==lifecycleGeneration||records.get(url)!==record){
        disposeCrowdTemplate(template.scene);
        throw new Error('Crowd asset cache was disposed during load');
      }
      record.status='ready';
      record.template=template;
      return template;
    }).catch(error=>{
      record.status='failed';
      record.error=error;
      // Failed/aborted records are retryable instead of poisoning warm restarts.
      if(records.get(url)===record)records.delete(url);
      throw error;
    });
    records.set(url,record);
    return record;
  }

  async function instantiate(entry,{prepareTemplate,timeoutMs=DEFAULT_TIMEOUT_MS}={}){
    const url=crowdAssetUrl(entry);
    const record=getRecord(url,{timeoutMs});
    const template=await record.promise;
    if(!template.prepared){
      prepareTemplate?.(template.scene);
      template.prepared=true;
    }
    const model=cloneSkeleton(template.scene);
    stats.cloneCount++;
    return {model,url,bytes:template.bytes,cacheStatus:record.status};
  }

  function has(entry){
    const record=records.get(crowdAssetUrl(entry));
    return record?.status==='ready';
  }

  function getStats(){
    let readyEntries=0,pendingEntries=0;
    for(const record of records.values()){
      if(record.status==='ready')readyEntries++;
      else if(record.status==='loading')pendingEntries++;
    }
    return {
      ...stats,
      cacheEntries:records.size,
      readyEntries,
      pendingEntries
    };
  }

  function disposeAll(){
    lifecycleGeneration++;
    for(const record of records.values()){
      if(record.status==='ready'&&record.template?.scene)disposeCrowdTemplate(record.template.scene);
    }
    records.clear();
  }

  return {instantiate,has,getStats,disposeAll};
}
