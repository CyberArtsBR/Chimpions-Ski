import assert from 'node:assert/strict';
import {RIDER_ANIMATION_STATE,createRiderAnimationStateMachine} from '../src/riderAnimationState.js';
import {createRiderPoseController} from '../src/riderPoseController.js';

const machine=createRiderAnimationStateMachine();
assert.equal(machine.update({mode:'countdown',dt:.1}).state,RIDER_ANIMATION_STATE.READY);
for(let i=0;i<4;i++)machine.update({mode:'countdown',dt:.1});
assert.equal(machine.state.state,RIDER_ANIMATION_STATE.START_COMPRESSION);
for(let i=0;i<6;i++)machine.update({mode:'countdown',dt:.1});
assert.equal(machine.state.state,RIDER_ANIMATION_STATE.START_RELEASE);

machine.reset();
const engagement=machine.update({dt:1/60,steer:.55,carveLoad:.25});
assert(engagement.edgeEngagement>0,'carve input produces an edge-engagement phase');
for(let i=0;i<10;i++)machine.update({dt:1/60,steer:.92,carveLoad:.95});
assert(machine.state.loadedCarve>.5,'sustained hard carve reaches a loaded phase');
const release=machine.update({dt:1/60,steer:.18,carveLoad:.18});
assert(release.release>0,'unloading a carve produces a release phase');
machine.update({dt:1/60,steer:-.65,carveLoad:.65});
const crossover=machine.update({dt:1/60,steer:.65,carveLoad:.65});
assert(crossover.crossover>0,'edge sign reversal produces a crossover phase');

machine.reset();
assert.equal(machine.update({dt:1/60,air:true,verticalVelocity:7}).state,RIDER_ANIMATION_STATE.TAKEOFF);
for(let i=0;i<8;i++)machine.update({dt:1/60,air:true,verticalVelocity:7});
assert.equal(machine.state.state,RIDER_ANIMATION_STATE.ASCENT);
assert.equal(machine.update({dt:1/60,air:true,verticalVelocity:0}).state,RIDER_ANIMATION_STATE.APEX);
assert.equal(machine.update({dt:1/60,air:true,verticalVelocity:-7}).state,RIDER_ANIMATION_STATE.DESCENT);
assert.equal(machine.update({dt:1/60,air:false,landing:.8,landingQuality:'hard'}).state,RIDER_ANIMATION_STATE.LANDING);

assert.equal(machine.update({dt:1/60,trickActive:true,trickType:'360'}).state,RIDER_ANIMATION_STATE.TRICK);
assert.equal(machine.update({dt:1/60,oilSlipTime:.6}).state,RIDER_ANIMATION_STATE.OIL_SLIP);
assert.equal(machine.update({dt:1/60,crashActive:true,mode:'crashed'}).state,RIDER_ANIMATION_STATE.CRASH);

const ski=createRiderPoseController({rideMode:'ski'});
const readyFlex=ski.update({dt:.1,mode:'countdown',steer:0,speed:40,rideMode:'ski'}).hipFlex;
for(let i=0;i<4;i++)ski.update({dt:.1,mode:'countdown',steer:0,speed:40,rideMode:'ski'});
assert(ski.pose.hipFlex>readyFlex,'start compression visibly loads the rider stance');
ski.reset('ski');
const skiPose=ski.update({dt:1/60,steer:.9,carveLoad:.9,speed:40,rideMode:'ski'});
assert(skiPose.outsideLoad>skiPose.insideFlex,'hard carve visually loads outside leg more');
assert.equal(skiPose.toeEdge,0);
assert(skiPose.skiLegIndependence>0,'ski mode preserves independent-leg animation');

ski.update({dt:1/60,steer:-.65,carveLoad:.6,speed:40,rideMode:'ski'});
const reversalPose=ski.update({dt:1/60,steer:.65,carveLoad:.6,speed:40,rideMode:'ski'});
assert(Math.abs(reversalPose.polePlant)>0,'edge reversal produces a directional pole-plant gesture');
assert(reversalPose.crossover>0,'edge reversal exposes crossover weight');

const manualJump=createRiderPoseController({rideMode:'ski'});
const rampJump=createRiderPoseController({rideMode:'ski'});
const manualAnticipation=manualJump.update({dt:1/60,jumpAnticipation:true,rampContact:false,speed:35,rideMode:'ski'}).preJumpCompression;
const rampAnticipation=rampJump.update({dt:1/60,jumpAnticipation:true,rampContact:true,speed:35,rideMode:'ski'}).preJumpCompression;
assert(rampAnticipation>manualAnticipation,'ramp takeoff anticipation is visibly larger than manual-jump anticipation');

const board=createRiderPoseController({rideMode:'snowboard'});
const toe=board.update({dt:1/60,steer:.8,carveLoad:.8,speed:35,rideMode:'snowboard'});
assert(toe.toeEdge>0&&toe.heelEdge===0,'snowboard toe edge is distinct');
assert(toe.snowboardSideOn>.7,'snowboard keeps a side-on torso bias');
assert(toe.legCoupling>.5,'snowboard legs are visually coupled rather than ski-independent');
for(let i=0;i<20;i++)board.update({dt:1/60,steer:-.8,carveLoad:.8,speed:35,rideMode:'snowboard'});
const heel=board.pose;
assert(heel.heelEdge>0,'snowboard heel edge is distinct');

const normal=ski.update({dt:1/60,air:true,verticalVelocity:0,jumpSource:'ramp',trickActive:true,trickType:'BACKFLIP',trickProgress:.5});
assert(normal.trickTuck>.4,'backflip adds body tuck');
const styled=ski.update({dt:1/60,air:true,verticalVelocity:0,jumpSource:'ramp',styleHold:1,styleSide:-1});
assert(styled.styleReach>.15&&styled.styleSide===-1,'airborne style hold produces a directional reach');
const reduced=ski.update({dt:1/60,reducedMotion:true,air:true,verticalVelocity:0});
assert(reduced.secondaryWeight<1,'reduced motion preserves critical pose while reducing secondary motion');

console.log(JSON.stringify({
  check:'rider-animation-invariants',
  states:Object.keys(RIDER_ANIMATION_STATE).length,
  carvePhases:['neutral','anticipation','engagement','loaded','release','crossover']
}));
