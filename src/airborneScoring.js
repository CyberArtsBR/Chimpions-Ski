import {SKI_TUNING as T} from './gameplayTuning.js';

const SCORABLE_HAZARDS=new Set(['tree','rock','log','wideLog','oil']);

export function resetAirborneScoring(state){
  state.score=0;
  state.combo=0;
  state.comboMultiplier=1;
  state.lastClearTime=-Infinity;
  state.lastClearPoints=0;
  state.clearEventId=0;
  state.clearEvent=null;
}

export function resetHazardScoring(item){
  if(item?.userData)item.userData.clearScored=false;
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
  const chained=state.time-(state.lastClearTime??-Infinity)<=T.CLEAR_COMBO_WINDOW;
  state.combo=chained?Math.max(1,(state.combo||0)+1):1;
  state.comboMultiplier=Math.min(
    T.CLEAR_COMBO_MAX_MULTIPLIER,
    1+(state.combo-1)*T.CLEAR_COMBO_STEP
  );

  const points=Math.round(T.CLEAR_SCORE_BASE*state.comboMultiplier);
  state.score=(state.score||0)+points;
  state.lastClearTime=state.time;
  state.lastClearPoints=points;
  state.clearEventId=(state.clearEventId||0)+1;
  state.clearEvent={
    id:state.clearEventId,
    kind:item.userData.kind,
    points,
    combo:state.combo,
    multiplier:state.comboMultiplier,
    time:state.time
  };
  return state.clearEvent;
}
