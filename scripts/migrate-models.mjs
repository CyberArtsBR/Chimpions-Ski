import fs from 'node:fs/promises';
import path from 'node:path';

const source=(process.env.CHIMP_SOURCE_URL||'https://chimp-jump.onrender.com').replace(/\/$/,'');
const start=Number(process.env.MIGRATION_START||0);
const count=Number(process.env.MIGRATION_COUNT||20);
const avatars=JSON.parse(await fs.readFile('public/avatars.json','utf8'));
const slice=avatars.slice(start,start+count);

let copied=0,skipped=0;
for(const entry of slice){
  if(!entry.url)continue;
  const rel=decodeURIComponent(entry.url);
  const destination=path.join('public',rel);
  try{
    const stat=await fs.stat(destination);
    if(stat.size>1024){skipped++;continue;}
  }catch{}
  await fs.mkdir(path.dirname(destination),{recursive:true});
  const url=source+'/'+entry.url;
  console.log('Downloading',entry.name,'<-',url);
  const response=await fetch(url,{redirect:'follow'});
  if(!response.ok)throw new Error(`HTTP ${response.status} for ${url}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length<1000)throw new Error(`Downloaded file is unexpectedly small: ${entry.name}`);
  if(bytes.toString('utf8',0,4)!=='glTF')throw new Error(`Downloaded file is not a binary GLB: ${entry.name}`);
  await fs.writeFile(destination,bytes);
  copied++;
  console.log('Saved',destination,bytes.length,'bytes');
}
console.log(JSON.stringify({start,count,requested:slice.length,copied,skipped,total:avatars.length}));
