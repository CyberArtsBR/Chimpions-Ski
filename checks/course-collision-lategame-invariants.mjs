import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COURSE_TYPES,FORMATION_TYPES,createCourseDirector} from '../src/course.js';
import {SKI_TUNING as T} from '../src/gameplayTuning.js';
import {OBSTACLE_TUNING} from '../src/obstacleTuning.js';
import {maxReachableLateralDelta} from '../src/courseSafety.js';
import {estimateRampFlightEnvelope} from '../src/rampTrajectory.js';
import {getRideProfile} from '../src/rideMode.js';
import {stepCarving} from '../src/skiPhysics.js';

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
  log:{radiusX:OBSTACLE_TUNING.log.collisionHalfWidth,radiusZ:OBSTACLE_TUNING.log.radiusZ},
  wideLog:{radiusX:OBSTACLE_TUNING.wideLog.collisionHalfWidth,radiusZ:OBSTACLE_TUNING.wideLog.radiusZ},
  oil:{radiusX:OBSTACLE_TUNING.oil.collisionHalfWidth,radiusZ:OBSTACLE_TUNING.oil.radiusZ}
};
const isHazard=placement=>!!hazardInfo[placement.kind];
const seeds=Array.from({length:32},(_,index)=>Math.imul(0x9e3779b9,index+1)>>>0);
const sectionsPerSeed=160;

let totalMeters=0,totalSections=0,totalRamps=0,totalPostMaxFill=0,totalDecisions=0;
let maxFormationStreak=0,maxDenseDecisionStreak=0;
let maxLeftDrySections=0,maxRightDrySections=0;
let minLeftEdgeThreats=Infinity,minRightEdgeThreats=Infinity,minSidePressureHazards=Infinity;
let minMeaningfulReactionTime=Infinity;

for(const seed of seeds){
  const director=createCourseDirector({routeCenter,random:rng(seed)});
  let z=-12;
  let previousFormation=null,formationStreak=0,denseDecisionStreak=0;
  let leftDry=0,rightDry=0,leftThreats=0,rightThreats=0,sidePressure=0;

  for(let sectionIndex=0;sectionIndex<sectionsPerSeed;sectionIndex++){
    const section=director.next({
      startZ:z,
      difficulty:1,
      speed:T.MAX_SPEED,
      postMaxTime:T.POST_MAX_HAZARD_RAMP_SECONDS
    });
    totalSections++;
    totalMeters+=section.length;
    assert(COURSE_TYPES.includes(section.type),'unknown late-game course section');
    const hazards=section.placements.filter(isHazard);

    const leftThis=hazards.some(p=>p.x<=-T.SIDE_HAZARD_ZONE_START);
    const rightThis=hazards.some(p=>p.x>=T.SIDE_HAZARD_ZONE_START);
    if(leftThis){
      leftThreats+=hazards.filter(p=>p.x<=-T.SIDE_HAZARD_ZONE_START).length;
      leftDry=0;
    }else leftDry++;
    if(rightThis){
      rightThreats+=hazards.filter(p=>p.x>=T.SIDE_HAZARD_ZONE_START).length;
      rightDry=0;
    }else rightDry++;
    sidePressure+=hazards.filter(p=>p.sidePressure).length;
    totalPostMaxFill+=hazards.filter(p=>p.postMaxPressure).length;
    maxLeftDrySections=Math.max(maxLeftDrySections,leftDry);
    maxRightDrySections=Math.max(maxRightDrySections,rightDry);

    // Validate reachability among the route-decision metadata emitted by this
    // section only. The procedural director keeps a stateful safe-route tracker
    // across section boundaries, but not every tracker transition is represented
    // by routeDecision metadata (notably RECOVERY). Cross-section stitching of
    // this partial metadata would therefore create false direct transitions.
    let previousDecision=null;
    const routeDecisions=[];
    for(const placement of section.placements){
      if(!placement.routeDecision||!Number.isFinite(placement.decisionZ))continue;
      let decision=routeDecisions.find(entry=>
        entry.z===placement.decisionZ&&entry.safeX===placement.safeX
      );
      if(!decision){
        decision={z:placement.decisionZ,safeX:placement.safeX,points:[]};
        routeDecisions.push(decision);
      }
      decision.points.push(placement);
    }
    routeDecisions.sort((a,b)=>b.z-a.z);
    for(const decision of routeDecisions){
      if(previousDecision){
        const dz=decision.z-previousDecision.z;
        const allowed=maxReachableLateralDelta(dz,T.MAX_SPEED)+1e-6;
        const lateralDelta=Math.abs(decision.safeX-previousDecision.safeX);
        assert(lateralDelta<=allowed,'late-game safe route demanded unreachable lateral movement');
        if(lateralDelta>.35){
          const reaction=Math.abs(dz)/T.MAX_SPEED;
          minMeaningfulReactionTime=Math.min(minMeaningfulReactionTime,reaction);
        }
      }
      for(const placement of decision.points.filter(isHazard)){
        const info=hazardInfo[placement.kind];
        assert(
          Math.abs(placement.x-decision.safeX)>info.radiusX+.36,
          'late-game hazard invaded guaranteed safe route'
        );
      }
      previousDecision={z:decision.z,safeX:decision.safeX};
    }

    const formationGroups=new Map();
    for(const placement of hazards){
      if(!Number.isFinite(placement.decisionSerial))continue;
      let group=formationGroups.get(placement.decisionSerial);
      if(!group){
        group={formation:placement.formation,z:placement.decisionZ,points:[]};
        formationGroups.set(placement.decisionSerial,group);
      }
      group.points.push(placement);
    }
    const orderedGroups=[...formationGroups.values()].sort((a,b)=>b.z-a.z);
    const authoredFixedRhythm=section.type==='ROCK SLALOM';
    if(authoredFixedRhythm){
      // ROCK SLALOM intentionally authors eight OFFSET_GATE rows per section.
      // Do not treat that section-family identity as stochastic repetition.
      previousFormation=null;
      formationStreak=0;
      denseDecisionStreak=0;
    }
    for(const group of orderedGroups){
      totalDecisions++;
      assert(FORMATION_TYPES.includes(group.formation),'unknown late-game formation');
      if(authoredFixedRhythm)continue;
      if(group.formation===previousFormation)formationStreak++;
      else{
        previousFormation=group.formation;
        formationStreak=1;
      }
      maxFormationStreak=Math.max(maxFormationStreak,formationStreak);

      if(group.points.length>=5)denseDecisionStreak++;
      else denseDecisionStreak=0;
      maxDenseDecisionStreak=Math.max(maxDenseDecisionStreak,denseDecisionStreak);
    }

    for(let a=0;a<hazards.length;a++){
      for(let b=a+1;b<hazards.length;b++){
        assert(
          !(Math.abs(hazards[a].x-hazards[b].x)<.42&&Math.abs(hazards[a].z-hazards[b].z)<.52),
          'late-game physical hazards overlap excessively'
        );
      }
    }

    if(section.type==='RAMP'||section.type==='LOG JUMP'){
      totalRamps++;
      const ramp=section.placements.find(p=>p.kind==='ramp');
      assert(ramp,'late-game jump section missing ramp');
      const envelope=estimateRampFlightEnvelope(T.MAX_SPEED);
      const protectedHazards=hazards.filter(placement=>{
        if(placement.jumpTarget)return false;
        const distance=ramp.z-placement.z;
        return distance>=envelope.protectedStartDistance&&
          distance<=envelope.protectedEndDistance&&
          Math.abs(placement.x-ramp.safeX)<envelope.corridorHalfWidth;
      });
      assert.equal(protectedHazards.length,0,'late-game ramp landing corridor was obstructed');
    }

    z=section.endZ;
  }

  minLeftEdgeThreats=Math.min(minLeftEdgeThreats,leftThreats);
  minRightEdgeThreats=Math.min(minRightEdgeThreats,rightThreats);
  minSidePressureHazards=Math.min(minSidePressureHazards,sidePressure);
}

assert(totalMeters/seeds.length>18000,'late-game procedural stress run covered too little distance per seed');
// Dense irregular late-game fields can legitimately reuse a formation for a short
// burst while still varying positions, safe routes and hazard composition. Keep a
// bounded anti-repetition contract without forcing the generator back toward the
// older, sparser cadence.
assert(maxFormationStreak<=4,`same formation repeated too many consecutive stochastic route decisions (${maxFormationStreak})`);
assert(maxDenseDecisionStreak<=4,`too many very-dense stochastic route decisions appeared consecutively (${maxDenseDecisionStreak})`);
assert(maxLeftDrySections<=6,'far-left edge stayed safe too long in sustained late game');
assert(maxRightDrySections<=6,'far-right edge stayed safe too long in sustained late game');
assert(minLeftEdgeThreats>=300,'far-left late-game pressure became too sparse');
assert(minRightEdgeThreats>=300,'far-right late-game pressure became too sparse');
const minimumSidePressureHazards=Math.ceil(sectionsPerSeed*.25);
assert(
  minSidePressureHazards>=minimumSidePressureHazards,
  `dedicated late-game side pressure became too sparse (${minSidePressureHazards} < ${minimumSidePressureHazards})`
);
assert(totalPostMaxFill>5000,'post-max sparse-gap pressure did not meaningfully activate');
assert(totalRamps>400,'late-game stress run did not exercise enough ramp trajectories');
assert(minMeaningfulReactionTime>.04,'meaningful safe-route decision provided effectively no reaction time');

assert(T.PHYSICS_SUBSTEP_SECONDS<=1/180+1e-12,'physics substep ceiling was weakened');
const frameDts=[1/60,1/30,.05];
let narrowestLongitudinalSafetyFactor=Infinity;
let narrowestLateralSafetyFactor=Infinity;
const maxHeading=Math.max(T.HEADING_LIMIT_LOW,T.HEADING_LIMIT_HIGH);
const maxLateralScale=Math.max(T.LATERAL_SCALE_LOW,T.LATERAL_SCALE_HIGH);
const maxLateralSpeed=Math.sin(maxHeading)*T.MAX_SPEED*maxLateralScale;
for(const frameDt of frameDts){
  const steps=Math.ceil(frameDt/T.PHYSICS_SUBSTEP_SECONDS);
  const stepDt=frameDt/steps;
  const longitudinalTravel=T.MAX_SPEED*stepDt;
  const lateralTravel=maxLateralSpeed*stepDt;
  for(const info of Object.values(hazardInfo)){
    const longitudinalInterval=2*(info.radiusZ+T.COURSE_COLLISION_PADDING_Z);
    const lateralInterval=2*(info.radiusX+T.COURSE_COLLISION_PADDING_X);
    const longitudinalFactor=longitudinalInterval/longitudinalTravel;
    const lateralFactor=lateralInterval/lateralTravel;
    narrowestLongitudinalSafetyFactor=Math.min(narrowestLongitudinalSafetyFactor,longitudinalFactor);
    narrowestLateralSafetyFactor=Math.min(narrowestLateralSafetyFactor,lateralFactor);
    assert(longitudinalFactor>1,'max-speed longitudinal hazard tunneling became possible');
    assert(lateralFactor>1,'max-speed lateral hazard tunneling became possible');
  }
}

const mainSource=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
assert(
  mainSource.includes('Math.ceil(dt/SKI_TUNING.PHYSICS_SUBSTEP_SECONDS)'),
  'runtime no longer uses the tested physics substep ceiling'
);
assert(
  mainSource.includes('radiusZ+SKI_TUNING.COURSE_COLLISION_PADDING_Z')&&
  mainSource.includes('radiusX+SKI_TUNING.COURSE_COLLISION_PADDING_X'),
  'runtime collision padding drifted from tested tuning'
);
assert(
  mainSource.includes('previousApproachDepth>-1.42&&approachDepth<=-1.42'),
  'ramp lip crossing test regressed to a vulnerable point sample'
);

const skiProfile=getRideProfile('ski');
const snowboardProfile=getRideProfile('snowboard');
assert.equal(skiProfile.maxSpeed,snowboardProfile.maxSpeed,'ride modes must share competitive max speed');
assert(Math.abs(skiProfile.tierIncrement-snowboardProfile.tierIncrement)<.001,'ride modes drifted to different speed-tier gains');
assert(skiProfile.reversalResponseScale>snowboardProfile.reversalResponseScale,'ski should retain quicker edge-to-edge recovery');
assert(skiProfile.lateralResponseScale>snowboardProfile.lateralResponseScale,'ski should retain more precise correction response');
assert(snowboardProfile.turnRateScale>skiProfile.turnRateScale,'snowboard should retain stronger carve commitment');
assert(snowboardProfile.lateralScale>skiProfile.lateralScale,'snowboard should retain somewhat more committed lateral travel');
assert(skiProfile.landingReengageScale<snowboardProfile.landingReengageScale,'ski should re-engage slightly sooner after landing');

function makeState(mode,overrides={}){
  const profile=getRideProfile(mode);
  return {
    rideMode:mode,
    speed:65,
    time:0,
    x:0,
    vx:0,
    edge:0,
    heading:0,
    turnRate:0,
    air:false,
    grounded:true,
    y:.12,
    vy:0,
    landingPulse:0,
    rampGrace:0,
    counterSteer:false,
    landingReengageTime:0,
    oilSlipTime:0,
    carveLoad:0,
    landingGripLoss:0,
    grip:.8,
    baseSpeed:profile.baseSpeed,
    maxSpeed:profile.maxSpeed,
    ...overrides
  };
}
function runCarve(state,input,seconds,dt=1/180){
  const steps=Math.ceil(seconds/dt);
  for(let i=0;i<steps;i++)stepCarving(state,input,dt);
  return state;
}
const skiCommitted=runCarve(makeState('ski'),1,.70);
const snowboardCommitted=runCarve(makeState('snowboard'),1,.70);
assert(
  Math.abs(snowboardCommitted.vx)>Math.abs(skiCommitted.vx)*1.04,
  'snowboard carve commitment is not measurably distinct from ski'
);

const edgeState=makeState('ski',{
  x:T.PLAYER_HALF_WIDTH-.002,
  vx:8,
  edge:1,
  heading:.30,
  turnRate:1
});
const speedBeforeEdge=edgeState.speed;
const edgeResult=stepCarving(edgeState,1,1/120);
assert.equal(edgeResult?.edgeScrape?.type,'edgeScrape','edge contact did not expose semantic edgeScrape event');
assert.equal(edgeResult.edgeScrape.side,'right','edge scrape side was incorrect');
assert(edgeResult.edgeScrape.intensity>0&&edgeResult.edgeScrape.intensity<=1,'edge scrape intensity escaped normalized range');
assert(edgeState.x<=T.PLAYER_HALF_WIDTH+1e-9,'edge response escaped playable clamp');
assert(edgeState.vx<0,'edge response did not apply a small inward deflection');
const edgeSpeedLoss=(speedBeforeEdge-edgeState.speed)/speedBeforeEdge;
assert(edgeSpeedLoss>0&&edgeSpeedLoss<.01,'edge speed scrub is not tiny/fair');

console.log(JSON.stringify({
  check:'course-collision-lategame-invariants',
  seeds:seeds.length,
  sections:totalSections,
  virtualKm:Number((totalMeters/1000).toFixed(1)),
  maxFormationStreak,
  maxDenseDecisionStreak,
  maxLeftDrySections,
  maxRightDrySections,
  minLeftEdgeThreats,
  minRightEdgeThreats,
  minSidePressureHazards,
  minMeaningfulReactionTime:Number(minMeaningfulReactionTime.toFixed(4)),
  totalRamps,
  totalPostMaxFill,
  collisionSafety:{
    narrowestLongitudinalFactor:Number(narrowestLongitudinalSafetyFactor.toFixed(2)),
    narrowestLateralFactor:Number(narrowestLateralSafetyFactor.toFixed(2)),
    simulatedFrameDts:frameDts
  },
  rideIdentity:{
    skiVx:Number(skiCommitted.vx.toFixed(3)),
    snowboardVx:Number(snowboardCommitted.vx.toFixed(3))
  },
  edgeScrape:edgeResult.edgeScrape
}));
