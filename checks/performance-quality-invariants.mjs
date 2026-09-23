import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {quality,QUALITY_PROFILES,QUALITY_PROFILE_NAMES,resolveQualityProfile,qualityCount} from '../src/renderQuality.js';
import {createPerformanceTelemetry} from '../src/performanceTelemetry.js';

const required=[
  'profile','dprCap','shadowMapSize','decorativeShadowCasting','snowLayerDensity',
  'snowParticleDensity','snowSurfaceDetailDensity','environmentDecorationDensity',
  'crowdMaxSpectators','distantSceneryUpdateHz'
];

assert.deepEqual([...QUALITY_PROFILE_NAMES],['high','reduced'],'quality values changed unexpectedly');
for(const name of QUALITY_PROFILE_NAMES){
  const settings=QUALITY_PROFILES[name];
  for(const key of required)assert.notEqual(settings[key],undefined,name+' quality missing '+key);
  assert.equal(settings.profile,name);
  assert(settings.dprCap>0&&settings.dprCap<=3);
  assert(settings.shadowMapSize>=512);
  for(const key of ['snowLayerDensity','snowParticleDensity','snowSurfaceDetailDensity','environmentDecorationDensity']){
    assert(settings[key]>0&&settings[key]<=1,name+' invalid '+key);
  }
  assert(settings.crowdMaxSpectators>=1);
}
assert(QUALITY_PROFILES.reduced.dprCap<QUALITY_PROFILES.high.dprCap);
assert(QUALITY_PROFILES.reduced.shadowMapSize<QUALITY_PROFILES.high.shadowMapSize);
assert(QUALITY_PROFILES.reduced.snowParticleDensity<QUALITY_PROFILES.high.snowParticleDensity);
assert(QUALITY_PROFILES.reduced.environmentDecorationDensity<QUALITY_PROFILES.high.environmentDecorationDensity);
assert(QUALITY_PROFILES.reduced.crowdMaxSpectators<QUALITY_PROFILES.high.crowdMaxSpectators);
assert.equal(resolveQualityProfile('bogus'),'high');
assert.equal(qualityCount(100,.5),50);

quality.setProfile('reduced');
assert.equal(quality.current,'reduced');
assert.equal(quality.getSettings().profile,'reduced');
quality.setProfile('high');
assert.equal(quality.current,'high');
assert.equal(quality.getSettings().dprCap,1.75,'high settings were not restored');

const telemetry=createPerformanceTelemetry();
telemetry.beginFrame();
telemetry.record('courseTraversal',1.25);
telemetry.record('courseBatchSync',.75);
telemetry.record('environmentUpdate',2);
telemetry.endFrame();
const snapshot=telemetry.getFlatSnapshot();
assert.equal(snapshot.perfTelemetrySamples,1);
assert.equal(snapshot.perfCourseTraversalMs,1.25);
assert.equal(snapshot.perfCourseBatchSyncMs,.75);
assert.equal(snapshot.perfEnvironmentUpdateMs,2);

const runner=readFileSync(new URL('../scripts/benchmark-ski-runtime.mjs',import.meta.url),'utf8');
const core=readFileSync(new URL('../scripts/benchmark/core.mjs',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/performance-quality-profiles.yml',import.meta.url),'utf8');
assert((runner+core).includes('QUALITY_PROFILE'),'benchmark must support explicit quality profiles');
assert(core.includes('longTasks'),'benchmark must capture long main-thread tasks');
assert(core.includes('p50FrameMs'),'benchmark must expose p50 frame time');
assert(core.includes('rendererPixelRatio'),'benchmark must sample effective renderer quality');
assert(core.includes('activeSnowLayerParticles'),'benchmark must sample effective environment workload');
assert(core.includes('perfCourseTraversalMs'),'benchmark must sample runtime hotspot telemetry');
assert(!workflow.includes('$(run_preview'),'workflow must not start a long-lived preview inside command substitution');
assert(workflow.includes('continue-on-error: true'),'benchmark profiles should preserve partial results');
assert(workflow.includes('if: always()'),'benchmark artifacts must survive partial profile failures');

console.log(JSON.stringify({
  check:'performance-quality-invariants',
  profiles:QUALITY_PROFILE_NAMES,
  high:QUALITY_PROFILES.high,
  reduced:QUALITY_PROFILES.reduced,
  telemetry:snapshot
}));
