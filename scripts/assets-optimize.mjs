import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {avatarManifest,avatarPath,inspectAvatar,assertCompatible,auditBuiltIns,manifestFrom,budgetsFrom} from './lib/asset-audit.mjs';
const exec=promisify(execFile),cwd=process.cwd(),work=path.join(cwd,'.asset-work'),out=path.join(cwd,'reports/assets');
const minAsset=(Number(process.env.ASSET_MIN_SAVINGS_PCT||1.5))/100,minTotal=(Number(process.env.ASSET_MIN_TOTAL_SAVINGS_PCT||2))/100,dry=process.argv.includes('--dry-run');
await fs.rm(work,{recursive:true,force:true});await fs.mkdir(work,{recursive:true});await fs.mkdir(out,{recursive:true});
const results=[];let beforeTotal=0,afterTotal=0,already=0;
for(const entry of await avatarManifest(cwd)){
  const source=avatarPath(entry,cwd),before=await inspectAvatar(entry,cwd);beforeTotal+=before.stats.bytes;
  if(before.stats.compressionExtensions.includes('EXT_meshopt_compression')){already++;afterTotal+=before.stats.bytes;results.push({name:entry.name,beforeBytes:before.stats.bytes,afterBytes:before.stats.bytes,savedPercent:0,accepted:false,reason:'already Meshopt-compressed'});continue;}
  const temp=path.join(work,path.basename(source));let candidate=null,accepted=false,reason='';
  try{
    await exec(process.platform==='win32'?'npx.cmd':'npx',['--no-install','gltf-transform','meshopt',source,temp,'--level','medium'],{cwd,maxBuffer:32*1024*1024});
    const tempEntry={...entry,url:path.relative(path.join(cwd,'public'),temp).replaceAll(path.sep,'/')};
    candidate=await inspectAvatar(tempEntry,cwd);assertCompatible(before.document,candidate.document,entry.name);
    for(const key of ['skinnedMeshCount','boneCount','animationClipCount'])if(candidate.stats[key]!==before.stats[key])throw new Error(`${key} changed`);
    const savings=(before.stats.bytes-candidate.stats.bytes)/before.stats.bytes;
    if(savings<minAsset)reason=`candidate saved only ${(savings*100).toFixed(2)}%, below ${(minAsset*100).toFixed(2)}% threshold`;
    else{accepted=true;reason=`accepted ${(savings*100).toFixed(2)}% transfer reduction`;if(!dry)await fs.copyFile(temp,source);}
  }catch(error){reason='rejected: '+String(error?.message||error);}
  const after=accepted?candidate.stats:before.stats;afterTotal+=after.bytes;
  results.push({name:entry.name,beforeBytes:before.stats.bytes,candidateBytes:candidate?.stats.bytes??null,afterBytes:after.bytes,savedPercent:Number((((before.stats.bytes-after.bytes)/before.stats.bytes)*100).toFixed(2)),accepted,reason,beforeCompression:before.stats.compressionExtensions,afterCompression:after.compressionExtensions});
  console.log(`${entry.name}: ${(before.stats.bytes/1048576).toFixed(2)} MB -> ${(after.bytes/1048576).toFixed(2)} MB (${reason})`);
}
const saved=beforeTotal-afterTotal,ratio=beforeTotal?saved/beforeTotal:0,report={schemaVersion:1,generatedAt:new Date().toISOString(),mode:dry?'dry-run':'apply',strategy:{geometry:'Meshopt medium via @gltf-transform/cli',textures:'preserved; no automatic lossy resize/recompression',draco:'rejected: redundant decoder/runtime complexity',ktx2:'deferred pending visual/browser validation',minimumPerAssetSavingsPercent:minAsset*100,minimumTotalSavingsPercent:minTotal*100},originalTotalBytes:beforeTotal,optimizedTotalBytes:afterTotal,savedBytes:saved,savedPercent:Number((ratio*100).toFixed(2)),results};
await fs.writeFile(path.join(out,'asset-optimization.json'),JSON.stringify(report,null,2)+'\n');
if(!dry){const audit=await auditBuiltIns(cwd);await fs.writeFile(path.join(out,'asset-audit.json'),JSON.stringify(audit,null,2)+'\n');await fs.writeFile(path.join(out,'asset-manifest.json'),JSON.stringify(manifestFrom(audit),null,2)+'\n');await fs.writeFile(path.join(cwd,'config/asset-budgets.json'),JSON.stringify(budgetsFrom(audit),null,2)+'\n');}
await fs.rm(work,{recursive:true,force:true});
if(already!==(await avatarManifest(cwd)).length&&ratio<minTotal&&process.env.ASSET_ALLOW_LOW_SAVINGS!=='1')throw new Error(`Overall reduction ${(ratio*100).toFixed(2)}% is below ${(minTotal*100).toFixed(2)}%`);
console.log(JSON.stringify({check:'asset-optimize',originalTotalBytes:beforeTotal,optimizedTotalBytes:afterTotal,savedPercent:report.savedPercent}));
