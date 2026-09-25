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
    // SKI: quick edge set, fast reversal and precise slalom corrections.
    edgeResponseScale:1.14,
    reversalResponseScale:1.22,
    turnRateScale:1.04,
    lateralScale:.985,
    lateralResponseScale:1.16,
    landingReengageScale:.88,
    edgeTransferSeconds:.060,
    edgeHoldScale:.98,
    skidResistance:1.08,
    brakeDeceleration:11.2,
    brakeSteeringScale:.93,
    tuckSteeringScale:.78,
    tuckTargetBonus:1.15,
    snowDisplacementScale:.92,
    trickStyleScale:.96
  }),
  [RIDE_MODE.SNOWBOARD]:Object.freeze({
    mode:RIDE_MODE.SNOWBOARD,
    label:'SNOWBOARD',
    baseSpeed:SKI_TUNING.BASE_SPEED,
    tierSeconds:SKI_TUNING.SPEED_TIER_SECONDS,
    tierIncrement:SKI_TUNING.SPEED_TIER_INCREMENT,
    maxSpeed:SKI_TUNING.MAX_SPEED,
    // SNOWBOARD: wider committed arcs, stronger edge hold and more momentum.
    edgeResponseScale:.88,
    reversalResponseScale:.76,
    turnRateScale:1.08,
    lateralScale:1.095,
    lateralResponseScale:.84,
    landingReengageScale:1.12,
    edgeTransferSeconds:.115,
    edgeHoldScale:1.10,
    skidResistance:1.15,
    brakeDeceleration:9.5,
    brakeSteeringScale:.86,
    tuckSteeringScale:.73,
    tuckTargetBonus:1.35,
    snowDisplacementScale:1.18,
    trickStyleScale:1.08
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
