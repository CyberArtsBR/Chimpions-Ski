#!/usr/bin/env node
import assert from 'node:assert/strict';
import {SKI_TUNING as T} from '../src/gameplayTuning.js';
import {getRideProfile} from '../src/rideMode.js';
import {createRunState} from '../src/runSession.js';
import {
  progressSpeed,
  stepCarving,
  updateJumpAssist,
  tryManualJump,
  stepAir
} from '../src/skiPhysics.js';
import {readPad} from '../src/input.js';
import {createTrickSystem,TRICK_TYPE} from '../src/trickSystem.js';
import {
  resetTrickScoring,
  scoreTrickCompletion,
  scoreTrickLandingBonus
} from '../src/trickScoring.js';
import {resetAirborneScoring} from '../src/airborneScoring.js';

const finiteState=state=>{
  for(const key of ['speed','x','vx','edge','heading','turnRate','carveLoad','skidRatio','edgeStability','tuckAmount','brakeAmount']){
    assert(Number.isFinite(state[key]),key+' became non-finite');
  }
};

function makeState(mode='ski',speed=null,time=0){
  const profile=getRideProfile(mode);
  const state=createRunState({mode:'playing',rideMode:mode,rideProfile:profile});
  state.time=time;
  state.speed=speed??profile.baseSpeed;
  state.maxRunSpeed=state.speed;
  return state;
}

function simulate({
  fps=60,
  seconds=3,
  mode='ski',
  speed=null,
  time=0,
  controls=()=>({steer:0,tuck:false,brake:false}),
  prepare=null
}={}){
  const state=makeState(mode,speed,time);
  prepare?.(state);
  const frameDt=1/fps;
  const frames=Math.round(seconds*fps);
  for(let frame=0;frame<frames;frame++){
    const steps=Math.max(1,Math.ceil(frameDt/T.PHYSICS_SUBSTEP_SECONDS));
    const dt=frameDt/steps;
    for(let step=0;step<steps;step++){
      const input=controls(state.time,state);
      state.time+=dt;
      progressSpeed(state,dt,input);
      stepCarving(state,input,dt);
      finiteState(state);
    }
  }
  return state;
}

// Ride identity: profiles must encode different physical personality, not just labels.
{
  const ski=getRideProfile('ski');
  const board=getRideProfile('snowboard');
  assert(ski.edgeTransferSeconds<board.edgeTransferSeconds,'SKI edge transfer should be faster');
  assert(ski.reversalResponseScale>board.reversalResponseScale,'SKI reversal should be sharper');
  assert(board.edgeHoldScale>ski.edgeHoldScale,'SNOWBOARD should hold a more committed edge');
  assert(board.snowDisplacementScale>ski.snowDisplacementScale,'SNOWBOARD should expose broader snow displacement');
}

// Tuck provides controlled speed agency without exceeding the 300 km/h cap.
{
  const neutral=simulate({seconds:3,time:60,controls:()=>({steer:0})});
  const tucked=simulate({seconds:3,time:60,controls:()=>({steer:0,tuck:true})});
  assert(tucked.speed>neutral.speed,'tuck did not improve convergence toward speed');
  assert(tucked.speed<=T.MAX_SPEED+1e-9,'tuck exceeded hard speed cap');
  assert(tucked.tuckAmount>.8,'tuck state did not converge');
}

// Brake sheds speed progressively rather than teleporting to a stop.
{
  const braked=simulate({
    seconds:2,
    time:600,
    speed:T.MAX_SPEED,
    controls:()=>({steer:.55,brake:true})
  });
  assert(braked.speed<T.MAX_SPEED-12,'brake did not shed meaningful speed');
  assert(braked.speed>T.BASE_SPEED*T.BRAKE_MIN_SPEED_SCALE-.05,'brake crossed configured low-speed floor');
  assert(braked.brakeAmount>.9,'brake state did not converge');
  assert(braked.skidRatio>.15,'brake did not create a skid signal');
}

// Oil reduces clean carving without injecting non-finite or random spin behavior.
{
  const clean=simulate({seconds:.7,time:120,controls:()=>({steer:.72})});
  const oil=simulate({
    seconds:.7,
    time:120,
    controls:()=>({steer:.72}),
    prepare:state=>{state.oilSlipTime=T.OIL_SLIP_SECONDS;}
  });
  assert(oil.edgeStability<clean.edgeStability,'oil did not reduce edge stability');
  assert(oil.grip<clean.grip,'oil did not reduce grip');
}

// Banana Power may accelerate control feel, but simulation timers must remain slowed.
{
  const state=makeState('ski');
  state.oilSlipTime=T.OIL_SLIP_SECONDS;
  const controlDt=1/60;
  const simulationDt=controlDt*.35;
  stepCarving(state,{steer:.6},controlDt,simulationDt);
  assert(
    Math.abs(state.oilSlipTime-(T.OIL_SLIP_SECONDS-simulationDt))<1e-9,
    'oil timer advanced in control/real time instead of simulation time'
  );
}

// Rapid reversals at maximum speed remain bounded and finite.
{
  const state=simulate({
    seconds:5,
    time:600,
    speed:T.MAX_SPEED,
    controls:t=>({steer:Math.floor(t*8)%2?1:-1})
  });
  finiteState(state);
  assert(Math.abs(state.x)<=T.PLAYER_BOUNDARY_HALF_WIDTH+1e-9,'high-speed reversal escaped course boundary');
  assert(Math.abs(state.vx)<T.MAX_SPEED,'high-speed reversal produced implausible lateral velocity');
}

// Existing fixed/substep strategy should make outer render FPS nearly irrelevant.
{
  const run=fps=>simulate({
    fps,
    seconds:4,
    time:180,
    speed:220/3.6,
    controls:t=>({steer:Math.sin(t*2.1)*.78,tuck:Math.sin(t*.7)>.35})
  });
  const a=run(30),b=run(60),c=run(120);
  for(const state of [a,b,c])finiteState(state);
  assert(Math.abs(a.x-b.x)<.18&&Math.abs(b.x-c.x)<.18,'30/60/120 FPS lateral result drifted');
  assert(Math.abs(a.speed-b.speed)<.08&&Math.abs(b.speed-c.speed)<.08,'30/60/120 FPS speed result drifted');
}

// Manual jump keeps buffer/coyote behavior and lands into a supported grade.
{
  const state=makeState('ski');
  const ground=.12;
  updateJumpAssist(state,true,1/180,true);
  assert.equal(tryManualJump(state,ground),true);
  let landing=null;
  for(let i=0;i<600&&!landing?.landed;i++)landing=stepAir(state,1/180,ground);
  assert(landing?.landed,'manual jump never landed');
  assert(['clean','solid','rough','hard'].includes(landing.quality),'unknown landing grade');
}

// Controller LT/RT semantics expose tuck/brake without stealing Jump.
{
  const buttons=pressed=>Array.from({length:16},(_,i)=>({pressed:pressed.includes(i),value:pressed.includes(i)?1:0}));
  const pad=pressed=>({index:41,id:'Mechanics Pad',mapping:'standard',axes:[0,0],buttons:buttons(pressed),connected:true});
  readPad([]);
  const tuck=readPad([pad([6])]);
  assert.equal(tuck.tuck,true);
  assert.equal(tuck.brake,false);
  assert.equal(tuck.jump,false);
  readPad([pad([])]);
  const brake=readPad([pad([7])]);
  assert.equal(brake.brake,true);
  assert.equal(brake.tuck,false);
  assert.equal(brake.jump,false);
}

// Repetition is diminished gradually while varied/clean execution can build value.
{
  const state=makeState('ski');
  resetAirborneScoring(state);
  resetTrickScoring(state);
  const first=scoreTrickCompletion(state,{type:TRICK_TYPE.SPIN_360,source:'manual'});
  state.time+=.2;
  const repeated=scoreTrickCompletion(state,{type:TRICK_TYPE.SPIN_360,source:'manual'});
  assert(first.points>0&&repeated.points>0,'repeated trick should never instantly become worthless');
  assert(repeated.points<=first.points,'repetition penalty failed to offset same-trick combo farming');
  const beforeBonus=state.score;
  const bonus=scoreTrickLandingBonus(state,{quality:'clean',type:TRICK_TYPE.SPIN_360,source:'manual'});
  assert(bonus?.points>0&&state.score>beforeBonus,'clean trick landing bonus was not awarded');
}

// A nearly completed rotation can be salvaged as rough; a grossly incomplete one still fails.
{
  const physics={air:true,y:10,vy:0,time:0,jumpSource:'ramp',jumpBufferTime:0,jumpBuffered:false};
  const salvage=createTrickSystem();
  assert(salvage.start(TRICK_TYPE.SPIN_360,{physicsState:physics,landingHeight:0,gravity:T.GRAVITY}));
  salvage.step(.43);
  const rough=salvage.land({jumpSource:'ramp'});
  assert.equal(rough.interrupted,false);
  assert.equal(rough.rough,true);
  assert(rough.alignmentErrorDegrees<=34);

  const fail=createTrickSystem();
  assert(fail.start(TRICK_TYPE.SPIN_360,{physicsState:physics,landingHeight:0,gravity:T.GRAVITY}));
  fail.step(.20);
  const bad=fail.land({jumpSource:'ramp'});
  assert.equal(bad.interrupted,true);
  assert.equal(bad.landingValid,false);
}

console.log(JSON.stringify({
  check:'mechanics-depth-invariants',
  rideModes:['ski','snowboard'],
  controls:{tuck:'Shift/LT',brake:'Ctrl/RT'},
  renderFps:[30,60,120],
  maxSpeedKmh:Math.round(T.MAX_SPEED*3.6)
}));
