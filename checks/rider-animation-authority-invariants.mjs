import assert from 'node:assert/strict';
import fs from 'node:fs';

const paths=[
  '../src/skier.js',
  '../src/riderAnimationState.js',
  '../src/riderPoseController.js',
  '../src/riderIK.js',
  '../src/riderClipLayer.js'
];

const sources=paths.map(path=>({
  path,
  source:fs.readFileSync(new URL(path,import.meta.url),'utf8')
}));

for(const {path,source} of sources){
  assert(!/from\s+['"]\.\/skiPhysics\.js['"]/.test(source),path+' must not import gameplay physics authority');
  assert(!/from\s+['"]\.\/course(?:\.js|\/)/.test(source),path+' must not import course authority');
  assert(!/from\s+['"]\.\/trickScoring\.js['"]/.test(source),path+' must not import scoring authority');
  assert(!/\bstate\.(?:x|y|vx|vy|speed)\s*=/.test(source),path+' must not assign authoritative gameplay state');
}

const skier=sources.find(item=>item.path.endsWith('/skier.js')).source;
assert(skier.includes("riderVisual.name='rider-visual'"),'rider presentation stays under the dedicated visual transform');
assert(skier.includes('root.add(riderVisual)'),'rider visual remains a child of the gameplay root');
assert(!/player\.position\s*=/.test(skier),'skier presentation module does not own gameplay position');

console.log(JSON.stringify({check:'rider-animation-authority-invariants',modules:sources.length}));
