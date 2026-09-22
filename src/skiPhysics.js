import * as THREE from 'three';
import {SKI_TUNING as T} from './gameplayTuning.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function progressSpeed(state,dt){
  const tier=Math.max(0,Math.floor((state.time||0)/T.SPEED_TIER_SECONDS));
  const tierTime=(state.time||0)-tier*T.SPEED_TIER_SECONDS;
  const targetSpeed=Math.min(T.MAX_SPEED,T.BASE_SPEED+tier*T.SPEED_TIER_INCREMENT);

  state.speedTier=tier;
  state.speedTierTime=tierTime;
  state.targetSpeed=targetSpeed;
  state.maxSpeed=T.MAX_SPEED;

  const carveDrag=(state.carveLoad||0)*.09;
  const landingDrag=(state.landingGripLoss||0)*.18;
  state.speed=THREE.MathUtils.damp(state.speed,targetSpeed,T.SPEED_RESPONSE,dt);
  state.speed=clamp(state.speed-(carveDrag+landingDrag)*dt,T.BASE_SPEED*.90,T.MAX_SPEED);
  return clamp((state.speed-T.BASE_SPEED)/(T.MAX_SPEED-T.BASE_SPEED),0,1);
}

export function stepCarving(state,input,dt){
  const steer=Math.abs(input)<T.INPUT_DEADZONE?0:clamp(input,-1,1);
  const speed01=clamp((state.speed-T.BASE_SPEED)/(T.MAX_SPEED-T.BASE_SPEED),0,1);
  state.landingGripLoss=Math.max(0,(state.landingGripLoss||0)-dt*2.25);

  if(state.air){
    state.x=clamp(state.x+state.vx*dt,-T.PLAYER_HALF_WIDTH,T.PLAYER_HALF_WIDTH);
    if(Math.abs(state.x)>=T.PLAYER_HALF_WIDTH&&state.x*state.vx>0)state.vx=0;
    state.vx=THREE.MathUtils.damp(state.vx,state.vx*.995,.32,dt);
    state.edge=THREE.MathUtils.damp(state.edge,0,3.2,dt);
    state.carveLoad=THREE.MathUtils.damp(state.carveLoad||0,0,4.8,dt);
    state.grip=.12;
    state.counterSteer=false;
    return;
  }

  const reversing=steer!==0&&state.edge*steer<-.01;
  const neutralizing=reversing&&Math.abs(state.edge)>.018;
  const targetEdge=steer;
  const edgeResponse=neutralizing?T.EDGE_REVERSAL:steer===0?T.EDGE_RELEASE:T.EDGE_RESPONSE;
  state.edge=THREE.MathUtils.damp(state.edge,targetEdge,edgeResponse,dt);

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

  state.turnRate=THREE.MathUtils.damp(
    state.turnRate,
    desiredTurnRate,
    neutralizing?T.TURN_REVERSAL_RESPONSE:T.TURN_RESPONSE,
    dt
  );

  const headingLimit=THREE.MathUtils.lerp(T.HEADING_LIMIT_LOW,T.HEADING_LIMIT_HIGH,speed01);
  state.heading=clamp(state.heading+state.turnRate*dt,-headingLimit,headingLimit);
  if(steer===0){
    state.heading=THREE.MathUtils.damp(state.heading,0,T.HEADING_RECENTER+speed01*.4,dt);
    state.turnRate=THREE.MathUtils.damp(state.turnRate,0,T.TURN_RECENTER,dt);
  }

  const roughLoss=state.landingGripLoss||0;
  state.grip=clamp(.80+speed01*.05+(state.carveLoad||0)*.14-roughLoss*.38,.36,1);

  const lateralScale=THREE.MathUtils.lerp(T.LATERAL_SCALE_LOW,T.LATERAL_SCALE_HIGH,speed01);
  let carveVelocity=Math.sin(state.heading)*state.speed*lateralScale;
  let gripResponse=T.LATERAL_RESPONSE+state.grip*1.9+(state.carveLoad||0)*1.4;

  if(neutralizing){
    carveVelocity*=.08;
    gripResponse=T.LATERAL_REVERSAL_RESPONSE;
    state.vx=THREE.MathUtils.damp(state.vx,0,T.LATERAL_REVERSAL_RESPONSE,dt);
  }

  state.vx=THREE.MathUtils.damp(state.vx,carveVelocity,gripResponse,dt);

  if(state.carveLoad>.62){
    const plantedScrub=1-(state.carveLoad-.62)*.06*dt;
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
  state.y+=state.vy*dt-.5*17.8*dt*dt;
  state.vy-=17.8*dt;
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

  if(quality==='clean'){
    state.vx*=.99;
    state.turnRate*=.93;
    state.heading*=.98;
    state.speed=Math.min(T.MAX_SPEED,state.speed+.22);
    state.landingGripLoss=.03;
  }else if(quality==='rough'){
    state.vx*=.93;
    state.turnRate*=.78;
    state.heading*=.93;
    state.speed=Math.max(T.BASE_SPEED*.90,state.speed*.965);
    state.landingGripLoss=.42;
  }else{
    state.vx*=.85;
    state.turnRate*=.64;
    state.heading*=.87;
    state.speed=Math.max(T.BASE_SPEED*.90,state.speed*.91);
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
  return true;
}
