import * as THREE from 'three';
import {
  TRICK_LANDING_SAFETY_MARGIN,
  TRICK_TIMING,
  estimateRemainingAirTime,
  evaluateTrickTiming,
  getTrickDefinition,
  getTrickRotationRadians
} from './trickTiming.js';

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
  SPIN_360_DEGREES_PER_SECOND:TRICK_TIMING[TRICK_TYPE.SPIN_360].degreesPerSecond,
  BACKFLIP_DEGREES_PER_SECOND:TRICK_TIMING[TRICK_TYPE.BACKFLIP].degreesPerSecond,
  LANDING_SAFETY_MARGIN:TRICK_LANDING_SAFETY_MARGIN,
  COMPLETE_EPSILON_DEGREES:8
});

const SPEED={
  [TRICK_TYPE.SPIN_360]:THREE.MathUtils.degToRad(TRICK_TUNING.SPIN_360_DEGREES_PER_SECOND),
  [TRICK_TYPE.BACKFLIP]:THREE.MathUtils.degToRad(TRICK_TUNING.BACKFLIP_DEGREES_PER_SECOND)
};
const TARGET_ROTATION={
  [TRICK_TYPE.SPIN_360]:getTrickRotationRadians(TRICK_TYPE.SPIN_360),
  [TRICK_TYPE.BACKFLIP]:getTrickRotationRadians(TRICK_TYPE.BACKFLIP)
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
    targetRotation:0,
    landingAlignmentError:0,
    startTime:0,
    source:'',
    completed:false,
    landingValid:true,
    tricksThisAir:0,
    remainingAirTime:0,
    trickAllowed:false,
    pendingTrick:'',
    lastCompletedType:'',
    lastRejectedType:'',
    rejectionReason:''
  };
  let visualPivot=null;
  let pendingRampType=null;
  let completion=null;
  let completionId=0;
  let previousAir=false;

  function isActive(){
    return snapshot.state===TRICK_STATE.SPIN_360||snapshot.state===TRICK_STATE.BACKFLIP;
  }

  function normalizeVisual(){
    if(visualPivot?.quaternion)visualPivot.quaternion.copy(baseQuaternion);
  }

  function setVisualTarget(next){
    normalizeVisual();
    visualPivot=next||null;
    if(visualPivot?.quaternion)baseQuaternion.copy(visualPivot.quaternion);
    else baseQuaternion.identity();
    if(isActive())applyVisual();
  }

  function applyVisual(){
    if(!visualPivot?.quaternion||!isActive())return;
    const definition=getTrickDefinition(snapshot.type);
    const axis=definition?.axis==='x'?axisX:axisY;
    // In this rider/camera coordinate frame positive X is the backward somersault
    // direction. Definitions keep axis/direction data centralized for future tricks.
    const angle=snapshot.rotation*(definition?.direction??1);
    trickQuaternion.setFromAxisAngle(axis,angle);
    visualPivot.quaternion.copy(baseQuaternion).multiply(trickQuaternion);
  }

  function beginAirIfNeeded(physicsState){
    const air=!!physicsState?.air;
    if(air&&!previousAir){
      snapshot.tricksThisAir=0;
      snapshot.lastCompletedType='';
      snapshot.lastRejectedType='';
      snapshot.rejectionReason='';
    }
    previousAir=air;
  }

  function updateTiming(physicsState,{landingHeight=0,gravity}={}){
    beginAirIfNeeded(physicsState);
    snapshot.remainingAirTime=estimateRemainingAirTime(physicsState,{landingHeight,gravity});
    if(!physicsState?.air){
      snapshot.trickAllowed=false;
      snapshot.remainingAirTime=0;
    }
    return snapshot.remainingAirTime;
  }

  function evaluateStart(type,physicsState,{landingHeight=0,gravity,landingSafetyMargin=TRICK_LANDING_SAFETY_MARGIN}={}){
    beginAirIfNeeded(physicsState);
    const timing=evaluateTrickTiming(type,physicsState,{landingHeight,gravity,landingSafetyMargin});
    snapshot.remainingAirTime=timing.remainingAirTime;
    snapshot.trickAllowed=!isActive()&&timing.allowed;
    snapshot.lastRejectedType='';
    snapshot.rejectionReason='';
    if(isActive()){
      snapshot.trickAllowed=false;
      snapshot.lastRejectedType=type||'';
      snapshot.rejectionReason='busy';
    }else if(!timing.allowed){
      snapshot.lastRejectedType=type||'';
      snapshot.rejectionReason=physicsState?.air?'insufficient-airtime':'not-airborne';
    }
    return {...timing,allowed:snapshot.trickAllowed};
  }

  function start(type,{
    source='manual',
    startTime=0,
    physicsState=null,
    landingHeight=0,
    gravity,
    landingSafetyMargin=TRICK_LANDING_SAFETY_MARGIN
  }={}){
    if(!SPEED[type]||!Number.isFinite(TARGET_ROTATION[type])){
      snapshot.trickAllowed=false;
      snapshot.lastRejectedType=type||'';
      snapshot.rejectionReason='unknown-trick';
      return false;
    }
    const timing=evaluateStart(type,physicsState,{landingHeight,gravity,landingSafetyMargin});
    if(!timing.allowed)return false;

    snapshot.state=activeState(type);
    snapshot.type=type;
    snapshot.progress=0;
    snapshot.rotation=0;
    snapshot.targetRotation=TARGET_ROTATION[type];
    snapshot.landingAlignmentError=0;
    snapshot.startTime=Number(startTime)||0;
    snapshot.source=source||'manual';
    snapshot.completed=false;
    snapshot.landingValid=true;
    snapshot.trickAllowed=true;
    normalizeVisual();
    return true;
  }

  function requestAirborne(type,physicsState,options={}){
    if(!physicsState?.air)return false;
    // Consume the airborne Jump request regardless of acceptance. This prevents
    // rejected/late trick input from surviving as a landing bounce/double jump.
    physicsState.jumpBufferTime=0;
    physicsState.jumpBuffered=false;
    return start(type,{
      ...options,
      source:options.source||physicsState.jumpSource||'manual',
      startTime:options.startTime??physicsState.time??0,
      physicsState
    });
  }

  function startSecondPress360(physicsState,options={}){
    return requestAirborne(TRICK_TYPE.SPIN_360,physicsState,options);
  }

  function armRamp(type){
    if(isActive()||!SPEED[type])return false;
    pendingRampType=type;
    snapshot.pendingTrick=type;
    return true;
  }

  function consumeRampArm(){
    const type=pendingRampType;
    pendingRampType=null;
    snapshot.pendingTrick='';
    return type;
  }

  function clearRampArm(){
    pendingRampType=null;
    snapshot.pendingTrick='';
  }

  function completeActive(){
    const completedType=snapshot.type;
    const completedSource=snapshot.source;
    const completedStartTime=snapshot.startTime;
    snapshot.rotation=snapshot.targetRotation||TAU;
    snapshot.progress=1;
    snapshot.completed=true;
    snapshot.state=TRICK_STATE.COMPLETED;
    applyVisual();
    normalizeVisual();

    snapshot.tricksThisAir++;
    snapshot.lastCompletedType=completedType;
    completion={
      id:++completionId,
      type:completedType,
      source:completedSource,
      startTime:completedStartTime
    };

    // A full rotation is equivalent to neutral. Reset the pivot and active
    // rotation immediately so another trick may begin in the same airtime.
    snapshot.state=TRICK_STATE.NONE;
    snapshot.type='';
    snapshot.progress=0;
    snapshot.rotation=0;
    snapshot.targetRotation=0;
    snapshot.landingAlignmentError=0;
    snapshot.startTime=0;
    snapshot.source='';
    snapshot.completed=false;
    snapshot.landingValid=true;
    snapshot.trickAllowed=false;
  }

  function step(dt){
    if(!isActive())return snapshot;
    const target=Math.max(.001,snapshot.targetRotation||TARGET_ROTATION[snapshot.type]||TAU);
    snapshot.rotation=Math.min(target,snapshot.rotation+SPEED[snapshot.type]*Math.max(0,Number(dt)||0));
    snapshot.progress=Math.min(1,snapshot.rotation/target);
    if(snapshot.rotation>=target-COMPLETE_EPSILON)completeActive();
    else applyVisual();
    return snapshot;
  }

  function consumeCompletion(){
    const event=completion;
    completion=null;
    return event;
  }

  function land({jumpSource=''}={}){
    const active=isActive();
    const target=Math.max(.001,snapshot.targetRotation||TARGET_ROTATION[snapshot.type]||TAU);
    const modulo=active?((snapshot.rotation%TAU)+TAU)%TAU:0;
    const alignmentError=active?Math.min(modulo,TAU-modulo):0;
    const alignmentErrorDegrees=THREE.MathUtils.radToDeg(alignmentError);
    const salvageable=active&&snapshot.progress>=.86&&alignmentErrorDegrees<=34;
    const interrupted=active&&!salvageable;
    const roughLanding=active&&salvageable;
    const result={
      hadTrick:snapshot.tricksThisAir>0||active,
      success:!interrupted,
      interrupted,
      rough:roughLanding,
      type:active?snapshot.type:snapshot.lastCompletedType,
      source:active?snapshot.source:jumpSource,
      completed:!active,
      landingValid:!interrupted,
      landingGrade:roughLanding?'rough':'',
      alignmentErrorDegrees,
      progress:active?snapshot.progress:1,
      targetRotation:target,
      reason:interrupted?'landing-interruption':roughLanding?'under-rotated':''
    };

    clearRampArm();
    snapshot.remainingAirTime=0;
    snapshot.trickAllowed=false;
    snapshot.landingAlignmentError=alignmentErrorDegrees;
    previousAir=false;

    if(interrupted){
      snapshot.state=TRICK_STATE.FAILED;
      snapshot.completed=false;
      snapshot.landingValid=false;
      snapshot.lastRejectedType=snapshot.type;
      snapshot.rejectionReason='landing-interruption';
      normalizeVisual();
    }else{
      snapshot.state=TRICK_STATE.NONE;
      snapshot.type='';
      snapshot.progress=0;
      snapshot.rotation=0;
      snapshot.targetRotation=0;
      snapshot.startTime=0;
      snapshot.source='';
      snapshot.completed=false;
      snapshot.landingValid=true;
      snapshot.tricksThisAir=0;
      normalizeVisual();
    }
    return result;
  }

  function finishLanding(){
    const wasTerminal=snapshot.state===TRICK_STATE.COMPLETED||snapshot.state===TRICK_STATE.FAILED;
    snapshot.state=TRICK_STATE.NONE;
    snapshot.type='';
    snapshot.progress=0;
    snapshot.rotation=0;
    snapshot.targetRotation=0;
    snapshot.landingAlignmentError=0;
    snapshot.startTime=0;
    snapshot.source='';
    snapshot.completed=false;
    snapshot.landingValid=true;
    snapshot.tricksThisAir=0;
    snapshot.remainingAirTime=0;
    snapshot.trickAllowed=false;
    snapshot.lastRejectedType='';
    snapshot.rejectionReason='';
    normalizeVisual();
    return wasTerminal;
  }

  function abort({reason='interrupted'}={}){
    if(!isActive()){
      clearRampArm();
      return null;
    }
    const result={
      hadTrick:true,
      success:false,
      interrupted:true,
      type:snapshot.type,
      source:snapshot.source,
      completed:false,
      landingValid:false,
      reason
    };
    snapshot.state=TRICK_STATE.FAILED;
    snapshot.completed=false;
    snapshot.landingValid=false;
    snapshot.trickAllowed=false;
    snapshot.lastRejectedType=snapshot.type;
    snapshot.rejectionReason=reason;
    clearRampArm();
    normalizeVisual();
    return result;
  }

  function getSnapshot(){
    return {...snapshot};
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
    snapshot.tricksThisAir=0;
    snapshot.remainingAirTime=0;
    snapshot.trickAllowed=false;
    snapshot.pendingTrick='';
    snapshot.lastCompletedType='';
    snapshot.lastRejectedType='';
    snapshot.rejectionReason='';
    pendingRampType=null;
    completion=null;
    previousAir=false;
  }

  if(visualTarget)setVisualTarget(visualTarget);
  return {
    state:snapshot,
    setVisualTarget,
    start,
    requestAirborne,
    startSecondPress360,
    armRamp,
    consumeRampArm,
    clearRampArm,
    updateTiming,
    evaluateStart,
    step,
    consumeCompletion,
    land,
    finishLanding,
    abort,
    reset,
    getSnapshot
  };
}
