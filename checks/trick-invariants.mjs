import assert from 'node:assert/strict';
import * as THREE from 'three';
import {updateJumpAssist,tryManualJump,stepAir,launchRamp} from '../src/skiPhysics.js';
import {readTrickIntent} from '../src/trickInput.js';
import {createTrickSystem,TRICK_STATE,TRICK_TYPE,TRICK_TUNING} from '../src/trickSystem.js';
import {announceTrickStart,resetTrickScoring,scoreTrickLanding,TRICK_POINTS} from '../src/trickScoring.js';

const DT=1/180;
const GROUND_Y=.12;

function makePhysicsState(){
  return {
    mode:'playing',time:0,score:0,speed:44.4444,x:0,vx:0,heading:0,turnRate:0,
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

function settleJump({source,type}){
  const state=makePhysicsState();
  resetTrickScoring(state);
  const {tricks}=makeRig();
  if(source==='ramp')assert.equal(launchRamp(state,0),true,'ramp should launch');
  else beginManual(state);
  assert.equal(tricks.start(type,{source,startTime:state.time}),true,'trick should start');
  announceTrickStart(state,type,source);
  let landingResult=null;
  for(let i=0;i<1200;i++){
    state.time+=DT;
    const landingSource=state.jumpSource;
    tricks.step(DT);
    const landing=stepAir(state,DT,GROUND_Y);
    if(landing.landed){
      landingResult=tricks.land({jumpSource:landingSource});
      scoreTrickLanding(state,landingResult);
      break;
    }
  }
  assert(landingResult,'jump never landed');
  return {state,tricks,landingResult};
}

// A. Normal Jump = normal jump, no trick.
{
  const keys=new Set();
  const state=makePhysicsState();
  const {tricks}=makeRig();
  assert.equal(readTrickIntent(keys,{axisY:0,dpad:{}}),null);
  beginManual(state);
  assert.equal(tricks.state.state,TRICK_STATE.NONE);
  assert.equal(state.jumpSource,'manual');
}

// B. DOWN + Jump from manual jump starts 360.
{
  const intent=readTrickIntent(new Set(['ArrowDown']),{axisY:0,dpad:{}});
  assert.equal(intent,TRICK_TYPE.SPIN_360);
  const state=makePhysicsState();
  const {tricks}=makeRig();
  beginManual(state);
  assert.equal(tricks.start(intent,{source:state.jumpSource,startTime:state.time}),true);
  assert.equal(tricks.state.state,TRICK_STATE.SPIN_360);
}

assert.equal(readTrickIntent(new Set(),{axisY:-1,dpad:{}}),TRICK_TYPE.BACKFLIP);
assert.equal(readTrickIntent(new Set(),{axisY:1,dpad:{}}),TRICK_TYPE.SPIN_360);

// C/K. Second Jump airborne starts 360 but does not add vertical velocity or double-jump.
{
  const state=makePhysicsState();
  const {tricks}=makeRig();
  beginManual(state);
  stepAir(state,DT,GROUND_Y);
  const beforeVy=state.vy;
  updateJumpAssist(state,true,DT);
  assert.equal(tricks.startSecondPress360(state),true);
  assert.equal(state.vy,beforeVy,'second press changed vertical velocity');
  assert.equal(state.jumpBufferTime,0,'second press left a buffered jump');
  assert.equal(tryManualJump(state,GROUND_Y),false,'airborne second press became a double jump');
  assert.equal(state.vy,beforeVy,'failed double-jump attempt changed vy');
}

// D/I. 360 manual jump completes and awards +200.
{
  const {state,landingResult}=settleJump({source:'manual',type:TRICK_TYPE.SPIN_360});
  assert.equal(landingResult.success,true);
  assert.equal(state.trickPoints,TRICK_POINTS['360']);
  assert.equal(state.trickPoints,200);
  assert.equal(state.score,200);
}

// E. 360 ramp jump completes.
{
  const {landingResult}=settleJump({source:'ramp',type:TRICK_TYPE.SPIN_360});
  assert.equal(landingResult.success,true);
}

// F/H. Manual-jump backflip starts but landing fails and scores 0.
{
  const {state,tricks,landingResult}=settleJump({source:'manual',type:TRICK_TYPE.BACKFLIP});
  assert.equal(landingResult.success,false);
  assert.equal(landingResult.landingValid,false);
  assert.equal(tricks.state.state,TRICK_STATE.FAILED);
  assert.equal(state.trickPoints,0);
  assert.equal(state.score,0);
  assert.equal(state.failedTrick,true);
}

// G/J. Ramp backflip completes and awards +400.
{
  const {state,landingResult}=settleJump({source:'ramp',type:TRICK_TYPE.BACKFLIP});
  assert.equal(landingResult.success,true);
  assert.equal(landingResult.landingValid,true);
  assert.equal(state.trickPoints,TRICK_POINTS.BACKFLIP);
  assert.equal(state.trickPoints,400);
  assert.equal(state.score,400);
}

// L. Trick rotation is isolated to rider visual; gameplay root/heading stay untouched.
{
  const state=makePhysicsState();
  state.heading=.23;
  const {player,visual,tricks}=makeRig();
  const playerBefore=player.quaternion.clone();
  beginManual(state);
  tricks.start(TRICK_TYPE.SPIN_360,{source:'manual'});
  tricks.step(.25);
  assert(player.quaternion.equals(playerBefore),'collision/gameplay root rotated with trick');
  assert.equal(state.heading,.23,'gameplay heading changed with trick');
  assert.notEqual(visual.quaternion.y,0,'rider visual did not rotate');
}

assert(TRICK_TUNING.SPIN_360_DEGREES_PER_SECOND>=580&&TRICK_TUNING.SPIN_360_DEGREES_PER_SECOND<=650);
assert.equal(TRICK_TUNING.BACKFLIP_DEGREES_PER_SECOND,300);

console.log(JSON.stringify({
  check:'trick-invariants',
  controls:{normal:'SPACE/A',backflip:'UP + SPACE/A',spin:'DOWN + SPACE/A or second airborne SPACE/A'},
  angularSpeedDegPerSec:{spin360:TRICK_TUNING.SPIN_360_DEGREES_PER_SECOND,backflip:TRICK_TUNING.BACKFLIP_DEGREES_PER_SECOND},
  points:TRICK_POINTS
}));
