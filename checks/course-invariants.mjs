import assert from 'node:assert/strict';
import {COURSE_TYPES,createCourseDirector,getCourseDifficulty} from '../src/course.js';

function rng(seed=0x5f3759df){
  let x=seed>>>0;
  return ()=>{
    x=(Math.imul(x,1664525)+1013904223)>>>0;
    return x/4294967296;
  };
}
const routeCenter=z=>Math.sin((-z)*.035)*2.9+Math.sin((-z)*.011)*1.1;

for(const [distance,speed] of [[0,12],[600,21],[1200,31],[99999,99]]){
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
  assert(section.length>=20&&section.length<=56,'implausible section length');
  assert(section.endZ<z,'section does not advance downhill');

  // Jump sections must be followed by explicit recovery space.
  if(previousType==='RAMP'||previousType==='LOG JUMP'){
    assert.equal(section.type,'RECOVERY',previousType+' was not followed by RECOVERY');
  }

  assert(section.placements.length>0,'course section emitted no placements');
  for(const p of section.placements){
    assert(Number.isFinite(p.x)&&Number.isFinite(p.z)&&Number.isFinite(p.safeX),'non-finite placement');
    assert(Math.abs(p.x)<=7.350001,'placement escaped course bounds');
    assert(Math.abs(p.safeX)<=6.200001,'safe route escaped protected corridor');
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

assert(sawRamp&&sawLogJump&&sawForest,'deterministic course sample failed to exercise major section types');
console.log('Course generation invariants OK');
