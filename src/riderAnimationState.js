export const RIDER_ANIMATION_STATE=Object.freeze({
  READY:'READY',
  START_COMPRESSION:'START_COMPRESSION',
  START_RELEASE:'START_RELEASE',
  DOWNHILL_NEUTRAL:'DOWNHILL_NEUTRAL',
  LEFT_CARVE:'LEFT_CARVE',
  RIGHT_CARVE:'RIGHT_CARVE',
  HARD_LEFT_CARVE:'HARD_LEFT_CARVE',
  HARD_RIGHT_CARVE:'HARD_RIGHT_CARVE',
  EDGE_REVERSAL:'EDGE_REVERSAL',
  JUMP_ANTICIPATION:'JUMP_ANTICIPATION',
  TAKEOFF:'TAKEOFF',
  ASCENT:'ASCENT',
  APEX:'APEX',
  DESCENT:'DESCENT',
  LANDING:'LANDING',
  LANDING_RECOVERY:'LANDING_RECOVERY',
  OIL_SLIP:'OIL_SLIP',
  TRICK:'TRICK',
  CRASH:'CRASH'
});

const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number(v)||0));
const sign=v=>v>0?1:v<0?-1:0;

export function createRiderAnimationStateMachine(){
  let current=RIDER_ANIMATION_STATE.READY;
  let previous=current;
  let stateTime=0;
  let lastEdge=0;
  let reversalTime=0;
  let landingRecovery=0;
  let previousAir=false;
  let airborneTime=0;
  let startTime=0;
  const snapshot={
    state:current,
    previousState:previous,
    stateTime:0,
    transition:1,
    edgeSign:0,
    hardCarve:0,
    reversal:0,
    airborneTime:0
  };

  function transition(next){
    if(next===current)return false;
    previous=current;
    current=next;
    stateTime=0;
    snapshot.previousState=previous;
    snapshot.state=current;
    snapshot.transition=0;
    return true;
  }

  function reset(next=RIDER_ANIMATION_STATE.READY){
    current=next;
    previous=next;
    stateTime=0;
    lastEdge=0;
    reversalTime=0;
    landingRecovery=0;
    previousAir=false;
    airborneTime=0;
    startTime=0;
    snapshot.state=next;
    snapshot.previousState=next;
    snapshot.stateTime=0;
    snapshot.transition=1;
    snapshot.edgeSign=0;
    snapshot.hardCarve=0;
    snapshot.reversal=0;
    snapshot.airborneTime=0;
    return snapshot;
  }

  function update(frame={}){
    const dt=clamp(frame.dt??1/60,0,0.1);
    stateTime+=dt;
    const edge=clamp(frame.steer??frame.edge??0,-1,1);
    const edgeSign=Math.abs(edge)>.055?sign(edge):0;
    const carveLoad=clamp(frame.carveLoad??Math.abs(edge),0,1);
    const hard=Math.max(Math.abs(edge),carveLoad);
    const air=!!frame.air;
    const landing=clamp(frame.landing,0,1);
    const vy=Number(frame.verticalVelocity)||0;
    const mode=String(frame.mode||'playing').toLowerCase();

    if(edgeSign&&lastEdge&&edgeSign!==lastEdge&&Math.abs(edge)>.12)reversalTime=.26;
    if(edgeSign)lastEdge=edgeSign;
    reversalTime=Math.max(0,reversalTime-dt);

    if(landing>.04)landingRecovery=Math.max(landingRecovery,.46);
    else landingRecovery=Math.max(0,landingRecovery-dt);

    if(air){
      airborneTime=previousAir?airborneTime+dt:0;
    }else airborneTime=0;
    previousAir=air;

    if(mode==='countdown')startTime+=dt;
    else startTime=0;

    let next=current;
    if(frame.crashActive||mode==='crashed'){
      next=RIDER_ANIMATION_STATE.CRASH;
    }else if((Number(frame.oilSlipTime)||0)>0){
      next=RIDER_ANIMATION_STATE.OIL_SLIP;
    }else if(frame.trickActive||frame.trickType){
      next=RIDER_ANIMATION_STATE.TRICK;
    }else if(mode==='countdown'){
      next=startTime<.34
        ?RIDER_ANIMATION_STATE.READY
        :startTime<.92
          ?RIDER_ANIMATION_STATE.START_COMPRESSION
          :RIDER_ANIMATION_STATE.START_RELEASE;
    }else if(air){
      if(airborneTime<.10)next=RIDER_ANIMATION_STATE.TAKEOFF;
      else if(vy>1.25)next=RIDER_ANIMATION_STATE.ASCENT;
      else if(Math.abs(vy)<=1.25)next=RIDER_ANIMATION_STATE.APEX;
      else next=RIDER_ANIMATION_STATE.DESCENT;
    }else if(landing>.09){
      next=RIDER_ANIMATION_STATE.LANDING;
    }else if(landingRecovery>0){
      next=RIDER_ANIMATION_STATE.LANDING_RECOVERY;
    }else if(frame.jumpAnticipation||frame.rampContact){
      next=RIDER_ANIMATION_STATE.JUMP_ANTICIPATION;
    }else if(reversalTime>0){
      next=RIDER_ANIMATION_STATE.EDGE_REVERSAL;
    }else if(hard>.70&&edgeSign<0){
      next=RIDER_ANIMATION_STATE.HARD_LEFT_CARVE;
    }else if(hard>.70&&edgeSign>0){
      next=RIDER_ANIMATION_STATE.HARD_RIGHT_CARVE;
    }else if(edgeSign<0){
      next=RIDER_ANIMATION_STATE.LEFT_CARVE;
    }else if(edgeSign>0){
      next=RIDER_ANIMATION_STATE.RIGHT_CARVE;
    }else{
      next=RIDER_ANIMATION_STATE.DOWNHILL_NEUTRAL;
    }

    transition(next);
    snapshot.state=current;
    snapshot.stateTime=stateTime;
    snapshot.transition=Math.min(1,snapshot.transition+dt*7.5);
    snapshot.edgeSign=edgeSign;
    snapshot.hardCarve=hard;
    snapshot.reversal=reversalTime>0?reversalTime/.26:0;
    snapshot.airborneTime=airborneTime;
    return snapshot;
  }

  return {update,reset,get state(){return snapshot;}};
}
