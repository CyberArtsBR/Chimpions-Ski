import {SKI_TUNING as T} from './gameplayTuning.js';

const SCORABLE_HAZARDS=new Set(['tree','rock','log','wideLog','oil']);
const HAZARD_RISK_SCALE=Object.freeze({
  tree:1.05,
  rock:1.10,
  log:1.12,
  wideLog:1.22,
  oil:.90
});
const NEAR_BAND_SCALE=Object.freeze({
  tree:1,
  rock:.92,
  log:1.02,
  wideLog:1.08,
  oil:.82
});
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function resetAirborneScoring(state){
  state.score=0;
  state.combo=0;
  state.comboMultiplier=1;
  state.bestCombo=0;
  state.nearMisses=0;
  state.riskBananas=0;
  state.lastClearTime=-Infinity;
  state.lastClearPoints=0;
  state.clearEventId=0;
  state.clearEvent=null;
  state.lastNearMissTime=-Infinity;
  state.lastNearMissSide=0;
}

export function resetHazardScoring(item){
  if(item?.userData){
    item.userData.clearScored=false;
    item.userData.nearMissScored=false;
  }
}

export function breakSkillCombo(state){
  state.combo=0;
  state.comboMultiplier=1;
  state.lastClearTime=-Infinity;
  state.lastNearMissTime=-Infinity;
  state.lastNearMissSide=0;
}

export function updateAirborneScoring(state){
  if((state.combo||0)>0&&state.time-(state.lastClearTime??-Infinity)>T.CLEAR_COMBO_WINDOW){
    state.combo=0;
    state.comboMultiplier=1;
  }
}

export function canScoreAirborneHazard(kind){
  return SCORABLE_HAZARDS.has(kind);
}

export function scoreSkillEvent(state,{
  kind='skill',
  basePoints=T.CLEAR_SCORE_BASE,
  intensity=0,
  label='',
  bonusScale=1,
  details=null
}={}){
  const chained=state.time-(state.lastClearTime??-Infinity)<=T.CLEAR_COMBO_WINDOW;
  state.combo=chained?Math.max(1,(state.combo||0)+1):1;
  state.comboMultiplier=Math.min(
    T.CLEAR_COMBO_MAX_MULTIPLIER,
    1+(state.combo-1)*T.CLEAR_COMBO_STEP
  );
  state.bestCombo=Math.max(state.bestCombo||0,state.combo);
  if(kind==='near-miss'||kind==='thread')state.nearMisses=(state.nearMisses||0)+1;
  if(kind==='risk-banana')state.riskBananas=(state.riskBananas||0)+1;

  const safeIntensity=clamp(Number(intensity)||0,0,1);
  const riskScale=1+safeIntensity*.28;
  const points=Math.max(1,Math.round(
    Math.max(0,Number(basePoints)||0)*
    state.comboMultiplier*
    riskScale*
    Math.max(.1,Number(bonusScale)||1)
  ));
  state.score=(state.score||0)+points;
  state.lastClearTime=state.time;
  state.lastClearPoints=points;
  state.clearEventId=(state.clearEventId||0)+1;
  state.clearEvent={
    id:state.clearEventId,
    kind,
    label,
    points,
    combo:state.combo,
    multiplier:state.comboMultiplier,
    intensity:safeIntensity,
    time:state.time,
    ...(details&&typeof details==='object'?details:null)
  };
  return state.clearEvent;
}

export function tryScoreAirborneClearance(state,item,{
  previousZ,
  playerZ,
  itemGround,
  radiusX,
  requiredClearance
}){
  if(!state.air||item.userData.clearScored||!canScoreAirborneHazard(item.userData.kind))return null;
  if(!(previousZ<playerZ&&item.position.z>=playerZ))return null;

  const dx=Math.abs(item.position.x-state.x);
  const overlapLimit=Math.max(.1,Number(radiusX)||0)+.30;
  if(dx>overlapLimit)return null;

  const clearance=state.y-(.12+itemGround);
  const required=Math.max(0,Number(requiredClearance)||0);
  if(clearance<=required)return null;

  const speed01=clamp(
    ((state.speed||T.BASE_SPEED)-T.BASE_SPEED)/Math.max(.001,T.MAX_SPEED-T.BASE_SPEED),
    0,1
  );
  const horizontalRisk=clamp(1-dx/overlapLimit,0,1);
  const excessClearance=clearance-required;
  // Barely clearing the obstacle is riskier than sailing meters above it.
  const verticalRisk=clamp(1-excessClearance/2.25,0,1);
  const intensity=clamp(speed01*.38+horizontalRisk*.30+verticalRisk*.32,0,1);
  const hazardScale=HAZARD_RISK_SCALE[item.userData.kind]||1;

  item.userData.clearScored=true;
  return scoreSkillEvent(state,{
    kind:item.userData.kind,
    basePoints:Math.round(T.CLEAR_SCORE_BASE*hazardScale),
    intensity,
    label:'AIR CLEAR',
    details:{
      clearance:Number(clearance.toFixed(3)),
      requiredClearance:Number(required.toFixed(3)),
      hazardType:item.userData.kind,
      speed:state.speed||0
    }
  });
}

export function tryScoreNearMiss(state,item,{
  previousZ,
  playerZ,
  radiusX,
  paddingX=T.COURSE_COLLISION_PADDING_X
}={}){
  if(state.air||item?.userData?.nearMissScored||!canScoreAirborneHazard(item?.userData?.kind))return null;
  if(!(previousZ<playerZ&&item.position.z>=playerZ))return null;

  const dx=Math.abs(item.position.x-state.x);
  const collisionHalfWidth=Math.max(0,Number(radiusX)||0)+Math.max(0,Number(paddingX)||0);
  const nearBand=1.18*(NEAR_BAND_SCALE[item.userData.kind]||1);
  const clearance=dx-collisionHalfWidth;
  if(clearance<=.08||clearance>nearBand)return null;

  const side=Math.sign(state.x-item.position.x)||1;
  const lateralTowardObstacle=(state.vx||0)*side<0;
  const lateralSpeed01=clamp(Math.abs(state.vx||0)/Math.max(4,(state.speed||T.BASE_SPEED)*.25),0,1);
  const speed01=clamp(
    ((state.speed||T.BASE_SPEED)-T.BASE_SPEED)/Math.max(.001,T.MAX_SPEED-T.BASE_SPEED),
    0,1
  );
  const proximity=clamp(1-(clearance-.08)/(nearBand-.08),0,1);
  const intensity=clamp(
    proximity*.62+
    speed01*.24+
    lateralSpeed01*(lateralTowardObstacle?.14:.06),
    0,1
  );

  item.userData.nearMissScored=true;
  const threaded=
    state.time-(state.lastNearMissTime??-Infinity)<=.95&&
    state.lastNearMissSide&&
    state.lastNearMissSide!==side;
  state.lastNearMissTime=state.time;
  state.lastNearMissSide=side;

  return scoreSkillEvent(state,{
    kind:threaded?'thread':'near-miss',
    basePoints:threaded?135:70,
    intensity,
    bonusScale:HAZARD_RISK_SCALE[item.userData.kind]||1,
    label:threaded?'THREAD':'NEAR MISS',
    details:{
      clearance:Number(clearance.toFixed(3)),
      hazardType:item.userData.kind,
      towardObstacle:lateralTowardObstacle,
      speed:state.speed||0
    }
  });
}

export function scoreRiskBanana(state,item){
  const tier=clamp(Math.round(Number(item?.userData?.riskReward)||0),0,3);
  if(tier<=0)return null;
  const authoredPoints=Math.max(0,Number(item?.userData?.rewardPoints)||0);
  return scoreSkillEvent(state,{
    kind:'risk-banana',
    basePoints:authoredPoints||45+tier*35,
    intensity:tier/3,
    label:tier>=3?'EXPERT BANANA':tier===2?'RISK BANANA':'BONUS BANANA'
  });
}
