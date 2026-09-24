import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {BUILTIN_AVATAR_NAMES,DEFAULT_AVATAR_NAME} from '../src/avatarRoster.js';
import {MAX_LOCAL_GLB_BYTES,LOCAL_GLB_COMPLEXITY_LIMITS,validateLocalGlbFile,validateParsedLocalGlb} from '../src/localAvatarUpload.js';

const expectedFiles=BUILTIN_AVATAR_NAMES.map(name=>name+'.glb').sort((a,b)=>a.localeCompare(b));
const dir=new URL('../public/model/characters/',import.meta.url);
const diskFiles=(await readdir(dir)).filter(name=>name.toLowerCase().endsWith('.glb')).sort((a,b)=>a.localeCompare(b));
assert.deepEqual(diskFiles,expectedFiles,'deployable character directory must contain only the canonical 10 GLBs');

for(const manifestName of ['avatars.json','characters.json']){
  const manifest=JSON.parse(await readFile(new URL('../public/'+manifestName,import.meta.url),'utf8'));
  assert.equal(manifest.length,10,manifestName+' must contain exactly 10 entries');
  assert.deepEqual(manifest.map(e=>e.name),[...BUILTIN_AVATAR_NAMES],manifestName+' must use canonical roster order');
  for(const entry of manifest){
    assert.equal(entry.url,'model/characters/'+encodeURIComponent(entry.name)+'.glb','dead/unexpected GLB reference in '+manifestName);
  }
}

const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const avatar=await readFile(new URL('../src/avatar-system.js',import.meta.url),'utf8');
const crowd=await readFile(new URL('../src/startCrowd.js',import.meta.url),'utf8');
assert(main.includes('createFallbackSkier({rideMode:selectedRideMode})'),'boot must use the procedural rider with the persisted ride mode and without a GLB request');
assert(!main.includes('await setAvatar(initialAvatar'),'boot must not eagerly fetch an initial GLB');
assert(!main.includes('setSpectators(catalog)'),'player selection must not warm spectator GLBs');
assert(!main.includes('ensureLoaded(catalog)'),'run start must not load spectator GLBs');
assert(!main.includes('crowdBenchmark'),'obsolete crowd benchmark hook remains');
assert(main.includes("DEFAULT_AVATAR_NAME"),'approved fallback metadata must be canonical');
assert.equal(DEFAULT_AVATAR_NAME,'The Heretic');

assert(crowd.includes('START_CROWD_COUNT=0'),'crowd must be explicitly disabled');
assert(!/GLTFLoader|parseAsync|fetch\s*\(|\.glb/i.test(crowd),'disabled crowd hook must have no spectator GLB loader/fetch path');
assert(avatar.includes('type="file" accept=".glb,model/gltf-binary"'),'local GLB chooser is missing');
assert(avatar.includes('URL.createObjectURL(file)'),'local GLB must use an object URL');
assert(avatar.includes('URL.revokeObjectURL'),'obsolete local object URLs must be revoked');
assert(avatar.includes('onValidateLocalAvatar(nextEntry)'),'local GLB must be parsed/rig-validated before selection');

function fakeFile(name,bytes){
  const blob=new Blob([bytes],{type:'model/gltf-binary'});
  return {name,size:blob.size,slice:(...args)=>blob.slice(...args)};
}
const valid=new ArrayBuffer(12);
const view=new DataView(valid);
view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,12,true);
await assert.doesNotReject(()=>validateLocalGlbFile(fakeFile('custom.glb',valid)));
await assert.rejects(()=>validateLocalGlbFile(fakeFile('custom.txt',valid)),/\.glb/);
const bad=new Uint8Array(12);bad[0]=1;
await assert.rejects(()=>validateLocalGlbFile(fakeFile('bad.glb',bad)),/Invalid GLB file header/);
const tooLarge={name:'huge.glb',size:MAX_LOCAL_GLB_BYTES+1,slice:()=>new Blob()};
await assert.rejects(()=>validateLocalGlbFile(tooLarge),/too large/i);

const safeGeometry={attributes:{position:{count:24000,array:new Float32Array(24000*3)}},morphAttributes:{}};
const safeTexture={isTexture:true,source:{data:{width:2048,height:2048}}};
const safeMaterial={map:safeTexture};
const safeParsed={
  scene:{traverse(fn){fn({isBone:true});fn({isMesh:true,geometry:safeGeometry,material:safeMaterial});}},
  animations:[{tracks:new Array(12).fill({})}]
};
assert.doesNotThrow(()=>validateParsedLocalGlb(safeParsed));
const pathological={
  scene:{traverse(fn){fn({isMesh:true,geometry:{attributes:{position:{count:LOCAL_GLB_COMPLEXITY_LIMITS.vertices+1,array:new Float32Array(3)}},morphAttributes:{}},material:null});}},
  animations:[]
};
assert.throws(()=>validateParsedLocalGlb(pathological),/too complex/i);

console.log(JSON.stringify({check:'roster-bandwidth-invariants',builtIns:10,crowdGlbRequests:0,bootGlbRequestsExpected:0,customUpload:'local-only'}));
