import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DEFAULT_RIDE_MODE,RIDE_AUDIO_PROFILES,normalizeRideSpeed} from '../src/rideAudioProfile.js';
import {createTrickAudioState,getTrickStartProfile,getTrickSuccessProfile,getTrickFailProfile} from '../src/trickAudio.js';
import {createHaptics,HAPTIC_PATTERNS} from '../src/haptics.js';

const audioSource=fs.readFileSync(new URL('../src/audio.js',import.meta.url),'utf8');

assert(audioSource.includes("JUMP_MUSIC_URL='/audio/music-full.mp3'"),'Music URL must remain local');
assert(!audioSource.includes('chimp-jump.onrender.com/audio/music-full.mp3'),'External Chimp Jump Render hotlink returned');
assert.equal(DEFAULT_RIDE_MODE,'ski','Ski must remain the default ride mode');
assert.equal(RIDE_AUDIO_PROFILES.ski.maxSpeedKmh,300,'Ski max normalization must be 300 km/h');
assert.equal(RIDE_AUDIO_PROFILES.snowboard.maxSpeedKmh,300,'Snowboard max normalization must be 300 km/h');
assert.equal(normalizeRideSpeed(300/3.6,'ski'),1);
assert.equal(normalizeRideSpeed(300/3.6,'snowboard'),1);
assert(audioSource.includes('function setRideMode(mode)'), 'Ride-mode API is missing');
assert(audioSource.includes('function playTrickStart(type,eventId)'), 'Trick start API is missing');
assert(audioSource.includes('function playTrickSuccess(type,combo=1,eventId)'), 'Trick success API is missing');
assert(audioSource.includes('function playTrickFail(type,eventId)'), 'Trick fail API is missing');
assert(getTrickStartProfile('360')&&getTrickStartProfile('backflip'));
assert(getTrickSuccessProfile('360',1)&&getTrickSuccessProfile('backflip',3));
assert(getTrickFailProfile('360')&&getTrickFailProfile('backflip'));

const trickState=createTrickAudioState();
assert.equal(trickState.start('360','evt-1').play,true);
assert.equal(trickState.start('360','evt-1').play,false,'Duplicate trick start retriggered');
assert.equal(trickState.result('360','success','evt-1').play,true);
assert.equal(trickState.result('360','success','evt-1').play,false,'Duplicate trick success retriggered');
assert.equal(trickState.result('backflip','fail','evt-2').play,true);
assert.equal(trickState.result('backflip','fail','evt-2').play,false,'Duplicate trick fail retriggered');
trickState.reset();
assert.deepEqual(trickState.diagnostics(),{generation:0,activeType:null,recentEventCount:0,anonymousResultLatch:null});
assert(audioSource.includes('trickState.reset();'),'Run reset must clear temporary trick/audio state');

const unsupported=createHaptics();
for(const call of [
  ()=>unsupported.menuMove(),
  ()=>unsupported.menuConfirm(),
  ()=>unsupported.banana(),
  ()=>unsupported.rampTakeoff(),
  ()=>unsupported.land(1,'hard'),
  ()=>unsupported.trickStart('360'),
  ()=>unsupported.trickSuccess('backflip'),
  ()=>unsupported.trickFail('360'),
  ()=>unsupported.oil(),
  ()=>unsupported.crash('tree'),
  ()=>unsupported.update(.1,{mode:'playing',speed:300/3.6,baseSpeed:160/3.6,maxSpeed:300/3.6,edge:.8})
])assert.doesNotThrow(call,'Unsupported haptics path threw');
for(const [name,pattern] of Object.entries(HAPTIC_PATTERNS)){
  assert(pattern.duration>0&&pattern.duration<=180,name+' haptic duration is not sane');
  assert(pattern.weakMagnitude>=0&&pattern.weakMagnitude<=1,name+' weak magnitude is invalid');
  assert(pattern.strongMagnitude>=0&&pattern.strongMagnitude<=1,name+' strong magnitude is invalid');
}

const effectsA=[];
const effectsB=[];
const padA={
  index:0,id:'Pad A',connected:true,
  vibrationActuator:{playEffect:(type,options)=>{effectsA.push({type,options});return Promise.resolve('complete');}}
};
const padB={
  index:1,id:'Pad B',connected:true,
  vibrationActuator:{playEffect:(type,options)=>{effectsB.push({type,options});return Promise.resolve('complete');}}
};
const targeted=createHaptics();
targeted.setActiveGamepad(padB);
assert.equal(targeted.menuMove(),true);
assert.equal(effectsA.length,0,'haptics leaked to an inactive lower-index controller');
assert.equal(effectsB.length,1,'active controller did not receive menu haptics');
targeted.setActiveGamepad(padA);
assert.equal(targeted.menuConfirm(),true);
assert.equal(effectsA.length,1,'haptic target did not follow controller takeover');
assert.equal(targeted.diagnostics().activeIndex,0);
targeted.clearActiveGamepad();
assert.equal(targeted.crash('rock'),false,'cleared active controller still received haptics');

const continuousEffects=[];
const continuousPad={
  index:2,id:'Continuous',connected:true,
  vibrationActuator:{
    playEffect:(type,options)=>{continuousEffects.push({type,options});return Promise.resolve('complete');}
  }
};
const continuous=createHaptics();
continuous.setActiveGamepad(continuousPad);
continuous.update(.09,{
  mode:'playing',
  speed:300/3.6,
  baseSpeed:160/3.6,
  maxSpeed:300/3.6,
  edge:.85,
  groundRoll:.03,
  groundPitch:.02,
  oilSlipTime:0,
  time:10
});
assert(continuousEffects.length>0,'continuous snow/carve haptics did not emit at max speed');
assert(continuousEffects[0].options.weakMagnitude>0&&continuousEffects[0].options.strongMagnitude>0,'continuous rumble magnitudes were empty');

let rejectedCalls=0;
let fallbackPulses=0;
let unhandled=null;
const onUnhandled=reason=>{unhandled=reason;};
process.once('unhandledRejection',onUnhandled);
const rejectingPad={
  index:3,id:'Rejecting',connected:true,
  vibrationActuator:{
    playEffect:()=>{rejectedCalls++;return Promise.reject(new Error('unsupported dual-rumble'));},
    pulse:()=>{fallbackPulses++;return Promise.resolve(true);}
  }
};
const rejecting=createHaptics();
rejecting.setActiveGamepad(rejectingPad);
assert.equal(rejecting.menuMove(),true,'initial supported-looking haptic call was not attempted');
await new Promise(resolve=>setImmediate(resolve));
assert.equal(unhandled,null,'rejected vibration promise escaped as unhandled rejection');
assert.equal(rejecting.menuMove(),true,'pulse fallback was not used after playEffect rejection');
assert.equal(rejectedCalls,1,'rejected playEffect was retried repeatedly');
assert.equal(fallbackPulses,1,'pulse fallback did not receive the second haptic request');
process.removeListener('unhandledRejection',onUnhandled);

assert.equal(targeted.emit('landing',{impact:.65,quality:'clean'}),false,'event routing ignored cleared active target');

assert(audioSource.includes('source.onended=()=>{'),'Transient audio sources must clean themselves up');
assert(audioSource.includes('context??=new AudioContextClass()'),'Audio must reuse one AudioContext');
assert(audioSource.includes('const boardScrapeSource=makeLoop('),'Snowboard scrape loop must be persistent, not recreated per frame');

console.log(JSON.stringify({
  check:'audio-haptics-invariants',
  defaultRideMode:DEFAULT_RIDE_MODE,
  maxKmh:{ski:RIDE_AUDIO_PROFILES.ski.maxSpeedKmh,snowboard:RIDE_AUDIO_PROFILES.snowboard.maxSpeedKmh},
  trickDeduplication:'pass',
  unsupportedHaptics:'pass',
  maxHapticDurationMs:Math.max(...Object.values(HAPTIC_PATTERNS).map(pattern=>pattern.duration))
}));
