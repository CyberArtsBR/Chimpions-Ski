import assert from 'node:assert/strict';
import {COURSE_TYPES,createCourseDirector} from '../src/course.js';
import {SKI_TUNING as T} from '../src/gameplayTuning.js';
import {OBSTACLE_TUNING} from '../src/obstacleTuning.js';
import {estimateRampFlightEnvelope} from '../src/rampTrajectory.js';
import {maxReachableLateralDelta} from '../src/courseSafety.js';
import {getCourseLookahead} from '../src/courseStreaming.js';
import {getCourseSectionLengthBounds} from '../src/courseSectionContract.js';

const seedCount=Math.max(8,Number.parseInt(process.env.AAA_SEEDS||'48',10)||48);
const sectionsPerSeed=Math.max(80,Number.parseInt(process.env.AAA_SECTIONS||'180',10)||180);
const routeCenter=z=>Math.sin((-z)*.035)*2.9+Math.sin((-z)*.011)*1.1;
const jumpTypes=new Set(['RAMP','LOG JUMP']);
const hazardInfo={
  tree:{radiusX:.62,radiusZ:.68},rock:{radiusX:.55,radiusZ:.58},
  log:{radiusX:OBSTACLE_TUNING.log.collisionHalfWidth,radiusZ:OBSTACLE_TUNING.log.radiusZ},
  wideLog:{radiusX:OBSTACLE_TUNING.wideLog.collisionHalfWidth,radiusZ:OBSTACLE_TUNING.wideLog.radiusZ},
  oil:{radiusX:OBSTACLE_TUNING.oil.collisionHalfWidth,radiusZ:OBSTACLE_TUNING.oil.radiusZ}
};
const isHazard=p=>!!hazardInfo[p?.kind];
function rng(seed){let x=seed>>>0;return()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};}
function seedAt(index){return (0x9e3779b9^Math.imul(index+1,0x85ebca6b))>>>0;}
function phaseAt(index){
  const f=index/Math.max(1,sectionsPerSeed-1);
  if(f<.20)return {name:'early',difficulty:.15,speed:T.BASE_SPEED,postMaxTime:0};
  if(f<.45)return {name:'mid',difficulty:.5,speed:T.BASE_SPEED+(T.MAX_SPEED-T.BASE_SPEED)*.45,postMaxTime:0};
  if(f<.70)return {name:'high-speed',difficulty:.82,speed:T.BASE_SPEED+(T.MAX_SPEED-T.BASE_SPEED)*.82,postMaxTime:0};
  if(f<.85)return {name:'max-speed',difficulty:1,speed:T.MAX_SPEED,postMaxTime:0};
  return {name:'post-max',difficulty:1,speed:T.MAX_SPEED,postMaxTime:T.POST_MAX_HAZARD_RAMP_SECONDS};
}

const stats={seeds:seedCount,sections:0,virtualMeters:0,jumps:0,logJumps:0,ramps:0,hazards:0,phaseSections:{},maxPlacements:0};
for(let seedIndex=0;seedIndex<seedCount;seedIndex++){
  const seed=seedAt(seedIndex),director=createCourseDirector({routeCenter,random:rng(seed)});
  let z=-12,previousType='RECOVERY';
  for(let index=0;index<sectionsPerSeed;index++){
    const phase=phaseAt(index);
    let section;
    try{
      section=director.next({startZ:z,difficulty:phase.difficulty,speed:phase.speed,postMaxTime:phase.postMaxTime});
      assert(COURSE_TYPES.includes(section.type),'unknown course section type');
      assert(Number.isFinite(section.length)&&section.length>0,'section length is not finite/positive');
      assert(section.endZ<z,'section does not advance downhill');
      if(!jumpTypes.has(section.type)){
        const bounds=getCourseSectionLengthBounds(section.type);
        assert(section.length>=bounds.min&&section.length<=bounds.max,`section length ${section.length} outside authoritative ${bounds.min}-${bounds.max}`);
      }
      if(jumpTypes.has(previousType))assert.equal(section.type,'RECOVERY',previousType+' must be followed by RECOVERY');

      const hazards=section.placements.filter(isHazard);
      for(const p of section.placements){
        assert(Number.isFinite(p.x)&&Number.isFinite(p.z)&&Number.isFinite(p.safeX),'non-finite placement');
        assert(Math.abs(p.x)<=T.COURSE_OBJECT_HALF_WIDTH+1e-6,'placement escaped course bounds');
        assert(Math.abs(p.safeX)<=T.SAFE_ROUTE_HALF_WIDTH+1e-6,'safe route escaped protected corridor');
      }

      const decisions=[];
      for(const p of section.placements){
        if(!p.routeDecision)continue;
        let d=decisions.find(item=>item.z===p.decisionZ&&item.safeX===p.safeX);
        if(!d){d={z:p.decisionZ,safeX:p.safeX,points:[]};decisions.push(d);}
        d.points.push(p);
      }
      decisions.sort((a,b)=>b.z-a.z);
      let previous=null;
      for(const decision of decisions){
        if(previous){
          const allowed=maxReachableLateralDelta(decision.z-previous.z,phase.speed)+1e-6;
          assert(Math.abs(decision.safeX-previous.safeX)<=allowed,'safe route demanded unreachable lateral movement');
        }
        for(const p of decision.points.filter(isHazard)){
          const info=hazardInfo[p.kind];
          assert(Math.abs(p.x-decision.safeX)>info.radiusX+.36,'hazard intruded into guaranteed safe route');
        }
        previous=decision;
      }

      if(jumpTypes.has(section.type)){
        stats.jumps++;
        if(section.type==='RAMP')stats.ramps++;else stats.logJumps++;
        const ramp=section.placements.find(p=>p.kind==='ramp');
        assert(ramp,'jump section missing ramp');
        assert.equal(ramp.landingZone,true,'jump ramp missing landing-zone metadata');
        const envelope=estimateRampFlightEnvelope(phase.speed);
        const protectedHazards=hazards.filter(p=>!p.jumpTarget&&
          ramp.z-p.z>=envelope.protectedStartDistance&&ramp.z-p.z<=envelope.protectedEndDistance&&
          Math.abs(p.x-ramp.safeX)<envelope.corridorHalfWidth);
        assert.equal(protectedHazards.length,0,'hazard invaded predicted landing corridor');
        if(section.type==='LOG JUMP')assert(section.placements.some(p=>p.kind==='log'&&p.jumpTarget),'LOG JUMP missing marked target');
      }

      stats.sections++;stats.virtualMeters+=section.length;stats.hazards+=hazards.length;
      stats.phaseSections[phase.name]=(stats.phaseSections[phase.name]||0)+1;
      stats.maxPlacements=Math.max(stats.maxPlacements,section.placements.length);
      previousType=section.type;z=section.endZ;
    }catch(error){
      const type=section?.type||'unavailable';
      error.message=`seed=${seed} seedIndex=${seedIndex} section=${index} phase=${phase.name} type=${type}: ${error.message}`;
      throw error;
    }
  }
}
assert(stats.jumps>0,'stress matrix generated no jump sections');
assert(stats.ramps>0&&stats.logJumps>0,'stress matrix did not cover both RAMP and LOG JUMP');
assert(getCourseLookahead(T.BASE_SPEED)>280,'base-speed lookahead must exceed the visible gameplay range');
assert(getCourseLookahead(T.MAX_SPEED)>getCourseLookahead(T.BASE_SPEED),'max-speed lookahead must exceed base-speed lookahead');
console.log(JSON.stringify({check:'aaa-course-stress',...stats,virtualKm:Number((stats.virtualMeters/1000).toFixed(2)),note:'Jump section length is intentionally delegated to checks/course-invariants.mjs and the shared course contract; this stress test does not recreate a parallel jump-length formula.'}));
