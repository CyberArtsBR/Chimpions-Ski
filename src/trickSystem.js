import * as THREE from 'three';

const TAU=Math.PI*2;
const COMPLETE_EPSILON=THREE.MathUtils.degToRad(8);

export const TRICK_STATE=Object.freeze({
  NONE:'NONE',
  SPIN_360:'SPIN_360',
  BACKFLIP:'BACKFLIP',
  COMPLETED:'COMPLETED',
  FAILED:'FAILED'
});

export const TRICK_TYPE=Object.freeze({
  SPIN_360:'360',
  BACKFLIP:'BACKFLIP'
});

export const TRICK_TUNING=Object.freeze({
  SPIN_360_DEGREES_PER_SECOND:620,
  BACKFLIP_DEGREES_PER_SECOND:300,
  COMPLETE_EPSILON_DEGREES:8
});

const SPEED={
  [TRICK_TYPE.SPIN_360]:THREE.MathUtils.degToRad(TRICK_TUNING.SPIN_360_DEGREES_PER_SECOND),
  [TRICK_TYPE.BACKFLIP]:THREE.MathUtils.degToRad(TRICK_TUNING.BACKFLIP_DEGREES_PER_SECOND)
};

function activeState(type){
  return type===TRICK_TYPE.BACKFLIP?TRICK_STATE.BACKFLIP:TRICK_STATE.SPIN_360;
}

export function createTrickSystem({visualTarget=null}={}){
  const axisX=new THREE.Vector3(1,0,0);
  const axisY=new THREE.Vector3(0,1,0);
  const baseQuaternion=new THREE.Quaternion();
  const trickQuaternion=new THREE.Quaternion();
  const snapshot={
    state:TRICK_STATE.NONE,
    type:'',
    progress:0,
    rotation:0,
    startTime:0,
    source:'',
    completed:false,
    landingValid:true
  };
  const landingResult={hadTrick:false,success:false,type:'',source:'',completed:false,landingValid:true};
  let target=null;
  let pendingRampType=null;

  function normalizeVisual(){
    if(target?.quaternion)target.quaternion.copy(baseQuaternion);
  }

  function setVisualTarget(next){
    normalizeVisual();
    target=next||null;
    if(target?.quaternion)baseQuaternion.copy(target.quaternion);
    else baseQuaternion.identity();
    if(snapshot.state!==TRICK_STATE.NONE&&snapshot.state!==TRICK_STATE.FAILED)applyVisual();
  }

  function applyVisual(){
    if(!target?.quaternion)return;
    if(snapshot.completed||snapshot.state===TRICK_STATE.COMPLETED){
      target.quaternion.copy(baseQuaternion);
      return;
    }
    const axis=snapshot.type===TRICK_TYPE.BACKFLIP?axisX:axisY;
    const angle=snapshot.type===TRICK_TYPE.BACKFLIP?-snapshot.rotation:snapshot.rotation;
    trickQuaternion.setFromAxisAngle(axis,angle);
    target.quaternion.copy(baseQuaternion).multiply(trickQuaternion);
  }

  function canStart(){return snapshot.state===TRICK_STATE.NONE;}

  function start(type,{source='manual',startTime=0}={}){
    if(!canStart()||!SPEED[type])return false;
    snapshot.state=activeState(type);
    snapshot.type=type;
    snapshot.progress=0;
    snapshot.rotation=0;
    snapshot.startTime=Number(startTime)||0;
    snapshot.source=source||'manual';
    snapshot.completed=false;
    snapshot.landingValid=true;
    normalizeVisual();
    return true;
  }

  function armRamp(type){
    if(!canStart()||!SPEED[type])return false;
    pendingRampType=type;
    return true;
  }
  function consumeRampArm(){
    const type=pendingRampType;
    pendingRampType=null;
    return type;
  }
  function clearRampArm(){pendingRampType=null;}

  function startSecondPress360(physicsState,{startTime=physicsState?.time||0}={}){
    if(!physicsState?.air)return false;
    // Any airborne jump press is consumed here so it can never become a buffered
    // landing bounce/double-jump. Only the first press with no active trick starts 360.
    physicsState.jumpBufferTime=0;
    physicsState.jumpBuffered=false;
    if(!canStart())return false;
    return start(TRICK_TYPE.SPIN_360,{source:physicsState.jumpSource||'manual',startTime});
  }

  function step(dt){
    if(snapshot.state!==TRICK_STATE.SPIN_360&&snapshot.state!==TRICK_STATE.BACKFLIP)return snapshot;
    snapshot.rotation=Math.min(TAU,snapshot.rotation+SPEED[snapshot.type]*Math.max(0,Number(dt)||0));
    snapshot.progress=Math.min(1,snapshot.rotation/TAU);
    if(snapshot.rotation>=TAU-COMPLETE_EPSILON){
      snapshot.rotation=TAU;
      snapshot.progress=1;
      snapshot.completed=true;
      snapshot.state=TRICK_STATE.COMPLETED;
    }
    applyVisual();
    return snapshot;
  }

  function land({jumpSource=''}={}){
    const hadTrick=snapshot.state!==TRICK_STATE.NONE;
    landingResult.hadTrick=hadTrick;
    landingResult.type=snapshot.type;
    landingResult.source=snapshot.source;
    landingResult.completed=snapshot.completed||snapshot.rotation>=TAU-COMPLETE_EPSILON;
    const sourceMatches=snapshot.source==='ramp'&&jumpSource==='ramp';
    const landingValid=snapshot.type===TRICK_TYPE.BACKFLIP?sourceMatches:true;
    landingResult.landingValid=landingValid;
    landingResult.success=hadTrick&&landingResult.completed&&landingValid;

    if(hadTrick){
      snapshot.completed=landingResult.completed;
      snapshot.progress=landingResult.completed?1:snapshot.progress;
      snapshot.landingValid=landingValid;
      snapshot.state=landingResult.success?TRICK_STATE.COMPLETED:TRICK_STATE.FAILED;
      normalizeVisual();
    }
    pendingRampType=null;
    return landingResult;
  }

  function finishLanding(){
    if(snapshot.state!==TRICK_STATE.COMPLETED)return false;
    snapshot.state=TRICK_STATE.NONE;
    snapshot.type='';
    snapshot.progress=0;
    snapshot.rotation=0;
    snapshot.startTime=0;
    snapshot.source='';
    snapshot.completed=false;
    snapshot.landingValid=true;
    normalizeVisual();
    return true;
  }

  function reset(){
    normalizeVisual();
    snapshot.state=TRICK_STATE.NONE;
    snapshot.type='';
    snapshot.progress=0;
    snapshot.rotation=0;
    snapshot.startTime=0;
    snapshot.source='';
    snapshot.completed=false;
    snapshot.landingValid=true;
    pendingRampType=null;
  }

  if(visualTarget)setVisualTarget(visualTarget);
  return {state:snapshot,setVisualTarget,start,armRamp,consumeRampArm,clearRampArm,startSecondPress360,step,land,finishLanding,reset};
}
