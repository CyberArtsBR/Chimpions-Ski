import {SKI_TUNING as T} from './gameplayTuning.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function estimateRampFlightEnvelope(speed=T.BASE_SPEED){
  const safeSpeed=clamp(Number(speed)||T.BASE_SPEED,T.BASE_SPEED*.9,T.MAX_SPEED);
  const rampVy=T.RAMP_JUMP_BASE_VELOCITY+safeSpeed*T.RAMP_JUMP_SPEED_FACTOR;
  const flightTime=(2*rampVy)/T.GRAVITY;
  const landingDistance=safeSpeed*flightTime;

  // Margin grows modestly with speed so a procedural row cannot sit on the touchdown seam.
  const safetyMargin=clamp(10+safeSpeed*.16,15,20);
  const touchdownHalfWindow=clamp(7+safeSpeed*.075,9.5,12);
  const protectedStartDistance=Math.max(0,landingDistance-touchdownHalfWindow);
  const protectedEndDistance=landingDistance+touchdownHalfWindow+safetyMargin*.35;
  const flightEndDistance=landingDistance+safetyMargin;

  return {
    speed:safeSpeed,
    rampVy,
    flightTime,
    landingDistance,
    safetyMargin,
    touchdownHalfWindow,
    protectedStartDistance,
    protectedEndDistance,
    flightEndDistance,
    corridorHalfWidth:T.LANDING_CORRIDOR_HALF_WIDTH
  };
}
