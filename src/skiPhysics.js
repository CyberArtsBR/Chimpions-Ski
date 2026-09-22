import * as THREE from 'three';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function progressSpeed(state,dt){
  const speed01=clamp((state.speed-12)/19,0,1);
  const acceleration=THREE.MathUtils.lerp(.42,.20,speed01);
  const carveDrag=(state.carveLoad||0)*THREE.MathUtils.lerp(.06,.15,speed01);
  const landingDrag=(state.landingGripLoss||0)*.24;
  state.speed=clamp(state.speed+(acceleration-carveDrag-landingDrag)*dt,11.5,31);
  return speed01;
}

export function stepCarving(state,input,dt){
  const steer=Math.abs(input)<.035?0:clamp(input,-1,1);
  const speed01=clamp((state.speed-12)/19,0,1);
  state.landingGripLoss=Math.max(0,(state.landingGripLoss||0)-dt*1.8);

  if(state.air){
    state.x=clamp(state.x+state.vx*dt,-8.1,8.1);
    state.vx=THREE.MathUtils.damp(state.vx,state.vx*.992,.45,dt);
    state.edge=THREE.MathUtils.damp(state.edge,0,2.4,dt);
    state.carveLoad=THREE.MathUtils.damp(state.carveLoad||0,0,3.4,dt);
    state.grip=.12;
    state.counterSteer=false;
    return;
  }

  const reversing=steer!==0&&state.edge*steer<-.02;
  const neutralizing=reversing&&Math.abs(state.edge)>.045;
  const targetEdge=neutralizing?0:steer;
  const edgeResponse=neutralizing?12.2:steer===0?6.5:7.8+speed01*.85;
  state.edge=THREE.MathUtils.damp(state.edge,targetEdge,edgeResponse,dt);

  const edgeAmount=Math.abs(state.edge);
  const loadTarget=Math.pow(edgeAmount,1.18)*(.76+speed01*.24);
  state.carveLoad=THREE.MathUtils.damp(state.carveLoad||0,loadTarget,7.2,dt);

  const maxTurnRate=.78+speed01*.25;
  const edgeTurn=Math.sign(state.edge)*Math.pow(edgeAmount,1.13)*maxTurnRate;
  let desiredTurnRate=edgeTurn;
  if(steer===0){
    desiredTurnRate-=state.heading*(1.42+speed01*.28);
  }else if(neutralizing){
    desiredTurnRate-=state.heading*1.82;
  }else{
    desiredTurnRate-=state.heading*.13;
  }

  state.turnRate=THREE.MathUtils.damp(
    state.turnRate,
    desiredTurnRate,
    neutralizing?10.2:5.9+speed01*.55,
    dt
  );

  state.heading=clamp(state.heading+state.turnRate*dt,-.53,.53);
  if(steer===0){
    state.heading=THREE.MathUtils.damp(state.heading,0,1.08+speed01*.30,dt);
    state.turnRate=THREE.MathUtils.damp(state.turnRate,0,2.35,dt);
  }

  const roughLoss=state.landingGripLoss||0;
  state.grip=clamp(.72+speed01*.07+(state.carveLoad||0)*.18-roughLoss*.42,.32,1);
  const carveVelocity=Math.sin(state.heading)*state.speed*(.435+speed01*.045);
  const gripResponse=4.45+state.grip*1.45+(state.carveLoad||0)*.9;
  state.vx=THREE.MathUtils.damp(state.vx,carveVelocity,gripResponse,dt);

  if(state.carveLoad>.55){
    const scrub=1-(state.carveLoad-.55)*.055*dt;
    state.vx*=Math.max(.985,scrub);
  }

  state.x=clamp(state.x+state.vx*dt,-8.1,8.1);
  if(Math.abs(state.x)>=8.08){
    state.vx*=.40;
    state.heading*=.67;
    state.turnRate*=.60;
  }

  state.counterSteer=neutralizing;
}

export function stepAir(state,dt,groundY){
  if(!state.air){
    state.landingPulse=Math.max(0,state.landingPulse-dt*4.5);
    state.y=THREE.MathUtils.damp(state.y,groundY,11,dt);
    return {landed:false,impact:0,quality:state.landingQuality||'none'};
  }

  state.vy-=17.8*dt;
  state.y+=state.vy*dt;
  if(state.y>groundY||state.vy>0)return {landed:false,impact:0,quality:'air'};

  const impact=Math.abs(state.vy);
  let quality='clean';
  if(impact>=7.6)quality='rough';
  if(impact>=10.8)quality='hard';

  state.y=groundY;
  state.vy=0;
  state.air=false;
  state.landingQuality=quality;
  state.landingPulse=Math.min(1,impact/9);

  if(quality==='clean'){
    state.vx*=.98;
    state.turnRate*=.90;
    state.heading*=.97;
    state.speed=Math.min(31,state.speed+.18);
    state.landingGripLoss=.05;
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
  state.vy=6.55+state.speed*.075;
  state.y=Math.max(state.y,rampGroundY+.34);
  state.rampGrace=.34;
  state.landingQuality='air';
  return true;
}
