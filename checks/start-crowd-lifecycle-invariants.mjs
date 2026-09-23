import fs from 'node:fs';

const crowd=fs.readFileSync(new URL('../src/startCrowd.js',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const assert=(ok,message)=>{if(!ok){console.error('FAIL',message);process.exitCode=1;}else console.log('PASS',message);};

assert(crowd.includes('function disposeNodeResources(nodes)'),'start crowd has explicit GPU-resource disposal');
assert(crowd.includes('for(const skeleton of skeletons)skeleton.dispose?.()'),'crowd skeleton resources are disposed');
assert(crowd.includes('for(const texture of textures)texture.dispose?.()'),'crowd texture resources are disposed');
assert(crowd.includes("if(mode==='playing'&&root.position.z>=30)"),'crowd unloads once safely behind the camera');
assert(crowd.includes('async function ensureLoaded(entries=lastEntries)'),'crowd can be rebuilt only when a later run requests it');
assert(main.includes('await startCrowd.ensureLoaded(catalog)'),'restart waits for crowd rehydration before countdown');
assert(main.includes('startCrowdReleased:startCrowd.released'),'runtime diagnostics expose crowd release state');
