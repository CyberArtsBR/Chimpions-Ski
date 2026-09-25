import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const cwd=process.cwd();
const publicRoot=path.join(cwd,'public');
const characterRoot=path.normalize(path.join(publicRoot,'model/characters'))+path.sep;
const reportPath=path.join(cwd,'reports/assets/static-assets.json');
const STATIC_EXTENSIONS=new Set([
  '.png','.jpg','.jpeg','.webp','.avif','.svg',
  '.mp3','.ogg','.wav','.m4a','.aac','.flac',
  '.glb','.gltf','.bin'
]);

async function walk(dir,out=[]){
  for(const entry of await fs.readdir(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())await walk(full,out);
    else if(entry.isFile())out.push(full);
  }
  return out;
}

function category(ext){
  if(['.png','.jpg','.jpeg','.webp','.avif','.svg'].includes(ext))return 'image';
  if(['.mp3','.ogg','.wav','.m4a','.aac','.flac'].includes(ext))return 'audio';
  if(['.glb','.gltf','.bin'].includes(ext))return 'model';
  return 'other';
}

const files=(await walk(publicRoot))
  .filter(file=>!path.normalize(file).startsWith(characterRoot))
  .filter(file=>STATIC_EXTENSIONS.has(path.extname(file).toLowerCase()));

const assets=[];
for(const file of files){
  const bytes=await fs.readFile(file);
  const ext=path.extname(file).toLowerCase();
  assets.push({
    path:path.relative(cwd,file).replaceAll(path.sep,'/'),
    category:category(ext),
    extension:ext,
    bytes:bytes.byteLength,
    sha256:crypto.createHash('sha256').update(bytes).digest('hex')
  });
}
assets.sort((a,b)=>b.bytes-a.bytes||a.path.localeCompare(b.path));

const byHash=new Map();
for(const asset of assets){
  if(!byHash.has(asset.sha256))byHash.set(asset.sha256,[]);
  byHash.get(asset.sha256).push(asset);
}
const duplicates=[...byHash.entries()]
  .filter(([,group])=>group.length>1)
  .map(([sha256,group])=>({
    sha256,
    copies:group.length,
    bytesEach:group[0].bytes,
    reclaimableBytes:group[0].bytes*(group.length-1),
    paths:group.map(item=>item.path).sort()
  }))
  .sort((a,b)=>b.reclaimableBytes-a.reclaimableBytes);

const categories={};
for(const asset of assets){
  const bucket=categories[asset.category]||{files:0,bytes:0};
  bucket.files++;bucket.bytes+=asset.bytes;categories[asset.category]=bucket;
}

const opportunities=[];
for(const asset of assets){
  if(asset.category==='image'&&asset.bytes>=2*1024*1024)opportunities.push({type:'large-image',path:asset.path,bytes:asset.bytes,note:'Review dimensions/format visually before recompression.'});
  if(asset.category==='audio'&&asset.bytes>=4*1024*1024)opportunities.push({type:'large-audio',path:asset.path,bytes:asset.bytes,note:'Review codec/bitrate and loop quality before recompression.'});
  if(asset.category==='model'&&asset.bytes>=4*1024*1024)opportunities.push({type:'large-secondary-model',path:asset.path,bytes:asset.bytes,note:'Profile runtime usage before geometry or texture compression.'});
}
for(const duplicate of duplicates.slice(0,20))opportunities.push({type:'duplicate-content',paths:duplicate.paths,bytes:duplicate.reclaimableBytes,note:'Byte-identical copies; consolidate only if URL/cache contracts allow it.'});

const report={
  schemaVersion:1,
  generatedAt:new Date().toISOString(),
  scope:'public static assets excluding public/model/characters',
  totals:{files:assets.length,bytes:assets.reduce((sum,item)=>sum+item.bytes,0)},
  categories,
  largest:assets.slice(0,40),
  duplicates,
  opportunities
};

await fs.mkdir(path.dirname(reportPath),{recursive:true});
await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n');

console.table(report.largest.slice(0,20).map(item=>({
  path:item.path,
  category:item.category,
  MB:(item.bytes/1048576).toFixed(2)
})));
console.log(JSON.stringify({
  check:'static-asset-audit',
  files:report.totals.files,
  totalBytes:report.totals.bytes,
  duplicateGroups:duplicates.length,
  opportunities:opportunities.length
}));
