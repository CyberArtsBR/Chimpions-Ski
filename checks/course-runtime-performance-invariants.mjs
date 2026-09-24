import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCourseDirector} from '../src/course.js';
import {getCourseLookahead} from '../src/courseStreaming.js';
import {SKI_TUNING as T} from '../src/gameplayTuning.js';
import {BATCHED_COURSE_KINDS} from '../src/courseRenderBatches.js';

const playerZ=2.2;
const recycleZ=17;
const renderMinZ=-315;
const renderMaxZ=28;
const meshDraws={tree:11,rock:3,log:6,wideLog:4,oil:2,banana:6,ramp:13};
const batched=new Set(BATCHED_COURSE_KINDS);

function rng(seed){
  let x=seed>>>0;
  return ()=>{
    x=(Math.imul(x,1664525)+1013904223)>>>0;
    return x/4294967296;
  };
}
const routeCenter=z=>Math.sin((-z)*.035)*2.9+Math.sin((-z)*.011)*1.1;

function generatedSnapshot(seed,speed,difficulty){
  const director=createCourseDirector({routeCenter,random:rng(seed)});
  const lookahead=getCourseLookahead(speed);
  let endZ=-12;
  const objects=[];
  while(endZ>playerZ-lookahead){
    const section=director.next({startZ:endZ-5.5,difficulty,speed});
    for(const p of section.placements)objects.push({kind:p.kind,z:p.z});
    endZ=section.endZ;
  }
  const rendered=objects.filter(o=>o.z>=renderMinZ&&o.z<=renderMaxZ);
  let legacy=0,after=0;
  const seenBatches=new Set();
  for(const item of rendered){
    legacy+=meshDraws[item.kind]||0;
    if(batched.has(item.kind))seenBatches.add(item.kind);
    else after+=meshDraws[item.kind]||0;
  }
  for(const kind of seenBatches)after+=meshDraws[kind];
  return {
    lookahead,
    active:objects.length,
    rendered:rendered.length,
    legacyDrawCalls:legacy,
    batchedDrawCalls:after,
    reduction:legacy?1-after/legacy:0
  };
}

const normal=generatedSnapshot(0x51a7,T.BASE_SPEED,.35);
const high=generatedSnapshot(0xc0ffee,T.MAX_SPEED,1);
assert(normal.batchedDrawCalls<normal.legacyDrawCalls*.60,'normal-density batching reduction is too small');
assert(high.batchedDrawCalls<high.legacyDrawCalls*.55,'high-density batching reduction is too small');
assert(high.lookahead>=560,'max-speed lookahead regressed');

// Collision/substep audit through the new 300 km/h high end.
const collisionHalfDepth={
  rock:.58+.20,
  oil:.74+.20,
  log:.48+.20,
  wideLog:.58+.20,
  tree:.68+.20
};
const lipWindow=1.78-1.42;
const collisionSpeedsKmh=[160,180,200,220,240,260,280,300];
for(const kmh of collisionSpeedsKmh){
  const speed=kmh/3.6;
  const travel=speed/180;
  for(const [kind,window] of Object.entries(collisionHalfDepth)){
    assert(travel<window,kmh+' km/h substep can tunnel through '+kind);
  }
  // Ramp takeoff is crossing-based, so it does not need a sample to land inside
  // the old narrow lip window at higher speeds.
}

// Long-run logical pool simulation: allocations rise only to per-kind high-water marks.
function longRun(seed,seconds=600){
  const random=rng(seed);
  const director=createCourseDirector({routeCenter,random});
  const active=[];
  const pools={tree:0,rock:0,log:0,wideLog:0,oil:0,banana:0,ramp:0};
  const created={tree:0,rock:0,log:0,wideLog:0,oil:0,banana:0,ramp:0};
  let endZ=-12,travel=0;
  let maxActive=0,maxCreated=0,createdAtHalf=0;
  const dt=.05;
  const speed=T.MAX_SPEED;
  const lookahead=getCourseLookahead(speed);

  function acquire(kind,z){
    if(pools[kind]>0)pools[kind]--;
    else created[kind]++;
    active.push({kind,z});
  }
  function fill(){
    while(endZ+travel>playerZ-lookahead){
      const section=director.next({startZ:endZ-5.5,difficulty:1,speed});
      for(const p of section.placements)acquire(p.kind,p.z+travel);
      endZ=section.endZ;
    }
  }

  fill();
  for(let frame=0;frame<seconds/dt;frame++){
    const step=speed*dt;
    travel+=step;
    for(let i=active.length-1;i>=0;i--){
      active[i].z+=step;
      if(active[i].z>recycleZ){
        const removed=active[i];
        active[i]=active[active.length-1];
        active.pop();
        pools[removed.kind]++;
      }
    }
    fill();
    maxActive=Math.max(maxActive,active.length);
    maxCreated=Math.max(maxCreated,Object.values(created).reduce((a,b)=>a+b,0));
    if(frame===Math.floor(seconds/dt/2))createdAtHalf=maxCreated;
  }
  const totalCreated=Object.values(created).reduce((a,b)=>a+b,0);
  return {maxActive,totalCreated,createdAtHalf,growthSecondHalf:totalCreated-createdAtHalf,created,pools};
}

const memory=longRun(0xdecafbad,600);
assert(memory.maxActive<260,'active course set grew beyond practical lookahead bound');
assert(memory.totalCreated<360,'pooled course high-water allocation is unexpectedly large');
assert(memory.growthSecondHalf<45,'pool high-water kept growing like an unbounded allocation');

const mainSource=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const scoringSource=readFileSync(new URL('../src/airborneScoring.js',import.meta.url),'utf8');
assert(mainSource.includes("createCourseRenderBatches"),'course batching integration is missing');
assert(mainSource.includes("removeCourseAt(i);"),'swap-remove course recycling is missing');
assert(!mainSource.includes("course.splice(i,1);"),'splice returned to the course traversal hot path');
assert(!mainSource.includes("world.remove(item);"),'pooled course objects still churn the scene graph');
assert(mainSource.includes("item.userData.consumed=true"),'ramp consumed state is missing');
assert(mainSource.includes("item.userData.activated&&!aligned"),'ramp off-deck cancellation is missing');
assert(mainSource.includes("previousApproachDepth>-1.42"),'crossing-based ramp lip detection is missing');
assert(scoringSource.includes("previousZ<playerZ&&item.position.z>=playerZ"),'airborne score crossing guard regressed');
assert(!/clearEvents\s*=\s*\[/.test(scoringSource),'score events accumulated into an unbounded array');

console.log(JSON.stringify({
  check:'course-runtime-performance',
  drawCalls:{zero:{legacy:0,batched:0},normal,high},
  collision:{speedsKmh:collisionSpeedsKmh,maxSubstepMeters:Number((T.MAX_SPEED/180).toFixed(4)),rampLipWindow:lipWindow},
  memory
}));
