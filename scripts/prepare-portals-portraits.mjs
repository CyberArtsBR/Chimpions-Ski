import fs from 'node:fs/promises';
import path from 'node:path';

const sources=[
  [
    "The Archon",
    "https://arweave.net/5jsHyN5yHpmkT-usm3w--BwC9fZKqFeZ2QGY9Nj4xrE"
  ],
  [
    "The Heretic",
    "https://arweave.net/-o3xO43MWMUll7FBIrJ2j6rK8Nq4K4YPENdzecPOCdE"
  ],
  [
    "The Commodore",
    "https://arweave.net/Lbpd42IUkDzfy2uarQjP2JDeAn4qzpFfO6GUfAeW2bc"
  ],
  [
    "The Pioneer",
    "https://arweave.net/VA0_0h2MzW6ilZsE_iAW0Ppk70fm0k_PN205MF3vD6s"
  ],
  [
    "The Punk",
    "https://arweave.net/Of2DMtt0q9hpAyXVzK-M24rvi_CymCcFi2RLrVnu-sc"
  ],
  [
    "The Street Fighter",
    "https://arweave.net/yRhvGxxkyDkwQwQmxnORL3vacyGI3ERvMugkLkDvjK8"
  ],
  [
    "The Bosun",
    "https://arweave.net/Xct_-Q1nQaFfhHKQfUhyMr2c1KcoCaCTJQpcr9mqdbs"
  ],
  [
    "The Adolescent",
    "https://arweave.net/HGBlJxXb_X0yTwtHQyKPKPvFbJh9r3Ch4-XbZyNoLaI"
  ],
  [
    "The Angsty",
    "https://arweave.net/tInLoI8PpzOmaE6Ju9H1pWaVCUNpFkYk1pXc8Ha8ASM"
  ],
  [
    "The Apologetic",
    "https://arweave.net/GKX1TmFqdV9USvPPP96ugeP7LDajDsg3Fc_LWwahXDs"
  ]
];
const catalogPath='public/avatars.json';
const outDir='public/portraits-original';

function extensionFor(bytes,contentType=''){
  const type=String(contentType).toLowerCase();
  if(type.includes('image/gif'))return 'gif';
  if(type.includes('image/webp'))return 'webp';
  if(type.includes('image/png'))return 'png';
  if(type.includes('image/jpeg')||type.includes('image/jpg'))return 'jpg';
  if(bytes.length>=6&&Buffer.from(bytes.subarray(0,6)).toString('ascii').startsWith('GIF8'))return 'gif';
  if(bytes.length>=8&&bytes[0]===0x89&&Buffer.from(bytes.subarray(1,4)).toString('ascii')==='PNG')return 'png';
  if(bytes.length>=12&&Buffer.from(bytes.subarray(0,4)).toString('ascii')==='RIFF'&&Buffer.from(bytes.subarray(8,12)).toString('ascii')==='WEBP')return 'webp';
  if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'jpg';
  return '';
}

const catalog=JSON.parse(await fs.readFile(catalogPath,'utf8'));
const byName=new Map(catalog.map(entry=>[entry.name,entry]));
await fs.mkdir(outDir,{recursive:true});

let downloaded=0;
for(const [name,url] of sources){
  const entry=byName.get(name);
  if(!entry)continue;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(url,{redirect:'follow',signal:controller.signal,headers:{'user-agent':'Chimpions-Ski-Portals-Build/1.0'}});
    if(!response.ok)throw new Error('HTTP '+response.status);
    const bytes=new Uint8Array(await response.arrayBuffer());
    const ext=extensionFor(bytes,response.headers.get('content-type')||'');
    if(!ext||bytes.length<128)throw new Error('unsupported image response');
    const safe=name.replace(/\s+/g,'_');
    const file='portraits-original/'+safe+'.'+ext;
    await fs.writeFile(path.join('public',file),bytes);
    entry.image=file;
    downloaded++;
    console.log('Portals portrait ready:',name,'→',file,bytes.length+' bytes');
  }catch(error){
    console.warn('Portals portrait fallback:',name,'→',error?.message||String(error));
  }finally{
    clearTimeout(timeout);
  }
}

await fs.writeFile(catalogPath,JSON.stringify(catalog,null,2)+'\n');
console.log('Portals portraits:',downloaded+'/'+sources.length,'original images packaged; local fallbacks cover the rest.');
