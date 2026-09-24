export const AVATAR_SELECTOR_INITIAL_RENDER=36;
export const AVATAR_SELECTOR_RENDER_CHUNK=24;

export function normalizeAvatarSearch(value=''){
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLocaleLowerCase();
}

export function buildAvatarSearchIndex(catalog){
  return catalog.map((entry,index)=>({
    entry,
    index,
    id:String(entry?.id??''),
    searchText:normalizeAvatarSearch((entry?.name||'')+' '+(entry?.tribe||''))
  }));
}

export function filterAvatarSearchIndex(index,query=''){
  const normalized=normalizeAvatarSearch(query.trim());
  if(!normalized)return index;
  return index.filter(record=>record.searchText.includes(normalized));
}

export function getAvatarRenderTarget(filteredCount,renderedCount=0,chunkSize=AVATAR_SELECTOR_RENDER_CHUNK){
  if(filteredCount<=0)return 0;
  const initial=renderedCount===0?AVATAR_SELECTOR_INITIAL_RENDER:renderedCount+chunkSize;
  return Math.min(filteredCount,initial);
}
