import assert from 'node:assert/strict';
import fs from 'node:fs';
import {calculateLandingFeedback} from '../src/gameFeelFeedback.js';
import {createHaptics,HAPTIC_PATTERNS} from '../src/haptics.js';

const snow=fs.readFileSync(new URL('../src/snowParticles.js',import.meta.url),'utf8');
const trails=fs.readFileSync(new URL('../src/snowTrails.js',import.meta.url),'utf8');
const audio=fs.readFileSync(new URL('../src/audio.js',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

for(const feedback of [
  calculateLandingFeedback({impact:2.6,quality:'clean'}),
  calculateLandingFeedback({impact:8.2,quality:'clean',jumpSource:'manual'}),
  calculateLandingFeedback({impact:10.5,quality:'solid'}),
  calculateLandingFeedback({impact:13.5,quality:'rough'}),
  calculateLandingFeedback({impact:20.5,quality:'hard',jumpSource:'ramp'})
]){
  assert(['tiny','clean','solid','rough','hard'].includes(feedback.band),'landing band escaped sensory vocabulary');
  assert(feedback.audioGain>=0&&feedback.audioGain<=1);
  assert(feedback.hapticStrength>=0&&feedback.hapticStrength<=1);
  assert(feedback.particleBurst>=0&&feedback.particleBurst<=1);
}
assert.equal(calculateLandingFeedback({impact:2.6,quality:'clean'}).band,'tiny');
assert.equal(calculateLandingFeedback({impact:20.5,quality:'hard'}).band,'hard');

for(const name of ['landTiny','landClean','landSolid','landRough','landHard'])assert(HAPTIC_PATTERNS[name],name+' pattern missing');
const unsupported=createHaptics();
assert.doesNotThrow(()=>unsupported.update(.06,{mode:'playing',speed:300/3.6,baseSpeed:150/3.6,maxSpeed:300/3.6,edge:.9,carveLoad:1,brakeAmount:.2,tuckAmount:0}));

assert(snow.includes('const CAPACITY=640'),'snow particle capacity must stay bounded');
assert(snow.includes('roosterBudget'),'powder rooster-tail budget missing');
assert(snow.includes('function nearMiss('),'near-miss powder burst API missing');
assert(snow.includes('streak?2:1'),'high-speed streak visual tier missing');
assert(trails.includes('skidAmount=0'),'trail skid shaping missing');
assert(trails.includes('brakeAmount=0'),'trail brake shaping missing');
assert(trails.includes('snowDisplacementScale=1'),'ride-mode displacement scaling missing');
assert(audio.includes('const speedEnergy=Math.pow(speed01,.72)'),'nonlinear speed-energy audio shaping missing');
assert(audio.includes('const ferocity=Math.pow(speed01,2.35)'),'300 km/h ferocity audio layer missing');
assert(audio.includes('const hierarchyDuck=Math.max(.46'),'weather hierarchy ducking missing');
assert(main.includes('environment.weatherBindings?.snowParticles?.nearMiss?.({'),'near-miss snow integration missing');
assert(main.includes('const charged=state.specialReady||state.specialActiveTime>0;'),'Banana Power equipment glow contract changed');
assert(main.includes('tuckAmount:state.tuckAmount'),'tuck state is not reaching sensory systems');

console.log(JSON.stringify({
  check:'sensory-invariants',
  landingBands:['tiny','clean','solid','rough','hard'],
  particleCapacity:640,
  nearMissPowder:'pooled',
  speedFeel:'nonlinear audio + visual streaks + adaptive haptic cadence',
  bananaGlow:'ready-or-active until consumed/reset'
}));
