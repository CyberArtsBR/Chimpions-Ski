import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {avatarManifest,avatarPath,inspectAvatar,assertCompatible,auditBuiltIns,manifestFrom,budgetsFrom} from './lib/asset-audit.mjs';
const exec=promisify(execFile),cwd=process.cwd(),work=path.join(cwd,'.asset-work'),sourceWork=path.join(work,'source'),out=path.join(cwd,'reports/assets');
const sourceConfig=JSON.parse(await fs.readFile(path.join(cwd,'config/asset-source.json'),'utf8'));
const minAsset=(Number(process.env.ASSET_MIN_SAVINGS_PCT||1.5))/100,minTotal=(Number(process.env.ASSET_MIN_TOTAL_SAVINGS_PCT||2))/100,dry=process.argv.includes('--dry-run');
await fs.rm(work,{recursive:true,force:true});await fs.mkdir(work,{recursive:true});await fs.mkdir(sourceWork,{recursive:true});await fs.mkdir(out,{recursive:true});

async function materializePinnedSource(entry){
  const repoPath=path.posix.join(sourceConfig.sourceDirectory,entry.name+'.glb');
  const destination=path.join(sourceWork,entry.name+'.glb');
  let stdout;
  try{
    ({stdout}=await exec('git',['show',sourceConfig.sourceCommit+':'+repoPath],{cwd,encoding:'buffer',maxBuffer:64*1024*1024}));
  }catch(error){
    throw new Error('Could not read pinned source '+sourceConfig.sourceCommit+':'+repoPath+'. Use a full checkout or fetch that commit first. '+String(error?.message||error));
  }
  await fs.writeFile(destination,stdout);
  const expected=Number(sourceConfig.assets?.[entry.name]?.bytes);
  if(Number.isFinite(expected)&&stdout.byteLength!==expected)throw new Error(entry.name+' pinned source size changed: '+stdout.byteLength+' != '+expected);
  return destination;
}

function tempEntry(entry,file){return {...entry,url:path.relative(path.join(cwd,'public'),file).replaceAll(path.sep,'/')};}
const results=[];let beforeTotal=0,afterTotal=0,already=0;
for(const entry of await avatarManifest(cwd)){
  const production=avatarPath(entry,cwd),source=await materializePinnedSource(entry),beforeStarted=performance.now(),before=await inspectAvatar(tempEntry(entry,source),cwd),beforeInspectMs=performance.now()-beforeStarted;beforeTotal+=before.stats.bytes;
  if(before.stats.compressionExtensions.includes('EXT_meshopt_compression')){already++;afterTotal+=before.stats.bytes;if(!dry)await fs.copyFile(source,production);results.push({name:entry.name,beforeBytes:before.stats.bytes,afterBytes:before.stats.bytes,savedPercent:0,accepted:false,reason:'already Meshopt-compressed',beforeInspectMs:Number(beforeInspectMs.toFixed(2)),afterInspectMs:Number(beforeInspectMs.toFixed(2)),beforeTriangles:before.stats.triangleCount,afterTriangles:before.stats.triangleCount,beforeGpuBytes:before.stats.estimatedDecodedGpuBytes,afterGpuBytes:before.stats.estimatedDecodedGpuBytes});continue;}
  const temp=path.join(work,path.basename(source));let candidate=null,accepted=false,reason='';
  try{
    await exec(process.platform==='win32'?'npx.cmd':'npx',['--no-install','gltf-transform','meshopt',source,temp,'--level','medium'],{cwd,maxBuffer:32*1024*1024});
    const candidateStarted=performance.now();candidate=await inspectAvatar(tempEntry(entry,temp),cwd);candidate.stats.inspectMs=performance.now()-candidateStarted;assertCompatible(before.document,candidate.document,entry.name);
    for(const key of ['skinnedMeshCount','boneCount','animationClipCount'])if(candidate.stats[key]!==before.stats[key])throw new Error(`${key} changed`);
    const savings=(before.stats.bytes-candidate.stats.bytes)/before.stats.bytes;
    if(savings<minAsset)reason=`candidate saved only ${(savings*100).toFixed(2)}%, below ${(minAsset*100).toFixed(2)}% threshold`;
    else{accepted=true;reason=`accepted ${(savings*100).toFixed(2)}% transfer reduction`;if(!dry)await fs.copyFile(temp,production);}
  }catch(error){reason='rejected: '+String(error?.message||error);}
  if(!accepted&&!dry)await fs.copyFile(source,production);
  const after=accepted?candidate.stats:before.stats;afterTotal+=after.bytes;
  results.push({name:entry.name,beforeBytes:before.stats.bytes,candidateBytes:candidate?.stats.bytes??null,afterBytes:after.bytes,savedPercent:Number((((before.stats.bytes-after.bytes)/before.stats.bytes)*100).toFixed(2)),accepted,reason,beforeCompression:before.stats.compressionExtensions,afterCompression:after.compressionExtensions,beforeInspectMs:Number(beforeInspectMs.toFixed(2)),candidateInspectMs:candidate?.stats.inspectMs==null?null:Number(candidate.stats.inspectMs.toFixed(2)),afterInspectMs:Number((accepted?(candidate?.stats.inspectMs??beforeInspectMs):beforeInspectMs).toFixed(2)),beforeTriangles:before.stats.triangleCount,afterTriangles:after.triangleCount,beforeGpuBytes:before.stats.estimatedDecodedGpuBytes,afterGpuBytes:after.estimatedDecodedGpuBytes,beforeTextureBytes:before.stats.estimatedTextureMemory,afterTextureBytes:after.estimatedTextureMemory});
  console.log(`${entry.name}: ${(before.stats.bytes/1048576).toFixed(2)} MB -> ${(after.bytes/1048576).toFixed(2)} MB (${reason})`);
}
if(Number.isFinite(Number(sourceConfig.expectedTotalBytes))&&beforeTotal!==Number(sourceConfig.expectedTotalBytes))throw new Error('Pinned source total '+beforeTotal+' != expected '+sourceConfig.expectedTotalBytes);
const saved=beforeTotal-afterTotal,ratio=beforeTotal?saved/beforeTotal:0,report={schemaVersion:2,generatedAt:new Date().toISOString(),mode:dry?'dry-run':'apply',source:{commit:sourceConfig.sourceCommit,directory:sourceConfig.sourceDirectory,expectedTotalBytes:sourceConfig.expectedTotalBytes},strategy:{geometry:'Meshopt medium via @gltf-transform/cli',textures:'preserved; no automatic lossy resize/recompression',draco:'rejected: redundant decoder/runtime complexity',ktx2:'deferred pending visual/browser validation',minimumPerAssetSavingsPercent:minAsset*100,minimumTotalSavingsPercent:minTotal*100},originalTotalBytes:beforeTotal,optimizedTotalBytes:afterTotal,savedBytes:saved,savedPercent:Number((ratio*100).toFixed(2)),results};
await fs.writeFile(path.join(out,'asset-optimization.json'),JSON.stringify(report,null,2)+'\n');
if(!dry){const audit=await auditBuiltIns(cwd);await fs.writeFile(path.join(out,'asset-audit.json'),JSON.stringify(audit,null,2)+'\n');await fs.writeFile(path.join(out,'asset-manifest.json'),JSON.stringify(manifestFrom(audit),null,2)+'\n');await fs.writeFile(path.join(cwd,'config/asset-budgets.json'),JSON.stringify(budgetsFrom(audit),null,2)+'\n');}
await fs.rm(work,{recursive:true,force:true});
if(already!==(await avatarManifest(cwd)).length&&ratio<minTotal&&process.env.ASSET_ALLOW_LOW_SAVINGS!=='1')throw new Error(`Overall reduction ${(ratio*100).toFixed(2)}% is below ${(minTotal*100).toFixed(2)}%`);
console.log(JSON.stringify({check:'asset-optimize',sourceCommit:sourceConfig.sourceCommit,originalTotalBytes:beforeTotal,optimizedTotalBytes:afterTotal,savedPercent:report.savedPercent}));
