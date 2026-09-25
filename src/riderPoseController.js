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
    carve:0,
    speed:0,
    air:0,
    landing:0,
    ascent:0,
    apex:0,
    descent:0,
    hardCarve:0,
    reversal:0,
    hipFlex:0,
    hipLean:0,
    outsideLoad:0,
    insideFlex:0,
    torsoCounter:0,
    headLook:0,
    armBalance:0,
    polePlant:0,
    takeoffExtend:0,
    jumpTuck:0,
    landingAbsorb:0,
    trickTuck:0,
    trickOpen:0,
    trickSpin:0,
    crash:0,
    crashDirection:0,
    oil:0,
    toeEdge:0,
    heelEdge:0,
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
    pose.carve=expBlend(pose.carve,targetCarve,reversing?.34:.20,dt);
    pose.speed=expBlend(pose.speed,getRideSpeedFeel(currentRideMode,frame.speed),.09,dt);
    pose.air=expBlend(pose.air,frame.air?1:0,frame.air?.30:.18,dt);
    pose.landing=expBlend(pose.landing,clamp(frame.landing),clamp(frame.landing)>pose.landing?.55:.22,dt);

    const vy=Number(frame.verticalVelocity)||0;
    const airScale=frame.jumpSource==='ramp'?1:.68;
    pose.ascent=frame.air?clamp(vy/11)*airScale:0;
    pose.descent=frame.air?clamp(-vy/11)*airScale:0;
    pose.apex=frame.air?clamp(1-Math.abs(vy)/4.8)*airScale:0;
    pose.hardCarve=clamp(Math.max(state.hardCarve,Number(frame.carveLoad)||0));
    pose.reversal=state.reversal;

    const landingQuality=String(frame.landingQuality||'none');
    const landingScale=landingQuality==='hard'?1.35:landingQuality==='rough'?1.15:1;
    const startCompression=state.state===RIDER_ANIMATION_STATE.START_COMPRESSION?1:0;
    const jumpAnticipation=state.state===RIDER_ANIMATION_STATE.JUMP_ANTICIPATION?1:0;
    const takeoff=(state.state===RIDER_ANIMATION_STATE.START_RELEASE||state.state===RIDER_ANIMATION_STATE.TAKEOFF||state.state===RIDER_ANIMATION_STATE.ASCENT)?1:0;
    const landingState=(state.state===RIDER_ANIMATION_STATE.LANDING||state.state===RIDER_ANIMATION_STATE.LANDING_RECOVERY)?1:0;
    const trickProgress=clamp(frame.trickProgress);
    const trickActive=state.state===RIDER_ANIMATION_STATE.TRICK?1:0;
    const backflip=String(frame.trickType||'').toUpperCase()==='BACKFLIP';
    const trickArc=Math.sin(Math.PI*trickProgress);
    const reduced=!!frame.reducedMotion;
    const secondaryScale=reduced?.35:1;

    const baseFlex=.075+pose.speed*.050+startCompression*.090+jumpAnticipation*.075+pose.descent*.055;
    const carveFlex=pose.hardCarve*.055*(1-pose.reversal*.72);
    pose.hipFlex=baseFlex+carveFlex+pose.landing*.13*landingScale-trickActive*pose.ascent*.025;
    pose.hipLean=pose.carve*(.075+pose.hardCarve*.105)*(1-pose.reversal*.82);
    pose.outsideLoad=Math.abs(pose.carve)*(.48+pose.hardCarve*.52)*(1-pose.reversal*.72);
    pose.insideFlex=Math.abs(pose.carve)*(.22+pose.hardCarve*.46)*(1-pose.reversal*.58);
    pose.torsoCounter=-pose.carve*(.030+pose.hardCarve*.045)*(1-pose.air*.65);
    pose.headLook=-pose.carve*(.045+pose.hardCarve*.055)*(1-pose.air*.45);
    pose.armBalance=-pose.carve*(.10+pose.hardCarve*.16)*(1-pose.reversal*.35);
    pose.polePlant=state.state===RIDER_ANIMATION_STATE.EDGE_REVERSAL?(state.edgeSign||Math.sign(targetCarve))*pose.reversal:0;
    pose.takeoffExtend=takeoff*clamp(.32+pose.ascent*.68)*airScale;
    pose.jumpTuck=clamp(pose.apex*.40+pose.descent*.70+trickActive*trickArc*(backflip?.72:.44));
    pose.landingAbsorb=clamp(Math.max(pose.landing,landingState*.35)*landingScale);
    pose.trickTuck=trickActive*trickArc*(backflip?1:.62);
    pose.trickOpen=trickActive*clamp((trickProgress-.72)/.28);
    pose.trickSpin=trickActive*(backflip?0:trickArc);
    pose.crash=state.state===RIDER_ANIMATION_STATE.CRASH?clamp(frame.crashSeverity??1):0;
    pose.crashDirection=(Math.sign(Number(frame.crashDirection)||1)||1)*pose.crash;
    pose.oil=state.state===RIDER_ANIMATION_STATE.OIL_SLIP?clamp((Number(frame.oilSlipTime)||0)/1.2):0;
    pose.ikWeight=frame.air||pose.crash?.12:1;
    pose.secondaryWeight=secondaryScale;
    pose.visualLift=(pose.takeoffExtend*.018+pose.apex*.014-pose.landingAbsorb*.032)*secondaryScale;

    if(currentRideMode===RIDE_MODE.SNOWBOARD){
      pose.toeEdge=clamp(pose.carve,0,1);
      pose.heelEdge=clamp(-pose.carve,0,1);
      pose.hipLean*=1.12;
      pose.hipFlex+=pose.toeEdge*.032+pose.heelEdge*.016;
      pose.torsoCounter=pose.torsoCounter*.58+pose.toeEdge*.018-pose.heelEdge*.012;
      pose.headLook*=.72;
    }else{
      pose.toeEdge=0;
      pose.heelEdge=0;
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
      if(typeof pose[key]==='number')pose[key]=key==='ikWeight'||key==='secondaryWeight'?1:0;
    }
    pose.state=RIDER_ANIMATION_STATE.READY;
    pose.previousState=RIDER_ANIMATION_STATE.READY;
    return pose;
  }

  return {pose,update,reset,setRideMode,getRideMode:()=>currentRideMode,stateMachine:machine};
}
