import {SKI_TUNING} from './gameplayTuning.js';

export const RIDE_MODE=Object.freeze({
  SKI:'ski',
  SNOWBOARD:'snowboard'
});

const PROFILES=Object.freeze({
  [RIDE_MODE.SKI]:Object.freeze({
    mode:RIDE_MODE.SKI,
    label:'SKI',
    baseSpeed:SKI_TUNING.BASE_SPEED,
    tierSeconds:SKI_TUNING.SPEED_TIER_SECONDS,
    tierIncrement:SKI_TUNING.SPEED_TIER_INCREMENT,
    maxSpeed:SKI_TUNING.MAX_SPEED,
    edgeResponseScale:1.05,
    reversalResponseScale:1.08,
    turnRateScale:.99,
    lateralScale:.98,
    lateralResponseScale:1.06,
    landingReengageScale:.92
  }),
  [RIDE_MODE.SNOWBOARD]:Object.freeze({
    mode:RIDE_MODE.SNOWBOARD,
    label:'SNOWBOARD',
    baseSpeed:SKI_TUNING.BASE_SPEED,
    tierSeconds:SKI_TUNING.SPEED_TIER_SECONDS,
    tierIncrement:SKI_TUNING.SPEED_TIER_INCREMENT,
    maxSpeed:SKI_TUNING.MAX_SPEED,
    edgeResponseScale:.95,
    reversalResponseScale:.90,
    turnRateScale:1.05,
    lateralScale:1.05,
    lateralResponseScale:.93,
    landingReengageScale:1.07
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
