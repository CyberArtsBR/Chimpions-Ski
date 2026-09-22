import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COURSE_TYPES,FORMATION_TYPES,createCourseDirector,getCourseDifficulty} from '../src/course.js';
import {SKI_TUNING as T} from '../src/gameplayTuning.js';
import {estimateRampFlightEnvelope} from '../src/rampTrajectory.js';
import {maxReachableLateralDelta} from '../src/courseSafety.js';
import {getCourseLookahead} from '../src/courseStreaming.js';

function rng(seed=0x5f3759df){
  let x=seed>>>0;
  return ()=>{
    x=(Math.imul(x,1664525)+1013904223)>>>0;
    return x/4294967296;
  };
}
const routeCenter=z=>Math.sin((-z)*.035)*2.9+Math.sin((-z)*.011)*1.1;
const hazardInfo={
  tree:{radiusX:.62,radiusZ:.68},
  rock:{radiusX:.55,radiusZ:.58},
  log:{radiusX:1.02,radiusZ:.48},
  wideLog:{radiusX:2.48,radiusZ:.58},
  oil:{radiusX:1.48,radiusZ:.74}
};
const isHazard=p=>!!hazardInfo[p.kind];

assert(!FORMATION_TYPES.includes('ROW'),'ROW must not be selectable by procedural generation');

for(const [distance,speed] of [[0,T.BASE_SPEED],[900,T.BASE_SPEED+5],[1800,T.MAX_SPEED],[99999,99]]){
  const d=getCourseDifficulty(distance,speed);
  assert(Number.isFinite(d)&&d>=0&&d<=1,'difficulty escaped normalized range');
}

const seeds=[1,7,19,43,101,31337,0xabcdef,0x12345678,0xdeadbeef,0xc0ffee,0x5eed,0xdecafbad];
const sectionsPerSeed=120;
let totalSections=0,totalMeters=0,totalRamps=0;
let minLeftEdgeThreats=Infinity,minRightEdgeThreats=Infinity;
let maxLeftDrySections=0,maxRightDrySections=0;
let maxColumnStreak=0;
let columnFailure=null;

for(const seed of seeds){
  const director=createCourseDirector({routeCenter,random:rng(seed)});
  let z=-12;
  let previousType='RECOVERY';
  let previousDecision=null;
  let leftEdgeThreats=0,rightEdgeThreats=0,leftDry=0,rightDry=0;
  const columnStreak=new Map();

  for(let i=0;i<sectionsPerSeed;i++){
    const difficulty=Math.min(1,i/90);
    const speed=T.BASE_SPEED+(T.MAX_SPEED-T.BASE_SPEED)*difficulty;
    const section=director.next({startZ:z,difficulty,speed});
    totalSections++;
    totalMeters+=section.length;

    assert(COURSE_TYPES.includes(section.type),'unknown course section type');
    const maxRampLength=Math.ceil(62+estimateRampFlightEnvelope(T.MAX_SPEED).protectedEndDistance);
    const maxAllowed=(section.type==='RAMP'||section.type==='LOG JUMP')?maxRampLength:120;
    assert(section.length>=20&&section.length<=maxAllowed,'implausible section length');
    assert(section.endZ<z,'section does not advance downhill');

    if(previousType==='RAMP'||previousType==='LOG JUMP'){
      assert.equal(section.type,'RECOVERY',previousType+' was not followed by RECOVERY');
    }

    const hazards=section.placements.filter(isHazard);
    const leftThis=hazards.some(p=>p.x<=-9);
    const rightThis=hazards.some(p=>p.x>=9);
    if(leftThis){leftEdgeThreats+=hazards.filter(p=>p.x<=-9).length;leftDry=0;}else leftDry++;
    if(rightThis){rightEdgeThreats+=hazards.filter(p=>p.x>=9).length;rightDry=0;}else rightDry++;
    maxLeftDrySections=Math.max(maxLeftDrySections,leftDry);
    maxRightDrySections=Math.max(maxRightDrySections,rightDry);

    for(const p of section.placements){
      assert(Number.isFinite(p.x)&&Number.isFinite(p.z)&&Number.isFinite(p.safeX),'non-finite placement');
      assert(Math.abs(p.x)<=T.COURSE_OBJECT_HALF_WIDTH+1e-6,'placement escaped course bounds');
      assert(Math.abs(p.safeX)<=T.SAFE_ROUTE_HALF_WIDTH+1e-6,'safe route escaped protected corridor');
      assert.equal(p.section,section.type,'placement lost section metadata');
      assert.notEqual(p.formation,'ROW','straight ROW formation was generated');
      if(p.formation)assert(FORMATION_TYPES.includes(p.formation),'unknown formation metadata');
    }

    // Route-decision metadata mirrors the exact safe-route constraints used by generation.
    const decisions=[];
    for(const p of section.placements){
      if(!p.routeDecision)continue;
      let decision=decisions.find(d=>d.z===p.decisionZ&&d.safeX===p.safeX);
      if(!decision){
        decision={z:p.decisionZ,safeX:p.safeX,points:[]};
        decisions.push(decision);
      }
      decision.points.push(p);
    }
    decisions.sort((a,b)=>b.z-a.z);
    for(const decision of decisions){
      if(previousDecision){
        const allowed=maxReachableLateralDelta(decision.z-previousDecision.z,speed)+1e-6;
        assert(
          Math.abs(decision.safeX-previousDecision.safeX)<=allowed,
          'safe route demanded unreachable lateral movement'
        );
      }

      const routeHazards=decision.points.filter(isHazard);
      for(const p of routeHazards){
        const info=hazardInfo[p.kind];
        assert(
          Math.abs(p.x-decision.safeX)>info.radiusX+.36,
          'hazard intruded into the guaranteed navigable route'
        );
      }

      if(routeHazards.length>=4){
        const xs=routeHazards.map(p=>p.x);
        const zs=routeHazards.map(p=>p.z);
        const spanX=Math.max(...xs)-Math.min(...xs);
        const spanZ=Math.max(...zs)-Math.min(...zs);
        assert(!(spanX>14&&spanZ<1),'wide horizontal obstacle wall detected');
      }

      // Detect an unnatural repeated vertical column across consecutive route decisions.
      const bins=new Set(routeHazards.map(p=>Math.round(p.x/.25)));
      const next=new Map();
      for(const bin of bins){
        const streak=(columnStreak.get(bin)||0)+1;
        next.set(bin,streak);
        maxColumnStreak=Math.max(maxColumnStreak,streak);
        if(streak>4&&!columnFailure){
          columnFailure={
            seed,
            sectionIndex:i,
            sectionType:section.type,
            decisionZ:decision.z,
            safeX:decision.safeX,
            bin,
            x:bin*.25,
            hazards:routeHazards.map(p=>({kind:p.kind,x:p.x,z:p.z,formation:p.formation}))
          };
        }
      }
      columnStreak.clear();
      for(const [bin,streak] of next)columnStreak.set(bin,streak);

      previousDecision={z:decision.z,safeX:decision.safeX};
    }

    // Excessive physical overlap should have been pruned during authored generation.
    for(let a=0;a<hazards.length;a++){
      for(let b=a+1;b<hazards.length;b++){
        assert(
          !(Math.abs(hazards[a].x-hazards[b].x)<.42&&Math.abs(hazards[a].z-hazards[b].z)<.52),
          'physical hazards overlap excessively'
        );
      }
    }

    if(section.type==='RAMP'||section.type==='LOG JUMP'){
      totalRamps++;
      const ramp=section.placements.find(p=>p.kind==='ramp');
      assert(ramp,'jump section missing ramp');
      assert(ramp.landingZone===true,'ramp is missing landing-zone metadata');

      const envelope=estimateRampFlightEnvelope(speed);
      const protectedHazards=hazards.filter(p=>{
        if(p.jumpTarget)return false;
        const distance=ramp.z-p.z;
        return distance>=envelope.protectedStartDistance&&
          distance<=envelope.protectedEndDistance&&
          Math.abs(p.x-ramp.safeX)<envelope.corridorHalfWidth;
      });
      assert.equal(protectedHazards.length,0,'hazard invaded predicted ramp landing corridor');

      const airborneHazards=hazards.filter(p=>
        p.z<ramp.z-18&&p.z>ramp.z-envelope.flightEndDistance
      );
      assert(airborneHazards.length>0,'airborne section became empty of hazards');

      if(section.type==='LOG JUMP'){
        assert(section.placements.some(p=>p.kind==='log'&&p.jumpTarget),'LOG JUMP missing marked jump target');
      }
    }

    previousType=section.type;
    z=section.endZ;
  }

  minLeftEdgeThreats=Math.min(minLeftEdgeThreats,leftEdgeThreats);
  minRightEdgeThreats=Math.min(minRightEdgeThreats,rightEdgeThreats);
}

assert(totalMeters/seeds.length>10000,'stress run did not cover enough virtual distance per seed');
assert(minLeftEdgeThreats>=20,'far-left edge was insufficiently threatened');
assert(minRightEdgeThreats>=20,'far-right edge was insufficiently threatened');
assert(maxLeftDrySections<=16,'far-left edge stayed safe for too many consecutive sections');
assert(maxRightDrySections<=16,'far-right edge stayed safe for too many consecutive sections');
if(columnFailure)console.error('COLUMN_DIAGNOSTIC '+JSON.stringify(columnFailure));
assert(maxColumnStreak<=4,'repeated vertical obstacle column persisted too long');

// Streaming audit: generation must live well outside the ~280m far plane.
const cameraFar=280;
const baseLookahead=getCourseLookahead(T.BASE_SPEED);
const maxLookahead=getCourseLookahead(T.MAX_SPEED);
assert(baseLookahead>=560,'base-speed course lookahead regressed');
assert(maxLookahead>cameraFar+300,'max-speed course lookahead is too close to visible range');
assert(maxLookahead<=T.COURSE_LOOKAHEAD_MAX+1e-6,'lookahead exceeded configured cap');

function streamingProbe(seed,speed,dt){
  const director=createCourseDirector({routeCenter,random:rng(seed)});
  let courseEndZ=-12,courseTravel=0;
  const playerZ=2.2;
  let initialAdds=0,initialObjects=0,maxFrameAdds=0;

  const target=()=>playerZ-getCourseLookahead(speed);
  while(courseEndZ+courseTravel>target()&&initialAdds<24){
    const section=director.next({startZ:courseEndZ-5.5,difficulty:1,speed});
    initialObjects+=section.placements.length;
    courseEndZ=section.endZ;
    initialAdds++;
  }
  assert(courseEndZ+courseTravel<=target(),'24-section guard could not satisfy initial lookahead');
  assert(initialAdds<=8,'resetCourse would create an excessive section burst');
  assert(initialObjects<=220,'resetCourse would activate an excessive object burst');

  for(let frame=0;frame<3600;frame++){
    courseTravel+=speed*dt;
    let frameAdds=0;
    while(courseEndZ+courseTravel>target()&&frameAdds<24){
      const section=director.next({startZ:courseEndZ-5.5,difficulty:1,speed});
      courseEndZ=section.endZ;
      frameAdds++;
    }
    assert(courseEndZ+courseTravel<=target(),'steady-state streaming failed to restore lookahead');
    maxFrameAdds=Math.max(maxFrameAdds,frameAdds);
  }
  assert(maxFrameAdds<=1,'steady-state frame generated a large course burst');
  return {initialAdds,initialObjects,maxFrameAdds};
}
const stream60=streamingProbe(0x5151,T.MAX_SPEED,1/60);
const stream20=streamingProbe(0x6161,T.MAX_SPEED,.05);

const mainSource=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
assert(mainSource.includes('removeCourseAt(i);')&&mainSource.includes('releaseCourseItem(item);'),'course swap-remove recycling/pooling path is missing');
assert(!mainSource.includes('course.splice(i,1);'),'course hot loop regressed to splice-based removal');
assert(mainSource.includes('getCourseLookahead(state?.speed??SKI_TUNING.BASE_SPEED)'),'adaptive lookahead hook is missing');

console.log(JSON.stringify({
  check:'course-generation-invariants',
  seeds:seeds.length,
  sections:totalSections,
  virtualKm:Number((totalMeters/1000).toFixed(1)),
  minLeftEdgeThreats,
  minRightEdgeThreats,
  maxLeftDrySections,
  maxRightDrySections,
  maxColumnStreak,
  ramps:totalRamps,
  baseLookahead,
  maxLookahead:Number(maxLookahead.toFixed(2)),
  stream60,
  stream20
}));
