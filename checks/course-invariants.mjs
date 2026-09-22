import assert from 'node:assert/strict';
import {COURSE_TYPES,createCourseDirector,getCourseDifficulty} from '../src/course.js';
import {SKI_TUNING as T} from '../src/gameplayTuning.js';

function rng(seed=0x5f3759df){
  let x=seed>>>0;
  return ()=>{
    x=(Math.imul(x,1664525)+1013904223)>>>0;
    return x/4294967296;
  };
}
const routeCenter=z=>Math.sin((-z)*.035)*2.9+Math.sin((-z)*.011)*1.1;

for(const [distance,speed] of [[0,T.BASE_SPEED],[900,T.BASE_SPEED+5],[1800,T.MAX_SPEED],[99999,99]]){
  const d=getCourseDifficulty(distance,speed);
  assert(Number.isFinite(d)&&d>=0&&d<=1,'difficulty escaped normalized range');
}

const director=createCourseDirector({routeCenter,random:rng(123456)});
let z=-12;
let previousType='RECOVERY';
let sawRamp=false,sawLogJump=false,sawForest=false;

for(let i=0;i<120;i++){
  const difficulty=Math.min(1,i/85);
  const section=director.next({startZ:z,difficulty});
  assert(COURSE_TYPES.includes(section.type),'unknown course section type');
  // Longer recovery/jump sections are intentional after the open-course gameplay pass.
  assert(section.length>=20&&section.length<=110,'implausible section length');
  assert(section.endZ<z,'section does not advance downhill');

  // Jump sections must be followed by explicit recovery space.
  if(previousType==='RAMP'||previousType==='LOG JUMP'){
    assert.equal(section.type,'RECOVERY',previousType+' was not followed by RECOVERY');
  }

  if(!['OPEN CARVE','RECOVERY'].includes(section.type))assert(section.placements.length>0,'course section emitted no placements');
  for(const p of section.placements){
    assert(Number.isFinite(p.x)&&Number.isFinite(p.z)&&Number.isFinite(p.safeX),'non-finite placement');
    assert(Math.abs(p.x)<=T.COURSE_OBJECT_HALF_WIDTH+1e-6,'placement escaped course bounds');
    assert(Math.abs(p.safeX)<=T.SAFE_ROUTE_HALF_WIDTH+1e-6,'safe route escaped protected corridor');
    assert.equal(p.section,section.type,'placement lost section metadata');
  }

  if(section.type==='RAMP'){
    sawRamp=true;
    const ramps=section.placements.filter(p=>p.kind==='ramp');
    assert(ramps.length===1,'RAMP section should contain one primary ramp');
    assert(ramps[0].landingZone===true,'ramp is missing landing-zone metadata');
  }
  if(section.type==='LOG JUMP'){
    sawLogJump=true;
    assert(section.placements.some(p=>p.kind==='ramp'),'LOG JUMP missing takeoff ramp');
    assert(section.placements.some(p=>p.kind==='log'&&p.jumpTarget),'LOG JUMP missing marked jump target');
  }
  if(section.type==='FOREST')sawForest=true;

  previousType=section.type;
  z=section.endZ;
}

if(!(sawRamp&&sawLogJump&&sawForest)){
  // Rare authored sections should remain reachable, but one pseudo-random seed is
  // not required to hit every rare transition. Probe several deterministic seeds
  // at full difficulty so this stays a reachability test rather than a luck test.
  for(const seed of [7,19,43,101,31337,0xabcdef]){
    const probe=createCourseDirector({routeCenter,random:rng(seed)});
    let probeZ=-12;
    for(let i=0;i<220;i++){
      const section=probe.next({startZ:probeZ,difficulty:1});
      if(section.type==='RAMP')sawRamp=true;
      if(section.type==='LOG JUMP')sawLogJump=true;
      if(section.type==='FOREST')sawForest=true;
      probeZ=section.endZ;
      if(sawRamp&&sawLogJump&&sawForest)break;
    }
    if(sawRamp&&sawLogJump&&sawForest)break;
  }
}
assert(sawRamp&&sawLogJump&&sawForest,'major course section types became unreachable');
console.log('Course generation invariants OK');
