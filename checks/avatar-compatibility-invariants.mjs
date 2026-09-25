import assert from 'node:assert/strict';
import {
  AVATAR_COMPATIBILITY_STATUS,
  assertAvatarPlayable,
  avatarNameFrom,
  getAvatarCompatibility,
  getAvatarRigCapabilities,
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

const requiredRig={
  hips:{},
  leftThigh:{},rightThigh:{},
  leftShin:{},rightShin:{},
  leftFoot:{},rightFoot:{}
};
const requiredCapabilities=getAvatarRigCapabilities({rig:requiredRig});
assert.equal(requiredCapabilities.gameplay,true,'legacy gameplay-required leg rig remains sufficient');
assert.equal(requiredCapabilities.terrainLegIK,true,'required leg chain supports terrain IK');
assert.equal(requiredCapabilities.gaze,false,'optional head/neck bones remain optional');
assert.equal(requiredCapabilities.leftArm,false,'optional arm chains remain optional');

console.log(JSON.stringify({check:'avatar-compatibility-invariants',builtins:BUILTIN_AVATAR_NAMES.length}));
