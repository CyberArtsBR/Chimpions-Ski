import assert from 'node:assert/strict';
import * as THREE from 'three';
import {updateJumpAssist,tryManualJump,stepAir,launchRamp} from '../src/skiPhysics.js';
import {readAirborneTrickIntent,readTrickIntent} from '../src/trickInput.js';
import {createTrickSystem,TRICK_STATE,TRICK_TYPE,TRICK_TUNING} from '../src/trickSystem.js';
import {estimateRemainingAirTime,evaluateTrickTiming} from '../src/trickTiming.js';
import {
  announceTrickStart,
  resetTrickScoring,
  scoreTrickCompletion,
  scoreTrickFailure,
  TRICK_POINTS
} from '../src/trickScoring.js';
import {SKI_TUNING as T} from '../src/gameplayTuning.js';

const DT=1/180;
const GROUND_Y=.12;

function makePhysicsState(){
  return {
    mode:'playing',time:0,score:0,rideMode:'ski',speed:T.BASE_SPEED,x:0,vx:0,heading:0,turnRate:0,
    y:GROUND_Y,vy:0,air:false,grounded:true,jumping:false,jumpSource:'',jumpVelocity:0,
    jumpBufferTime:0,jumpBuffered:false,coyoteTime:.075,landingPulse:0,landingQuality:'none',
    landingReengageTime:0,landingGripLoss:0,rampGrace:0
  };
}

function makeRig(){
  const player=new THREE.Group();
  const visual=new THREE.Group();
  player.add(visual);
  const tricks=createTrickSystem({visualTarget:visual});
  return {player,visual,tricks};
}

function beginManual(state){
  updateJumpAssist(state,true,DT);
  assert.equal(tryManualJump(state,GROUND_Y),true,'manual jump should launch');
}

function beginRamp(state){
  assert.equal(launchRamp(state,0),true,'ramp should launch');
}

function request(tricks,state,type,source=state.jumpSource||'manual'){
  return tricks.start(type,{
    source,
    startTime:state.time,
    physicsState:state,
    landingHeight:GROUND_Y,
    gravity:T.GRAVITY
  });
}

function tick(state,tricks){
  state.time+=DT;
  tricks.updateTiming(state,{landingHeight:GROUND_Y,gravity:T.GRAVITY});
  tricks.step(DT);
  const completion=tricks.consumeCompletion();
  const landingSource=state.jumpSource;
  const landing=stepAir(state,DT,GROUND_Y);
  let terminal=null;
  if(landing.landed)terminal=tricks.land({jumpSource:landingSource});
  return {completion,landing,terminal};
}

function runToCompletion(state,tricks,maxSteps=1200){
  for(let i=0;i<maxSteps;i++){
    const result=tick(state,tricks);
    if(result.completion)return result.completion;
    assert.equal(result.landing.landed,false,'trick landed before completing');
  }
  assert.fail('trick never completed');
}

function finishAir(state,tricks,maxSteps=1600){
  for(let i=0;i<maxSteps;i++){
    const result=tick(state,tricks);
    if(result.landing.landed)return result.terminal;
  }
  assert.fail('airtime never landed');
}

function advanceUntilRemainingBelow(state,tricks,threshold){
  for(let i=0;i<1200;i++){
    tricks.updateTiming(state,{landingHeight:GROUND_Y,gravity:T.GRAVITY});
    if(tricks.state.remainingAirTime<threshold)return;
    const result=tick(state,tricks);
    assert.equal(result.landing.landed,false,'landed before reaching late-input test window');
  }
  assert.fail('could not reach late-input window');
}

const manualProbe=makePhysicsState();
beginManual(manualProbe);
const manualAirtime=estimateRemainingAirTime(manualProbe,{landingHeight:GROUND_Y,gravity:T.GRAVITY});
const spinTiming=evaluateTrickTiming(TRICK_TYPE.SPIN_360,manualProbe,{landingHeight:GROUND_Y,gravity:T.GRAVITY});
const backflipTiming=evaluateTrickTiming(TRICK_TYPE.BACKFLIP,manualProbe,{landingHeight:GROUND_Y,gravity:T.GRAVITY});
assert(spinTiming.allowed,'early manual 360 must fit');
assert(backflipTiming.allowed,'early manual backflip must fit');

// A) normal simple jump, no trick.
{
  const state=makePhysicsState();
  const {tricks}=makeRig();
  resetTrickScoring(state);
  beginManual(state);
  assert.equal(readTrickIntent(new Set(),{axisY:0,dpad:{}}),null);
  const terminal=finishAir(state,tricks);
  assert.equal(terminal.interrupted,false);
  assert.equal(state.score,0);
  assert.equal(state.failedTrick,false);
}

// B) simple jump + early 360: allowed and successful.
{
  const state=makePhysicsState();
  const {tricks}=makeRig();
  resetTrickScoring(state);
  beginManual(state);
  assert.equal(request(tricks,state,TRICK_TYPE.SPIN_360),true);
  announceTrickStart(state,TRICK_TYPE.SPIN_360,'manual');
  const completion=runToCompletion(state,tricks);
  scoreTrickCompletion(state,completion);
  assert.equal(state.score,200);
  assert.equal(finishAir(state,tricks).interrupted,false);
}

// C) simple jump + late 360: rejected, no failure.
{
  const state=makePhysicsState();
  const {tricks}=makeRig();
  resetTrickScoring(state);
  beginManual(state);
  const required=spinTiming.requiredAirTime;
  advanceUntilRemainingBelow(state,tricks,required-.02);
  assert.equal(request(tricks,state,TRICK_TYPE.SPIN_360),false);
  assert.equal(tricks.state.state,TRICK_STATE.NONE);
  const terminal=finishAir(state,tricks);
  assert.equal(terminal.interrupted,false);
  assert.equal(state.failedTrick,false);
  assert.equal(state.score,0);
}

// D) simple jump + early backflip: allowed and successful.
{
  const state=makePhysicsState();
  const {tricks}=makeRig();
  resetTrickScoring(state);
  beginManual(state);
  assert.equal(request(tricks,state,TRICK_TYPE.BACKFLIP),true);
  announceTrickStart(state,TRICK_TYPE.BACKFLIP,'manual');
  const completion=runToCompletion(state,tricks);
  scoreTrickCompletion(state,completion);
  assert.equal(state.score,400);
  assert.equal(finishAir(state,tricks).interrupted,false);
}

// E) simple jump + late backflip: rejected, no failure.
{
  const state=makePhysicsState();
  const {tricks}=makeRig();
  resetTrickScoring(state);
  beginManual(state);
  advanceUntilRemainingBelow(state,tricks,backflipTiming.requiredAirTime-.02);
  assert.equal(request(tricks,state,TRICK_TYPE.BACKFLIP),false);
  assert.equal(finishAir(state,tricks).interrupted,false);
  assert.equal(state.failedTrick,false);
}

// F/N) second Jump airborne early: 360 allowed, vy unchanged, no double jump.
{
  const state=makePhysicsState();
  const {tricks}=makeRig();
  beginManual(state);
  tick(state,tricks);
  const beforeVy=state.vy;
  updateJumpAssist(state,true,DT);
  assert.equal(readAirborneTrickIntent(new Set(),{axisY:0,dpad:{}}),TRICK_TYPE.SPIN_360);
  assert.equal(tricks.requestAirborne(TRICK_TYPE.SPIN_360,state,{
    landingHeight:GROUND_Y,gravity:T.GRAVITY,startTime:state.time
  }),true);
  assert.equal(state.vy,beforeVy,'airborne trick request changed vy');
  assert.equal(state.jumpBufferTime,0,'airborne trick request left jump buffered');
  assert.equal(tryManualJump(state,GROUND_Y),false,'airborne trick request became a double jump');
  assert.equal(state.vy,beforeVy,'failed double-jump attempt changed vy');
}

// G) second Jump too late: rejected, vy unchanged.
{
  const state=makePhysicsState();
  const {tricks}=makeRig();
  beginManual(state);
  advanceUntilRemainingBelow(state,tricks,spinTiming.requiredAirTime-.03);
  const beforeVy=state.vy;
  updateJumpAssist(state,true,DT);
  assert.equal(tricks.requestAirborne(TRICK_TYPE.SPIN_360,state,{
    landingHeight:GROUND_Y,gravity:T.GRAVITY,startTime:state.time
  }),false);
  assert.equal(state.vy,beforeVy);
  assert.equal(state.jumpBufferTime,0);
  assert.equal(finishAir(state,tricks).interrupted,false);
}

// H/L/O) ramp: 360 + 360 chain, each scores once, visual normalizes between tricks.
{
  const state=makePhysicsState();
  const {visual,tricks}=makeRig();
  resetTrickScoring(state);
  beginRamp(state);
  assert.equal(request(tricks,state,TRICK_TYPE.SPIN_360,'ramp'),true);
  tricks.step(.10);
  assert(!visual.quaternion.equals(new THREE.Quaternion()),'active 360 did not rotate visual pivot');
  const first=runToCompletion(state,tricks);
  assert(visual.quaternion.equals(new THREE.Quaternion()),'visual pivot did not normalize after completed 360');
  scoreTrickCompletion(state,first);
  assert.equal(tricks.consumeCompletion(),null,'completion event emitted twice');
  assert.equal(request(tricks,state,TRICK_TYPE.SPIN_360,'ramp'),true);
  const second=runToCompletion(state,tricks);
  scoreTrickCompletion(state,second);
  assert.equal(state.score,400,'two 360s should score exactly +200 each');
  assert.equal(tricks.state.tricksThisAir,2);
}

// I) ramp: 360 + backflip chain.
{
  const state=makePhysicsState();
  const {tricks}=makeRig();
  resetTrickScoring(state);
  beginRamp(state);
  assert.equal(request(tricks,state,TRICK_TYPE.SPIN_360,'ramp'),true);
  scoreTrickCompletion(state,runToCompletion(state,tricks));
  assert.equal(request(tricks,state,TRICK_TYPE.BACKFLIP,'ramp'),true);
  scoreTrickCompletion(state,runToCompletion(state,tricks));
  assert.equal(state.score,600);
}

// J/K/M) ramp chain stops when remaining airtime is too short; rejection scores zero and lands normally.
{
  const state=makePhysicsState();
  const {tricks}=makeRig();
  resetTrickScoring(state);
  beginRamp(state);
  assert.equal(request(tricks,state,TRICK_TYPE.SPIN_360,'ramp'),true);
  scoreTrickCompletion(state,runToCompletion(state,tricks));
  assert.equal(request(tricks,state,TRICK_TYPE.BACKFLIP,'ramp'),true);
  scoreTrickCompletion(state,runToCompletion(state,tricks));
  const beforeScore=state.score;
  advanceUntilRemainingBelow(state,tricks,spinTiming.requiredAirTime-.02);
  assert.equal(request(tricks,state,TRICK_TYPE.SPIN_360,'ramp'),false);
  assert.equal(state.score,beforeScore,'rejected trick changed score');
  const terminal=finishAir(state,tricks);
  assert.equal(terminal.interrupted,false,'late rejected trick caused landing failure');
  assert.equal(state.failedTrick,false);
}

// Direction semantics: UP + Jump = 360; BACK/DOWN + Jump = backflip.
assert.equal(readTrickIntent(new Set(['ArrowUp']),{axisY:0,dpad:{}}),TRICK_TYPE.SPIN_360);
assert.equal(readTrickIntent(new Set(['KeyW']),{axisY:0,dpad:{}}),TRICK_TYPE.SPIN_360);
assert.equal(readTrickIntent(new Set(['ArrowDown']),{axisY:0,dpad:{}}),TRICK_TYPE.BACKFLIP);
assert.equal(readTrickIntent(new Set(['KeyS']),{axisY:0,dpad:{}}),TRICK_TYPE.BACKFLIP);
assert.equal(readTrickIntent(new Set(),{axisY:-1,dpad:{}}),TRICK_TYPE.SPIN_360);
assert.equal(readTrickIntent(new Set(),{axisY:1,dpad:{}}),TRICK_TYPE.BACKFLIP);
assert.equal(readAirborneTrickIntent(new Set(['ArrowUp']),{axisY:0,dpad:{}}),TRICK_TYPE.SPIN_360);
assert.equal(readAirborneTrickIntent(new Set(['ArrowDown']),{axisY:0,dpad:{}}),TRICK_TYPE.BACKFLIP);
assert.equal(readAirborneTrickIntent(new Set(),{axisY:0,dpad:{}}),TRICK_TYPE.SPIN_360);
assert.equal(TRICK_TYPE.FRONTFLIP,undefined,'front flip must not be exposed through normal trick types');

// Genuine interruption can still fail, but timing rejection does not.
{
  const state=makePhysicsState();
  const {tricks}=makeRig();
  resetTrickScoring(state);
  beginRamp(state);
  assert.equal(request(tricks,state,TRICK_TYPE.BACKFLIP,'ramp'),true);
  const failure=tricks.abort({reason:'collision'});
  assert(failure?.interrupted);
  scoreTrickFailure(state,failure);
  assert.equal(state.failedTrick,true);
  assert.equal(state.score,0);
}

// P) restart/reset clears active and pending trick state.
{
  const state=makePhysicsState();
  const {tricks}=makeRig();
  beginRamp(state);
  assert.equal(request(tricks,state,TRICK_TYPE.SPIN_360,'ramp'),true);
  tricks.armRamp(TRICK_TYPE.BACKFLIP);
  tricks.reset();
  assert.equal(tricks.state.state,TRICK_STATE.NONE);
  assert.equal(tricks.state.pendingTrick,'');
  assert.equal(tricks.state.tricksThisAir,0);
  assert.equal(tricks.state.remainingAirTime,0);
}

assert.equal(TRICK_TUNING.SPIN_360_DEGREES_PER_SECOND,760);
assert.equal(TRICK_TUNING.BACKFLIP_DEGREES_PER_SECOND,800);
assert.equal(TRICK_TUNING.LANDING_SAFETY_MARGIN,.11);

console.log(JSON.stringify({
  check:'trick-invariants',
  manualJumpAirtime:Number(manualAirtime.toFixed(4)),
  controls:{normal:'SPACE/A',spin:'UP + SPACE/A or second airborne SPACE/A',backflip:'BACK/DOWN + SPACE/A',frontflip:'not mapped'},
  angularSpeedDegPerSec:{spin360:TRICK_TUNING.SPIN_360_DEGREES_PER_SECOND,backflip:TRICK_TUNING.BACKFLIP_DEGREES_PER_SECOND},
  durationsSeconds:{spin360:Number(spinTiming.trickDuration.toFixed(4)),backflip:Number(backflipTiming.trickDuration.toFixed(4))},
  landingSafetyMargin:TRICK_TUNING.LANDING_SAFETY_MARGIN,
  latestSafeManualStartSeconds:{
    spin360:Number((manualAirtime-spinTiming.requiredAirTime).toFixed(4)),
    backflip:Number((manualAirtime-backflipTiming.requiredAirTime).toFixed(4))
  },
  points:TRICK_POINTS
}));
