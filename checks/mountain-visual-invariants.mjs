import fs from 'node:fs';

const environment=fs.readFileSync(new URL('../src/environment.js',import.meta.url),'utf8');
const alpineSky=fs.readFileSync(new URL('../src/alpineSky.js',import.meta.url),'utf8');
const alpineLandscape=fs.readFileSync(new URL('../src/alpineLandscape.js',import.meta.url),'utf8');
const assert=(ok,message)=>{if(!ok){console.error('FAIL',message);process.exitCode=1;}else console.log('PASS',message);};

assert(!environment.includes("import {createMountainBands} from './mountainBands.js'"),'3D mountain-band runtime import removed');
assert(!environment.includes('const mountainBands=createMountainBands()'),'3D mountain-band runtime creation removed');
assert(!environment.includes('mountainBands.update('),'per-frame mountain instance updates removed');
assert(
  environment.includes('createAlpineLandscape')&&
  alpineSky.includes('float a=atan(d.x,-d.z),sides=smoothstep(.20,.52,abs(a))'),
  'current alpine skyline/landscape framing is active'
);
assert(
  alpineSky.includes('sides=smoothstep(.20,.52,abs(a))')&&
  alpineLandscape.includes("const side=i%2?-1:1")&&
  alpineLandscape.includes('COURSE_FLAG_X+18'),
  'alpine scenery keeps the downhill center visually open'
);
assert(
  alpineLandscape.includes('new THREE.InstancedMesh(forestGeometry(),forestMaterial,280)')&&
  alpineLandscape.includes('forest.count=Math.round(80+200*detail)'),
  'non-playable decorative forest remains batched and quality-scalable'
);
assert(!/atmosphere\.add\([^\n]*(createSideRidgePair|createMountainField|createDistantForest)/.test(environment),'legacy static mountains/forest remain inactive at runtime');
