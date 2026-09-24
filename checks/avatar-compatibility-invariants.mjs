import assert from 'node:assert/strict';
import {
  AVATAR_COMPATIBILITY_STATUS,
  assertAvatarPlayable,
  avatarNameFrom,
  getAvatarCompatibility,
  isCatalogAvatarUrl,
  validateAvatarOverride
} from '../src/avatarCompatibility.js';
import {BUILTIN_AVATAR_NAMES} from '../src/avatarRoster.js';

for(const name of BUILTIN_AVATAR_NAMES){
  const compatibility=getAvatarCompatibility(name);
  assert.equal(compatibility.status,AVATAR_COMPATIBILITY_STATUS.SUPPORTED,name+' unexpectedly blocked by static metadata');
  assert.doesNotThrow(()=>assertAvatarPlayable(name));
}
assert.equal(avatarNameFrom('/model/characters/The%20Street%20Fighter.glb'),'The Street Fighter');
assert.equal(isCatalogAvatarUrl('/model/characters/The%20Archon.glb'),true);
assert.equal(isCatalogAvatarUrl('blob:https://example.invalid/abc'),false);
assert(validateAvatarOverride({status:'supported',scaleMultiplier:1,modelOffset:{x:0,y:.1,z:0}}));
assert.throws(()=>validateAvatarOverride({status:'mystery'}),/invalid compatibility status/);
assert.throws(()=>validateAvatarOverride({scaleMultiplier:0}),/scaleMultiplier/);
assert.throws(()=>validateAvatarOverride({snowboardOffset:{x:999}}),/snowboardOffset\.x/);
assert.throws(()=>validateAvatarOverride({bonePaths:{hips:'not-absolute'}}),/absolute node path/);
console.log(JSON.stringify({check:'avatar-compatibility-invariants',builtins:BUILTIN_AVATAR_NAMES.length}));
