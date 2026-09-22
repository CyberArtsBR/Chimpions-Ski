import * as THREE from 'three';
import {SKI_TUNING as T} from './gameplayTuning.js';
import {getRideProfile} from './rideMode.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function progressSpeed(state,dt){
  const profile=getRideProfile(state.rideMode);
  const tier=Math.max(0,Math.floor((state.time||0)/profile.tierSeconds));
  const tierTime=(state.time||0)-tier*profile.tierSeconds;
  const targetSpeed=Math.min(profile.maxSpeed,profile.baseSpeed+tier*profile.tierIncrement);

  state.speedTier=tier;
  state.speedTierTime=tierTime;
  state.targetSpeed=targetSpeed;
  state.baseSpeed=profile.baseSpeed;
  state.maxSpeed=profile.maxSpeed;

  const carveDrag=(state.carveLoad||0)*.09;
  const landingDrag=(state.landingGripLoss||0)*.18;
  state.speed=THREE.MathUtils.damp(state.speed,targetSpeed,T.SPEED_RESPONSE,dt);
  state.speed=clamp(state.speed-(carveDrag+landingDrag)*dt,profile.baseSpeed*.90,profile.maxSpeed);
  return clamp((state.speed-profile.baseSpeed)/(profile.maxSpeed-profile.baseSpeed),0,1);
}

function stepAirControl(state,steer,neutralizing,speed01,dt){
  const edgeAmount=Math.abs(state.edge);
  const maxTurnRate=T.TURN_RATE_BASE+speed01*T.TURN_RATE_SPEED_BONUS;
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
  state.x=clamp(state.x+state.vx*dt,-T.PLAYER_HALF_WIDTH,T.PLAYER_HALF_WIDTH);

  if(Math.abs(state.x)>=T.PLAYER_HALF_WIDTH&&state.x*state.vx>0){
    state.vx=0;
    if(state.x*state.heading>0)state.heading=0;
    if(state.x*state.turnRate>0)state.turnRate=0;
  }

  state.carveLoad=THREE.MathUtils.damp(state.carveLoad||0,0,8,dt);
  state.grip=0;
  state.airControl=true;
}

export function stepCarving(state,input,dt){
  const steer=Math.abs(input)<T.INPUT_DEADZONE?0:clamp(input,-1,1);
  const rideProfile=getRideProfile(state.rideMode);
  const speed01=clamp((state.speed-rideProfile.baseSpeed)/(rideProfile.maxSpeed-rideProfile.baseSpeed),0,1);
  state.landingGripLoss=Math.max(0,(state.landingGripLoss||0)-dt*2.25);
  state.landingReengageTime=Math.max(0,(state.landingReengageTime||0)-dt);
  state.oilSlipTime=Math.max(0,(state.oilSlipTime||0)-dt);
  const oilSlip=clamp((state.oilSlipTime||0)/T.OIL_SLIP_SECONDS,0,1);

  const reversing=steer!==0&&state.edge*steer<-.01;
  const neutralizing=reversing&&Math.abs(state.edge)>.018;
  const targetEdge=steer;
  const edgeResponse=neutralizing?T.EDGE_REVERSAL:steer===0?T.EDGE_RELEASE:T.EDGE_RESPONSE;
  const effectiveEdgeResponse=edgeResponse*(1-oilSlip*(1-T.OIL_CONTROL_SCALE));
  state.edge=THREE.MathUtils.damp(state.edge,targetEdge,effectiveEdgeResponse,dt);

  if(state.air){
    stepAirControl(state,steer,neutralizing,speed01,dt);
    state.counterSteer=neutralizing;
    return;
  }

  state.airControl=false;
  const edgeAmount=Math.abs(state.edge);
  const loadTarget=Math.pow(edgeAmount,1.02)*(.84+speed01*.16);
  state.carveLoad=THREE.MathUtils.damp(state.carveLoad||0,loadTarget,T.CARVE_LOAD_RESPONSE,dt);

  const maxTurnRate=T.TURN_RATE_BASE+speed01*T.TURN_RATE_SPEED_BONUS;
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
  const normalTargetGrip=clamp(.80+speed01*.05+(state.carveLoad||0)*.14-roughLoss*.38,.36,1);
  const targetGrip=THREE.MathUtils.lerp(normalTargetGrip,T.OIL_GRIP,oilSlip);
  const reengageRemaining=clamp((state.landingReengageTime||0)/T.LANDING_REENGAGE_TIME,0,1);
  const reengageBlend=1-reengageRemaining;
  state.grip=THREE.MathUtils.lerp(.42,targetGrip,reengageBlend);

  const lateralScale=THREE.MathUtils.lerp(T.LATERAL_SCALE_LOW,T.LATERAL_SCALE_HIGH,speed01);
  let carveVelocity=Math.sin(state.heading)*state.speed*lateralScale;
  const normalGripResponse=(T.LATERAL_RESPONSE+state.grip*1.9+(state.carveLoad||0)*1.4)*(1-oilSlip*.48);
  let gripResponse=THREE.MathUtils.lerp(T.AIR_LATERAL_RESPONSE*.46,normalGripResponse,reengageBlend);

  if(neutralizing){
    carveVelocity*=.08;
    const reversalResponse=THREE.MathUtils.lerp(
      T.AIR_LATERAL_REVERSAL_RESPONSE*.55,
      T.LATERAL_REVERSAL_RESPONSE,
      reengageBlend
    );
    gripResponse=reversalResponse;
    state.vx=THREE.MathUtils.damp(state.vx,0,reversalResponse,dt);
  }

  state.vx=THREE.MathUtils.damp(state.vx,carveVelocity,gripResponse,dt);

  if(state.carveLoad>.62&&reengageBlend>.35&&oilSlip<.35){
    const plantedScrub=1-(state.carveLoad-.62)*.06*dt*reengageBlend;
    state.vx*=Math.max(.984,plantedScrub);
  }

  state.x=clamp(state.x+state.vx*dt,-T.PLAYER_HALF_WIDTH,T.PLAYER_HALF_WIDTH);
  if(Math.abs(state.x)>=T.PLAYER_HALF_WIDTH&&state.x*state.vx>0){
    state.vx=0;
    if(state.x*state.heading>0)state.heading=0;
    if(state.x*state.turnRate>0)state.turnRate=0;
  }

  state.counterSteer=neutralizing;
}

export function updateJumpAssist(state,jumpPressed,dt){
  state.jumpBufferTime=Math.max(0,(state.jumpBufferTime||0)-dt);
  state.coyoteTime=Math.max(0,(state.coyoteTime||0)-dt);

  if(state.grounded&&!state.air)state.coyoteTime=.075;
  if(jumpPressed)state.jumpBufferTime=.11;

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
  state.vy=T.MANUAL_JUMP_VELOCITY;
  state.jumpVelocity=state.vy;
  state.y=Math.max(state.y,groundY+.045);
  state.jumpBufferTime=0;
  state.jumpBuffered=false;
  state.coyoteTime=0;
  state.landingQuality='air';
  state.landingReengageTime=0;
  return true;
}

export function stepAir(state,dt,groundY){
  if(!state.air){
    state.grounded=true;
    state.jumping=false;
    state.jumpVelocity=0;
    state.landingPulse=Math.max(0,state.landingPulse-dt*4.5);
    state.y=THREE.MathUtils.damp(state.y,groundY,13,dt);
    return {landed:false,impact:0,quality:state.landingQuality||'none'};
  }

  state.grounded=false;
  state.y+=state.vy*dt-.5*T.GRAVITY*dt*dt;
  state.vy-=T.GRAVITY*dt;
  state.jumpVelocity=state.vy;
  if(state.y>groundY||state.vy>0)return {landed:false,impact:0,quality:'air'};

  const impact=Math.abs(state.vy);
  const rampLanding=state.jumpSource==='ramp';
  const roughThreshold=rampLanding?17.2:7.6;
  const hardThreshold=rampLanding?20.5:10.8;
  let quality='clean';
  if(impact>=roughThreshold)quality='rough';
  if(impact>=hardThreshold)quality='hard';

  state.y=groundY;
  state.vy=0;
  state.jumpVelocity=0;
  state.air=false;
  state.grounded=true;
  state.jumping=false;
  state.jumpSource='';
  state.landingQuality=quality;
  state.landingPulse=Math.min(1,impact/(rampLanding?18:9));
  state.landingReengageTime=T.LANDING_REENGAGE_TIME;
  const rideProfile=getRideProfile(state.rideMode);

  // Preserve most airborne lateral momentum. Ground grip fades back in via stepCarving().
  if(quality==='clean'){
    state.vx*=.995;
    state.turnRate*=.95;
    state.heading*=.99;
    state.speed=Math.min(rideProfile.maxSpeed,state.speed+.22);
    state.landingGripLoss=.03;
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

  return {landed:true,impact,quality};
}

export function launchRamp(state,rampGroundY){
  if(state.air)return false;
  state.air=true;
  state.grounded=false;
  state.jumping=true;
  state.jumpSource='ramp';
  state.vy=T.RAMP_JUMP_BASE_VELOCITY+state.speed*T.RAMP_JUMP_SPEED_FACTOR;
  state.jumpVelocity=state.vy;
  state.y=Math.max(state.y,rampGroundY+.34);
  state.rampGrace=T.RAMP_RETRIGGER_GRACE;
  state.jumpBufferTime=0;
  state.jumpBuffered=false;
  state.coyoteTime=0;
  state.landingQuality='air';
  state.landingReengageTime=0;
  return true;
}
