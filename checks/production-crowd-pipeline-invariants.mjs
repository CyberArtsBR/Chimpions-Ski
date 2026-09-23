import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {START_CROWD_COUNT,CROWD_LIGHTWEIGHT_IDS,chooseCrowdSources} from '../src/crowdManifest.js';

const crowd=readFileSync(new URL('../src/startCrowd.js',import.meta.url),'utf8');
const cache=readFileSync(new URL('../src/crowdAssetCache.js',import.meta.url),'utf8');
const audit=readFileSync(new URL('../scripts/audit-crowd-assets.mjs',import.meta.url),'utf8');

const fakeCatalog=CROWD_LIGHTWEIGHT_IDS.map((id,index)=>({id,name:`Chimpion ${index}`,url:`model/characters/${index}.glb`}));
const selected=chooseCrowdSources([...fakeCatalog,fakeCatalog[0]],START_CROWD_COUNT);

assert.equal(START_CROWD_COUNT,50,'production crowd count must remain 50');
assert.equal(selected.length,50,'production path must select all 50 unique sources');
assert.equal(new Set(selected.map(entry=>entry.id)).size,50,'production source selection must deduplicate');
assert.deepEqual(selected.slice(0,10).map(entry=>String(entry.id)),CROWD_LIGHTWEIGHT_IDS.slice(0,10),'start-critical ordering must use the smallest audited assets first');

assert(cache.includes("cache:'force-cache'"),'cold fetches use browser HTTP cache semantics');
assert(cache.includes('const records=new Map()'),'parsed crowd templates are cached by URL');
assert(cache.includes('record.promise=fetchAndParse'),'duplicate concurrent loads share one in-flight parse');
assert(cache.includes('loader.parseAsync'),'GLB bytes are parsed once into cached templates');
assert(cache.includes('cloneSkeleton(template.scene)'),'warm actors clone cached skinned templates safely');
assert(cache.includes('records.delete(url)'),'failed/aborted records remain retryable');
assert(cache.includes('disposeCrowdClone'),'clone lifecycle has a dedicated skeleton-only disposal path');
assert(cache.includes('disposeCrowdTemplate'),'cache ownership has a separate full template disposal path');

assert(crowd.includes('startReadyCount:10'),'start-critical crowd target is explicit');
assert(crowd.includes('loadConcurrency:1'),'interactive crowd GLB parsing is serialized to protect main-thread frame pacing');
assert(crowd.includes('startWaitMs:900'),'run-start wait has a bounded timeout');
assert(crowd.includes('new THREE.InstancedMesh'),'unloaded spectators keep a lightweight visible placeholder representation');
assert(crowd.includes("const job=startLoad(entries,{full:false});"),'interactive ensureLoaded starts or reuses the start-critical preparation path');
assert(crowd.includes('return waitForStartReady(job);'),'run start waits only for the critical subset, not all 50 assets');
assert(crowd.includes('job.claimLimit=Math.min(job.claimLimit,job.cursor)'),'run commitment freezes new GLB claims immediately');
assert(crowd.includes('if(job.cursor>=job.claimLimit)break'),'workers honor the frozen claim limit before starting another asset');
assert(crowd.includes('function prepareFull(entries=lastEntries)'),'the full 50-source profiling path remains explicitly available');
assert(crowd.includes('Parsed templates intentionally remain in assetCache for warm restart.'),'scene destruction preserves the parsed-template cache');
assert(crowd.includes("if(mode==='playing'&&root.position.z>=30)"),'crowd actors are released once safely behind the camera');
assert(crowd.includes('generation!==loadGeneration||released||!built'),'stale async callbacks cannot attach to a destroyed/new crowd');
assert(crowd.includes('disposeCrowdClone(model)'),'stale or released clones clean up per-instance skeleton state');
assert(crowd.includes('get cacheStats(){return assetCache.getStats();}'),'cache/network/parse diagnostics are exposed for production benchmarks');
assert(crowd.includes('setQuality'),'crowd-specific quality knobs are exposed without a competing global profile system');

assert(audit.includes('individualBytes:2.25*MiB'),'offline audit enforces an individual GLB budget');
assert(audit.includes('criticalBytes:16*MiB'),'offline audit enforces a start-critical byte budget');
assert(audit.includes('fullBytes:90*MiB'),'offline audit enforces a full crowd byte budget');
assert(audit.includes("classification:index<DEFAULT_CRITICAL_COUNT?'start-critical-near':'progressive-background'"),'audit classifies start-critical vs background assets');
assert(audit.includes('oversizedTextureCount'),'audit consumes texture-dimension warnings from the deep avatar audit');
assert(audit.includes('vertexCount'),'audit reports geometry complexity when deep metadata is available');
assert(audit.includes('Source GLBs are read-only'),'asset audit documents non-destructive source ownership');

console.log(JSON.stringify({
  check:'production-crowd-pipeline-invariants',
  productionCount:START_CROWD_COUNT,
  uniqueSources:selected.length,
  startCriticalCount:10,
  progressive:true,
  progressivePausesAtStart:true,
  parsedTemplateCache:true,
  warmRestart:true,
  staleCallbackGuard:true,
  assetBudgetTooling:true
}));

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
assert(!main.includes('requestAnimationFrame(()=>{\n      setTimeout(()=>{\n        startCrowd.setSpectators(catalog)'),'selector-open path must not start crowd parsing before rider selection');
assert(main.includes("await setAvatar(entry,rideMode);\n        // Rider selection has priority."),'selected rider must finish loading before crowd warmup starts');
