import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {quality,QUALITY_PROFILES,QUALITY_PROFILE_NAMES,resolveQualityProfile,qualityCount} from '../src/renderQuality.js';
import {createPerformanceTelemetry} from '../src/performanceTelemetry.js';
import {createCollisionBroadphase} from '../src/collisionBroadphase.js';

const required=[
  'profile','dprCap','shadowMapSize','decorativeShadowCasting','snowLayerDensity',
  'snowParticleDensity','snowSurfaceDetailDensity','environmentDecorationDensity',
  'distantSceneryDetail','crowdMaxSpectators','distantSceneryUpdateHz'
];

assert.deepEqual([...QUALITY_PROFILE_NAMES],['auto','high','max','medium','low'],'quality values changed unexpectedly');
for(const name of ['high','max','medium','low']){
  const settings=QUALITY_PROFILES[name];
  for(const key of required)assert.notEqual(settings[key],undefined,name+' quality missing '+key);
  assert.equal(settings.profile,name);
  assert(settings.dprCap>0&&settings.dprCap<=3);
  assert(settings.shadowMapSize>=512);
  for(const key of ['snowSurfaceDetailDensity','environmentDecorationDensity','distantSceneryDetail']){
    assert(settings[key]>0&&settings[key]<=1,name+' invalid '+key);
  }
  for(const key of ['snowLayerDensity','snowParticleDensity']){
    assert(settings[key]>=0&&settings[key]<=1,name+' invalid '+key);
  }
  assert(settings.crowdMaxSpectators>=1);
}
assert(QUALITY_PROFILES.low.dprCap<QUALITY_PROFILES.medium.dprCap);
assert(QUALITY_PROFILES.medium.dprCap<QUALITY_PROFILES.high.dprCap);
assert(QUALITY_PROFILES.low.shadowMapSize<QUALITY_PROFILES.medium.shadowMapSize);
assert(QUALITY_PROFILES.medium.shadowMapSize<QUALITY_PROFILES.high.shadowMapSize);
for(const name of ['high','max','medium','low'])assert.equal(QUALITY_PROFILES[name].snowParticleDensity,0,'legacy snow point-sprite density must remain disabled');
assert(QUALITY_PROFILES.high.dprCap<QUALITY_PROFILES.max.dprCap,'MAX should only extend premium DPR headroom');
assert(QUALITY_PROFILES.low.environmentDecorationDensity<QUALITY_PROFILES.high.environmentDecorationDensity);
assert.equal(resolveQualityProfile('reduced'),'medium','legacy reduced profile must map to medium');
assert.equal(resolveQualityProfile('bogus'),'auto');
assert.equal(qualityCount(100,.5),50);

quality.setProfile('low');
assert.equal(quality.current,'low');
assert.equal(quality.active,'low');
assert.equal(quality.getSettings().profile,'low');
quality.setProfile('high');
assert.equal(quality.current,'high');
assert.equal(quality.getSettings().dprCap,1.5,'high settings were not restored');
quality.setProfile('auto');
assert.equal(quality.current,'auto');
assert.equal(quality.active,'high','AUTO should begin from premium quality');

const telemetry=createPerformanceTelemetry();
telemetry.beginFrame(16.25);
telemetry.record('physics',2.5);
telemetry.record('collisionBroadphase',.12);
telemetry.record('courseTraversal',1.25);
telemetry.record('courseGeneration',.35);
telemetry.record('courseBatchSync',.75);
telemetry.record('environmentUpdate',2);
telemetry.increment('collisionCandidates',9);
telemetry.increment('collisionChecks',7);
telemetry.recordAvatarLoad(42);
telemetry.endFrame();
const snapshot=telemetry.getFlatSnapshot();
assert.equal(snapshot.perfTelemetrySamples,1);
assert.equal(snapshot.frameTimeP95Ms,16.25);
assert.equal(snapshot.perfPhysicsMs,2.5);
assert.equal(snapshot.perfCollisionBroadphaseMs,.12);
assert.equal(snapshot.perfCourseTraversalMs,1.25);
assert.equal(snapshot.perfCourseGenerationMs,.35);
assert.equal(snapshot.perfCourseBatchSyncMs,.75);
assert.equal(snapshot.perfEnvironmentUpdateMs,2);
assert.equal(snapshot.collisionCandidates,9);
assert.equal(snapshot.collisionChecks,7);
assert.equal(snapshot.avatarLoadAverageMs,42);

const broadphase=createCollisionBroadphase({bucketSize:8});
const items=Array.from({length:120},(_,index)=>({position:{z:-index*4},userData:{}}));
for(let i=0;i<items.length;i++)broadphase.add(items[i],-i*4);
const candidates=broadphase.query(-120,3.5,[]);
assert(candidates.length<12,'broadphase returned too much of the active course');
assert(candidates.length<items.length*.10,'broadphase should cut the candidate set by at least 90% in this dense synthetic sample');
broadphase.remove(candidates[0]);
assert.equal(broadphase.getDiagnostics().broadphaseActiveItems,119);
broadphase.clear();
assert.equal(broadphase.getDiagnostics().broadphaseBuckets,0);

const runner=readFileSync(new URL('../scripts/benchmark-ski-runtime.mjs',import.meta.url),'utf8');
const core=readFileSync(new URL('../scripts/benchmark/core.mjs',import.meta.url),'utf8');
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/performance-quality-profiles.yml',import.meta.url),'utf8');
assert((runner+core).includes('QUALITY_PROFILE'),'benchmark must support explicit quality profiles');
assert(core.includes('longTasks'),'benchmark must capture long main-thread tasks');
assert(core.includes('p50FrameMs'),'benchmark must expose p50 frame time');
assert(core.includes('collisionCandidates'),'benchmark must sample collision broadphase workload');
assert(core.includes('perfPhysicsMs'),'benchmark must sample physics telemetry');
assert(core.includes('rendererPixelRatio'),'benchmark must sample effective renderer quality');
assert(core.includes('activeSnowLayerParticles'),'benchmark must sample effective environment workload');
assert(main.includes('createCollisionBroadphase'),'main runtime must use longitudinal collision broadphase');
assert(main.includes('quality.observeFrame'),'AUTO quality must observe runtime frame timing');
assert(!workflow.includes('$(run_preview'),'workflow must not start a long-lived preview inside command substitution');
assert(workflow.includes('continue-on-error: true'),'benchmark profiles should preserve partial results');
assert(workflow.includes('if: always()'),'benchmark artifacts must survive partial profile failures');

console.log(JSON.stringify({
  check:'performance-quality-invariants',
  profiles:QUALITY_PROFILE_NAMES,
  high:QUALITY_PROFILES.high,
  medium:QUALITY_PROFILES.medium,
  low:QUALITY_PROFILES.low,
  telemetry:snapshot,
  broadphase:{candidateCount:candidates.length,fullScan:items.length,reduction:1-candidates.length/items.length}
}));
