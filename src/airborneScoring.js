import {SKI_TUNING as T} from './gameplayTuning.js';

const SCORABLE_HAZARDS=new Set(['tree','rock','log','wideLog','oil']);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function resetAirborneScoring(state){
  state.score=0;
  state.combo=0;
  state.comboMultiplier=1;
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
  bonusScale=1
}={}){
  const chained=state.time-(state.lastClearTime??-Infinity)<=T.CLEAR_COMBO_WINDOW;
  state.combo=chained?Math.max(1,(state.combo||0)+1):1;
  state.comboMultiplier=Math.min(
    T.CLEAR_COMBO_MAX_MULTIPLIER,
    1+(state.combo-1)*T.CLEAR_COMBO_STEP
  );

  const riskScale=1+clamp(Number(intensity)||0,0,1)*.28;
  const points=Math.max(1,Math.round(
    Math.max(0,Number(basePoints)||0)*state.comboMultiplier*riskScale*Math.max(.5,Number(bonusScale)||1)
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
    intensity:clamp(Number(intensity)||0,0,1),
    time:state.time
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
  if(dx>radiusX+.30)return null;

  const clearance=state.y-(.12+itemGround);
  if(clearance<=requiredClearance)return null;

  item.userData.clearScored=true;
  return scoreSkillEvent(state,{
    kind:item.userData.kind,
    basePoints:T.CLEAR_SCORE_BASE,
    label:'AIR CLEAR'
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
  const nearBand=1.18;
  const clearance=dx-collisionHalfWidth;
  if(clearance<=.10||clearance>nearBand)return null;

  item.userData.nearMissScored=true;
  const intensity=clamp(1-(clearance-.10)/(nearBand-.10),0,1);
  const side=Math.sign(state.x-item.position.x)||1;
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
    label:threaded?'THREAD':'NEAR MISS'
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
