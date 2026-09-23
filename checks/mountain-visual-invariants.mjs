import fs from 'node:fs';

const bands=fs.readFileSync(new URL('../src/mountainBands.js',import.meta.url),'utf8');
const environment=fs.readFileSync(new URL('../src/environment.js',import.meta.url),'utf8');
const assert=(ok,message)=>{if(!ok){console.error('FAIL',message);process.exitCode=1;}else console.log('PASS',message);};

assert(bands.includes("group.name='StreamingSideMountainBands'"),'streaming mountain-band system is active');
assert(bands.includes('group.userData.sideOnly=true'),'mountain bands stay side-only');
assert(bands.includes('edgeTaper'),'ridge profiles taper toward their ends');
assert(bands.includes('facetDepth'),'mountain faces include faceted depth');
assert((environment.match(/createMountainBands\(\)/g)||[]).length===1,'environment creates exactly one moving mountain system');
assert(!/atmosphere\.add\([^\n]*(createSideRidgePair|createMountainField|createDistantForest)/.test(environment),'legacy static mountains/forest are not attached to runtime atmosphere');
