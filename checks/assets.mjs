import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BUILTIN_AVATAR_NAMES} from '../src/avatarRoster.js';

const avatars=JSON.parse(fs.readFileSync('public/avatars.json','utf8'));
const characters=JSON.parse(fs.readFileSync('public/characters.json','utf8'));
assert.equal(avatars.length,10,'Built-in Ski roster must contain exactly 10 avatars');
assert.deepEqual(avatars.map(a=>a.name),[...BUILTIN_AVATAR_NAMES],'avatars.json roster/order drifted');
assert.deepEqual(characters.map(a=>a.name),[...BUILTIN_AVATAR_NAMES],'characters.json roster/order drifted');
assert.equal(new Set(avatars.map(a=>String(a.id))).size,avatars.length,'Avatar IDs must be unique');
assert(avatars.every(a=>a.name&&a.url),'Every Ski catalog entry must have a name and GLB URL');
for(const avatar of avatars){
  assert.equal(avatar.url,'model/characters/'+encodeURIComponent(avatar.name)+'.glb','Unexpected avatar URL for '+avatar.name);
  assert(fs.existsSync('public/'+decodeURIComponent(avatar.url)),'Missing GLB for '+avatar.name);
}
console.log('PASS Chimpions Ski canonical roster:',avatars.length);
