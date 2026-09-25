import {SKI_TUNING as T} from './gameplayTuning.js';
import {breakSkillCombo,scoreSkillEvent} from './airborneScoring.js';

export const TRICK_POINTS=Object.freeze({
  '360':200,
  BACKFLIP:400
});

const REPETITION_SCALE=Object.freeze([1,.65,.45,.34,.28]);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

function publish(state,{phase,type='',points=0,success=null,label='',source='',details=null}={}){
  state.trickEventId=(state.trickEventId||0)+1;
  state.trickEvent={
    id:state.trickEventId,
    phase,
    type,
    points,
    success,
    label,
    source,
    time:state.time||0,
    ...(details&&typeof details==='object'?details:null)
  };
  return state.trickEvent;
}

function trickLabel(type){
  return type==='BACKFLIP'?'BACKFLIP!':type==='360'?'360!':String(type||'TRICK');
}

function repetitionFactor(state,type){
  const same=state.lastScoredTrickType===type;
  const recent=(state.time||0)-(state.lastScoredTrickTime??-Infinity)<=8;
  state.trickRepeatCount=same&&recent?Math.min(8,(state.trickRepeatCount||0)+1):0;
  state.lastScoredTrickType=type;
  state.lastScoredTrickTime=state.time||0;
  return REPETITION_SCALE[Math.min(REPETITION_SCALE.length-1,state.trickRepeatCount)];
}

export function resetTrickScoring(state){
  state.trickEventId=0;
  state.trickEvent=null;
  state.trickType='';
  state.trickPoints=0;
  state.trickSuccess=null;
  state.failedTrick=false;
  state.trickCrash=false;
  state.tricksLanded=0;
  state.tricksFailed=0;
  state.largestTrickScore=0;
  state.lastScoredTrickType='';
  state.lastScoredTrickTime=-Infinity;
  state.trickRepeatCount=0;
  state.airTrickPointsEarned=0;
}

export function announceTrickStart(state,type,source=''){
  state.trickType=type||'';
  state.trickPoints=0;
  state.trickSuccess=null;
  state.failedTrick=false;
  return publish(state,{phase:'start',type,success:null,label:'AIR TIME',source});
}

export function scoreTrickCompletion(state,{type='',source=''}={}){
  const basePoints=TRICK_POINTS[type]||0;
  const repeatScale=repetitionFactor(state,type);
  const speed01=clamp(
    ((state.speed||T.BASE_SPEED)-T.BASE_SPEED)/Math.max(.001,T.MAX_SPEED-T.BASE_SPEED),
    0,1
  );
  const riskIntensity=clamp(speed01*.34+(source==='ramp'?.12:0),0,.46);
  const skillEvent=basePoints?scoreSkillEvent(state,{
    kind:'trick',
    basePoints,
    intensity:riskIntensity,
    bonusScale:repeatScale,
    label:trickLabel(type),
    details:{trickType:type,source,repetitionScale:repeatScale}
  }):null;
  const points=skillEvent?.points||0;

  state.tricksLanded=(state.tricksLanded||0)+1;
  state.largestTrickScore=Math.max(state.largestTrickScore||0,points);
  state.airTrickPointsEarned=(state.airTrickPointsEarned||0)+points;
  state.trickType=type||'';
  state.trickPoints=points;
  state.trickSuccess=true;
  state.failedTrick=false;

  return publish(state,{
    phase:'complete',
    type,
    points,
    success:true,
    label:trickLabel(type),
    source,
    details:{
      basePoints,
      repetitionScale:repeatScale,
      combo:state.combo||1,
      comboMultiplier:state.comboMultiplier||1,
      riskIntensity
    }
  });
}

export function scoreTrickLandingBonus(state,{quality='clean',type='',source=''}={}){
  const pool=Math.max(0,Number(state.airTrickPointsEarned)||0);
  let ratio=0;
  if(quality==='clean')ratio=.18;
  else if(quality==='solid')ratio=.09;

  const points=pool>0&&ratio>0?Math.min(250,Math.round(pool*ratio)):0;
  if(points)state.score=(state.score||0)+points;
  state.airTrickPointsEarned=0;

  if(quality==='hard')breakSkillCombo(state);
  if(!pool)return null;
  return publish(state,{
    phase:'landing-bonus',
    type:type||state.trickType||'',
    points,
    success:quality!=='hard',
    label:quality==='clean'?'CLEAN LANDING':quality==='solid'?'SOLID LANDING':'LANDING',
    source,
    details:{quality,ratio,pool}
  });
}

export function scoreTrickFailure(state,{type='',source=''}={}){
  state.tricksFailed=(state.tricksFailed||0)+1;
  state.trickType=type||'';
  state.trickPoints=0;
  state.trickSuccess=false;
  state.failedTrick=true;
  state.airTrickPointsEarned=0;
  breakSkillCombo(state);
  return publish(state,{phase:'fail',type,points:0,success:false,label:'TRICK FAILED',source});
}

// Compatibility helper for callers that still resolve a terminal trick at landing.
export function scoreTrickLanding(state,{type='',success=false,source='',quality='clean'}={}){
  if(!success)return scoreTrickFailure(state,{type,source});
  return scoreTrickLandingBonus(state,{quality,type,source});
}
