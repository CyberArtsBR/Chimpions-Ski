import {getRideSpeedFeel,normalizeRideMode,RIDE_MODE} from './rideMode.js';
import {RIDER_ANIMATION_STATE,createRiderAnimationStateMachine} from './riderAnimationState.js';

const clamp=(v,min=0,max=1)=>Math.max(min,Math.min(max,Number(v)||0));
const expBlend=(current,target,response,dt)=>current+(target-current)*(1-Math.pow(1-response,Math.max(0,dt)*60));

export function createRiderPoseController({rideMode=RIDE_MODE.SKI}={}){
  const machine=createRiderAnimationStateMachine();
  let currentRideMode=normalizeRideMode(rideMode);
  const pose={
    state:RIDER_ANIMATION_STATE.READY,
    previousState:RIDER_ANIMATION_STATE.READY,
    stateTime:0,
    carvePhase:'neutral',
    carve:0,
    speed:0,
    air:0,
    landing:0,
    ascent:0,
    apex:0,
    descent:0,
    hardCarve:0,
    anticipation:0,
    edgeEngagement:0,
    loadedCarve:0,
    release:0,
    crossover:0,
    reversal:0,
    hipFlex:0,
    hipLean:0,
    outsideLoad:0,
    insideFlex:0,
    torsoCounter:0,
    headLook:0,
    armBalance:0,
    polePlant:0,
    preJumpCompression:0,
    takeoffExtend:0,
    jumpTuck:0,
    landingPrep:0,
    landingAbsorb:0,
    followThrough:0,
    trickTuck:0,
    trickOpen:0,
    trickSpin:0,
    styleHold:0,
    styleReach:0,
    styleSide:1,
    crash:0,
    crashDirection:0,
    oil:0,
    toeEdge:0,
    heelEdge:0,
    snowboardSideOn:0,
    legCoupling:0,
    skiLegIndependence:1,
    ikWeight:1,
    secondaryWeight:1,
    visualLift:0
  };

  function setRideMode(mode){currentRideMode=normalizeRideMode(mode);}

  function update(frame={}){
    const dt=clamp(frame.dt??1/60,0,.1);
    currentRideMode=normalizeRideMode(frame.rideMode??currentRideMode);
    const state=machine.update(frame);
    const targetCarve=clamp(frame.steer??frame.edge??0,-1,1);
    const reversing=Math.sign(targetCarve)!==Math.sign(pose.carve)&&Math.abs(targetCarve)>.04&&Math.abs(pose.carve)>.04;
    pose.carve=expBlend(pose.carve,targetCarve,reversing?.42:.24,dt);
    pose.speed=expBlend(pose.speed,getRideSpeedFeel(currentRideMode,frame.speed),.09,dt);
    pose.air=expBlend(pose.air,frame.air?1:0,frame.air?.32:.20,dt);
    pose.landing=expBlend(pose.landing,clamp(frame.landing),clamp(frame.landing)>pose.landing?.58:.22,dt);

    pose.anticipation=expBlend(pose.anticipation,state.anticipation,.34,dt);
    pose.edgeEngagement=expBlend(pose.edgeEngagement,state.edgeEngagement,.30,dt);
    pose.loadedCarve=expBlend(pose.loadedCarve,state.loadedCarve,.24,dt);
    pose.release=expBlend(pose.release,state.release,.34,dt);
    pose.crossover=expBlend(pose.crossover,state.crossover,.42,dt);
    pose.reversal=pose.crossover;
    pose.carvePhase=state.carvePhase;

    const vy=Number(frame.verticalVelocity)||0;
    const rampPower=frame.jumpSource==='ramp'||frame.rampContact?1:.70;
    pose.ascent=frame.air?clamp(vy/11)*rampPower:0;
    pose.descent=frame.air?clamp(-vy/11)*rampPower:0;
    pose.apex=frame.air?clamp(1-Math.abs(vy)/4.8)*rampPower:0;
    pose.hardCarve=clamp(Math.max(state.hardCarve,Number(frame.carveLoad)||0));

    const landingQuality=String(frame.landingQuality||'none');
    const landingScale=landingQuality==='hard'?1.38:landingQuality==='rough'?1.18:1;
    const startCompression=state.state===RIDER_ANIMATION_STATE.START_COMPRESSION?1:0;
    const jumpAnticipation=state.state===RIDER_ANIMATION_STATE.JUMP_ANTICIPATION?1:0;
    const takeoff=(state.state===RIDER_ANIMATION_STATE.START_RELEASE||state.state===RIDER_ANIMATION_STATE.TAKEOFF||state.state===RIDER_ANIMATION_STATE.ASCENT)?1:0;
    const landingState=(state.state===RIDER_ANIMATION_STATE.LANDING||state.state===RIDER_ANIMATION_STATE.LANDING_RECOVERY)?1:0;
    const landingRecovery=state.state===RIDER_ANIMATION_STATE.LANDING_RECOVERY?clamp(1-state.stateTime/.5):0;
    const trickProgress=clamp(frame.trickProgress);
    const trickActive=state.state===RIDER_ANIMATION_STATE.TRICK?1:0;
    const backflip=String(frame.trickType||'').toUpperCase()==='BACKFLIP';
    const trickArc=Math.sin(Math.PI*trickProgress);
    const reduced=!!frame.reducedMotion;
    const secondaryScale=reduced?.35:1;

    const preJumpTarget=jumpAnticipation*(frame.rampContact?1:.58);
    pose.preJumpCompression=expBlend(pose.preJumpCompression,preJumpTarget,frame.rampContact?.40:.28,dt);
    const landingPrepTarget=frame.air?pose.descent*(.44+.56*rampPower):0;
    pose.landingPrep=expBlend(pose.landingPrep,landingPrepTarget,.30,dt);

    const baseFlex=.070+pose.speed*.052+startCompression*.090+pose.preJumpCompression*.125+pose.descent*.040+pose.landingPrep*.045;
    const carveFlex=pose.edgeEngagement*.024+pose.loadedCarve*.060;
    pose.hipFlex=baseFlex+carveFlex+pose.landing*.135*landingScale-trickActive*pose.ascent*.020-pose.release*.012;
    const carveSign=Math.sign(pose.carve||targetCarve||1);
    pose.hipLean=pose.carve*(.052+pose.edgeEngagement*.050+pose.loadedCarve*.112)*(1-pose.crossover*.74)-carveSign*pose.anticipation*.018;
    pose.outsideLoad=Math.abs(pose.carve)*(.45+pose.edgeEngagement*.24+pose.loadedCarve*.48)*(1-pose.crossover*.62);
    pose.insideFlex=Math.abs(pose.carve)*(.28+pose.edgeEngagement*.18+pose.loadedCarve*.34)*(1-pose.crossover*.50);
    pose.torsoCounter=-pose.carve*(.060+pose.edgeEngagement*.052+pose.loadedCarve*.086)*(1-pose.air*.65)+carveSign*pose.release*.026;
    pose.headLook=-pose.carve*(.040+pose.loadedCarve*.060)*(1-pose.air*.45)+carveSign*pose.release*.014;
    pose.armBalance=-pose.carve*(.18+pose.edgeEngagement*.14+pose.loadedCarve*.28)*(1-pose.crossover*.30)+carveSign*pose.release*.10;
    pose.polePlant=state.state===RIDER_ANIMATION_STATE.EDGE_REVERSAL?(state.edgeSign||Math.sign(targetCarve))*pose.crossover:0;
    pose.takeoffExtend=takeoff*clamp(.30+pose.ascent*.70)*(frame.jumpSource==='ramp'?1.18:rampPower);
    pose.jumpTuck=clamp(pose.apex*.42+pose.descent*.66+trickActive*trickArc*(backflip?.72:.44));
    pose.landingAbsorb=clamp(Math.max(pose.landing,landingState*.35)*landingScale);
    pose.followThrough=clamp(pose.release*.48+landingRecovery*.72*landingScale);
    pose.trickTuck=trickActive*trickArc*(backflip?1:.62);
    pose.trickOpen=trickActive*clamp((trickProgress-.72)/.28);
    pose.trickSpin=trickActive*(backflip?0:trickArc);

    const styleTarget=frame.air?clamp(frame.styleHold):0;
    pose.styleHold=expBlend(pose.styleHold,styleTarget,reduced?.18:.36,dt);
    pose.styleSide=Number(frame.styleSide)<0?-1:1;
    pose.styleReach=pose.styleHold*(.58+.42*pose.apex)*(reduced?.78:1);

    pose.crash=state.state===RIDER_ANIMATION_STATE.CRASH?clamp(frame.crashSeverity??1):0;
    pose.crashDirection=(Math.sign(Number(frame.crashDirection)||1)||1)*pose.crash;
    pose.oil=state.state===RIDER_ANIMATION_STATE.OIL_SLIP?clamp((Number(frame.oilSlipTime)||0)/1.2):0;
    pose.ikWeight=frame.air||pose.crash?.12:1;
    pose.secondaryWeight=secondaryScale;
    pose.visualLift=(pose.takeoffExtend*.020+pose.apex*.016-pose.landingAbsorb*.034-pose.preJumpCompression*.008)*secondaryScale;

    if(currentRideMode===RIDE_MODE.SNOWBOARD){
      pose.toeEdge=clamp(pose.carve,0,1);
      pose.heelEdge=clamp(-pose.carve,0,1);
      pose.snowboardSideOn=clamp(.72+pose.hardCarve*.12+pose.air*.08+pose.styleHold*.08);
      pose.legCoupling=clamp(.58+pose.hardCarve*.20+pose.air*.14);
      pose.skiLegIndependence=0;
      pose.hipLean*=1.16;
      pose.hipFlex+=pose.toeEdge*.034+pose.heelEdge*.018;
      pose.torsoCounter=pose.torsoCounter*.78+pose.toeEdge*.040-pose.heelEdge*.030;
      pose.headLook*=.70;
      pose.armBalance*=1.10;
    }else{
      pose.toeEdge=0;
      pose.heelEdge=0;
      pose.snowboardSideOn=0;
      pose.legCoupling=0;
      pose.skiLegIndependence=clamp(.62+pose.outsideLoad*.38);
    }

    pose.state=state.state;
    pose.previousState=state.previousState;
    pose.stateTime=state.stateTime;
    return pose;
  }

  function reset(mode=currentRideMode){
    currentRideMode=normalizeRideMode(mode);
    machine.reset();
    for(const key of Object.keys(pose)){
      if(typeof pose[key]==='number')pose[key]=key==='ikWeight'||key==='secondaryWeight'||key==='skiLegIndependence'?1:0;
    }
    pose.state=RIDER_ANIMATION_STATE.READY;
    pose.previousState=RIDER_ANIMATION_STATE.READY;
    pose.carvePhase='neutral';
    pose.styleSide=1;
    return pose;
  }

  return {pose,update,reset,setRideMode,getRideMode:()=>currentRideMode,stateMachine:machine};
}
