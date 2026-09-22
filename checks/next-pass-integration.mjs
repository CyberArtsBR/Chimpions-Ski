import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const assert=(condition,message)=>{
  if(!condition)throw new Error(message);
};

const tuning=read('src/gameplayTuning.js');
const streaming=read('src/courseStreaming.js');
const feedback=read('src/gameFeedback.js');
const ui=read('src/ui.js');
const start=read('src/startScreen.js');
const day=read('src/dayCycle.js');
const markers=read('src/boundaryMarkers.js');
const main=read('src/main.js');
const score=read('src/scorePresentation.js');
const camera=read('src/skiCamera.js');

const numberAfter=(source,key)=>{
  const match=source.match(new RegExp(key+'\\s*:\\s*([0-9.]+)'));
  return match?Number(match[1]):NaN;
};

const baseSpeed=numberAfter(tuning,'BASE_SPEED');
assert(Number.isFinite(baseSpeed)&&Math.abs(baseSpeed-44.4444)<0.001,'Start speed must remain 160 km/h / 44.4444 m/s');
assert(numberAfter(tuning,'MAX_SPEED')>=58.333,'Maximum speed must remain at least 210 km/h');
assert(numberAfter(tuning,'CLEAR_COMBO_WINDOW')===1.5,'Airborne combo window must be 1.5 seconds');
assert(numberAfter(tuning,'CLEAR_COMBO_MAX_MULTIPLIER')===3,'Airborne combo multiplier cap must remain x3');

const lookaheadMin=numberAfter(tuning,'COURSE_LOOKAHEAD_MIN');
const lookaheadMax=numberAfter(tuning,'COURSE_LOOKAHEAD_MAX');
assert(lookaheadMin>280,'Course lookahead minimum must stay beyond the 280m camera far plane');
assert(lookaheadMax>=lookaheadMin,'Course lookahead maximum must be >= minimum');
assert(streaming.includes('COURSE_LOOKAHEAD_SECONDS'),'Adaptive course lookahead must remain speed-aware');

assert(!feedback.includes('CLEAN LANDING'),'gameFeedback must not reintroduce CLEAN LANDING');
assert(!ui.includes('CLEAN LANDING'),'UI must not reintroduce CLEAN LANDING');

assert(start.includes("https://chimp-jump.onrender.com/"),'Start screen must link back to the game selection URL');
assert(start.includes('Start Game')||start.includes('Start Game'.toUpperCase()),'Start screen must expose a Start Game control');

for(const name of ['sunny','golden-sunset','blue-evening','deep-blue-night','blue-gray-dawn']){
  assert(day.includes("name:'"+name+"'"),'Missing required day-cycle palette: '+name);
}

assert(markers.includes('limit=11.3'),'Boundary markers must remain at the playable +/-11.3 limit');
assert(markers.includes('0x1d68d8')&&markers.includes('0xd94445'),'Boundary markers must keep blue/red side colors');

for(const required of [
  "from './airborneScoring.js'",
  "from './courseStreaming.js'",
  "from './startScreen.js'",
  "from './scorePresentation.js'"
]){
  assert(main.includes(required),'Integrated main.js missing '+required);
}
assert(main.includes('state.clearEvent??null'),'Integrated main.js must forward clear events to score presentation');
assert(main.includes('state.time);'),'Integrated environment update must receive run time for the day cycle');

assert(score.includes('COMBO x'),'Score presentation must expose combo feedback');
assert(camera.includes('lateralFollow')&&camera.includes('deadStart'),'Camera must preserve smooth lateral follow/dead-zone behavior');

console.log('Next-pass integration invariants: OK');