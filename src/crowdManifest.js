export const START_CROWD_COUNT=50;

// Ordered from the smallest audited production GLBs upward. Keeping the order
// explicit makes the first start-critical spectators cheap to acquire while the
// remaining unique characters can continue loading progressively.
export const CROWD_LIGHTWEIGHT_IDS=Object.freeze([
  '56','53','179','185','181','208','124','114','100','13',
  '75','95','136','180','166','73','86','6','141','50',
  '126','extra-thefirstborn','182','142','67','109','149','20','189','165',
  '130','52','155','157','41','15','21','209','203','218',
  '99','145','94','28','37','159','89','88','113','116'
]);

const CROWD_LIGHTWEIGHT_ID_SET=new Set(CROWD_LIGHTWEIGHT_IDS);

function sourceKey(entry){
  return String(entry?.id||entry?.url||'');
}

export function chooseCrowdSources(entries=[],count=START_CROWD_COUNT){
  const requested=Math.max(0,Math.floor(Number(count)||0));
  if(!requested)return [];

  const unique=[];
  const seen=new Set();
  for(const entry of entries||[]){
    const key=sourceKey(entry);
    if(!entry?.url||!key||seen.has(key))continue;
    seen.add(key);
    unique.push(entry);
  }
  if(!unique.length)return [];

  const byId=new Map(unique.map(entry=>[String(entry.id),entry]));
  const lightweight=[];
  for(const id of CROWD_LIGHTWEIGHT_IDS){
    const entry=byId.get(id);
    if(entry)lightweight.push(entry);
  }

  const fallback=unique.filter(entry=>!CROWD_LIGHTWEIGHT_ID_SET.has(String(entry.id)));
  return [...lightweight,...fallback].slice(0,Math.min(requested,unique.length));
}

export function crowdSourceKey(entry){
  return sourceKey(entry);
}

export function crowdLodFileName(entry){
  const key=sourceKey(entry).replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'');
  return (key||'fallback')+'.glb';
}

export function crowdAssetUrl(entry){
  if(!entry?.url)return '/models/default.glb';
  return '/generated/crowd/'+crowdLodFileName(entry);
}

export function crowdAssetPublicPath(entry){
  if(!entry?.url)return 'public/models/default.glb';
  return 'public/generated/crowd/'+crowdLodFileName(entry);
}

export function crowdSourceAssetPublicPath(entry){
  if(!entry?.url)return 'public/models/default.glb';
  return 'public/'+decodeURIComponent(String(entry.url).replace(/^\/+/,'')); 
}
