import * as THREE from 'three';
import {SKI_TUNING as T} from './gameplayTuning.js';
import {getRideProfile} from './rideMode.js';
import {resolveCourseEdgeContact} from './edgeContact.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

const SKI_PROFILE_CONTRACT=getRideProfile('ski');
if(
  SKI_PROFILE_CONTRACT.baseSpeed!==T.BASE_SPEED||
  SKI_PROFILE_CONTRACT.maxSpeed!==T.MAX_SPEED||
  SKI_PROFILE_CONTRACT.tierIncrement!==T.SPEED_TIER_INCREMENT
){
  throw new Error('SKI ride profile drifted from gameplay tuning');
}

function readRideControls(input){
  if(typeof input==='number')return {steer:clamp(input,-1,1),tuck:false,brake:false};
  return {
    steer:clamp(Number(input?.steer)||0,-1,1),
    tuck:!!input?.tuck,
    brake:!!input?.brake
  };
}

function updateStance(state,controls,dt,profile){
  const brakeTarget=!state.air&&controls.brake?1:0;
  const tuckTarget=controls.tuck&&!controls.brake?(state.air?.35:1):0;
  state.tuckAmount=THREE.MathUtils.damp(
    state.tuckAmount||0,
    tuckTarget,
    tuckTarget>TUCK_SAFE(state.tuckAmount)?T.TUCK_RESPONSE:T.TUCK_RELEASE_RESPONSE,
    dt
  );
  state.brakeAmount=THREE.MathUtils.damp(
    state.brakeAmount||0,
    brakeTarget,
    brakeTarget>(state.brakeAmount||0)?T.BRAKE_RESPONSE:T.BRAKE_RELEASE_RESPONSE,
    dt
  );
  state.aeroEfficiency=clamp(1+(state.tuckAmount||0)*.08-(state.brakeAmount||0)*.34,.62,1.08);
  state.brakeDeceleration=(state.brakeAmount||0)*profile.brakeDeceleration;
}

function TUCK_SAFE(value){
  return Number(value)||0;
}

export function progressSpeed(state,dt,input){
  const controls=readRideControls(input);
  const profile=getRideProfile(state.rideMode);
  updateStance(state,controls,dt,profile);

  const tier=Math.max(0,Math.floor((state.time||0)/profile.tierSeconds));
  const tierTime=(state.time||0)-tier*profile.tierSeconds;
  const targetSpeed=Math.min(profile.maxSpeed,profile.baseSpeed+tier*profile.tierIncrement);
  const tuckBonus=(state.tuckAmount||0)*profile.tuckTargetBonus;
  let effectiveTargetSpeed=Math.min(profile.maxSpeed,targetSpeed+tuckBonus);

  state.speedTier=tier;
  state.speedTierTime=tierTime;
  state.targetSpeed=targetSpeed;
  state.effectiveTargetSpeed=effectiveTargetSpeed;
  state.baseSpeed=profile.baseSpeed;
  state.maxSpeed=profile.maxSpeed;

  const tuck=(state.tuckAmount||0);
  const brake=(state.brakeAmount||0);
  const carveDrag=(state.carveLoad||0)*.09*(1-tuck*T.TUCK_CARVE_DRAG_REDUCTION);
  const landingDrag=(state.landingGripLoss||0)*.18;
  if(brake>.02)effectiveTargetSpeed=Math.min(effectiveTargetSpeed,state.speed);

  const response=T.SPEED_RESPONSE*(1+tuck*T.TUCK_SPEED_RESPONSE_BONUS)*
    THREE.MathUtils.lerp(1,T.BRAKE_SPEED_RESPONSE_SCALE,brake);
  state.speed=THREE.MathUtils.damp(state.speed,effectiveTargetSpeed,response,dt);

  const speed01=clamp((state.speed-profile.baseSpeed)/(profile.maxSpeed-profile.baseSpeed),0,1);
  const brakeLoss=profile.brakeDeceleration*brake*(.62+speed01*.38);
  const minimumSpeed=brake>.01?profile.baseSpeed*T.BRAKE_MIN_SPEED_SCALE:profile.baseSpeed*.90;
  state.speed=clamp(
    state.speed-(carveDrag+landingDrag+brakeLoss)*dt,
    minimumSpeed,
    profile.maxSpeed
  );

  const retentionTarget=clamp(state.speed/Math.max(profile.baseSpeed,effectiveTargetSpeed),0,1);
  state.speedRetention=THREE.MathUtils.damp(state.speedRetention??1,retentionTarget,5.5,dt);
  return clamp((state.speed-profile.baseSpeed)/(profile.maxSpeed-profile.baseSpeed),0,1);
}

function beginEdgeTransfer(state,steer,rideProfile){
  const desired=Math.sign(steer);
  const current=Math.sign(state.edge);
  if(
    desired&&current&&desired!==current&&
    (!state.edgeTransferDirection||state.edgeTransferDirection!==desired)
  ){
    state.edgeTransferDirection=desired;
    state.edgeTransferTime=rideProfile.edgeTransferSeconds;
    state.edgeTransitionPhase='release';
  }
}

function resolveEdgeTransfer(state,steer,rideProfile,dt){
  beginEdgeTransfer(state,steer,rideProfile);
  const direction=state.edgeTransferDirection||0;
  if(!direction){
    state.edgeTransition=THREE.MathUtils.damp(state.edgeTransition||0,0,12,dt);
    state.edgeTransitionPhase=Math.abs(state.edge)>.08?'hold':'neutral';
    return steer;
  }

  if(!steer||Math.sign(steer)!==direction){
    state.edgeTransferDirection=0;
    state.edgeTransferTime=0;
    state.edgeTransitionPhase='neutral';
    return steer;
  }

  const duration=Math.max(.001,rideProfile.edgeTransferSeconds);
  state.edgeTransferTime=Math.max(0,(state.edgeTransferTime||duration)-dt);
  const progress=clamp(1-state.edgeTransferTime/duration,0,1);
  state.edgeTransition=Math.sin(progress*Math.PI);

  let target=steer;
  if(progress<.42){
    state.edgeTransitionPhase='release';
    target=0;
  }else if(progress<.62){
    state.edgeTransitionPhase='neutral';
    target=steer*.22;
  }else{
    state.edgeTransitionPhase='engage';
    target=steer*THREE.MathUtils.lerp(.42,1,(progress-.62)/.38);
  }

  if(state.edgeTransferTime<=0){
    state.edgeTransferDirection=0;
    state.edgeTransitionPhase='hold';
  }
  return target;
}

function updateCarveMetrics(state,{
  carveVelocity=0,
  targetEdge=0,
  oilSlip=0,
  brake=0,
  neutralizing=false,
  dt=0
}={}){
  const speed=Math.max(1,Math.abs(state.speed)||1);
  const velocityError=Math.abs((state.vx||0)-carveVelocity)/(Math.abs(carveVelocity)+speed*.12+.001);
  const skidTarget=clamp(
    velocityError*.56+
    oilSlip*.46+
    brake*T.BRAKE_SKID_GAIN+
    (neutralizing?.16:0),
    0,1
  );
  state.skidRatio=THREE.MathUtils.damp(state.skidRatio||0,skidTarget,T.SKID_RESPONSE,dt);

  const edgeError=Math.abs((state.edge||0)-targetEdge);
  const stabilityTarget=clamp(1-edgeError*.58-(state.skidRatio||0)*.62-oilSlip*.24,0,1);
  state.edgeStability=THREE.MathUtils.damp(
    state.edgeStability??1,
    stabilityTarget,
    T.EDGE_STABILITY_RESPONSE,
    dt
  );

  state.carveAngle=Math.atan2(state.vx||0,speed);
  state.carveDirection=Math.sign(state.edge||0);
  const cleanCarve=
    (state.carveLoad||0)>=T.CARVE_DURATION_LOAD_MIN&&
    (state.skidRatio||0)<=T.CLEAN_CARVE_SKID_MAX&&
    !neutralizing;
  state.carveDuration=cleanCarve
    ?(state.carveDuration||0)+dt
    :Math.max(0,(state.carveDuration||0)-dt*2.25);

  const turnDelta=Math.abs((state.turnRate||0)-(state.previousTurnRate||0));
  const smoothTarget=clamp(1-turnDelta*.20-(state.skidRatio||0)*.58-(neutralizing?.14:0),0,1);
  state.lineSmoothness=THREE.MathUtils.damp(
    state.lineSmoothness??1,
    smoothTarget,
    T.LINE_SMOOTHNESS_RESPONSE,
    dt
  );
  state.previousTurnRate=state.turnRate||0;
}

function stepAirControl(state,steer,neutralizing,speed01,dt,rideProfile){
  const edgeAmount=Math.abs(state.edge);
  const maxTurnRate=(T.TURN_RATE_BASE+speed01*T.TURN_RATE_SPEED_BONUS)*rideProfile.turnRateScale;
  const edgeTurn=Math.sign(state.edge)*Math.pow(edgeAmount,.94)*maxTurnRate;

  let desiredTurnRate=edgeTurn+steer*T.TURN_INPUT_ASSIST;
  if(steer===0){
    desiredTurnRate-=state.heading*(2.45+speed01*.25);
  }else if(neutralizing){
    desiredTurnRate-=state.heading*(6.5+speed01*.55);
  }else{
    desiredTurnRate-=state.heading*.10;
  }

  state.turnRate=THREE.MathUtils.damp(
    state.turnRate,
    desiredTurnRate,
    neutralizing?T.AIR_REVERSAL_RESPONSE:T.AIR_TURN_RESPONSE,
    dt
  );

  const headingLimit=THREE.MathUtils.lerp(T.HEADING_LIMIT_LOW,T.HEADING_LIMIT_HIGH,speed01);
  if(steer!==0&&state.heading*steer<0){
    state.heading=THREE.MathUtils.damp(
      state.heading,
      0,
      T.COUNTER_HEADING_RESPONSE*.78*Math.abs(steer),
      dt
    );
  }
  state.heading=clamp(state.heading+state.turnRate*dt,-headingLimit,headingLimit);

  if(steer===0){
    state.heading=THREE.MathUtils.damp(state.heading,0,T.AIR_HEADING_RECENTER,dt);
    state.turnRate=THREE.MathUtils.damp(state.turnRate,0,T.AIR_HEADING_RECENTER*1.55,dt);
  }

  const lateralScale=THREE.MathUtils.lerp(T.AIR_LATERAL_SCALE_LOW,T.AIR_LATERAL_SCALE_HIGH,speed01);
  const targetVx=Math.sin(state.heading)*state.speed*lateralScale;
  const response=neutralizing?T.AIR_LATERAL_REVERSAL_RESPONSE:T.AIR_LATERAL_RESPONSE;

  // Air reversal targets the new lateral velocity directly. It does not hard-zero vx.
  state.vx=THREE.MathUtils.damp(state.vx,targetVx,response,dt);
  state.x=clamp(state.x+state.vx*dt,-T.PLAYER_BOUNDARY_HALF_WIDTH,T.PLAYER_BOUNDARY_HALF_WIDTH);

  const edgeScrape=resolveCourseEdgeContact(state,dt,{profile:rideProfile});

  state.carveLoad=THREE.MathUtils.damp(state.carveLoad||0,0,8,dt);
  state.grip=0;
  state.airControl=true;
  state.skidRatio=THREE.MathUtils.damp(state.skidRatio||0,0,8,dt);
  state.edgeStability=THREE.MathUtils.damp(state.edgeStability??1,.72,5,dt);
  state.carveDuration=Math.max(0,(state.carveDuration||0)-dt*2.5);
  state.carveAngle=Math.atan2(state.vx||0,Math.max(1,state.speed||1));
  return edgeScrape;
}

export function stepCarving(state,input,dt,simulationDt=dt){
  const controls=readRideControls(input);
  const timerDt=Math.max(0,Number(simulationDt)||0);
  const rawSteer=Math.abs(controls.steer)<T.INPUT_DEADZONE?0:controls.steer;
  const rideProfile=getRideProfile(state.rideMode);
  const speed01=clamp((state.speed-rideProfile.baseSpeed)/(rideProfile.maxSpeed-rideProfile.baseSpeed),0,1);
  // Timers advance in simulation time. Steering response may deliberately use
  // a different control dt during Banana Power, but hazards/landing recovery do not.
  state.landingGripLoss=Math.max(0,(state.landingGripLoss||0)-timerDt*2.25);
  state.landingReengageTime=Math.max(0,(state.landingReengageTime||0)-timerDt);
  state.oilSlipTime=Math.max(0,(state.oilSlipTime||0)-timerDt);
  const oilSlip=clamp((state.oilSlipTime||0)/T.OIL_SLIP_SECONDS,0,1);
  const tuck=state.tuckAmount||0;
  const brake=state.brakeAmount||0;

  const steeringAuthority=
    (1-tuck*(1-rideProfile.tuckSteeringScale))*
    (1-brake*(1-rideProfile.brakeSteeringScale));
  const steer=rawSteer*steeringAuthority;
  const transferTarget=resolveEdgeTransfer(state,steer,rideProfile,dt);
  const reversing=steer!==0&&state.edge*steer<-.01;
  const neutralizing=
    (state.edgeTransferDirection||0)!==0||
    (reversing&&Math.abs(state.edge)>.018);
  const targetEdge=transferTarget;
  const edgeResponse=neutralizing?T.EDGE_REVERSAL:steer===0?T.EDGE_RELEASE:T.EDGE_RESPONSE;
  const responseScale=neutralizing?rideProfile.reversalResponseScale:rideProfile.edgeResponseScale;
  const effectiveEdgeResponse=edgeResponse*responseScale*(1-oilSlip*(1-T.OIL_CONTROL_SCALE));
  state.edge=THREE.MathUtils.damp(state.edge,targetEdge,effectiveEdgeResponse,dt);

  if(state.air){
    const edgeScrape=stepAirControl(state,steer,neutralizing,speed01,dt,rideProfile);
    state.counterSteer=neutralizing;
    return edgeScrape?{edgeScrape}:null;
  }

  state.airControl=false;
  const edgeAmount=Math.abs(state.edge);
  const loadTarget=clamp(
    Math.pow(edgeAmount,1.02)*(.84+speed01*.16)*rideProfile.edgeHoldScale*(1+brake*.10),
    0,1
  );
  state.carveLoad=THREE.MathUtils.damp(state.carveLoad||0,loadTarget,T.CARVE_LOAD_RESPONSE,dt);

  const maxTurnRate=(T.TURN_RATE_BASE+speed01*T.TURN_RATE_SPEED_BONUS)*rideProfile.turnRateScale;
  const edgeTurn=Math.sign(state.edge)*Math.pow(edgeAmount,.94)*maxTurnRate;
  let desiredTurnRate=edgeTurn;
  if(steer===0){
    desiredTurnRate-=state.heading*(3.2+speed01*.35);
  }else if(neutralizing){
    desiredTurnRate-=state.heading*(8.2+speed01*.8);
  }else{
    desiredTurnRate+=steer*T.TURN_INPUT_ASSIST;
    desiredTurnRate-=state.heading*.16;
  }

  desiredTurnRate*=1-oilSlip*.38;
  desiredTurnRate*=1+brake*.08;
  state.turnRate=THREE.MathUtils.damp(
    state.turnRate,
    desiredTurnRate,
    neutralizing?T.TURN_REVERSAL_RESPONSE:T.TURN_RESPONSE,
    dt
  );

  const headingLimit=THREE.MathUtils.lerp(T.HEADING_LIMIT_LOW,T.HEADING_LIMIT_HIGH,speed01);
  if(steer!==0&&state.heading*steer<0){
    state.heading=THREE.MathUtils.damp(state.heading,0,T.COUNTER_HEADING_RESPONSE*Math.abs(steer),dt);
  }
  state.heading=clamp(state.heading+state.turnRate*dt,-headingLimit,headingLimit);
  if(steer===0){
    state.heading=THREE.MathUtils.damp(state.heading,0,T.HEADING_RECENTER+speed01*.4,dt);
    state.turnRate=THREE.MathUtils.damp(state.turnRate,0,T.TURN_RECENTER,dt);
  }

  const roughLoss=state.landingGripLoss||0;
  const normalTargetGrip=clamp(
    .80+speed01*.05+(state.carveLoad||0)*.14-roughLoss*.38-brake*T.BRAKE_GRIP_LOSS,
    .30,1
  );
  const targetGrip=THREE.MathUtils.lerp(normalTargetGrip,T.OIL_GRIP,oilSlip);
  const reengageRemaining=clamp((state.landingReengageTime||0)/T.LANDING_REENGAGE_TIME,0,1);
  const reengageBlend=1-reengageRemaining;
  state.grip=THREE.MathUtils.lerp(.42,targetGrip,reengageBlend);

  const lateralScale=THREE.MathUtils.lerp(T.LATERAL_SCALE_LOW,T.LATERAL_SCALE_HIGH,speed01)*rideProfile.lateralScale;
  let carveVelocity=Math.sin(state.heading)*state.speed*lateralScale*(1-brake*.16);
  const skidResistance=rideProfile.skidResistance*(1-brake*.20);
  const normalGripResponse=
    (T.LATERAL_RESPONSE+state.grip*1.9+(state.carveLoad||0)*1.4)*
    (1-oilSlip*.48)*skidResistance;
  let gripResponse=THREE.MathUtils.lerp(T.AIR_LATERAL_RESPONSE*.46,normalGripResponse,reengageBlend)*rideProfile.lateralResponseScale;

  if(neutralizing){
    carveVelocity*=.08;
    const reversalResponse=THREE.MathUtils.lerp(
      T.AIR_LATERAL_REVERSAL_RESPONSE*.55,
      T.LATERAL_REVERSAL_RESPONSE*rideProfile.reversalResponseScale,
      reengageBlend
    );
    gripResponse=reversalResponse;
    state.vx=THREE.MathUtils.damp(state.vx,0,reversalResponse,dt);
  }

  state.vx=THREE.MathUtils.damp(state.vx,carveVelocity,gripResponse,dt);

  if(state.carveLoad>.62&&reengageBlend>.35&&oilSlip<.35&&brake<.15){
    const plantedScrub=1-(state.carveLoad-.62)*.06*dt*reengageBlend;
    state.vx*=Math.max(.984,plantedScrub);
  }

  updateCarveMetrics(state,{carveVelocity,targetEdge,oilSlip,brake,neutralizing,dt:timerDt});

  state.x=clamp(state.x+state.vx*dt,-T.PLAYER_BOUNDARY_HALF_WIDTH,T.PLAYER_BOUNDARY_HALF_WIDTH);
  const edgeScrape=resolveCourseEdgeContact(state,dt,{profile:rideProfile});

  state.counterSteer=neutralizing;
  return edgeScrape?{edgeScrape}:null;
}

function applyMiniJumpCut(state){
  if(!state.air||state.jumpSource!=='manual'||state.jumpCutApplied)return false;
  const holdTime=Math.max(0,Number(state.jumpHoldTime)||0);
  state.jumpCutApplied=true;
  if(holdTime>T.MINI_JUMP_TAP_SECONDS)return false;

  if(state.vy>0){
    state.vy=Math.min(state.vy,T.MINI_JUMP_RELEASE_VELOCITY);
    state.jumpVelocity=state.vy;
  }
  state.jumpProfile='mini';
  return true;
}

export function updateJumpAssist(state,jumpPressed,dt,jumpHeld=jumpPressed){
  state.jumpBufferTime=Math.max(0,(state.jumpBufferTime||0)-dt);
  state.coyoteTime=Math.max(0,(state.coyoteTime||0)-dt);

  const held=!!jumpHeld;
  const wasHeld=!!state.jumpInputHeld;
  if(state.grounded&&!state.air)state.coyoteTime=.075;
  if(jumpPressed)state.jumpBufferTime=.11;

  if(state.air&&state.jumpSource==='manual'){
    if(held){
      state.jumpHoldTime=(state.jumpHoldTime||0)+dt;
      if(state.jumpHoldTime>T.MINI_JUMP_TAP_SECONDS)state.jumpProfile='full';
    }
    if(wasHeld&&!held)applyMiniJumpCut(state);
  }else if(!state.air){
    state.jumpHoldTime=0;
    state.jumpCutApplied=false;
    state.jumpProfile='';
  }

  state.jumpInputHeld=held;
  state.jumpBuffered=state.jumpBufferTime>0;
  state.grounded=!state.air;
  state.jumpVelocity=state.air?state.vy:0;
}

export function tryManualJump(state,groundY){
  if((state.jumpBufferTime||0)<=0)return false;
  if(state.air&&(state.coyoteTime||0)<=0)return false;
  if(!state.grounded&&(state.coyoteTime||0)<=0)return false;

  state.air=true;
  state.grounded=false;
  state.jumping=true;
  state.jumpSource='manual';
  state.jumpProfile='full';
  state.jumpHoldTime=0;
  state.jumpCutApplied=false;
  state.vy=T.MANUAL_JUMP_VELOCITY;
  state.jumpVelocity=state.vy;
  state.y=Math.max(state.y,groundY+.045);
  state.jumpBufferTime=0;
  state.jumpBuffered=false;
  state.coyoteTime=0;
  state.landingQuality='air';
  state.landingReengageTime=0;
  state.landingPreparation=0;

  // A press+release can occur between two render samples. Treat that as the
  // shortest valid tap rather than silently promoting it to a full jump.
  if(!state.jumpInputHeld)applyMiniJumpCut(state);
  return true;
}

function landingGradeForImpact(impact,rampLanding){
  const clean=rampLanding?T.RAMP_LANDING_CLEAN_MAX:T.MANUAL_LANDING_CLEAN_MAX;
  const solid=rampLanding?T.RAMP_LANDING_SOLID_MAX:T.MANUAL_LANDING_SOLID_MAX;
  const rough=rampLanding?T.RAMP_LANDING_ROUGH_MAX:T.MANUAL_LANDING_ROUGH_MAX;
  if(impact<clean)return 'clean';
  if(impact<solid)return 'solid';
  if(impact<rough)return 'rough';
  return 'hard';
}

function degradeLandingQuality(quality){
  if(quality==='clean')return 'solid';
  if(quality==='solid')return 'rough';
  if(quality==='rough')return 'hard';
  return quality;
}

export function stepAir(state,dt,groundY){
  if(!state.air){
    state.grounded=true;
    state.jumping=false;
    state.jumpVelocity=0;
    state.landingPulse=Math.max(0,state.landingPulse-dt*4.5);
    state.y=THREE.MathUtils.damp(state.y,groundY,13,dt);
    state.landingPreparation=THREE.MathUtils.damp(state.landingPreparation||0,0,5,dt);
    return {landed:false,impact:0,quality:state.landingQuality||'none'};
  }

  state.grounded=false;
  const alignment=1-clamp(Math.abs(state.heading||0)/Math.max(.001,T.HEADING_LIMIT_LOW),0,1);
  const edgeNeutral=1-clamp(Math.abs(state.edge||0),0,1);
  const descending=clamp(-(state.vy||0)/9,0,1);
  const prepTarget=clamp((alignment*.62+edgeNeutral*.38)*(.45+descending*.55),0,1);
  state.landingPreparation=THREE.MathUtils.damp(state.landingPreparation||0,prepTarget,6.5,dt);

  state.y+=state.vy*dt-.5*T.GRAVITY*dt*dt;
  state.vy-=T.GRAVITY*dt;
  state.jumpVelocity=state.vy;
  if(state.y>groundY||state.vy>0)return {landed:false,impact:0,quality:'air'};

  const impact=Math.abs(state.vy);
  const landingProfile=state.jumpProfile||'';
  const rampLanding=state.jumpSource==='ramp';
  const miniLanding=state.jumpSource==='manual'&&landingProfile==='mini';
  let quality=landingGradeForImpact(impact,rampLanding);

  const horizontalInstability=Math.abs(state.vx||0)/Math.max(1,state.speed||1);
  const poorPreparation=(state.landingPreparation||0)<.28;
  const crossedUp=Math.abs(state.edge||0)>.90&&horizontalInstability>.20;
  if((poorPreparation&&impact>(rampLanding?11.5:5.4))||crossedUp)quality=degradeLandingQuality(quality);

  state.y=groundY;
  state.vy=0;
  state.jumpVelocity=0;
  state.air=false;
  state.grounded=true;
  state.jumping=false;
  state.jumpSource='';
  state.lastJumpProfile=landingProfile;
  state.jumpProfile='';
  state.jumpHoldTime=0;
  state.jumpCutApplied=false;
  state.landingQuality=quality;
  state.landingImpact=impact;
  state.landingPulse=Math.min(1,impact/(rampLanding?18:9));
  state.landingReengageTime=(miniLanding?T.MINI_JUMP_LANDING_REENGAGE_TIME:T.LANDING_REENGAGE_TIME)*getRideProfile(state.rideMode).landingReengageScale;
  const rideProfile=getRideProfile(state.rideMode);

  // Preserve most airborne lateral momentum. Ground grip fades back in via stepCarving().
  if(quality==='clean'){
    state.vx*=.995;
    state.turnRate*=.95;
    state.heading*=.99;
    state.speed=Math.min(rideProfile.maxSpeed,state.speed+.22);
    state.landingGripLoss=.03;
  }else if(quality==='solid'){
    state.vx*=.985;
    state.turnRate*=.91;
    state.heading*=.985;
    state.speed=Math.max(rideProfile.baseSpeed*.90,state.speed*.992);
    state.landingGripLoss=.16;
  }else if(quality==='rough'){
    state.vx*=.96;
    state.turnRate*=.84;
    state.heading*=.96;
    state.speed=Math.max(rideProfile.baseSpeed*.90,state.speed*.965);
    state.landingGripLoss=.42;
  }else{
    state.vx*=.90;
    state.turnRate*=.72;
    state.heading*=.91;
    state.speed=Math.max(rideProfile.baseSpeed*.90,state.speed*.91);
    state.landingGripLoss=.72;
  }

  return {
    landed:true,
    impact,
    quality,
    preparation:state.landingPreparation||0,
    horizontalInstability,
    edgeAngle:state.edge||0
  };
}

export function applyTrickLandingQuality(state,trickLanding){
  if(!trickLanding?.landingValid||!trickLanding?.landingGrade)return state.landingQuality;
  if(trickLanding.landingGrade!=='rough')return state.landingQuality;
  if(state.landingQuality==='clean'||state.landingQuality==='solid'){
    state.landingQuality='rough';
    state.landingGripLoss=Math.max(state.landingGripLoss||0,.42);
    state.speed=Math.max(getRideProfile(state.rideMode).baseSpeed*.90,state.speed*.975);
  }
  return state.landingQuality;
}

export function launchRamp(state,rampGroundY){
  if(state.air)return false;
  state.air=true;
  state.grounded=false;
  state.jumping=true;
  state.jumpSource='ramp';
  state.jumpProfile='ramp';
  state.jumpHoldTime=0;
  state.jumpCutApplied=true;
  state.vy=T.RAMP_JUMP_BASE_VELOCITY+state.speed*T.RAMP_JUMP_SPEED_FACTOR;
  state.jumpVelocity=state.vy;
  state.y=Math.max(state.y,rampGroundY+.34);
  state.rampGrace=T.RAMP_RETRIGGER_GRACE;
  state.jumpBufferTime=0;
  state.jumpBuffered=false;
  state.coyoteTime=0;
  state.landingQuality='air';
  state.landingPreparation=0;
  state.landingReengageTime=0;
  return true;
}
