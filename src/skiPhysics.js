import * as THREE from 'three';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function progressSpeed(state,dt){
  const speed01=clamp((state.speed-12)/19,0,1);
  const acceleration=THREE.MathUtils.lerp(.42,.20,speed01);
  const carveDrag=(state.carveLoad||0)*THREE.MathUtils.lerp(.045,.11,speed01);
  const landingDrag=(state.landingGripLoss||0)*.22;
  state.speed=clamp(state.speed+(acceleration-carveDrag-landingDrag)*dt,11.5,31);
  return speed01;
}

export function stepCarving(state,input,dt){
  const steer=Math.abs(input)<.025?0:clamp(input,-1,1);
  const speed01=clamp((state.speed-12)/19,0,1);
  state.landingGripLoss=Math.max(0,(state.landingGripLoss||0)-dt*2.1);

  if(state.air){
    state.x=clamp(state.x+state.vx*dt,-8.1,8.1);
    state.vx=THREE.MathUtils.damp(state.vx,state.vx*.994,.35,dt);
    state.edge=THREE.MathUtils.damp(state.edge,0,2.8,dt);
    state.carveLoad=THREE.MathUtils.damp(state.carveLoad||0,0,4.2,dt);
    state.grip=.12;
    state.counterSteer=false;
    return;
  }

  const reversing=steer!==0&&state.edge*steer<-.015;
  const neutralizing=reversing&&Math.abs(state.edge)>.03;
  const targetEdge=neutralizing?0:steer;
  const edgeResponse=neutralizing?24:steer===0?10:16.5+speed01*1.5;
  state.edge=THREE.MathUtils.damp(state.edge,targetEdge,edgeResponse,dt);

  const edgeAmount=Math.abs(state.edge);
  const loadTarget=Math.pow(edgeAmount,1.05)*(.82+speed01*.18);
  state.carveLoad=THREE.MathUtils.damp(state.carveLoad||0,loadTarget,12,dt);

  const maxTurnRate=2.30+speed01*.30;
  const edgeTurn=Math.sign(state.edge)*Math.pow(edgeAmount,.98)*maxTurnRate;
  let desiredTurnRate=edgeTurn;
  if(steer===0){
    desiredTurnRate-=state.heading*(2.8+speed01*.35);
  }else if(neutralizing){
    desiredTurnRate-=state.heading*(6.2+speed01*.5);
  }else{
    desiredTurnRate-=state.heading*.18;
  }

  state.turnRate=THREE.MathUtils.damp(
    state.turnRate,
    desiredTurnRate,
    neutralizing?17:11.5+speed01*1.5,
    dt
  );

  const headingLimit=.58-speed01*.055;
  state.heading=clamp(state.heading+state.turnRate*dt,-headingLimit,headingLimit);
  if(steer===0){
    state.heading=THREE.MathUtils.damp(state.heading,0,2.55+speed01*.35,dt);
    state.turnRate=THREE.MathUtils.damp(state.turnRate,0,4.4,dt);
  }

  const roughLoss=state.landingGripLoss||0;
  state.grip=clamp(.78+speed01*.06+(state.carveLoad||0)*.15-roughLoss*.40,.34,1);

  const lateralScale=THREE.MathUtils.lerp(.80,.58,speed01);
  let carveVelocity=Math.sin(state.heading)*state.speed*lateralScale;
  let gripResponse=9.2+state.grip*2.1+(state.carveLoad||0)*1.7;

  if(neutralizing){
    // Counter-steering unloads the old edge and kills stale sideways momentum
    // before the new edge engages, so reversal is quick without snapping.
    carveVelocity*=.18;
    gripResponse=16.5;
  }

  state.vx=THREE.MathUtils.damp(state.vx,carveVelocity,gripResponse,dt);

  if(state.carveLoad>.58){
    const plantedScrub=1-(state.carveLoad-.58)*.075*dt;
    state.vx*=Math.max(.982,plantedScrub);
  }

  state.x=clamp(state.x+state.vx*dt,-8.1,8.1);
  if(Math.abs(state.x)>=8.08){
    state.vx*=.36;
    state.heading*=.64;
    state.turnRate*=.56;
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
  state.vy=5.9;
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
  state.vy-=17.8*dt;
  state.y+=state.vy*dt;
  state.jumpVelocity=state.vy;
  if(state.y>groundY||state.vy>0)return {landed:false,impact:0,quality:'air'};

  const impact=Math.abs(state.vy);
  let quality='clean';
  if(impact>=7.6)quality='rough';
  if(impact>=10.8)quality='hard';

  state.y=groundY;
  state.vy=0;
  state.jumpVelocity=0;
  state.air=false;
  state.grounded=true;
  state.jumping=false;
  state.jumpSource='';
  state.landingQuality=quality;
  state.landingPulse=Math.min(1,impact/9);

  if(quality==='clean'){
    state.vx*=.985;
    state.turnRate*=.92;
    state.heading*=.98;
    state.speed=Math.min(31,state.speed+.18);
    state.landingGripLoss=.04;
  }else if(quality==='rough'){
    state.vx*=.92;
    state.turnRate*=.76;
    state.heading*=.92;
    state.speed=Math.max(11.5,state.speed*.955);
    state.landingGripLoss=.48;
  }else{
    state.vx*=.84;
    state.turnRate*=.62;
    state.heading*=.86;
    state.speed=Math.max(11.5,state.speed*.90);
    state.landingGripLoss=.78;
  }

  return {landed:true,impact,quality};
}

export function launchRamp(state,rampGroundY){
  if(state.air)return false;
  state.air=true;
  state.grounded=false;
  state.jumping=false;
  state.jumpSource='ramp';
  state.vy=6.55+state.speed*.075;
  state.jumpVelocity=state.vy;
  state.y=Math.max(state.y,rampGroundY+.34);
  state.rampGrace=.42;
  state.jumpBufferTime=0;
  state.jumpBuffered=false;
  state.coyoteTime=0;
  state.landingQuality='air';
  return true;
}
