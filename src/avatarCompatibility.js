export const AVATAR_COMPATIBILITY_STATUS=Object.freeze({
  SUPPORTED:'supported',
  UNSUPPORTED:'unsupported',
  OVERRIDE_REQUIRED:'override-required'
});

export const AVATAR_RIG_SLOTS=Object.freeze([
  'hips','spine','chest','neck','head',
  'leftShoulder','leftUpperArm','leftForearm','leftHand',
  'rightShoulder','rightUpperArm','rightForearm','rightHand',
  'leftThigh','leftShin','leftFoot','rightThigh','rightShin','rightFoot'
]);

const REQUIRED_GAMEPLAY_SLOTS=Object.freeze([
  'hips','leftThigh','rightThigh','leftShin','rightShin','leftFoot','rightFoot'
]);

const SLOT_ALIASES=Object.freeze({
  hips:['hips','hip','pelvis'],
  spine:['spine','spine0','spine1','spine01'],
  chest:['chest','upperchest','spine2','spine02','spine3'],
  neck:['neck','neck1','necktwist01'],
  head:['head'],
  Shoulder:['shoulder','clavicle','collar'],
  UpperArm:['upperarm','arm','uparm'],
  Forearm:['forearm','lowerarm','elbow'],
  Hand:['hand','wrist'],
  Thigh:['thigh','upleg','upperleg'],
  Shin:['shin','calf','leg','lowerleg','knee'],
  Foot:['foot','ankle']
});

const RULES=Object.freeze({});

function structuredCloneSafe(value){return value==null?value:JSON.parse(JSON.stringify(value));}
function cloneRule(rule,name){
  return {
    name,
    status:rule?.status||AVATAR_COMPATIBILITY_STATUS.SUPPORTED,
    reason:rule?.reason||'No avatar-specific compatibility exception is registered.',
    notes:rule?.notes||'',
    rig:rule?.rig?{...rule.rig,bonePaths:rule.rig.bonePaths?{...rule.rig.bonePaths}:null}:null,
    override:rule?.override?structuredCloneSafe(rule.override):null
  };
}

export function avatarNameFrom(input){
  if(typeof input==='string'){
    const raw=decodeURIComponent(input.split('?')[0].split('#')[0]);
    const base=raw.split('/').pop()||raw;
    return base.replace(/\.glb$/i,'').trim();
  }
  return String(input?.name||avatarNameFrom(input?.url||'')).trim();
}

export function getAvatarCompatibility(input){
  const name=avatarNameFrom(input);
  return cloneRule(RULES[name],name);
}

export class AvatarCompatibilityError extends Error{
  constructor(message,{code='AVATAR_COMPATIBILITY_ERROR',avatar='',details=null}={}){
    super(message);
    this.name='AvatarCompatibilityError';
    this.code=code;
    this.avatar=avatar;
    this.details=details;
  }
}

export function assertAvatarPlayable(input){
  const compatibility=getAvatarCompatibility(input);
  if(compatibility.status===AVATAR_COMPATIBILITY_STATUS.UNSUPPORTED){
    throw new AvatarCompatibilityError(`${compatibility.name||'Avatar'} is unsupported for gameplay: ${compatibility.reason}`,{
      code:'AVATAR_UNSUPPORTED',avatar:compatibility.name,details:compatibility
    });
  }
  if(compatibility.status===AVATAR_COMPATIBILITY_STATUS.OVERRIDE_REQUIRED&&!compatibility.override){
    throw new AvatarCompatibilityError(`${compatibility.name||'Avatar'} requires a validated compatibility override before gameplay.`,{
      code:'AVATAR_OVERRIDE_REQUIRED',avatar:compatibility.name,details:compatibility
    });
  }
  return compatibility;
}

function finiteNumber(value,label,{min=-Infinity,max=Infinity}={}){
  if(!Number.isFinite(value)||value<min||value>max)throw new TypeError(`${label} must be a finite number between ${min} and ${max}`);
}
function validateVector(value,label,{maxAbs=2}={}){
  if(value==null)return;
  if(typeof value!=='object')throw new TypeError(`${label} must be an object`);
  for(const axis of ['x','y','z'])if(value[axis]!=null)finiteNumber(value[axis],`${label}.${axis}`,{min:-maxAbs,max:maxAbs});
}

export function validateAvatarOverride(override={}){
  if(!override||typeof override!=='object'||Array.isArray(override))throw new TypeError('avatar override must be an object');
  if(override.status&&!Object.values(AVATAR_COMPATIBILITY_STATUS).includes(override.status))throw new TypeError(`invalid compatibility status: ${override.status}`);
  if(override.scaleMultiplier!=null)finiteNumber(override.scaleMultiplier,'scaleMultiplier',{min:.05,max:20});
  validateVector(override.modelOffset,'modelOffset',{maxAbs:5});
  validateVector(override.skiOffset,'skiOffset',{maxAbs:2});
  validateVector(override.snowboardOffset,'snowboardOffset',{maxAbs:2});
  if(override.boardY!=null)finiteNumber(override.boardY,'boardY',{min:-.5,max:.75});
  if(override.stanceHalfLength!=null)finiteNumber(override.stanceHalfLength,'stanceHalfLength',{min:.1,max:1});
  if(override.bonePaths!=null){
    if(typeof override.bonePaths!=='object'||Array.isArray(override.bonePaths))throw new TypeError('bonePaths must be an object');
    const seen=new Set();
    for(const [slot,path] of Object.entries(override.bonePaths)){
      if(!AVATAR_RIG_SLOTS.includes(slot))throw new TypeError(`unknown rig slot: ${slot}`);
      if(typeof path!=='string'||!path.startsWith('/'))throw new TypeError(`bone path for ${slot} must be an absolute node path`);
      if(seen.has(path))throw new TypeError(`duplicate bone path override: ${path}`);
      seen.add(path);
    }
  }
  return true;
}

function nameParts(name=''){
  let s=name.replace(/([a-z0-9])([A-Z])/g,'$1 $2').toLowerCase()
    .replace(/mixamorig\d*[:_ ]*/g,'').replace(/cc[_ ]*base[_ ]*/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  let words=s.split(/\s+/).filter(Boolean);
  let side=words.includes('left')||words.includes('l')?'left':words.includes('right')||words.includes('r')?'right':'';
  let core=words.filter(w=>!['left','right','l','r','bone','def','bip','bip001'].includes(w)).join('');
  if(!side&&/^(left|right)/.test(core)){side=core.startsWith('left')?'left':'right';core=core.slice(side.length);}
  return {side,core};
}
function isDescendant(child,ancestor){for(let p=child?.parent;p;p=p.parent)if(p===ancestor)return true;return false;}
function siblingIndex(node){
  const siblings=node?.parent?.children||[];
  const same=siblings.filter(item=>(item?.name||item?.type||'node')===(node?.name||node?.type||'node'));
  return Math.max(0,same.indexOf(node));
}
export function avatarNodePath(node,root=null){
  const parts=[];
  for(let current=node;current&&current!==root;current=current.parent){
    const name=String(current.name||current.type||'node').replaceAll('/','_');
    parts.push(`${name}[${siblingIndex(current)}]`);
  }
  return '/'+parts.reverse().join('/');
}
function collectBones(model,rootLimit=null){
  const bones=[];
  const start=rootLimit||model;
  start?.traverse?.(object=>{if(object?.isBone)bones.push(object);});
  return bones;
}
function findByPath(model,path){
  let found=null;
  model?.traverse?.(node=>{if(!found&&avatarNodePath(node,model)===path)found=node;});
  return found;
}

export function resolveAvatarRig(model,compatibility=getAvatarCompatibility('')){
  const bonePaths=compatibility?.rig?.bonePaths||compatibility?.override?.bonePaths||null;
  let rootLimit=model;
  const rootPath=compatibility?.rig?.skeletonRootPath||compatibility?.override?.skeletonRootPath||null;
  if(rootPath){
    rootLimit=findByPath(model,rootPath);
    if(!rootLimit)return {rig:{},bones:[],ambiguous:{},missing:[...AVATAR_RIG_SLOTS],missingRequired:[...REQUIRED_GAMEPLAY_SLOTS],source:'explicit',error:`skeleton root path not found: ${rootPath}`};
  }
  const bones=collectBones(model,rootLimit);
  const rig={};
  const ambiguous={};
  const used=new Set();

  if(bonePaths){
    for(const slot of AVATAR_RIG_SLOTS){
      const path=bonePaths[slot];
      if(!path)continue;
      const bone=findByPath(model,path);
      if(bone?.isBone&&(!rootLimit||bone===rootLimit||isDescendant(bone,rootLimit))&&!used.has(bone)){
        rig[slot]=bone;used.add(bone);
      }
    }
  }else{
    for(const key of AVATAR_RIG_SLOTS){
      const side=key.startsWith('left')?'left':key.startsWith('right')?'right':'';
      const kind=side?key.slice(side.length):key;
      let matches=bones.filter(b=>{const p=nameParts(b.name);return p.side===side&&SLOT_ALIASES[kind]?.includes(p.core);});
      const aliasMatches=[...matches];
      if(key==='hips'&&matches.length>1)matches=matches.filter(b=>matches.every(other=>other===b||isDescendant(other,b)));
      if((key==='spine'||key==='chest')&&matches.length>1){
        matches=matches.filter(b=>matches.every(other=>other===b||(key==='spine'?isDescendant(other,b):isDescendant(b,other))));
      }
      if(matches.length===1&&!used.has(matches[0])){rig[key]=matches[0];used.add(matches[0]);}
      else if(aliasMatches.length>1)ambiguous[key]=aliasMatches.map(b=>avatarNodePath(b,model));
    }
  }
  const missing=AVATAR_RIG_SLOTS.filter(slot=>!rig[slot]);
  const missingRequired=REQUIRED_GAMEPLAY_SLOTS.filter(slot=>!rig[slot]);
  return {rig,bones,ambiguous,missing,missingRequired,source:bonePaths?'explicit':'aliases',error:null};
}

export function isCatalogAvatarUrl(url=''){
  return /\/model\/characters\/[^/]+\.glb(?:[?#].*)?$/i.test(String(url));
}
