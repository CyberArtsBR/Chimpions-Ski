import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSkiCamera,predictAirborneLanding,SKI_CAMERA_LIMITS as LIMITS} from '../src/skiCamera.js';
import {createStartCameraSequence,START_CAMERA_FRONT_HOLD_MS,START_CAMERA_ROTATE_MS,START_CAMERA_SEQUENCE_MS} from '../src/startCameraSequence.js';
import {SKI_TUNING as T} from '../src/gameplayTuning.js';
import {RIDE_MODE,getRideProfile} from '../src/rideMode.js';
import {createFallbackSkier} from '../src/skier.js';

function makeState(overrides={}){
  return {
    mode:'playing',rideMode:RIDE_MODE.SKI,
    speed:T.BASE_SPEED,x:0,vx:0,edge:0,heading:0,
    y:.12,vy:0,air:false,jumpSource:'',landingPulse:0,
    landingQuality:'none',centerGround:0,groundRoll:0,crashTime:0,crashDirection:0,
    ...overrides
  };
}

function makeRig(){
  const camera=new THREE.PerspectiveCamera(55,16/9,.1,280);
  camera.position.set(0,6.1,10.5);
  camera.lookAt(0,1,-12);
  const skiCamera=createSkiCamera(camera);
  return {camera,skiCamera};
}

function assertFiniteCamera(camera,message){
  assert(Number.isFinite(camera.position.x),message+' x');
  assert(Number.isFinite(camera.position.y),message+' y');
  assert(Number.isFinite(camera.position.z),message+' z');
  assert(Number.isFinite(camera.quaternion.x),message+' qx');
  assert(Number.isFinite(camera.quaternion.y),message+' qy');
  assert(Number.isFinite(camera.quaternion.z),message+' qz');
  assert(Number.isFinite(camera.quaternion.w),message+' qw');
  assert(Number.isFinite(camera.fov),message+' fov');
}

// Closed-form prediction should use current physics state without running a duplicate simulation.
{
  const ramp=predictAirborneLanding(makeState({
    air:true,jumpSource:'ramp',speed:T.MAX_SPEED,y:6.5,vy:3.2,vx:8,x:3
  }));
  assert.equal(ramp.active,true);
  assert(ramp.time>0&&ramp.time<=LIMITS.MAX_PREDICTION_TIME,'prediction time escaped bounds');
  assert(ramp.forwardLead>0&&ramp.forwardLead<=LIMITS.MAX_LANDING_LEAD,'forward landing preview escaped bounds');
  assert(Math.abs(ramp.lateralLead)<=LIMITS.MAX_LATERAL_LANDING_LEAD+1e-9,'lateral landing preview escaped bounds');
  assert(ramp.lookDown>=0&&ramp.lookDown<=.72,'look-down preview escaped bounds');
  assert.equal(predictAirborneLanding(makeState()).active,false,'grounded state produced airborne prediction');
}

// Ski and Snowboard frames remain finite and FOV-bounded at opening and max speed.
for(const mode of [RIDE_MODE.SKI,RIDE_MODE.SNOWBOARD]){
  const profile=getRideProfile(mode);
  for(const speed of [profile.baseSpeed,profile.maxSpeed]){
    const {camera,skiCamera}=makeRig();
    const state=makeState({rideMode:mode,speed,air:true,jumpSource:'ramp',y:7.4,vy:-5.5,vx:9.5,x:5.5,edge:1,groundRoll:.5});
    for(let i=0;i<180;i++)skiCamera.update(state,1/120);
    const diagnostics=skiCamera.getDiagnostics();
    assertFiniteCamera(camera,mode+' camera');
    assert(camera.fov>=LIMITS.MIN_FOV-1e-9&&camera.fov<=LIMITS.MAX_FOV+1e-9,mode+' FOV escaped bounds');
    assert(Math.abs(diagnostics.roll)<=LIMITS.MAX_GAMEPLAY_ROLL+1e-9,mode+' roll escaped gameplay bounds');
    assert(diagnostics.airborneLookBlend>.1,mode+' airborne lookahead never engaged');
  }
}

// Waist view follows lateral travel without steering the horizon. Both ride
// modes keep their equipment tips on screen while the rider body can be hidden.
for(const mode of [RIDE_MODE.SKI,RIDE_MODE.SNOWBOARD]){
  const {camera,skiCamera}=makeRig();
  const rider=createFallbackSkier({rideMode:mode});
  rider.position.set(0,.12,2.2);
  rider.updateMatrixWorld(true);
  skiCamera.setViewMode('first-person');
  const state=makeState({rideMode:mode,speed:41});
  for(let i=0;i<15;i++)skiCamera.update(state,1/60);
  assert.equal(camera.position.y,1.05,'first-person view is above waist height');
  const equipment=mode===RIDE_MODE.SKI?rider.userData.skis[0]:rider.getObjectByName('snowboard-equipment');
  const tip=equipment.localToWorld(new THREE.Vector3(0,0,-1.06)).project(camera);
  assert(Math.abs(tip.x)<1&&tip.y>-1&&tip.y<0,'ski or snowboard tip is outside the first-person frame');
  assert(rider.userData.firstPersonBody,'rider body cannot be hidden while keeping equipment visible');
  const forward=camera.getWorldDirection(new THREE.Vector3());
  for(const [x,heading] of [[-8,-.44],[8,.44],[0,0]]){
    skiCamera.update({...state,x,heading,edge:Math.sign(heading),groundPitch:heading*.25},1/60);
    assert.equal(camera.position.x,x,'first-person camera did not move sideways with the rider');
    assert(camera.getWorldDirection(new THREE.Vector3()).distanceTo(forward)<1e-9,'first-person camera turns away from downhill');
  }
}

// Airborne lookahead must blend in and recover gradually after landing, not snap.
{
  const {skiCamera}=makeRig();
  const state=makeState({air:true,jumpSource:'ramp',speed:T.MAX_SPEED,y:8.2,vy:4.5,vx:7,x:2.5});
  skiCamera.update(state,1/60);
  const first=skiCamera.getDiagnostics();
  assert(first.airborneLookBlend>0&&first.airborneLookBlend<1,'airborne lookahead did not interpolate on entry');
  for(let i=0;i<45;i++)skiCamera.update(state,1/60);
  const airborne=skiCamera.getDiagnostics();
  assert(airborne.airborneLookBlend>first.airborneLookBlend,'airborne lookahead failed to build smoothly');
  assert(airborne.previewForwardLead>0,'landing preview did not move forward');

  state.air=false;
  state.y=.12;
  state.vy=0;
  state.jumpSource='';
  state.landingPulse=.4;
  skiCamera.update(state,1/60);
  const landing=skiCamera.getDiagnostics();
  assert(landing.airborneLookBlend>0,'landing recovery snapped airborne lookahead to zero');
  assert(landing.airborneLookBlend<airborne.airborneLookBlend,'landing recovery failed to start settling');
  for(let i=0;i<180;i++)skiCamera.update(state,1/60);
  assert(skiCamera.getDiagnostics().airborneLookBlend<.01,'landing recovery did not settle');
}

// FOV and roll stay bounded even if upstream state or camera values are temporarily invalid/extreme.
{
  const {camera,skiCamera}=makeRig();
  camera.fov=NaN;
  camera.position.set(NaN,Infinity,-Infinity);
  const state=makeState({speed:9999,edge:50,groundRoll:50,x:999,vx:999,heading:999});
  skiCamera.update(state,1/60);
  assertFiniteCamera(camera,'sanitized camera');
  assert(camera.fov>=LIMITS.MIN_FOV&&camera.fov<=LIMITS.MAX_FOV,'sanitized FOV escaped bounds');
  assert(Math.abs(skiCamera.getDiagnostics().roll)<=LIMITS.MAX_GAMEPLAY_ROLL+1e-9,'sanitized roll escaped bounds');
}

// Reduced motion lowers decorative landing/roll intensity without disabling landing lookahead.
{
  const normal=makeRig();
  const reduced=makeRig();
  reduced.skiCamera.setReducedMotion(true);
  const state=makeState({air:false,speed:T.MAX_SPEED,edge:1,groundRoll:.3,landingPulse:.5,landingQuality:'hard'});
  normal.skiCamera.update({...state},1/60);
  reduced.skiCamera.update({...state},1/60);
  const normalDiag=normal.skiCamera.getDiagnostics();
  const reducedDiag=reduced.skiCamera.getDiagnostics();
  assert(Math.abs(reducedDiag.roll)<Math.abs(normalDiag.roll),'reduced motion did not reduce roll');
  assert(Math.abs(reducedDiag.landingKick)<Math.abs(normalDiag.landingKick),'reduced motion did not reduce landing kick');
  assert.equal(reducedDiag.motionScale,LIMITS.REDUCED_MOTION_SCALE,'reduced motion hook used unexpected scale');
}

// Reset clears temporal camera state for restart / fast restart.
{
  const {camera,skiCamera}=makeRig();
  const state=makeState({air:true,jumpSource:'ramp',speed:T.MAX_SPEED,y:9,vy:-2,vx:5,x:4,edge:1});
  for(let i=0;i<30;i++)skiCamera.update(state,1/60);
  assert(skiCamera.getDiagnostics().airborneLookBlend>0,'test setup failed to engage airborne camera');
  skiCamera.reset();
  const reset=skiCamera.getDiagnostics();
  assert.equal(reset.airborneLookBlend,0,'restart retained airborne lookahead state');
  assert.equal(reset.landingKick,0,'restart retained landing kick');
  assert.equal(reset.roll,0,'restart retained roll');
  const ground=makeState();
  skiCamera.update(ground,1/60);
  assertFiniteCamera(camera,'post-reset camera');
}

assert.equal(
  START_CAMERA_SEQUENCE_MS,
  START_CAMERA_FRONT_HOLD_MS+START_CAMERA_ROTATE_MS,
  'start-camera wall-clock safety duration drifted from presentation duration'
);

// Start hero camera remains compatible with the chase frame and hands off cleanly to gameplay.
{
  const {camera,skiCamera}=makeRig();
  const player=new THREE.Group();
  player.position.set(0,.12,2.2);
  const start=createStartCameraSequence({camera,skiCamera,player});
  const state=makeState({mode:'countdown'});
  start.begin(state,1000);
  assert.equal(start.phase,'front-hold');
  assert.equal(start.update(state,1000+START_CAMERA_FRONT_HOLD_MS-1),true,'front hold ended early');
  assert.equal(start.update(state,1000+START_CAMERA_FRONT_HOLD_MS+START_CAMERA_ROTATE_MS*.5),true,'hero rotation ended early');
  assertFiniteCamera(camera,'start rotation camera');
  assert.equal(start.update(state,1000+START_CAMERA_FRONT_HOLD_MS+START_CAMERA_ROTATE_MS+1),false,'start camera failed to hand off');
  assert.equal(start.phase,'ready');
  state.mode='playing';
  skiCamera.update(state,1/60);
  assertFiniteCamera(camera,'gameplay handoff camera');
  assert(camera.fov>=LIMITS.MIN_FOV&&camera.fov<=LIMITS.MAX_FOV,'gameplay handoff FOV escaped bounds');
}

console.log('Ski camera invariants OK');
