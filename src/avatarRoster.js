export const BUILTIN_AVATAR_NAMES=Object.freeze([
  'The Archon',
  'The Heretic',
  'The Commodore',
  'The Pioneer',
  'The Punk',
  'The Street Fighter',
  'The Bosun',
  'The Adolescent',
  'The Angsty',
  'The Apologetic'
]);

export const DEFAULT_AVATAR_NAME='The Heretic';

const BUILTIN_AVATAR_SET=new Set(BUILTIN_AVATAR_NAMES);

export function isBuiltinAvatarName(name=''){
  return BUILTIN_AVATAR_SET.has(String(name));
}

export function builtinAvatarUrl(name){
  if(!isBuiltinAvatarName(name))throw new Error('Avatar is not in the built-in roster: '+String(name));
  return 'model/characters/'+encodeURIComponent(String(name))+'.glb';
}

export function createBuiltinAvatarEntry(name=DEFAULT_AVATAR_NAME,metadata={}){
  if(!isBuiltinAvatarName(name))throw new Error('Avatar is not in the built-in roster: '+String(name));
  return {
    id:String(metadata.id||('builtin:'+name)),
    name,
    image:String(metadata.image||''),
    tribe:String(metadata.tribe||'The Chimpions'),
    ...metadata,
    name,
    url:builtinAvatarUrl(name),
    builtin:true
  };
}

export function canonicalizeBuiltinCatalog(entries=[]){
  const byName=new Map();
  for(const entry of entries||[]){
    if(!isBuiltinAvatarName(entry?.name))continue;
    if(byName.has(entry.name))throw new Error('Duplicate built-in avatar metadata: '+entry.name);
    byName.set(entry.name,entry);
  }
  return BUILTIN_AVATAR_NAMES.map(name=>{
    const metadata=byName.get(name);
    if(!metadata)throw new Error('Missing built-in avatar metadata: '+name);
    return createBuiltinAvatarEntry(name,metadata);
  });
}
