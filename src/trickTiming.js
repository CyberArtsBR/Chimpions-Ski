import {SKI_TUNING} from './gameplayTuning.js';

export const TRICK_LANDING_SAFETY_MARGIN=.11;

export const TRICK_TIMING=Object.freeze({
  '360':Object.freeze({degreesPerSecond:760,duration:360/760}),
  BACKFLIP:Object.freeze({degreesPerSecond:800,duration:360/800})
});

export function getTrickDuration(type){
  return TRICK_TIMING[type]?.duration??Infinity;
}

export function estimateRemainingAirTime(
  physicsState,
  {landingHeight=0,gravity=SKI_TUNING.GRAVITY}={}
){
  if(!physicsState?.air)return 0;
  const y=Number(physicsState.y);
  const vy=Number(physicsState.vy);
  const target=Number(landingHeight);
  const g=Number(gravity);
  if(!Number.isFinite(y)||!Number.isFinite(vy)||!Number.isFinite(target)||!Number.isFinite(g)||g<=0)return 0;

  // Solve: (y-target) + vy*t - 0.5*g*t^2 = 0.
  // The positive root works during both ascent and descent.
  const height=y-target;
  const discriminant=vy*vy+2*g*height;
  if(discriminant<0)return 0;
  const time=(vy+Math.sqrt(Math.max(0,discriminant)))/g;
  return Number.isFinite(time)&&time>0?time:0;
}

export function evaluateTrickTiming(
  type,
  physicsState,
  {
    landingHeight=0,
    gravity=SKI_TUNING.GRAVITY,
    landingSafetyMargin=TRICK_LANDING_SAFETY_MARGIN
  }={}
){
  const remainingAirTime=estimateRemainingAirTime(physicsState,{landingHeight,gravity});
  const trickDuration=getTrickDuration(type);
  const safetyMargin=Math.max(0,Number(landingSafetyMargin)||0);
  const requiredAirTime=trickDuration+safetyMargin;
  const allowed=!!physicsState?.air
    &&Number.isFinite(trickDuration)
    &&remainingAirTime+1e-6>=requiredAirTime;
  return {type,allowed,remainingAirTime,trickDuration,safetyMargin,requiredAirTime};
}
