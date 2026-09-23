import {SKI_TUNING} from './gameplayTuning.js';

export const RIDE_MODE=Object.freeze({
  SKI:'ski',
  SNOWBOARD:'snowboard'
});

const KMH_TO_MPS=1/3.6;
const PROFILES=Object.freeze({
  [RIDE_MODE.SKI]:Object.freeze({
    mode:RIDE_MODE.SKI,
    label:'SKI',
    baseSpeed:SKI_TUNING.BASE_SPEED,
    tierSeconds:SKI_TUNING.SPEED_TIER_SECONDS,
    tierIncrement:SKI_TUNING.SPEED_TIER_INCREMENT,
    maxSpeed:SKI_TUNING.MAX_SPEED
  }),
  [RIDE_MODE.SNOWBOARD]:Object.freeze({
    mode:RIDE_MODE.SNOWBOARD,
    label:'SNOWBOARD',
    baseSpeed:180*KMH_TO_MPS,
    tierSeconds:30,
    tierIncrement:10*KMH_TO_MPS,
    maxSpeed:SKI_TUNING.MAX_SPEED
  })
});

export function normalizeRideMode(mode){
  return String(mode||'').toLowerCase()===RIDE_MODE.SNOWBOARD?RIDE_MODE.SNOWBOARD:RIDE_MODE.SKI;
}

export function getRideProfile(mode=RIDE_MODE.SKI){
  return PROFILES[normalizeRideMode(mode)];
}

export function getRideSpeedProgress(mode,speed){
  const profile=getRideProfile(mode);
  const range=Math.max(.001,profile.maxSpeed-profile.baseSpeed);
  return Math.max(0,Math.min(1,(Number(speed)-profile.baseSpeed)/range));
}

export function getRideSpeedFeel(mode,speed){
  return .62+getRideSpeedProgress(mode,speed)*.38;
}

export function speedToKmh(speed){
  return Math.round((Number(speed)||0)*3.6);
}
