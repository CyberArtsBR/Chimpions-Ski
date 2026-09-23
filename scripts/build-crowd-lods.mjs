import path from 'node:path';
import {mkdir,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,prune} from '@gltf-transform/functions';
import sharp from 'sharp';
import {
  START_CROWD_COUNT,
  chooseCrowdSources,
  crowdAssetPublicPath,
  crowdSourceAssetPublicPath
} from '../src/crowdManifest.js';

const MiB=1024*1024;
const TEXTURE_MAX=256;
const JPEG_QUALITY=72;
const WEBP_QUALITY=72;
const GENERATED_BUDGETS=Object.freeze({
  individualBytes:2*MiB,
  criticalBytes:8*MiB,
  fullBytes:50*MiB
});

sharp.cache(false);
sharp.concurrency(2);

function mib(bytes){return Number((bytes/MiB).toFixed(3));}

async function encodeTexture(texture){
  const image=texture.getImage();
  if(!image?.byteLength)return {changed:false,before:0,after:0,mimeType:texture.getMimeType()||''};

  const mimeType=texture.getMimeType()||'';
  const before=image.byteLength;
  let pipeline=sharp(image,{failOn:'none'}).resize({
    width:TEXTURE_MAX,
    height:TEXTURE_MAX,
    fit:'inside',
    withoutEnlargement:true,
    kernel:'lanczos3'
  });
  let output;
  if(mimeType==='image/jpeg'){
    output=await pipeline.jpeg({quality:JPEG_QUALITY,mozjpeg:true}).toBuffer();
  }else if(mimeType==='image/png'){
    output=await pipeline.png({compressionLevel:9,effort:8}).toBuffer();
  }else if(mimeType==='image/webp'){
    output=await pipeline.webp({quality:WEBP_QUALITY,effort:5}).toBuffer();
  }else{
    return {changed:false,before,after:before,mimeType,unsupported:true};
  }
  texture.setImage(new Uint8Array(output));
  texture.setMimeType(mimeType);
  return {changed:true,before,after:output.byteLength,mimeType};
}

async function optimizeOne(io,entry,root){
  const sourceRelative=crowdSourceAssetPublicPath(entry);
  const outputRelative=crowdAssetPublicPath(entry);
  const sourcePath=path.resolve(root,sourceRelative);
  const outputPath=path.resolve(root,outputRelative);
  const sourceInfo=await stat(sourcePath);
  const document=await io.read(sourcePath);
  const rootDoc=document.getRoot();
  const animations=rootDoc.listAnimations();
  for(const animation of animations)animation.dispose();

  const textureStats=[];
  for(const texture of rootDoc.listTextures())textureStats.push(await encodeTexture(texture));

  await document.transform(prune(),dedup());

  const binary=await io.writeBinary(document);
  await mkdir(path.dirname(outputPath),{recursive:true});
  await writeFile(outputPath,binary);

  return {
    id:String(entry.id||''),
    name:entry.name||String(entry.id||'Chimpion'),
    sourcePath:sourceRelative.replace(/\\/g,'/'),
    outputPath:outputRelative.replace(/\\/g,'/'),
    sourceBytes:sourceInfo.size,
    bytes:binary.byteLength,
    reductionPct:Number(((1-binary.byteLength/sourceInfo.size)*100).toFixed(1)),
    animationsRemoved:animations.length,
    textureCount:textureStats.length,
    textureBytesBefore:textureStats.reduce((sum,item)=>sum+item.before,0),
    textureBytesAfter:textureStats.reduce((sum,item)=>sum+item.after,0),
    unsupportedTextureCount:textureStats.filter(item=>item.unsupported).length
  };
}

async function main(){
  const root=process.cwd();
  const catalog=JSON.parse(await readFile(path.resolve(root,'public/avatars.json'),'utf8'));
  const selected=chooseCrowdSources(catalog,START_CROWD_COUNT);
  if(selected.length!==START_CROWD_COUNT){
    throw new Error(`Expected ${START_CROWD_COUNT} crowd sources, found ${selected.length}`);
  }

  const outputDir=path.resolve(root,'public/generated/crowd');
  await rm(outputDir,{recursive:true,force:true});
  await mkdir(outputDir,{recursive:true});

  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const assets=[];
  for(let index=0;index<selected.length;index++){
    const asset=await optimizeOne(io,selected[index],root);
    asset.priority=index+1;
    asset.classification=index<10?'start-critical-near':'progressive-background';
    assets.push(asset);
    console.log(`CROWD_LOD ${String(index+1).padStart(2,'0')}/${START_CROWD_COUNT} ${asset.id} ${mib(asset.sourceBytes)}MiB -> ${mib(asset.bytes)}MiB (${asset.reductionPct}% smaller)`);
  }

  const sourceBytes=assets.reduce((sum,item)=>sum+item.sourceBytes,0);
  const totalBytes=assets.reduce((sum,item)=>sum+item.bytes,0);
  const criticalBytes=assets.slice(0,10).reduce((sum,item)=>sum+item.bytes,0);
  const largestBytes=Math.max(...assets.map(item=>item.bytes));
  const errors=[];
  if(totalBytes>GENERATED_BUDGETS.fullBytes)errors.push(`Generated crowd total ${mib(totalBytes)} MiB exceeds ${mib(GENERATED_BUDGETS.fullBytes)} MiB`);
  if(criticalBytes>GENERATED_BUDGETS.criticalBytes)errors.push(`Generated start-critical crowd ${mib(criticalBytes)} MiB exceeds ${mib(GENERATED_BUDGETS.criticalBytes)} MiB`);
  for(const item of assets){
    if(item.bytes>GENERATED_BUDGETS.individualBytes)errors.push(`${item.name} generated LOD ${mib(item.bytes)} MiB exceeds ${mib(GENERATED_BUDGETS.individualBytes)} MiB`);
    if(item.unsupportedTextureCount)errors.push(`${item.name} has ${item.unsupportedTextureCount} unsupported texture format(s)`);
  }

  const outputManifest={
    schemaVersion:1,
    generatedAt:new Date().toISOString(),
    sourceAssetsPreserved:true,
    textureMaxDimension:TEXTURE_MAX,
    productionCount:START_CROWD_COUNT,
    criticalCount:10,
    summary:{
      sourceBytes,
      generatedBytes:totalBytes,
      sourceMiB:mib(sourceBytes),
      generatedMiB:mib(totalBytes),
      criticalMiB:mib(criticalBytes),
      largestMiB:mib(largestBytes),
      reductionPct:Number((100*(1-totalBytes/sourceBytes)).toFixed(1))
    },
    budgets:{
      individualMiB:mib(GENERATED_BUDGETS.individualBytes),
      criticalMiB:mib(GENERATED_BUDGETS.criticalBytes),
      fullMiB:mib(GENERATED_BUDGETS.fullBytes)
    },
    errors,
    assets
  };
  await writeFile(path.join(outputDir,'manifest.json'),JSON.stringify(outputManifest,null,2)+'\n','utf8');

  console.log('CROWD_LOD_BUILD '+JSON.stringify(outputManifest.summary));
  if(errors.length)throw new Error('Crowd LOD budget failed: '+errors.join('; '));
}

await main();
