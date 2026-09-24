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
const near=(a,b,t=.03)=>Number.isFinite(a)&&Math.abs(a-b)<=t;

if(!tuning){
  pending('current speed contract','src/gameplayTuning.js absent');
}else{
  const base=num(tuning,'BASE_SPEED')*3.6;
  const max=num(tuning,'MAX_SPEED')*3.6;
  const tier=num(tuning,'SPEED_TIER_INCREMENT')*3.6;
  const seconds=num(tuning,'SPEED_TIER_SECONDS');
  if(near(base,160)&&near(max,300)&&near(tier,20)&&seconds===30){
    pass('SKI 160/+20/30s/300',`base=${base.toFixed(3)} max=${max.toFixed(3)} tier=${tier.toFixed(3)} km/h`);
  }else fail('SKI 160/+20/30s/300',`unexpected base/max/tier/seconds ${base}/${max}/${tier}/${seconds}`);
}

if(!ride){
  pending('SNOWBOARD 180/+20/30s/300','src/rideMode.js absent');
}else if(
  has(ride,'baseSpeed:180*KMH_TO_MPS','tierIncrement:SKI_TUNING.SPEED_TIER_INCREMENT','maxSpeed:SKI_TUNING.MAX_SPEED')
){
  pass('SNOWBOARD 180/+20/30s/300','snowboard shares +20 km/h tier increment and 300 km/h cap');
}else fail('SNOWBOARD 180/+20/30s/300','expected 180 start with shared tier/max contract');

const gravity=num(tuning,'GRAVITY');
const manualVy=num(tuning,'MANUAL_JUMP_VELOCITY');
const rampBase=num(tuning,'RAMP_JUMP_BASE_VELOCITY');
const rampFactor=num(tuning,'RAMP_JUMP_SPEED_FACTOR');
const manualOffset=physics?.match(/groundY\+([0-9.]+)\)/)?.[1];
const y0=manualOffset?Number(manualOffset):.045;
const manualAirtime=Number.isFinite(gravity)&&Number.isFinite(manualVy)
  ?(manualVy+Math.sqrt(manualVy*manualVy+2*gravity*y0))/gravity
  :NaN;

if(!tricks){
  pending('trick timing','src/trickSystem.js absent');
}else{
  const spin=Number(tricks.match(/SPIN_360_DEGREES_PER_SECOND:\s*([0-9.]+)/)?.[1]);
  const flip=Number(tricks.match(/BACKFLIP_DEGREES_PER_SECOND:\s*([0-9.]+)/)?.[1]);
  const eps=Number(tricks.match(/COMPLETE_EPSILON_DEGREES:\s*([0-9.]+)/)?.[1]);
  const spinNeed=(360-eps)/spin;
  const flipNeed=(360-eps)/flip;
  if(manualAirtime>=spinNeed)pass('manual 360 possible',`airtime=${manualAirtime.toFixed(4)}s need=${spinNeed.toFixed(4)}s`);
  else fail('manual 360 possible',`airtime=${manualAirtime.toFixed(4)}s need=${spinNeed.toFixed(4)}s`);
  if(manualAirtime<flipNeed)pass('manual backflip intentionally fails',`manual rotation=${(manualAirtime*flip).toFixed(1)}deg`);
  else fail('manual backflip intentionally fails','manual jump unexpectedly has enough time to complete backflip');

  const rampTimes=[160,180,220,260,300].map(kmh=>{
    const speed=kmh/3.6;
    const vy=rampBase+speed*rampFactor;
    return {kmh,time:2*vy/gravity};
  });
  const worst=Math.min(...rampTimes.map(x=>x.time));
  if(worst>=flipNeed)pass('ramp backflip possible through 300 km/h',`minimum modeled airtime=${worst.toFixed(4)}s need=${flipNeed.toFixed(4)}s`);
  else fail('ramp backflip possible through 300 km/h',`minimum ramp airtime ${worst.toFixed(4)}s is insufficient`);

  const safety=has(tricks,'if(!physicsState?.air)return false;','physicsState.jumpBufferTime=0;','physicsState.jumpBuffered=false;')&&
    (!main||has(main,'if(pressedThisStep&&state.air)','startSecondPress360(state'));
  if(safety)pass('second-jump 360 safety','airborne guard + jump-buffer consumption found');
  else fail('second-jump 360 safety','airborne/buffer-consumption integration pattern changed');
}

if(!tuning||!main){
  pending('300 km/h collision integration guards','tuning/main source absent');
}else{
  const substep=num(tuning,'PHYSICS_SUBSTEP_SECONDS');
  const crossing=main.includes('previousApproachDepth>-1.42&&approachDepth<=-1.42');
  if(substep<=1/180+1e-12&&crossing){
    pass('300 km/h collision integration guards',`substep<=1/180 and ramp lip uses crossing detection; max-step=${((300/3.6)*substep).toFixed(4)}m`);
  }else fail('300 km/h collision integration guards',`substep=${substep} crossing=${crossing}`);
}

if(!tuning||!streaming){
  pending('300 km/h course lookahead contract','course streaming source absent');
}else{
  const min=num(tuning,'COURSE_LOOKAHEAD_MIN');
  const seconds=num(tuning,'COURSE_LOOKAHEAD_SECONDS');
  const max=num(tuning,'COURSE_LOOKAHEAD_MAX');
  const speed=300/3.6;
  const distance=Math.max(min,Math.min(max,Math.max(min,speed*seconds)));
  const ahead=distance/speed;
  if(distance===max&&ahead>=8.5)pass('300 km/h course lookahead contract',`${distance.toFixed(1)}m = ${ahead.toFixed(2)}s at 300 km/h`);
  else fail('300 km/h course lookahead contract',`distance=${distance} ahead=${ahead}`);
}

if(!ride||!physics){
  pending('no legacy speed clamps','ride/physics source absent');
}else{
  const progressBlock=physics.slice(physics.indexOf('export function progressSpeed'),physics.indexOf('function stepAirControl'));
  const landingBlock=physics.slice(physics.indexOf('export function stepAir'),physics.indexOf('export function launchRamp'));
  const profileDriven=has(progressBlock,'profile.maxSpeed','profile.baseSpeed','profile.tierIncrement')&&has(landingBlock,'rideProfile.maxSpeed','rideProfile.baseSpeed');
  const legacyClamp=/\b(?:210|230)\b|58\.3333|63\.8889/.test(progressBlock+landingBlock);
  if(profileDriven&&!legacyClamp)pass('no legacy speed clamps','progression and landing outcomes use current ride profile bounds');
  else fail('no legacy speed clamps',`profileDriven=${profileDriven} legacyClamp=${legacyClamp}`);
}

for(const result of results)console.log(`${result.status.padEnd(7)} ${result.name}: ${result.detail}`);
console.log(JSON.stringify({check:'trick-balance-invariants',pass:results.filter(x=>x.status==='PASS').length,pending:results.filter(x=>x.status==='PENDING').length,fail:results.filter(x=>x.status==='FAIL').length,results}));
if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
