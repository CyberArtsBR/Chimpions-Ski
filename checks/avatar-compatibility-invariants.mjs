import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  AVATAR_COMPATIBILITY_STATUS,
  assertAvatarPlayable,
  avatarNodePath,
  getAvatarCompatibility,
  resolveAvatarRig,
  validateAvatarOverride
} from '../src/avatarCompatibility.js';

class FakeNode{
  constructor(name,{bone=false}={}){this.name=name;this.isBone=bone;this.parent=null;this.children=[];}
  add(child){child.parent=this;this.children.push(child);return child;}
  traverse(fn){fn(this);for(const child of this.children)child.traverse(fn);}
}

const ritualist=getAvatarCompatibility('/model/characters/The%20Ritualist.glb');
assert.equal(ritualist.status,AVATAR_COMPATIBILITY_STATUS.UNSUPPORTED);
assert.match(ritualist.reason,/duplicated Mixamo-style skeleton aliases/i);
assert.throws(()=>assertAvatarPlayable('The Ritualist'),error=>error?.code==='AVATAR_UNSUPPORTED');

const rocker=getAvatarCompatibility('The Rocker');
assert.equal(rocker.status,AVATAR_COMPATIBILITY_STATUS.SUPPORTED);
assert.equal(rocker.override,null,'Rocker must not get a speculative scale override without rendered evidence');
assert.match(rocker.notes,/No avatar-specific scale override/i);

assert(validateAvatarOverride({status:'supported',scaleMultiplier:1,modelOffset:{x:0,y:.1,z:0}}));
assert.throws(()=>validateAvatarOverride({status:'mystery'}),/invalid compatibility status/);
assert.throws(()=>validateAvatarOverride({scaleMultiplier:0}),/scaleMultiplier/);
assert.throws(()=>validateAvatarOverride({snowboardOffset:{x:999}}),/snowboardOffset\.x/);
assert.throws(()=>validateAvatarOverride({bonePaths:{hips:'not-absolute'}}),/absolute node path/);
assert.throws(()=>validateAvatarOverride({bonePaths:{hips:'/Rig/Hips[0]',leftThigh:'/Rig/Hips[0]'}}),/duplicate bone path/);

const model=new FakeNode('Scene');
const armatureA=model.add(new FakeNode('ArmatureA'));
const armatureB=model.add(new FakeNode('ArmatureB'));
for(const armature of [armatureA,armatureB]){
  const hips=armature.add(new FakeNode('mixamorig:Hips',{bone:true}));
  const leftUp=hips.add(new FakeNode('mixamorig:LeftUpLeg',{bone:true}));
  const leftLeg=leftUp.add(new FakeNode('mixamorig:LeftLeg',{bone:true}));
  leftLeg.add(new FakeNode('mixamorig:LeftFoot',{bone:true}));
  const rightUp=hips.add(new FakeNode('mixamorig:RightUpLeg',{bone:true}));
  const rightLeg=rightUp.add(new FakeNode('mixamorig:RightLeg',{bone:true}));
  rightLeg.add(new FakeNode('mixamorig:RightFoot',{bone:true}));
}
const ambiguous=resolveAvatarRig(model,getAvatarCompatibility('Ordinary'));
assert.equal(ambiguous.rig.hips,undefined,'ambiguous aliases must not select the first matching skeleton');
assert.equal(ambiguous.ambiguous.hips.length,2);

const secondHips=armatureB.children[0];
const explicitPaths={
  hips:avatarNodePath(secondHips,model),
  leftThigh:avatarNodePath(secondHips.children[0],model),
  leftShin:avatarNodePath(secondHips.children[0].children[0],model),
  leftFoot:avatarNodePath(secondHips.children[0].children[0].children[0],model),
  rightThigh:avatarNodePath(secondHips.children[1],model),
  rightShin:avatarNodePath(secondHips.children[1].children[0],model),
  rightFoot:avatarNodePath(secondHips.children[1].children[0].children[0],model)
};
const explicit=resolveAvatarRig(model,{rig:{bonePaths:explicitPaths}});
assert.equal(explicit.source,'explicit');
assert.equal(explicit.rig.hips,secondHips);
assert.deepEqual(explicit.missingRequired,[]);

const audit=JSON.parse(await readFile(new URL('../docs/avatar-rig-compat-audit.json',import.meta.url),'utf8'));
const byName=new Map(audit.avatars.map(avatar=>[avatar.filename,avatar]));
const matrix=[
  ['The Ritualist.glb','ambiguous duplicated skeleton'],
  ['The Rocker.glb','extreme bounds / 95-joint'],
  ['The Powder Monkey.glb','high geometry / ordinary 25-joint'],
  ['The AntiPaladin.glb','high geometry / 71-joint'],
  ['The Aberration.glb','representative ordinary 25-joint'],
  ['The Adolescent.glb','representative high-joint-count'],
  ['The Pioneer.glb','representative small body bounds'],
  ['The Ranched.glb','representative large body bounds']
];
for(const [filename] of matrix)assert(byName.has(filename),`compatibility matrix avatar missing: ${filename}`);
assert.equal(byName.get('The Aberration.glb').jointCount,25);
assert(byName.get('The Adolescent.glb').jointCount>=70);
assert(byName.get('The Pioneer.glb').bounds.diagonal<1);
assert(byName.get('The Ranched.glb').bounds.diagonal>1.7);
for(const [filename] of matrix.filter(([name])=>name!=='The Ritualist.glb')){
  assert.deepEqual(byName.get(filename).rig.missingRequired,[],`${filename} missing lower-body gameplay rig`);
}
assert.equal(byName.get('The Ritualist.glb').rig.classification,'UNSUPPORTED');
assert.equal(Object.keys(byName.get('The Rocker.glb').rig.ambiguous||{}).length,0);
assert.equal(byName.get('The Rocker.glb').trickPivot.risk,'REVIEW');

const skierSource=await readFile(new URL('../src/skier.js',import.meta.url),'utf8');
const snowboardSource=await readFile(new URL('../src/snowboardEquipment.js',import.meta.url),'utf8');
const mainSource=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
assert.match(skierSource,/const rest=new Map\(\)/,'authored GLB rest quaternions must remain captured');
assert.match(skierSource,/targetQ\.copy\(rest\.get\(b\)\)/,'pose deltas must rebuild from authored rest');
assert.match(skierSource,/bone\.quaternion\.copy\(displayed\)/,'arm display smoothing must write a cached absolute target');
assert.match(skierSource,/bone\.quaternion\.copy\(base\)/,'ride-mode reset must restore authored rest');
assert.match(skierSource,/resetArmChainToRest\(\);/,'ride-mode switching must reset arm state');
assert.doesNotMatch(skierSource,/function mapRig\(/,'rig mapping must live in the compatibility resolver, not a second mapper');
assert.match(skierSource,/resolveAvatarRig\(model,compatibility\)/,'each loaded avatar must resolve its own rig');
assert.match(skierSource,/root\.userData\.avatarCompatibility=compatibility/,'runtime root must expose compatibility state');
assert.match(snowboardSource,/root\.userData\.restPosition=root\.position\.clone\(\)/,'snowboard must keep a stable rest attachment');
assert.match(snowboardSource,/\{foot:'left',role:'front'/,'left/front binding identity must remain explicit');
assert.match(snowboardSource,/\{foot:'right',role:'rear'/,'right/rear binding identity must remain explicit');
assert.match(skierSource,/riderVisual\.add\(modelCarrier\)/);
assert.match(skierSource,/riderVisual\.add\(snowboard\.root\)/,'snowboard and avatar must share the visual trick parent');
assert.match(mainSource,/createTrickSystem\(\{visualTarget:trickVisualPivot\}\)/,'tricks must rotate the visual pivot, not rig bones');
assert.match(mainSource,/trickVisualPivot\.add\(skier\)/,'avatar/equipment must be attached below the trick visual pivot');

console.log(JSON.stringify({
  check:'avatar-compatibility-invariants',
  status:'ok',
  matrix:matrix.map(([filename,role])=>({filename,role,structural:byName.get(filename)?.rig?.classification||'UNKNOWN'})),
  visualTesting:'not-performed-by-this-automated-check'
}));
