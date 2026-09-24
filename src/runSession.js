const BASE_TRANSIENT_STATE=Object.freeze({
  distance:0,
  travel:0,
  time:0,
  bananas:0,
  maxRunSpeed:0,
  bestCombo:0,
  speedTier:0,
  speedTierTime:0,
  maxSpeedReached:false,
  postMaxHazardTime:0,
  x:0,
  vx:0,
  edge:0,
  heading:0,
  turnRate:0,
  y:.12,
  vy:0,
  air:false,
  grounded:true,
  jumping:false,
  jumpSource:'',
  jumpVelocity:0,
  jumpBufferTime:0,
  jumpBuffered:false,
  jumpInputHeld:false,
  jumpHoldTime:0,
  jumpCutApplied:false,
  jumpProfile:'',
  lastJumpProfile:'',
  coyoteTime:0,
  landingPulse:0,
  frame:0,
  rampGrace:0,
  counterSteer:false,
  airControl:false,
  landingReengageTime:0,
  oilSlipTime:0,
  difficulty:0,
  courseSection:'OPEN CARVE',
  safeRouteX:0,
  grip:.72,
  carveLoad:0,
  landingGripLoss:0,
  landingQuality:'none',
  groundPitch:0,
  groundRoll:0,
  leftGround:0,
  rightGround:0,
  centerGround:0,
  crashType:'',
  crashVelocity:null,
  crashDirection:0,
  crashTime:0
});

export function createRunState({mode='menu',rideMode,rideProfile,best=0}={}){
  if(!rideProfile)throw new Error('createRunState requires a ride profile');
  return {
    mode,
    rideMode,
    best,
    ...BASE_TRANSIENT_STATE,
    speed:rideProfile.baseSpeed,
    maxRunSpeed:rideProfile.baseSpeed,
    baseSpeed:rideProfile.baseSpeed,
    targetSpeed:rideProfile.baseSpeed,
    maxSpeed:rideProfile.maxSpeed
  };
}

export function createRunSession({state}={}){
  if(!state)throw new Error('createRunSession requires shared state');

  function reset({rideProfile}={}){
    if(!rideProfile)throw new Error('RunSession.reset requires a ride profile');
    Object.assign(state,BASE_TRANSIENT_STATE,{
      speed:rideProfile.baseSpeed,
      maxRunSpeed:rideProfile.baseSpeed,
      baseSpeed:rideProfile.baseSpeed,
      targetSpeed:rideProfile.baseSpeed,
      maxSpeed:rideProfile.maxSpeed
    });
    return state;
  }

  function snapshot(){
    return {
      distance:state.distance,
      time:state.time,
      bananas:state.bananas,
      speed:state.speed,
      maxRunSpeed:state.maxRunSpeed,
      score:state.score||0,
      combo:state.combo||0,
      airborne:!!state.air,
      crashType:state.crashType||''
    };
  }

  return {reset,snapshot};
}
