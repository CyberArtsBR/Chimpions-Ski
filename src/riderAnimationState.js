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

const clamp=(v,min=0,max=1)=>Math.max(min,Math.min(max,Number(v)||0));
const sign=v=>v>0?1:v<0?-1:0;

export function createRiderAnimationStateMachine(){
  let current=RIDER_ANIMATION_STATE.READY;
  let previous=current;
  let stateTime=0;
  let lastEdge=0;
  let previousEdge=0;
  let previousLoad=0;
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
    edgeMagnitude:0,
    hardCarve:0,
    reversal:0,
    airborneTime:0,
    carvePhase:'neutral',
    anticipation:0,
    edgeEngagement:0,
    loadedCarve:0,
    release:0,
    crossover:0
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
    previousEdge=0;
    previousLoad=0;
    reversalTime=0;
    landingRecovery=0;
    previousAir=false;
    airborneTime=0;
    startTime=0;
    Object.assign(snapshot,{
      state:next,previousState:next,stateTime:0,transition:1,
      edgeSign:0,edgeMagnitude:0,hardCarve:0,reversal:0,airborneTime:0,
      carvePhase:'neutral',anticipation:0,edgeEngagement:0,loadedCarve:0,release:0,crossover:0
    });
    return snapshot;
  }

  function update(frame={}){
    const dt=clamp(frame.dt??1/60,0,.1);
    stateTime+=dt;
    const edge=clamp(frame.steer??frame.edge??0,-1,1);
    const edgeMagnitude=Math.abs(edge);
    const edgeSign=edgeMagnitude>.055?sign(edge):0;
    const carveLoad=clamp(frame.carveLoad??edgeMagnitude,0,1);
    const hard=Math.max(edgeMagnitude,carveLoad);
    const air=!!frame.air;
    const landing=clamp(frame.landing,0,1);
    const vy=Number(frame.verticalVelocity)||0;
    const mode=String(frame.mode||'playing').toLowerCase();
    const safeDt=Math.max(1/240,dt||1/60);
    const edgeRate=(edge-previousEdge)/safeDt;
    const loadRate=(carveLoad-previousLoad)/safeDt;

    if(edgeSign&&lastEdge&&edgeSign!==lastEdge&&edgeMagnitude>.12)reversalTime=.26;
    if(edgeSign)lastEdge=edgeSign;
    reversalTime=Math.max(0,reversalTime-dt);
    const crossover=reversalTime>0?reversalTime/.26:0;

    const loadedCarve=clamp((hard-.48)/.44)*(1-crossover*.72);
    const edgeEngagement=clamp((edgeMagnitude-.055)/.52)*(1-loadedCarve*.55)*(1-crossover*.72);
    const anticipation=clamp(Math.abs(edgeRate)/24)*(.34+.66*(1-edgeMagnitude))*(1-loadedCarve)*(1-crossover*.75);
    const releasingSameEdge=(previousEdge&&edge&&Math.sign(previousEdge)===Math.sign(edge))
      ?Math.max(0,Math.abs(previousEdge)-edgeMagnitude)/safeDt
      :0;
    const release=clamp(releasingSameEdge/14+Math.max(0,-loadRate)/8)*(1-crossover*.70);
    const carvePhase=crossover>.12?'crossover'
      :release>.18?'release'
      :loadedCarve>.58?'loaded'
      :edgeEngagement>.20?'engagement'
      :anticipation>.14?'anticipation'
      :'neutral';
    previousEdge=edge;
    previousLoad=carveLoad;

    if(landing>.04)landingRecovery=Math.max(landingRecovery,.46);
    else landingRecovery=Math.max(0,landingRecovery-dt);

    if(air)airborneTime=previousAir?airborneTime+dt:0;
    else airborneTime=0;
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
    Object.assign(snapshot,{
      state:current,
      stateTime,
      transition:Math.min(1,snapshot.transition+dt*7.5),
      edgeSign,
      edgeMagnitude,
      hardCarve:hard,
      reversal:crossover,
      airborneTime,
      carvePhase,
      anticipation,
      edgeEngagement,
      loadedCarve,
      release,
      crossover
    });
    return snapshot;
  }

  return {update,reset,get state(){return snapshot;}};
}
