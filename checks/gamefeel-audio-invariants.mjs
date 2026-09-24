import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  calculateCarveFeedback,
  calculateCrashFeedback,
  calculateLandingFeedback,
  createEdgeContactGate
} from '../src/gameFeelFeedback.js';

const bounded=value=>value>=0&&value<=1;
for(const edge of [-3,0,.1,.5,1,4]){
  const carve=calculateCarveFeedback({
    edge,
    carveLoad:edge,
    speed:300/3.6,
    baseSpeed:160/3.6,
    maxSpeed:300/3.6,
    lateralVelocity:14,
    grounded:true,
    groundRoll:.03,
    groundPitch:.02
  });
  assert(bounded(carve.intensity),'Carve intensity escaped [0,1]');
  assert(bounded(carve.snowSpray),'Carve snow spray escaped [0,1]');
}
assert.equal(calculateCarveFeedback({edge:1,carveLoad:1,air:true}).intensity,0,'Airborne carve must not produce contact feedback');

const tinyLanding=calculateLandingFeedback({landed:true,impact:2.6,quality:'clean'});
const cleanLanding=calculateLandingFeedback({landed:true,impact:8.2,quality:'clean',jumpSource:'manual'});
const hardLanding=calculateLandingFeedback({landed:true,impact:20.5,quality:'hard',jumpSource:'ramp'});
assert(hardLanding.intensity>cleanLanding.intensity&&cleanLanding.intensity>tinyLanding.intensity,'Landing intensity ordering is invalid');
assert.equal(tinyLanding.particleBurst,0,'Tiny landing became visually dramatic');
assert.equal(tinyLanding.dramatic,false,'Tiny landing became dramatic');
assert(hardLanding.cameraKick>0&&hardLanding.hapticStrength>cleanLanding.hapticStrength,'Hard landing semantic outputs are too weak');
for(const landing of [tinyLanding,cleanLanding,hardLanding]){
  assert(bounded(landing.intensity));
  assert(bounded(landing.particleBurst));
  assert(bounded(landing.cameraKick));
  assert(bounded(landing.hapticStrength));
}

const crash=calculateCrashFeedback({kind:'rock',velocity:{x:7,y:-5,z:300/3.6}});
assert(bounded(crash.intensity)&&bounded(crash.snowBurst)&&bounded(crash.cameraPunch)&&bounded(crash.hapticStrength),'Crash feedback escaped bounds');

const edgeGate=createEdgeContactGate({cooldownSeconds:.1});
assert.equal(edgeGate.request(.72,1).play,true);
assert.equal(edgeGate.request(.72,1.05).play,false,'Edge scrape cooldown did not suppress frame spam');
assert.equal(edgeGate.request(.72,1.11).play,true);
edgeGate.reset();
assert.equal(edgeGate.request(.72,1.12).play,true,'Edge scrape reset did not clear cooldown');

const audioSource=fs.readFileSync(new URL('../src/audio.js',import.meta.url),'utf8');
const mainSource=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const feedbackSource=fs.readFileSync(new URL('../src/gameFeedback.js',import.meta.url),'utf8');

assert(audioSource.includes("const variation=type==='go'?0:"),'GO cue still has random pitch variation');
assert(audioSource.includes('function playGoCue({allowVoiceFallback=false}={})'),'Deterministic GO API missing');
assert(audioSource.includes("const chip=play('go',.76,1.0)"),'Procedural GO stinger missing');
assert(audioSource.includes('if(chip||!allowVoiceFallback)return chip;'),'Speech synthesis is still primary GO presentation');
assert(audioSource.includes('return playGoVoice();'),'Optional SpeechSynthesis fallback was not retained');
assert(audioSource.includes("edgeScrape:.115"),'Edge scrape cooldown missing');
assert(audioSource.includes('function playEdgeContact(edgeContactIntensity=0)'),'Edge contact audio hook missing');
assert(audioSource.includes('const carveFeedback=calculateCarveFeedback({'),'Real gameplay carve model is not feeding ride audio');
assert(audioSource.includes('function getSemanticFeedback()'),'Semantic carve output hook missing');
assert(audioSource.includes('if(graph||!context)return graph;'),'Persistent audio graph duplicate-loop guard missing');
assert(audioSource.includes('context??=new AudioContextClass()'),'AudioContext reuse guard missing');
assert(audioSource.includes("if(context.state==='suspended')context.resume().catch(()=>{});"),'Autoplay-safe resume handling missing');
assert(audioSource.includes("document.addEventListener('pointerdown',unlock,{once:true,capture:true});"),'Pointer unlock lifecycle missing');
assert(audioSource.includes("document.addEventListener('keydown',unlock,{once:true,capture:true});"),'Keyboard unlock lifecycle missing');
assert(audioSource.includes('source.onended=()=>{'),'Transient source cleanup missing');
assert(audioSource.includes('eventLast.clear();'),'Run reset does not clear event cooldown state');
assert(audioSource.includes('if(graph&&context)applyState(pendingState,true);'),'Run reset does not immediately neutralize persistent ride feedback');

for(const required of [
  'carveLoad:state.carveLoad',
  'lateralVelocity:state.vx',
  'grounded:state.grounded',
  'landingGripLoss:state.landingGripLoss'
])assert(mainSource.includes(required),'Missing real gameplay audio input: '+required);
assert(mainSource.includes('const landingFeedback=feedback.onLanding('),'Landing semantic adapter is not integrated');
assert(mainSource.includes('landingFeedback?.hapticStrength'),'Landing haptic request is not semantic');
assert(mainSource.includes('const crashFeedback=feedback.onCrash('),'Crash semantic adapter is not integrated');
assert(mainSource.includes('crashFeedback?.hapticStrength'),'Crash haptic strength request hook missing');
assert(feedbackSource.includes('function onEdgeContact(edgeContactIntensity,timeSeconds=0)'),'Fence/edge semantic hook missing');
assert(feedbackSource.includes("remember('landing',feedback)"),'Landing semantic event exposure missing');
assert(feedbackSource.includes("remember('crash',feedback)"),'Crash semantic event exposure missing');

console.log(JSON.stringify({
  check:'gamefeel-audio-invariants',
  goCue:'deterministic procedural WebAudio primary',
  carve:'bounded gameplay-derived intensity',
  landing:{tiny:tinyLanding.intensity,clean:cleanLanding.intensity,hard:hardLanding.intensity},
  crashIntensity:crash.intensity,
  edgeCooldownSeconds:.1,
  lifecycle:'single graph + transient cleanup + reset neutralization'
}));
