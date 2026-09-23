import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCrowdAssetCache} from '../src/crowdAssetCache.js';

const originalFetch=globalThis.fetch;
const entry={id:'test',url:'model/characters/test.glb'};
const bytes=new Uint8Array([1,2,3,4]).buffer;

function okResponse(){
  return {ok:true,status:200,arrayBuffer:async()=>bytes.slice(0)};
}

try{
  let fetchCount=0;
  let parseCount=0;
  globalThis.fetch=async()=>{fetchCount++;return okResponse();};
  const loader={parseAsync:async()=>{parseCount++;return {scene:new THREE.Group(),animations:[]};}};
  const cache=createCrowdAssetCache({loader});

  const [first,second]=await Promise.all([cache.instantiate(entry),cache.instantiate(entry)]);
  assert.notEqual(first.model,second.model,'each actor receives an independent scene clone');
  assert.equal(fetchCount,1,'concurrent duplicate requests share one network fetch');
  assert.equal(parseCount,1,'concurrent duplicate requests share one GLTF parse');
  assert.equal(cache.getStats().cloneCount,2,'two actor clones are tracked');
  assert.equal(cache.getStats().cacheHits,1,'the second in-flight request is a cache hit');

  const third=await cache.instantiate(entry);
  assert.ok(third.model,'warm cache can create another actor clone');
  assert.equal(fetchCount,1,'warm cache does not redownload');
  assert.equal(parseCount,1,'warm cache does not reparse');

  let shouldFail=true;
  let retryFetches=0;
  globalThis.fetch=async()=>{
    retryFetches++;
    if(shouldFail){
      shouldFail=false;
      return {ok:false,status:503,arrayBuffer:async()=>bytes.slice(0)};
    }
    return okResponse();
  };
  const retryCache=createCrowdAssetCache({loader:{parseAsync:async()=>({scene:new THREE.Group(),animations:[]})}});
  await assert.rejects(()=>retryCache.instantiate(entry),/503/,'failed crowd asset surfaces an error');
  assert.equal(retryCache.getStats().cacheEntries,0,'failed record does not poison the cache');
  await retryCache.instantiate(entry);
  assert.equal(retryFetches,2,'failed asset is retryable on the next request');

  let resolveParse;
  globalThis.fetch=async()=>okResponse();
  const pendingCache=createCrowdAssetCache({
    loader:{parseAsync:()=>new Promise(resolve=>{resolveParse=resolve;})}
  });
  const pending=pendingCache.instantiate(entry);
  while(!resolveParse)await new Promise(resolve=>setTimeout(resolve,0));
  pendingCache.disposeAll();
  resolveParse({scene:new THREE.Group(),animations:[]});
  await assert.rejects(pending,/disposed during load/,'disposing a cache invalidates stale async parse results');
  assert.equal(pendingCache.getStats().cacheEntries,0,'destroyed cache stays empty after stale completion');

  cache.disposeAll();
  retryCache.disposeAll();

  console.log(JSON.stringify({
    check:'crowd-asset-cache-behavior',
    duplicateFetchProtection:true,
    duplicateParseProtection:true,
    warmCache:true,
    retryAfterFailure:true,
    staleAsyncInvalidation:true
  }));
}finally{
  globalThis.fetch=originalFetch;
}
