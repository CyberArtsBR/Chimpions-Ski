import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const benchmark=readFileSync(new URL('../scripts/benchmark-production-crowd.mjs',import.meta.url),'utf8');
assert(!benchmark.includes('?test=1'),'production crowd benchmark must not use the reduced smoke-test crowd');
assert(benchmark.includes('Expected production crowd count 50'),'benchmark explicitly guards the real 50-spectator path');
assert(benchmark.includes('startBlockingMs'),'benchmark records cold/warm start blocking duration');
assert(benchmark.includes('warmRestarts'),'benchmark exercises repeated warm restart behavior');
assert(benchmark.includes('startCrowdReleased===true'),'benchmark waits for scene destruction before restart');
assert(benchmark.includes('transferBytes'),'benchmark records Resource Timing network bytes where the browser exposes them');
assert(benchmark.includes('heapBytes'),'benchmark samples JS heap where Chromium exposes performance.memory');
assert(benchmark.includes('rendererGeometries'),'benchmark captures renderer memory diagnostics');
assert(benchmark.includes('frameTiming'),'benchmark samples frame timing during the start sequence');
assert(benchmark.includes('limitations'),'benchmark reports metrics that browser APIs cannot guarantee');
console.log(JSON.stringify({check:'production-crowd-benchmark-invariants',realProductionCrowd:true,restarts:true,network:true,memory:true,frameTiming:true}));
