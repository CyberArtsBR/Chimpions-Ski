import * as THREE from 'three';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function progressSpeed(state,dt){
  const speed01=clamp((state.speed-12)/19,0,1);
  const acceleration=THREE.MathUtils.lerp(.40,.20,speed01);
  state.speed=Math.min(31,state.speed+acceleration*dt);
  return speed01;
}

export function stepCarving(state,input,dt){
  const steer=Math.abs(input)<.035?0:clamp(input,-1,1);
  const speed01=clamp((state.speed-12)/19,0,1);

  if(state.air){
    state.x=clamp(state.x+state.vx*dt,-8.1,8.1);
    state.vx=THREE.MathUtils.damp(state.vx,state.vx*.985,.65,dt);
    state.counterSteer=false;
    return;
  }

  const reversing=steer!==0&&state.edge*steer<-.025;
  const neutralizing=reversing&&Math.abs(state.edge)>.055;
  const targetEdge=neutralizing?0:steer;
  const edgeResponse=neutralizing?11.5:steer===0?6.8:7.4+speed01*.8;
  state.edge=THREE.MathUtils.damp(state.edge,targetEdge,edgeResponse,dt);

  const maxTurnRate=.82+speed01*.18;
  let desiredTurnRate=state.edge*maxTurnRate;
  if(steer===0){
    desiredTurnRate-=state.heading*(1.38+speed01*.22);
  }else if(neutralizing){
    desiredTurnRate-=state.heading*1.75;
  }else{
    desiredTurnRate-=state.heading*.16;
  }

  state.turnRate=THREE.MathUtils.damp(
    state.turnRate,
    desiredTurnRate,
    neutralizing?9.6:5.7+speed01*.45,
    dt
  );

  state.heading=clamp(state.heading+state.turnRate*dt,-.54,.54);
  if(steer===0){
    state.heading=THREE.MathUtils.damp(state.heading,0,1.05+speed01*.28,dt);
    state.turnRate=THREE.MathUtils.damp(state.turnRate,0,2.2,dt);
  }

  const carveVelocity=Math.sin(state.heading)*state.speed*(.44+speed01*.04);
  const grip=4.7+speed01*1.15+(steer===0?.45:0);
  state.vx=THREE.MathUtils.damp(state.vx,carveVelocity,grip,dt);
  state.x=clamp(state.x+state.vx*dt,-8.1,8.1);

  if(Math.abs(state.x)>=8.08){
    state.vx*=.42;
    state.heading*=.68;
    state.turnRate*=.62;
  }

  state.counterSteer=neutralizing;
}

export function stepAir(state,dt,groundY){
  if(!state.air){
    state.landingPulse=Math.max(0,state.landingPulse-dt*4.4);
    state.y=THREE.MathUtils.damp(state.y,groundY,10,dt);
    return {landed:false,impact:0};
  }

  state.vy-=17.8*dt;
  state.y+=state.vy*dt;
  if(state.y>groundY||state.vy>0)return {landed:false,impact:0};

  const impact=Math.abs(state.vy);
  state.y=groundY;
  state.vy=0;
  state.air=false;
  state.landingPulse=Math.min(1,impact/8);
  state.vx*=.94;
  state.turnRate*=.76;
  state.heading*=.93;
  return {landed:true,impact};
}

export function launchRamp(state,rampGroundY){
  if(state.air)return false;
  state.air=true;
  state.vy=6.95+state.speed*.055;
  state.y=Math.max(state.y,rampGroundY+.34);
  state.rampGrace=.28;
  return true;
}
