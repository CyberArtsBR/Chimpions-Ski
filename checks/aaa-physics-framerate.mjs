import assert from 'node:assert/strict';
import {stepCarving,progressSpeed,updateJumpAssist,tryManualJump,stepAir} from '../src/skiPhysics.js';
import {SKI_TUNING as T} from '../src/gameplayTuning.js';

const frameRates=[30,60,120];
function state(overrides={}){return {speed:T.BASE_SPEED,time:0,x:0,vx:0,edge:0,heading:0,turnRate:0,air:false,grounded:true,y:.12,vy:0,landingPulse:0,rampGrace:0,counterSteer:false,...overrides};}
function eachRuntimeSubstep(fps,seconds,fn){
  const frames=Math.round(fps*seconds),frameDt=1/fps;
  for(let frame=0;frame<frames;frame++){
    const count=Math.max(1,Math.ceil(frameDt/T.PHYSICS_SUBSTEP_SECONDS));
    const dt=frameDt/count;
    for(let sub=0;sub<count;sub++)fn(dt,frame*frameDt+sub*dt);
  }
}
function carveProbe(fps){
  const s=state({speed:T.BASE_SPEED+5});
  eachRuntimeSubstep(fps,4,(dt,t)=>{s.time+=dt;progressSpeed(s,dt);const input=t<1.5?1:t<3?-1:0;stepCarving(s,input,dt);});
  return {x:s.x,vx:s.vx,edge:s.edge,heading:s.heading,turnRate:s.turnRate,speed:s.speed};
}
function speedProbe(fps){
  // Sample one second beyond the tier boundary so floating-point accumulation at
  // exactly 240s cannot make one frame-rate appear to be in a different tier.
  const s=state();eachRuntimeSubstep(fps,241,(dt)=>{s.time+=dt;progressSpeed(s,dt);});
  return {time:s.time,speed:s.speed,targetSpeed:s.targetSpeed,speedTier:s.speedTier};
}
function jumpProbe(fps){
  const s=state();let first=true,elapsed=0,apex=s.y,landedAt=null;
  const maxSeconds=4,frames=Math.round(maxSeconds*fps),frameDt=1/fps;
  for(let frame=0;frame<frames&&landedAt==null;frame++){
    const count=Math.max(1,Math.ceil(frameDt/T.PHYSICS_SUBSTEP_SECONDS)),dt=frameDt/count;
    for(let sub=0;sub<count;sub++){
      const held=elapsed<.25;updateJumpAssist(s,first,dt,held);
      if(first){assert(tryManualJump(s,.12),'manual jump failed');first=false;}
      const result=stepAir(s,dt,.12);elapsed+=dt;apex=Math.max(apex,s.y);
      if(result.landed){landedAt=elapsed;break;}
    }
  }
  assert(landedAt!=null,'jump did not land');
  return {airtime:landedAt,apex,landingReengageTime:s.landingReengageTime,lastJumpProfile:s.lastJumpProfile};
}
function near(a,b,tolerance,label){assert(Math.abs(a-b)<=tolerance,`${label}: ${a} vs ${b} > ${tolerance}`);}
const carves=Object.fromEntries(frameRates.map(fps=>[fps,carveProbe(fps)]));
const speeds=Object.fromEntries(frameRates.map(fps=>[fps,speedProbe(fps)]));
const jumps=Object.fromEntries(frameRates.map(fps=>[fps,jumpProbe(fps)]));

const carveTolerance={x:.12,vx:.18,edge:.03,heading:.012,turnRate:.04,speed:.08};
for(const fps of [30,120]){
  for(const [key,tolerance] of Object.entries(carveTolerance))near(carves[60][key],carves[fps][key],tolerance,`carve ${key} 60 vs ${fps}`);
  near(speeds[60].speed,speeds[fps].speed,.08,`speed 60 vs ${fps}`);
  near(speeds[60].targetSpeed,speeds[fps].targetSpeed,.02,`target speed 60 vs ${fps}`);
  assert(Math.abs(speeds[60].speedTier-speeds[fps].speedTier)<=1,'speed tier diverged by more than one boundary sample');
  near(jumps[60].airtime,jumps[fps].airtime,.035,`jump airtime 60 vs ${fps}`);
  near(jumps[60].apex,jumps[fps].apex,.04,`jump apex 60 vs ${fps}`);
  near(jumps[60].landingReengageTime,jumps[fps].landingReengageTime,.03,`landing re-engage 60 vs ${fps}`);
  assert.equal(jumps[60].lastJumpProfile,jumps[fps].lastJumpProfile,'jump profile diverged');
}
assert(speeds[60].speed<=T.MAX_SPEED+1e-6,'speed exceeded cap');
console.log(JSON.stringify({check:'aaa-physics-framerate',runtimeSubstepSeconds:T.PHYSICS_SUBSTEP_SECONDS,frameRates,tolerances:{carve:carveTolerance,jump:{airtime:.035,apex:.04,landingReengageTime:.03},speed:.08},carves,speeds,jumps}));
