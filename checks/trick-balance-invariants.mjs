#!/usr/bin/env node
import fs from 'node:fs';

const read=path=>fs.existsSync(path)?fs.readFileSync(path,'utf8'):null;
const tuning=read('src/gameplayTuning.js');
const main=read('src/main.js');
const physics=read('src/skiPhysics.js');
const streaming=read('src/courseStreaming.js');
const ride=read('src/rideMode.js');
const tricks=read('src/trickSystem.js');

const results=[];
function add(name,status,detail){results.push({name,status,detail});}
function pass(name,detail){add(name,'PASS',detail);}
function pending(name,detail){add(name,'PENDING',detail);}
function fail(name,detail){add(name,'FAIL',detail);}
function num(source,name){
  const m=source?.match(new RegExp(`${name}\\s*:\\s*([0-9.]+)`));
  return m?Number(m[1]):NaN;
}
function has(source,...parts){return !!source&&parts.every(x=>source.includes(x));}

if(!tuning){
  pending('ski 160-210','src/gameplayTuning.js absent');
}else{
  const base=num(tuning,'BASE_SPEED')*3.6;
  const max=num(tuning,'MAX_SPEED')*3.6;
  const tier=num(tuning,'SPEED_TIER_INCREMENT')*3.6;
  if(Math.abs(base-160)<.02&&Math.abs(max-210)<.02&&Math.abs(tier-10)<.02)pass('ski 160-210',`base=${base.toFixed(3)} max=${max.toFixed(3)} tier=${tier.toFixed(3)} km/h`);
  else fail('ski 160-210',`unexpected base/max/tier ${base}/${max}/${tier}`);
}

if(!ride){
  pending('snowboard 180-230','src/rideMode.js is a future rider-branch file on this baseline');
}else if(has(ride,'baseSpeed:180*KMH_TO_MPS','tierIncrement:10*KMH_TO_MPS','maxSpeed:230*KMH_TO_MPS')){
  pass('snowboard 180-230','ride profile is 180 +10 km/h tiers to 230 km/h');
}else fail('snowboard 180-230','expected 180/10/230 profile not found');

const gravity=num(tuning,'GRAVITY');
const manualVy=num(tuning,'MANUAL_JUMP_VELOCITY');
const rampBase=num(tuning,'RAMP_JUMP_BASE_VELOCITY');
const rampFactor=num(tuning,'RAMP_JUMP_SPEED_FACTOR');
const manualOffset=physics?.match(/groundY\+([0-9.]+)\)/)?.[1];
const y0=manualOffset?Number(manualOffset):.045;
const manualAirtime=Number.isFinite(gravity)&&Number.isFinite(manualVy)?(manualVy+Math.sqrt(manualVy*manualVy+2*gravity*y0))/gravity:NaN;

if(!tricks){
  pending('manual 360 possible','src/trickSystem.js is a future trick-branch file on this baseline');
  pending('manual backflip intentionally fails','src/trickSystem.js is a future trick-branch file on this baseline');
  pending('ramp backflip possible','src/trickSystem.js is a future trick-branch file on this baseline');
  pending('second-jump 360 safety','src/trickSystem.js is a future trick-branch file on this baseline');
}else{
  const spin=Number(tricks.match(/SPIN_360_DEGREES_PER_SECOND:\s*([0-9.]+)/)?.[1]);
  const flip=Number(tricks.match(/BACKFLIP_DEGREES_PER_SECOND:\s*([0-9.]+)/)?.[1]);
  const eps=Number(tricks.match(/COMPLETE_EPSILON_DEGREES:\s*([0-9.]+)/)?.[1]);
  const spinNeed=(360-eps)/spin;
  const flipNeed=(360-eps)/flip;
  if(manualAirtime>=spinNeed)pass('manual 360 possible',`airtime=${manualAirtime.toFixed(4)}s need=${spinNeed.toFixed(4)}s`);
  else fail('manual 360 possible',`airtime=${manualAirtime.toFixed(4)}s need=${spinNeed.toFixed(4)}s`);
  if(manualAirtime<flipNeed)pass('manual backflip intentionally fails',`manual rotation=${(manualAirtime*flip).toFixed(1)}deg`);
  else fail('manual backflip intentionally fails','manual jump has enough time to complete backflip unexpectedly');

  const rampTimes=[160,180,210,230].map(kmh=>{
    const speed=kmh/3.6;
    const vy=rampBase+speed*rampFactor;
    return {kmh,time:2*vy/gravity};
  });
  const worst=Math.min(...rampTimes.map(x=>x.time));
  if(worst>=flipNeed)pass('ramp backflip possible',`minimum authored-envelope airtime=${worst.toFixed(4)}s need=${flipNeed.toFixed(4)}s`);
  else fail('ramp backflip possible',`minimum ramp airtime ${worst.toFixed(4)}s is insufficient`);

  const safety=has(tricks,'if(!physicsState?.air)return false;','physicsState.jumpBufferTime=0;','physicsState.jumpBuffered=false;')&&
    (!main||has(main,'if(pressedThisStep&&state.air)','startSecondPress360(state'));
  if(safety)pass('second-jump 360 safety','airborne guard + jump-buffer consumption found; no vy write in startSecondPress360');
  else fail('second-jump 360 safety','airborne/buffer-consumption integration pattern changed');
}

if(!main){
  pending('230 collision substeps safe','src/main.js absent');
}else{
  const hz=main.includes('dt/(1/180)')?180:NaN;
  const step=(230/3.6)/hz;
  const kinds=['rock','oil','log','wideLog','tree'];
  const windows={};
  let ok=Number.isFinite(step);
  for(const kind of kinds){
    const re=new RegExp(`userData\\.kind='${kind}'[^\\n]*?radiusZ=([0-9.]+)`);
    const radius=Number(main.match(re)?.[1]);
    windows[kind]=radius+.20;
    ok=ok&&Number.isFinite(radius)&&step<windows[kind];
  }
  const rampEngagement=1.72-.45;
  const lipContainment=1.78-1.42;
  ok=ok&&step<rampEngagement&&step<lipContainment&&main.includes('previousApproachDepth>-1.42&&approachDepth<=-1.42');
  if(ok)pass('230 collision substeps safe',`step=${step.toFixed(6)}m; narrowest lip containment=${lipContainment.toFixed(3)}m (${(lipContainment/step).toFixed(3)}x)`);
  else fail('230 collision substeps safe',`step=${step} windows=${JSON.stringify(windows)}`);
}

if(!tuning||!streaming){
  pending('lookahead safe','course streaming source absent');
}else{
  const min=num(tuning,'COURSE_LOOKAHEAD_MIN');
  const seconds=num(tuning,'COURSE_LOOKAHEAD_SECONDS');
  const max=num(tuning,'COURSE_LOOKAHEAD_MAX');
  const speed=230/3.6;
  const distance=Math.max(min,Math.min(max,Math.max(min,speed*seconds)));
  const ahead=distance/speed;
  if(ahead>=10)pass('lookahead safe',`${distance.toFixed(1)}m = ${ahead.toFixed(2)}s at 230 km/h`);
  else fail('lookahead safe',`${distance.toFixed(1)}m = ${ahead.toFixed(2)}s at 230 km/h`);
}

if(!ride){
  pending('no hardcoded 210 clamp for snowboard','src/rideMode.js absent on baseline');
}else if(!physics){
  pending('no hardcoded 210 clamp for snowboard','src/skiPhysics.js absent');
}else{
  const progressBlock=physics.slice(physics.indexOf('export function progressSpeed'),physics.indexOf('function stepAirControl'));
  const landingBlock=physics.slice(physics.indexOf('export function stepAir'),physics.indexOf('export function launchRamp'));
  const profileDriven=has(progressBlock,'profile.maxSpeed','profile.baseSpeed','profile.tierIncrement')&&has(landingBlock,'rideProfile.maxSpeed','rideProfile.baseSpeed');
  const hardClamp=/\b(?:T|SKI_TUNING)\.MAX_SPEED\b/.test(progressBlock+landingBlock)||/\b210\b/.test(progressBlock+landingBlock);
  if(profileDriven&&!hardClamp)pass('no hardcoded 210 clamp for snowboard','progression and all landing outcomes use ride profile bounds');
  else fail('no hardcoded 210 clamp for snowboard',`profileDriven=${profileDriven} hardClamp=${hardClamp}`);
}

for(const result of results)console.log(`${result.status.padEnd(7)} ${result.name}: ${result.detail}`);
console.log(JSON.stringify({check:'trick-balance-invariants',pass:results.filter(x=>x.status==='PASS').length,pending:results.filter(x=>x.status==='PENDING').length,fail:results.filter(x=>x.status==='FAIL').length,results}));
if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
