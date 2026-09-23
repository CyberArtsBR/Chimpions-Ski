import fs from 'node:fs';

const crowd=fs.readFileSync(new URL('../src/startCrowd.js',import.meta.url),'utf8');
const cache=fs.readFileSync(new URL('../src/crowdAssetCache.js',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const assert=(ok,message)=>{if(!ok){console.error('FAIL',message);process.exitCode=1;}else console.log('PASS',message);};

assert(cache.includes('export function disposeCrowdTemplate(root)'),'crowd cache has explicit template GPU-resource disposal');
assert(cache.includes('export function disposeCrowdClone(root)'),'crowd cache separates clone lifecycle from shared template lifecycle');
assert(cache.includes('for(const skeleton of skeletons)skeleton.dispose?.()'),'crowd clone/template skeleton resources are explicitly disposed');
assert(cache.includes('for(const texture of textures)texture.dispose?.()'),'cached template texture resources are explicitly disposed on cache teardown');
assert(crowd.includes("if(mode==='playing'&&root.position.z>=30)"),'crowd scene unloads once safely behind the camera');
assert(crowd.includes('async function ensureLoaded(entries=lastEntries)'),'crowd can be rebuilt only when a later run requests it');
assert(crowd.includes('return waitForStartReady(job)'),'run readiness waits for a bounded critical subset rather than the full crowd');
assert(crowd.includes('Parsed templates intentionally remain in assetCache for warm restart.'),'crowd release preserves parsed templates for warm restart');
assert(cache.includes('lifecycleGeneration++'),'full cache teardown invalidates pending async loads');
assert(main.includes('await startCrowd.ensureLoaded(catalog)'),'existing main integration reuses bounded crowd readiness API');
assert(main.includes('startCrowdReleased:startCrowd.released'),'runtime diagnostics expose crowd release state');

assert(main.includes('startCrowdCacheStats:startCrowd.cacheStats'),'runtime diagnostics expose crowd cache/fetch/parse counters');
assert(main.includes('startCrowdProgressivePaused:startCrowd.progressivePaused'),'runtime diagnostics expose whether progressive parsing is paused for a run');
assert(main.includes('window.chimpionsSkiPrepareFullCrowd=()=>startCrowd.prepareFull(catalog)'),'main exposes an explicit full-production crowd profiling hook');
