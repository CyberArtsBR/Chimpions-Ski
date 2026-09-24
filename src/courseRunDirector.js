import {getSpeedProgress,SKI_TUNING as T} from './gameplayTuning.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const lerp=(a,b,t)=>a+(b-a)*t;

export const RUN_PHASES=Object.freeze([
  'FLOW',
  'TECHNICAL',
  'PRESSURE',
  'RISK_REWARD',
  'TRICK',
  'EXPERT',
  'RECOVERY'
]);

export const EXPERT_PATTERN_TYPES=Object.freeze([
  'FUNNEL',
  'CROSS_COURSE',
  'FORK',
  'COMMITMENT',
  'OFFSET_CHICANE',
  'EDGE_RISK',
  'BAIT_LINE'
]);

const SECTION_FAMILIES=Object.freeze({
  FLOW:['OPEN CARVE','BANANA LINE','GATE'],
  TECHNICAL:['GATE','ROCK SLALOM','FOREST'],
  PRESSURE:['FOREST','ROCK SLALOM','GATE'],
  RISK_REWARD:['BANANA LINE','OPEN CARVE','GATE'],
  TRICK:['RAMP','LOG JUMP','OPEN CARVE'],
  EXPERT:['ROCK SLALOM','FOREST','GATE','LOG JUMP'],
  RECOVERY:['RECOVERY']
});

const PATTERN_WEIGHTS=Object.freeze({
  FLOW:[1.05,.72,.62,.70,.82,.42,.76],
  TECHNICAL:[.88,1.12,.76,1.05,1.24,.58,.74],
  PRESSURE:[1.15,1.10,.86,1.28,1.06,.72,.64],
  RISK_REWARD:[.70,.82,1.28,.72,.82,1.42,1.24],
  TRICK:[.62,.66,.72,.74,.86,1.02,.90],
  EXPERT:[1.18,1.34,1.08,1.32,1.42,1.04,.92],
  RECOVERY:[.28,.26,.24,.24,.26,.20,.22]
});

const PHASE_PRESSURE=Object.freeze({
  FLOW:.14,
  TECHNICAL:.44,
  PRESSURE:.68,
  RISK_REWARD:.54,
  TRICK:.46,
  EXPERT:.84,
  RECOVERY:.06
});

function normalizePerformance(performance={}){
  const safe=performance&&typeof performance==='object'?performance:{};
  return {
    nearMisses:Math.max(0,Number(safe.nearMisses)||0),
    cleanLandings:Math.max(0,Number(safe.cleanLandings)||0),
    successfulTricks:Math.max(0,Number(safe.successfulTricks)||0),
    failedTricks:Math.max(0,Number(safe.failedTricks)||0),
    oilContacts:Math.max(0,Number(safe.oilContacts)||0),
    bananas:Math.max(0,Number(safe.bananas)||0),
    riskBananas:Math.max(0,Number(safe.riskBananas)||0),
    timeSinceMistake:Math.max(0,Number(safe.timeSinceMistake)||0),
    steeringCorrectionIntensity:clamp(Number(safe.steeringCorrectionIntensity)||0,0,1)
  };
}

function masterySignal(performance={}){
  const p=normalizePerformance(performance);
  const positive=
    clamp(p.nearMisses/10,0,1)*.18+
    clamp(p.cleanLandings/8,0,1)*.16+
    clamp(p.successfulTricks/5,0,1)*.17+
    clamp(p.riskBananas/10,0,1)*.15+
    clamp(p.bananas/28,0,1)*.08+
    clamp(p.timeSinceMistake/24,0,1)*.14;
  const mistakes=
    clamp(p.failedTricks/4,0,1)*.20+
    clamp(p.oilContacts/5,0,1)*.18+
    p.steeringCorrectionIntensity*.10;
  return clamp(.48+positive-mistakes,0,1);
}

function buildThreatBudget({phase,intensity,speed01,post01,mastery,recentPressure}){
  const phasePressure=PHASE_PRESSURE[phase]??.3;
  const masteryBias=(mastery-.5)*.16;
  const target=clamp(
    .24+intensity*.40+speed01*.18+post01*.12+phasePressure*.16+masteryBias,
    phase==='RECOVERY'?.18:.30,
    phase==='RECOVERY'?.38:.96
  );
  const reactionSpacingScale=clamp(
    1+speed01*.16+post01*.04-(phase==='RECOVERY'?.02:0),
    .98,
    1.22
  );
  const routeCommitment=clamp(
    .32+intensity*.42+phasePressure*.20+Math.max(0,mastery-.55)*.10,
    .28,
    .92
  );
  const decisionCount=phase==='RECOVERY'
    ?1
    :Math.max(2,Math.min(4,2+Math.floor((intensity+phasePressure*.65)*1.55)));
  const maxCost=lerp(
    phase==='RECOVERY'?7.5:14,
    phase==='RECOVERY'?10.5:31,
    target
  );
  const maxOptionalHazards=Math.round(lerp(
    phase==='RECOVERY'?1:3,
    phase==='RECOVERY'?2:9,
    target
  ));
  const recoveryNeed=clamp(
    Math.max(0,recentPressure-.62)*.82+Math.max(0,.42-mastery)*.34,
    0,
    1
  );
  return {
    target,
    maxCost,
    maxOptionalHazards,
    reactionSpacingScale,
    routeCommitment,
    decisionCount,
    rewardBias:clamp(.48+(phase==='RISK_REWARD'?.30:0)+(phase==='EXPERT'?.14:0)+masteryBias*.6,0,1),
    recoveryNeed
  };
}

export function createExpertRunDirector({random=Math.random}={}){
  let recentPhases=[];
  let recentPatterns=[];
  let recentSections=[];
  let recentSides=[];
  let recentFamilies=[];
  let recentPressure=[];
  let sectionsSinceRamp=3;
  let sectionsSinceRecovery=0;
  let lastMastery=.5;

  const weightedIndex=weights=>{
    const safe=weights.map(value=>Math.max(0,Number(value)||0));
    const total=safe.reduce((sum,value)=>sum+value,0);
    if(total<=0)return 0;
    let roll=random()*total;
    for(let i=0;i<safe.length;i++){
      roll-=safe[i];
      if(roll<=0)return i;
    }
    return safe.length-1;
  };

  function antiRepeat(weights,values,recent,strong=.18,soft=.56){
    const copy=[...weights];
    const last=recent.at(-1);
    const previous=recent.at(-2);
    if(last!=null){
      const index=values.indexOf(last);
      if(index>=0)copy[index]*=strong;
    }
    if(previous!=null){
      const index=values.indexOf(previous);
      if(index>=0)copy[index]*=soft;
    }
    return copy;
  }

  function pressureAverage(){
    if(!recentPressure.length)return 0;
    return recentPressure.reduce((sum,value)=>sum+value,0)/recentPressure.length;
  }

  function choosePhase({
    difficulty=0,
    speed=T.BASE_SPEED,
    postMaxTime=0,
    lastType='RECOVERY',
    pendingLanding=false,
    mastery=.5
  }={}){
    if(lastType==='RAMP'||lastType==='LOG JUMP'||pendingLanding)return 'RECOVERY';

    const speed01=getSpeedProgress(speed);
    const post01=clamp((Number(postMaxTime)||0)/Math.max(1,T.POST_MAX_HAZARD_RAMP_SECONDS),0,1);
    const masteryBias=(mastery-.5)*.18;
    const pressureProgress=clamp(difficulty*.40+speed01*.35+post01*.30+masteryBias,0,1.12);
    const fatigue=pressureAverage();
    const recoveryNeed=clamp(
      Math.max(0,fatigue-.60)*1.25+
      Math.max(0,.44-mastery)*.45+
      (sectionsSinceRecovery>=5?.24:0),
      0,
      1
    );

    const weights=[
      1.30-pressureProgress*.56,
      .72+pressureProgress*.92,
      .50+pressureProgress*1.06,
      .48+pressureProgress*.88,
      sectionsSinceRamp>2?.40+pressureProgress*.58:.14,
      .12+Math.max(0,pressureProgress-.40)*1.38+post01*.66,
      .07+recoveryNeed*1.08
    ];

    if(sectionsSinceRecovery<=1)weights[6]*=.12;
    if(recentPhases.at(-1)==='PRESSURE'||recentPhases.at(-1)==='EXPERT')weights[6]*=1.48;
    if(recentPhases.slice(-2).every(value=>value==='FLOW'))weights[1]*=1.28;
    if(recentPhases.slice(-2).every(value=>value==='RECOVERY'))weights[6]*=.08;

    if(post01>.45){
      weights[1]*=1.16;
      weights[2]*=1.18;
      weights[3]*=1.22;
      weights[5]*=1.38;
      weights[0]*=.70;
      weights[4]*=.62;
    }

    if(mastery>.70){
      weights[2]*=1.08;
      weights[5]*=1.10;
      weights[6]*=.86;
    }else if(mastery<.34){
      weights[0]*=1.10;
      weights[6]*=1.18;
      weights[5]*=.86;
    }

    const adjusted=antiRepeat(weights,RUN_PHASES,recentPhases,.16,.60);
    return RUN_PHASES[weightedIndex(adjusted)];
  }

  function choosePattern(phase){
    const base=PATTERN_WEIGHTS[phase]||PATTERN_WEIGHTS.FLOW;
    const adjusted=antiRepeat(base,EXPERT_PATTERN_TYPES,recentPatterns,.14,.54);

    const lastSide=recentSides.at(-1)??0;
    if(lastSide!==0){
      const edgeIndex=EXPERT_PATTERN_TYPES.indexOf('EDGE_RISK');
      if(edgeIndex>=0&&recentPatterns.at(-1)==='EDGE_RISK')adjusted[edgeIndex]*=.35;
    }
    return EXPERT_PATTERN_TYPES[weightedIndex(adjusted)];
  }

  function chooseSide(){
    const last=recentSides.at(-1)??0;
    const previous=recentSides.at(-2)??0;
    if(last===0)return random()<.5?-1:1;
    if(previous===last)return -last;
    return random()<.68?-last:last;
  }

  function plan({
    runTime=0,
    difficulty=0,
    speed=T.BASE_SPEED,
    postMaxTime=0,
    lastType='RECOVERY',
    pendingLanding=false,
    sectionIndex=0,
    performance=null
  }={}){
    const mastery=masterySignal(performance);
    lastMastery=mastery;
    const phase=choosePhase({difficulty,speed,postMaxTime,lastType,pendingLanding,mastery});
    const speed01=getSpeedProgress(speed);
    const post01=clamp((Number(postMaxTime)||0)/Math.max(1,T.POST_MAX_HAZARD_RAMP_SECONDS),0,1);
    const time01=clamp((Number(runTime)||0)/300,0,1);
    const phasePressure=PHASE_PRESSURE[phase]??.3;
    const masteryBias=(mastery-.5)*.12;
    const intensity=clamp(
      .18+difficulty*.31+speed01*.19+post01*.17+time01*.07+phasePressure*.34+masteryBias,
      phase==='RECOVERY'?.10:.16,
      1
    );
    const recentPressureAverage=pressureAverage();
    const threatBudget=buildThreatBudget({
      phase,
      intensity,
      speed01,
      post01,
      mastery,
      recentPressure:recentPressureAverage
    });

    const pattern=phase==='RECOVERY'?null:choosePattern(phase);
    const side=chooseSide();
    const preferredSections=[...(SECTION_FAMILIES[phase]||SECTION_FAMILIES.FLOW)];
    const sequenceLength=threatBudget.decisionCount;
    const corridorHalfWidth=clamp(
      3.25-intensity*.84+speed01*.18,
      2.20,
      3.20
    );
    const routeShift=clamp(
      4.25+intensity*3.55+threatBudget.routeCommitment*.55,
      4.25,
      8.35
    );

    return {
      phase,
      pattern,
      side,
      intensity,
      mastery,
      preferredSections,
      sequenceLength,
      corridorHalfWidth,
      routeShift,
      speed01,
      postMaxPressure:post01,
      expertPressure:clamp(intensity*.70+post01*.26+Math.max(0,mastery-.58)*.08,0,1),
      threatBudget,
      sectionIndex
    };
  }

  function noteSection({
    phase,
    pattern,
    sectionType,
    side=0,
    pressure=0,
    obstacleFamily='',
    threatCost=null
  }={}){
    if(phase){recentPhases.push(phase);if(recentPhases.length>6)recentPhases.shift();}
    if(pattern){recentPatterns.push(pattern);if(recentPatterns.length>7)recentPatterns.shift();}
    if(sectionType){
      recentSections.push(sectionType);
      if(recentSections.length>7)recentSections.shift();
      if(sectionType==='RAMP'||sectionType==='LOG JUMP')sectionsSinceRamp=0;
      else sectionsSinceRamp++;
      if(sectionType==='RECOVERY')sectionsSinceRecovery=0;
      else sectionsSinceRecovery++;
    }
    if(side){recentSides.push(Math.sign(side));if(recentSides.length>6)recentSides.shift();}
    if(obstacleFamily){recentFamilies.push(obstacleFamily);if(recentFamilies.length>6)recentFamilies.shift();}
    const normalizedThreat=Number.isFinite(threatCost)
      ?clamp(threatCost/31,0,1)
      :clamp(Number(pressure)||0,0,1);
    recentPressure.push(normalizedThreat);
    if(recentPressure.length>6)recentPressure.shift();
  }

  function reset(){
    recentPhases=[];
    recentPatterns=[];
    recentSections=[];
    recentSides=[];
    recentFamilies=[];
    recentPressure=[];
    sectionsSinceRamp=3;
    sectionsSinceRecovery=0;
    lastMastery=.5;
  }

  return {
    plan,
    noteSection,
    reset,
    get recentPhases(){return [...recentPhases];},
    get recentPatterns(){return [...recentPatterns];},
    get recentSections(){return [...recentSections];},
    get recentSides(){return [...recentSides];},
    get recentFamilies(){return [...recentFamilies];},
    get mastery(){return lastMastery;}
  };
}
