import {getSpeedProgress,SKI_TUNING as T} from './gameplayTuning.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

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

export function createExpertRunDirector({random=Math.random}={}){
  let recentPhases=[];
  let recentPatterns=[];
  let recentSections=[];
  let recentSides=[];
  let recentFamilies=[];
  let recentPressure=[];
  let sectionsSinceRamp=3;
  let sectionsSinceRecovery=0;

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

  function choosePhase({difficulty=0,speed=T.BASE_SPEED,postMaxTime=0,lastType='RECOVERY',pendingLanding=false}={}){
    if(lastType==='RAMP'||lastType==='LOG JUMP'||pendingLanding)return 'RECOVERY';

    const speed01=getSpeedProgress(speed);
    const post01=clamp((Number(postMaxTime)||0)/Math.max(1,T.POST_MAX_HAZARD_RAMP_SECONDS),0,1);
    const mastery=clamp(difficulty*.42+speed01*.38+post01*.34,0,1.12);
    const fatigue=pressureAverage();

    const weights=[
      1.28-mastery*.54,
      .72+mastery*.90,
      .50+mastery*1.02,
      .48+mastery*.84,
      sectionsSinceRamp>2?.42+mastery*.58:.16,
      .12+Math.max(0,mastery-.42)*1.34+post01*.68,
      (sectionsSinceRecovery>=4||fatigue>.74)?.48+fatigue*.92:.08
    ];

    if(sectionsSinceRecovery<=1)weights[6]*=.15;
    if(recentPhases.at(-1)==='PRESSURE'||recentPhases.at(-1)==='EXPERT')weights[6]*=1.5;
    if(post01>.45){
      weights[1]*=1.18;
      weights[2]*=1.18;
      weights[3]*=1.22;
      weights[5]*=1.42;
      weights[0]*=.68;
      // At sustained 300 km/h the course should remain readable but genuinely
      // dense. Too many TRICK -> forced RECOVERY pairs were cancelling the
      // intended post-max hazard escalation.
      weights[4]*=.58;
      weights[6]*=.48;
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
    sectionIndex=0
  }={}){
    const phase=choosePhase({difficulty,speed,postMaxTime,lastType,pendingLanding});
    const speed01=getSpeedProgress(speed);
    const post01=clamp((Number(postMaxTime)||0)/Math.max(1,T.POST_MAX_HAZARD_RAMP_SECONDS),0,1);
    const time01=clamp((Number(runTime)||0)/300,0,1);
    const phasePressure={FLOW:.14,TECHNICAL:.44,PRESSURE:.66,RISK_REWARD:.52,TRICK:.46,EXPERT:.82,RECOVERY:.04}[phase]??.3;
    const intensity=clamp(
      .18+difficulty*.32+speed01*.20+post01*.18+time01*.08+phasePressure*.34,
      .16,
      1
    );

    const pattern=phase==='RECOVERY'?null:choosePattern(phase);
    const side=chooseSide();
    const preferredSections=[...(SECTION_FAMILIES[phase]||SECTION_FAMILIES.FLOW)];
    const sequenceLength=Math.max(2,Math.min(5,2+Math.floor(intensity*3)));
    const corridorHalfWidth=clamp(3.15-intensity*.92,2.05,3.05);
    const routeShift=clamp(4.3+intensity*3.9,4.3,8.2);

    return {
      phase,
      pattern,
      side,
      intensity,
      preferredSections,
      sequenceLength,
      corridorHalfWidth,
      routeShift,
      speed01,
      postMaxPressure:post01,
      expertPressure:clamp(intensity*.72+post01*.28,0,1),
      sectionIndex
    };
  }

  function noteSection({phase,pattern,sectionType,side=0,pressure=0,obstacleFamily=''}={}){
    if(phase){recentPhases.push(phase);if(recentPhases.length>5)recentPhases.shift();}
    if(pattern){recentPatterns.push(pattern);if(recentPatterns.length>6)recentPatterns.shift();}
    if(sectionType){
      recentSections.push(sectionType);
      if(recentSections.length>6)recentSections.shift();
      if(sectionType==='RAMP'||sectionType==='LOG JUMP')sectionsSinceRamp=0;
      else sectionsSinceRamp++;
      if(sectionType==='RECOVERY')sectionsSinceRecovery=0;
      else sectionsSinceRecovery++;
    }
    if(side){recentSides.push(Math.sign(side));if(recentSides.length>5)recentSides.shift();}
    if(obstacleFamily){recentFamilies.push(obstacleFamily);if(recentFamilies.length>5)recentFamilies.shift();}
    recentPressure.push(clamp(Number(pressure)||0,0,1));
    if(recentPressure.length>5)recentPressure.shift();
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
  }

  return {
    plan,
    noteSection,
    reset,
    get recentPhases(){return [...recentPhases];},
    get recentPatterns(){return [...recentPatterns];},
    get recentSections(){return [...recentSections];},
    get recentSides(){return [...recentSides];},
    get recentFamilies(){return [...recentFamilies];}
  };
}
