import assert from 'node:assert/strict';
import {createCourseDirector} from '../src/course.js';
import {
  createExpertRunDirector,
  EXPERT_PATTERN_TYPES,
  RUN_PHASES
} from '../src/courseRunDirector.js';
import {
  getPerceptionReactionSeconds,
  getSpeedAwarePerceptionMargin,
  maxHumanReachableLateralDelta,
  maxReachableLateralDelta
} from '../src/courseSafety.js';
import {
  breakSkillCombo,
  resetAirborneScoring,
  scoreRiskBanana,
  tryScoreNearMiss,
  updateAirborneScoring
} from '../src/airborneScoring.js';
import {SKI_TUNING as T} from '../src/gameplayTuning.js';
import {getRideProfile,RIDE_MODE,speedToKmh} from '../src/rideMode.js';

function rng(seed=0x12345678){
  let x=seed>>>0;
  return ()=>{
    x=(Math.imul(x,1664525)+1013904223)>>>0;
    return x/4294967296;
  };
}

const ski=getRideProfile(RIDE_MODE.SKI);
const snowboard=getRideProfile(RIDE_MODE.SNOWBOARD);
assert.equal(speedToKmh(ski.baseSpeed),160,'ski starting speed drifted from 160 km/h');
assert.equal(speedToKmh(snowboard.baseSpeed),180,'snowboard starting speed drifted from 180 km/h');
assert.equal(speedToKmh(ski.tierIncrement),20,'ski tier increment drifted from +20 km/h');
assert.equal(speedToKmh(snowboard.tierIncrement),20,'snowboard tier increment drifted from +20 km/h');
assert.equal(ski.tierSeconds,30,'ski speed tier cadence drifted from 30 seconds');
assert.equal(snowboard.tierSeconds,30,'snowboard speed tier cadence drifted from 30 seconds');
assert.equal(speedToKmh(ski.maxSpeed),300,'ski max speed drifted from 300 km/h');
assert.equal(speedToKmh(snowboard.maxSpeed),300,'snowboard max speed drifted from 300 km/h');
assert(T.PHYSICS_SUBSTEP_SECONDS<=1/180+1e-12,'180 Hz physics substep ceiling was weakened');

assert.deepEqual(
  RUN_PHASES,
  ['FLOW','TECHNICAL','PRESSURE','RISK_REWARD','TRICK','EXPERT','RECOVERY'],
  'run director phase vocabulary drifted'
);
assert.deepEqual(
  EXPERT_PATTERN_TYPES,
  ['FUNNEL','CROSS_COURSE','FORK','COMMITMENT','OFFSET_CHICANE','EDGE_RISK','BAIT_LINE'],
  'expert route-pattern vocabulary drifted'
);

const baseReaction=getPerceptionReactionSeconds(T.BASE_SPEED);
const maxReaction=getPerceptionReactionSeconds(T.MAX_SPEED);
const baseMargin=getSpeedAwarePerceptionMargin(T.BASE_SPEED);
const maxMargin=getSpeedAwarePerceptionMargin(T.MAX_SPEED);
assert(maxReaction>baseReaction,'human reaction reserve did not increase with speed');
assert(maxMargin>baseMargin,'perception margin did not increase with speed');
assert(
  maxHumanReachableLateralDelta(25,T.MAX_SPEED)<maxReachableLateralDelta(25,T.MAX_SPEED),
  'human-reaction reach is not stricter than purely geometric reach at 300 km/h'
);

{
  const director=createExpertRunDirector({random:rng(0xdecafbad)});
  const phases=new Set();
  const patterns=new Set();
  let maxPhaseStreak=0;
  let maxPatternStreak=0;
  let lastPhase='',lastPattern='',phaseStreak=0,patternStreak=0;

  for(let i=0;i<240;i++){
    const plan=director.plan({
      runTime:240+i*1.25,
      difficulty:1,
      speed:T.MAX_SPEED,
      postMaxTime:Math.min(T.POST_MAX_HAZARD_RAMP_SECONDS,i*1.25),
      lastType:i%17===0?'RECOVERY':'GATE',
      pendingLanding:false,
      sectionIndex:i
    });
    phases.add(plan.phase);
    if(plan.pattern)patterns.add(plan.pattern);

    phaseStreak=plan.phase===lastPhase?phaseStreak+1:1;
    lastPhase=plan.phase;
    maxPhaseStreak=Math.max(maxPhaseStreak,phaseStreak);

    if(plan.pattern){
      patternStreak=plan.pattern===lastPattern?patternStreak+1:1;
      lastPattern=plan.pattern;
      maxPatternStreak=Math.max(maxPatternStreak,patternStreak);
    }else{
      patternStreak=0;
      lastPattern='';
    }

    director.noteSection({
      phase:plan.phase,
      pattern:plan.pattern,
      sectionType:plan.phase==='TRICK'?'RAMP':plan.phase==='RECOVERY'?'RECOVERY':'GATE',
      side:plan.side,
      pressure:plan.expertPressure,
      obstacleFamily:i%2?'rock+tree':'oil+rock'
    });
  }

  assert(phases.size>=6,'run director collapsed into too few pressure phases');
  assert(patterns.size===EXPERT_PATTERN_TYPES.length,'not every expert route pattern remained reachable');
  assert(maxPhaseStreak<=3,'run director repeated a phase too many times');
  assert(maxPatternStreak<=3,'run director repeated an expert pattern too many times');
}

const routeCenter=z=>Math.sin((-z)*.035)*2.9+Math.sin((-z)*.011)*1.1;
const physicalKinds=new Set(['tree','rock','log','wideLog','oil']);
const observedPhases=new Set();
const observedPatterns=new Set();
let totalSections=0;
let totalRiskBananas=0;
let totalExpertHazards=0;
let totalRepairs=0;
let totalHardRepairs=0;
let invalidCorridors=0;

for(let seedIndex=0;seedIndex<8;seedIndex++){
  const director=createCourseDirector({
    routeCenter,
    random:rng(Math.imul(seedIndex+1,0x9e3779b9))
  });
  let z=-12;

  for(let sectionIndex=0;sectionIndex<100;sectionIndex++){
    const section=director.next({
      startZ:z,
      difficulty:1,
      speed:T.MAX_SPEED,
      runTime:240+sectionIndex*1.3,
      postMaxTime:Math.min(
        T.POST_MAX_HAZARD_RAMP_SECONDS,
        sectionIndex*1.3
      )
    });
    totalSections++;
    observedPhases.add(section.runPhase);
    if(section.expertPattern)observedPatterns.add(section.expertPattern);

    assert(section.corridorValidation,'section lost reachable-corridor diagnostics');
    if(!section.corridorValidation.valid)invalidCorridors++;
    totalRepairs+=section.corridorValidation.repairs||0;
    totalHardRepairs+=section.corridorValidation.hardRepairs||0;

    const riskBananas=section.placements.filter(
      placement=>placement.kind==='banana'&&(placement.riskReward||0)>0
    );
    totalRiskBananas+=riskBananas.length;
    for(const banana of riskBananas){
      assert(banana.rewardPoints>0,'risk banana lost authored score value');
      assert(
        banana.riskReward>=1&&banana.riskReward<=3,
        'risk banana escaped the supported risk tiers'
      );
      if(banana.rewardRoute){
        assert(
          Math.abs(banana.x-banana.rewardRouteFromX)<=banana.rewardRouteReach*.92+1e-6,
          'reward-route banana demanded more lateral movement than the human-reaction envelope'
        );
      }
    }

    const hazards=section.placements.filter(
      placement=>physicalKinds.has(placement.kind)
    );
    const expertHazards=hazards.filter(placement=>placement.expertOverlay);
    totalExpertHazards+=expertHazards.length;

    for(const candidate of expertHazards){
      const horizontalPeers=hazards.filter(
        other=>other!==candidate&&Math.abs(other.z-candidate.z)<1.55
      );
      if(horizontalPeers.length>=2){
        const xs=[candidate.x,...horizontalPeers.map(item=>item.x)];
        const span=Math.max(...xs)-Math.min(...xs);
        assert(span<=7.2,'expert overlay completed an obvious wide horizontal wall');
      }

      const verticalPeers=hazards.filter(
        other=>
          other!==candidate&&
          Math.abs(other.x-candidate.x)<.92&&
          Math.abs(other.z-candidate.z)<11.5
      );
      assert(
        verticalPeers.length<2,
        'expert overlay completed an obvious repeated vertical column'
      );
    }

    z=section.endZ;
  }
}

assert.equal(invalidCorridors,0,'a generated section eliminated every human-reachable corridor');
assert(observedPhases.size>=6,'course generation did not exercise enough run-director phases');
assert(observedPatterns.size===EXPERT_PATTERN_TYPES.length,'course generation did not exercise every expert pattern');
assert(totalRiskBananas>100,'risk/reward banana routes became too rare');
assert(totalExpertHazards>500,'expert route structures became too sparse');

{
  const state={time:0,air:false,y:.12,x:0};
  resetAirborneScoring(state);
  updateAirborneScoring(state);
  assert.equal(state.score,0,'ordinary survival generated skill score');
  assert.equal(state.combo,0,'ordinary survival generated a skill combo');

  const first={
    position:{x:0,z:2.25},
    userData:{kind:'rock',nearMissScored:false}
  };
  state.x=1.5;
  const near=tryScoreNearMiss(state,first,{
    previousZ:2.1,
    playerZ:2.2,
    radiusX:.55,
    paddingX:T.COURSE_COLLISION_PADDING_X
  });
  assert(near&&near.points>0,'legitimate near miss did not score');
  assert.equal(state.combo,1,'near miss did not begin active-skill combo');

  state.time=.55;
  state.x=-1.5;
  const second={
    position:{x:0,z:2.25},
    userData:{kind:'rock',nearMissScored:false}
  };
  const thread=tryScoreNearMiss(state,second,{
    previousZ:2.1,
    playerZ:2.2,
    radiusX:.55,
    paddingX:T.COURSE_COLLISION_PADDING_X
  });
  assert(thread&&thread.kind==='thread','opposite-side near misses did not register threading');
  assert(state.combo>=2,'threading did not sustain the active-skill combo');

  state.time=.8;
  const riskBanana={
    userData:{riskReward:3,rewardPoints:160}
  };
  const reward=scoreRiskBanana(state,riskBanana);
  assert(reward&&reward.points>=160,'expert banana did not receive risk/reward score');

  const scoreBeforeBreak=state.score;
  breakSkillCombo(state);
  assert.equal(state.combo,0,'collision-style combo break did not reset combo');
  assert.equal(state.comboMultiplier,1,'collision-style combo break did not reset multiplier');
  assert.equal(state.score,scoreBeforeBreak,'combo break incorrectly erased earned score');
}

console.log(JSON.stringify({
  check:'expert-difficulty-run-director-invariants',
  totalSections,
  phases:[...observedPhases],
  patterns:[...observedPatterns],
  riskBananas:totalRiskBananas,
  expertHazards:totalExpertHazards,
  totalRepairs,
  totalHardRepairs,
  invalidCorridors,
  perception:{
    reactionSeconds:[baseReaction,maxReaction],
    lateralMargin:[baseMargin,maxMargin]
  }
}));
