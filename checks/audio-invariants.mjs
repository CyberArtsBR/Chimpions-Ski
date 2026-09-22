import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const audioSource=fs.readFileSync('src/audio.js','utf8');
const mainSource=fs.readFileSync('src/main.js','utf8');
const musicPath='public/audio/music-full.mp3';

assert(fs.existsSync(musicPath),'Bundled Chimp Jump music is missing');
const music=fs.readFileSync(musicPath);
assert(music.length>4_000_000,'Bundled Chimp Jump music looks unexpectedly small');

const gitBlob=crypto.createHash('sha1')
  .update(Buffer.from('blob '+music.length+'\0'))
  .update(music)
  .digest('hex');
assert.equal(
  gitBlob,
  '9606f2230f5a3b78fb7f9517b80014132205ec52',
  'Bundled music bytes differ from the exact Chimp-Jump source asset'
);

assert(audioSource.includes("JUMP_MUSIC_URL='/audio/music-full.mp3'"),'Audio must use the local music asset');
assert(!audioSource.includes('chimp-jump.onrender.com/audio/music-full.mp3'),'Runtime music hotlink returned');
assert(audioSource.includes("type==='oil'"),'Distinct oil skid cue is missing');
assert(audioSource.includes("type==='clear'"),'Airborne clear cue is missing');
assert(audioSource.includes('function playClear(clearEvent)'), 'Combo presentation audio hook is missing');
assert(audioSource.includes('function resetRun()'), 'Audio run-reset hook is missing');
assert(mainSource.includes("audio.play('oil',.34)"),'Oil gameplay event is not wired to the distinct skid cue');
assert(mainSource.includes('audio.playClear?.(state.clearEvent??null)'), 'Airborne clear events are not wired to audio presentation');
assert(mainSource.includes('audio.resetRun?.()'), 'Restart does not reset audio event presentation state');

console.log(JSON.stringify({
  check:'audio-invariants',
  musicBytes:music.length,
  sourceGitBlob:gitBlob,
  localPath:'/audio/music-full.mp3',
  fallback:'procedural music bed retained'
}));
