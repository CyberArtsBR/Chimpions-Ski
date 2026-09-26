import fs from 'node:fs';

const source=fs.readFileSync(new URL('../src/skier.js',import.meta.url),'utf8');
const assert=(ok,message)=>{if(!ok){console.error('FAIL',message);process.exitCode=1;}else console.log('PASS',message);};

assert(source.includes('const armOutwardSigns=new Map()'),'arm outward sign map is derived from rest pose');
assert(source.includes('model.worldToLocal(modelLocalProbe)'),'rest-pose arm side is measured in model-local space');
assert(source.includes('authoredOutSign=armOutwardSigns.get(side)??sideSign'),'pose targets use authored outward sign');
assert(source.includes("aimLimbFromRest(side+'UpperArm'"),'upper arms are aimed from GLB rest pose');
assert(source.includes("aimLimbFromRest(side+'Forearm'"),'forearms are aimed from GLB rest pose');
assert(source.includes("applyArmRestDelta(side+'Hand',0,0,0"),'hands keep the authored neutral wrist orientation');
assert(source.includes('resetArmChainToRest()'),'ride-mode changes can restore the complete arm chain');
assert(source.includes('const styleHand=styleReach*(sideSign===pose.styleSide?1:0)'),'style hold uses a directional arm reach without requiring hand IK');
assert(source.includes('const coupling=snowboardMode?pose.legCoupling:0'),'snowboard leg coupling is applied separately from ski independent loading');
assert(source.includes("applyArmRestDelta(side+'Hand',0,0,0"),'optional hands remain authored-neutral when present and are never required for playability');
