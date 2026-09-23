import fs from 'node:fs';

const environment=fs.readFileSync(new URL('../src/environment.js',import.meta.url),'utf8');
const assert=(ok,message)=>{if(!ok){console.error('FAIL',message);process.exitCode=1;}else console.log('PASS',message);};

assert(!environment.includes("import {createMountainBands} from './mountainBands.js'"),'3D mountain-band runtime import removed');
assert(!environment.includes('const mountainBands=createMountainBands()'),'3D mountain-band runtime creation removed');
assert(!environment.includes('mountainBands.update('),'per-frame mountain instance updates removed');
assert(environment.includes('float ridgeBand('),'lightweight skyline ridge is generated in the sky shader');
assert(environment.includes('float sideMask=smoothstep(.18,.48,abs(downhill))'),'skyline keeps the downhill center visually open');
assert(environment.includes('const treeCount=15;'),'non-playable decorative forest reduced by about 90%');
assert(!/atmosphere\.add\([^\n]*(createSideRidgePair|createMountainField|createDistantForest)/.test(environment),'legacy static mountains/forest remain inactive at runtime');
