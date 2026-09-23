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

const unsupported=createHaptics({navigatorObject:{getGamepads:()=>[]}});
for(const call of [
  ()=>unsupported.rampTakeoff(),
  ()=>unsupported.land(1,'hard'),
  ()=>unsupported.trickStart('360'),
  ()=>unsupported.trickSuccess('backflip'),
  ()=>unsupported.trickFail('360'),
  ()=>unsupported.oil(),
  ()=>unsupported.crash('tree')
])assert.doesNotThrow(call,'Unsupported haptics path threw');
for(const [name,pattern] of Object.entries(HAPTIC_PATTERNS)){
  assert(pattern.duration>0&&pattern.duration<=160,name+' haptic duration is not sane');
  assert(pattern.weakMagnitude>=0&&pattern.weakMagnitude<=1,name+' weak magnitude is invalid');
  assert(pattern.strongMagnitude>=0&&pattern.strongMagnitude<=1,name+' strong magnitude is invalid');
}

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
