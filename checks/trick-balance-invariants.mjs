#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SKI_TUNING as T} from '../src/gameplayTuning.js';
import {getRideProfile} from '../src/rideMode.js';
import {getCourseLookahead} from '../src/courseStreaming.js';
import {updateJumpAssist,tryManualJump,launchRamp} from '../src/skiPhysics.js';
import {createTrickSystem,TRICK_TYPE} from '../src/trickSystem.js';
import {STYLE_HOLD_TIMING,evaluateStyleHoldTiming,evaluateTrickTiming} from '../src/trickTiming.js';

const results=[];
const add=(name,detail)=>{results.push({name,status:'PASS',detail});console.log('PASS    '+name+': '+detail);};
const near=(a,b,t=.03)=>Number.isFinite(a)&&Math.abs(a-b)<=t;
const GROUND_Y=.12;
const DT=1/180;

const ski=getRideProfile('ski');
const snowboard=getRideProfile('snowboard');
assert(near(ski.baseSpeed*3.6,150));
assert(near(snowboard.baseSpeed*3.6,150));
assert(near(ski.tierIncrement*3.6,10));
assert.equal(ski.tierSeconds,30);
assert(near(ski.maxSpeed*3.6,300));
assert.equal(snowboard.tierIncrement,ski.tierIncrement);
assert.equal(snowboard.tierSeconds,ski.tierSeconds);
assert.equal(snowboard.maxSpeed,ski.maxSpeed);
add('SKI 150/+10/30s/300','current ski speed contract');
add('SNOWBOARD 150/+10/30s/300','current snowboard speed contract');

function makeState(speed=T.BASE_SPEED){
  return {
    mode:'playing',time:0,rideMode:'ski',speed,
    x:0,vx:0,heading:0,turnRate:0,
    y:GROUND_Y,vy:0,air:false,grounded:true,jumping:false,
    jumpSource:'',jumpVelocity:0,jumpBufferTime:0,jumpBuffered:false,
    jumpInputHeld:true,jumpHoldTime:0,jumpCutApplied:false,
    coyoteTime:.075,landingPulse:0,landingQuality:'none',
    landingReengageTime:0,landingGripLoss:0,rampGrace:0
  };
}

const manual=makeState();
updateJumpAssist(manual,true,DT,true);
assert.equal(tryManualJump(manual,GROUND_Y),true,'manual jump must launch');
const manual360=evaluateTrickTiming(TRICK_TYPE.SPIN_360,manual,{landingHeight:GROUND_Y,gravity:T.GRAVITY});
const manualBackflip=evaluateTrickTiming(TRICK_TYPE.BACKFLIP,manual,{landingHeight:GROUND_Y,gravity:T.GRAVITY});
assert(manual360.allowed,'early manual 360 must fit current airtime');
assert(manualBackflip.allowed,'early manual backflip must fit current airtime');
add('manual 360 possible',`required=${manual360.requiredAirTime.toFixed(4)}s available=${manual360.remainingAirTime.toFixed(4)}s`);
add('manual backflip possible',`required=${manualBackflip.requiredAirTime.toFixed(4)}s available=${manualBackflip.remainingAirTime.toFixed(4)}s`);

let minimumRampAir=Infinity;
for(const kmh of [150,180,220,260,300]){
  const state=makeState(kmh/3.6);
  assert.equal(launchRamp(state,0),true,'ramp launch must succeed');
  const timing=evaluateTrickTiming(TRICK_TYPE.BACKFLIP,state,{landingHeight:GROUND_Y,gravity:T.GRAVITY});
  minimumRampAir=Math.min(minimumRampAir,timing.remainingAirTime);
  assert(timing.allowed,`ramp backflip must fit at ${kmh} km/h`);
}
add('ramp backflip possible through 300 km/h',`minimum modeled remaining airtime=${minimumRampAir.toFixed(4)}s`);

let minimumStyleAir=Infinity;
for(const kmh of [150,180,220,260,300]){
  const state=makeState(kmh/3.6);
  assert.equal(launchRamp(state,0),true,'ramp launch must succeed');
  const timing=evaluateStyleHoldTiming(state,{landingHeight:GROUND_Y,gravity:T.GRAVITY});
  minimumStyleAir=Math.min(minimumStyleAir,timing.remainingAirTime);
  assert(timing.allowed,`style hold must fit a ramp arc at ${kmh} km/h`);
}
assert(STYLE_HOLD_TIMING.autoReleaseAirTime>=.14,'style hold landing release window became too small');
add('style hold safe through 300 km/h',`minimum modeled remaining airtime=${minimumStyleAir.toFixed(4)}s auto-release=${STYLE_HOLD_TIMING.autoReleaseAirTime.toFixed(2)}s`);

{
  const state=makeState();
  updateJumpAssist(state,true,DT,true);
  assert.equal(tryManualJump(state,GROUND_Y),true);
  state.jumpBufferTime=.1;
  state.jumpBuffered=true;
  const beforeVy=state.vy;
  const tricks=createTrickSystem();
  assert.equal(tricks.requestAirborne(TRICK_TYPE.SPIN_360,state,{
    landingHeight:GROUND_Y,gravity:T.GRAVITY,startTime:state.time
  }),true,'second airborne jump should route to timing-gated 360');
  assert.equal(state.vy,beforeVy,'airborne trick request must not add vertical boost');
  assert.equal(state.jumpBufferTime,0,'airborne trick request must consume jump buffer time');
  assert.equal(state.jumpBuffered,false,'airborne trick request must consume buffered jump flag');
}
add('second-jump 360 safety','request is timing-gated, consumes buffer, and does not boost vy');

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
assert(T.PHYSICS_SUBSTEP_SECONDS<=1/180+1e-12,'physics substep ceiling must remain <= 1/180s');
assert(main.includes('previousApproachDepth>-1.42&&approachDepth<=-1.42'),'ramp lip must use crossing detection');
add('300 km/h collision integration guards',`substep=${T.PHYSICS_SUBSTEP_SECONDS.toFixed(6)}s crossing=true`);

const lookahead=getCourseLookahead(T.MAX_SPEED);
const aheadSeconds=lookahead/T.MAX_SPEED;
assert.equal(lookahead,T.COURSE_LOOKAHEAD_MAX,'max-speed lookahead should reach configured cap');
assert(aheadSeconds>=8.5,'300 km/h course lookahead became too short');
add('300 km/h course lookahead contract',`${lookahead.toFixed(1)}m = ${aheadSeconds.toFixed(2)}s at 300 km/h`);

const physics=readFileSync(new URL('../src/skiPhysics.js',import.meta.url),'utf8');
const progressBlock=physics.slice(physics.indexOf('export function progressSpeed'),physics.indexOf('function stepAirControl'));
const landingBlock=physics.slice(physics.indexOf('export function stepAir'),physics.indexOf('export function launchRamp'));
assert(progressBlock.includes('profile.maxSpeed')&&progressBlock.includes('profile.baseSpeed')&&progressBlock.includes('profile.tierIncrement'),'speed progression must use ride profile');
assert(landingBlock.includes('rideProfile.maxSpeed')&&landingBlock.includes('rideProfile.baseSpeed'),'landing speed bounds must use ride profile');
assert(!/\b(?:210|230)\b|58\.3333|63\.8889/.test(progressBlock+landingBlock),'legacy speed clamps remain in physics');
add('no legacy speed clamps','progression and landing outcomes use current ride profile bounds');

console.log(JSON.stringify({check:'trick-balance-invariants',pass:results.length,pending:0,fail:0,results}));
