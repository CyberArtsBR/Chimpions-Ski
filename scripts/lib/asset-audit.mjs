import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';

await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const COMPRESSION=new Set(['EXT_meshopt_compression','KHR_draco_mesh_compression','KHR_mesh_quantization','KHR_texture_basisu','EXT_texture_webp']);
export const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export async function avatarManifest(cwd=process.cwd()){return JSON.parse(await fs.readFile(path.join(cwd,'public/avatars.json'),'utf8'));}
export function avatarPath(entry,cwd=process.cwd()){return path.join(cwd,'public',decodeURIComponent(entry.url).replace(/^\/+/,''));}
const uniq=list=>[...new Set(list)];

function textureUsage(root){
  const usage=new Map();
  const add=(tex,semantic,colorSpace,material)=>{if(!tex)return;if(!usage.has(tex))usage.set(tex,[]);usage.get(tex).push({semantic,colorSpace,material:material.getName()});};
  for(const m of root.listMaterials()){
    add(m.getBaseColorTexture(),'baseColor','srgb',m); add(m.getNormalTexture(),'normal','linear',m);
    add(m.getMetallicRoughnessTexture(),'metallicRoughness','linear',m); add(m.getOcclusionTexture(),'occlusion','linear',m);
    add(m.getEmissiveTexture(),'emissive','srgb',m);
  }
  return usage;
}
function primitiveTriangles(p){
  const count=(p.getIndices()||p.getAttribute('POSITION'))?.getCount?.()||0;
  const mode=p.getMode?.()??4; return mode===4?Math.floor(count/3):(mode===5||mode===6?Math.max(0,count-2):0);
}
export function fingerprint(document){
  const r=document.getRoot();
  const round=v=>typeof v==='number'&&Number.isFinite(v)?Math.round(v*1e6)/1e6:v;
  const vec=v=>Array.from(v||[],round);
  const canonical=list=>list.map(x=>JSON.stringify(x)).sort();
  return JSON.stringify({
    nodes:canonical(r.listNodes().map(n=>({n:n.getName(),c:n.listChildren().map(x=>x.getName()).sort(),m:n.getMesh()?.getName()||'',s:n.getSkin()?.getName()||'',t:vec(n.getTranslation()),q:vec(n.getRotation()),z:vec(n.getScale())}))),
    skins:canonical(r.listSkins().map(s=>({n:s.getName(),j:s.listJoints().map(j=>j.getName())}))),
    meshes:canonical(r.listMeshes().map(m=>({n:m.getName(),p:m.listPrimitives().map(p=>({a:[...p.listSemantics()].sort(),m:p.getMaterial()?.getName()||'',mode:p.getMode?.()??4}))}))),
    materials:canonical(r.listMaterials().map(m=>({n:m.getName(),a:m.getAlphaMode(),d:m.getDoubleSided()}))),
    animations:[...r.listAnimations().map(a=>a.getName())].sort()
  });
}
export function assertCompatible(before,after,label='asset'){if(fingerprint(before)!==fingerprint(after))throw new Error(`Structural/rig fingerprint changed for ${label}`);}

export async function inspectAvatar(entry,cwd=process.cwd()){
  const file=avatarPath(entry,cwd), bytes=await fs.readFile(file), document=await io.read(file), r=document.getRoot();
  const meshes=r.listMeshes(), primitives=meshes.flatMap(m=>m.listPrimitives()), positions=uniq(primitives.map(p=>p.getAttribute('POSITION')).filter(Boolean));
  const joints=uniq(r.listSkins().flatMap(s=>s.listJoints())), usage=textureUsage(r);
  const textures=r.listTextures().map(t=>{const [width=0,height=0]=t.getSize?.()||[];return {name:t.getName(),mimeType:t.getMimeType?.()||'',width,height,bytes:t.getImage?.()?.byteLength||0,usage:usage.get(t)||[]};});
  const extensions=uniq(r.listExtensionsUsed().map(e=>e.extensionName)).sort();
  const geometryBytes=uniq(r.listAccessors().map(a=>a.getArray?.()).filter(Boolean)).reduce((n,a)=>n+(a.byteLength||0),0);
  const textureBytes=textures.reduce((n,t)=>n+Math.ceil(t.width*t.height*4*4/3),0);
  return {document,stats:{name:entry.name,path:path.relative(cwd,file).replaceAll(path.sep,'/'),bytes:bytes.byteLength,sha256:sha256(bytes),meshCount:meshes.length,primitiveCount:primitives.length,skinnedMeshCount:r.listNodes().filter(n=>n.getMesh()&&n.getSkin()).length,vertexCount:positions.reduce((n,a)=>n+a.getCount(),0),triangleCount:primitives.reduce((n,p)=>n+primitiveTriangles(p),0),materialCount:r.listMaterials().length,textureCount:textures.length,maxTextureDimension:Math.max(0,...textures.flatMap(t=>[t.width,t.height])),boneCount:joints.length,animationClipCount:r.listAnimations().length,estimatedGeometryMemory:geometryBytes,estimatedTextureMemory:textureBytes,estimatedDecodedGpuBytes:geometryBytes+textureBytes,compressionExtensions:extensions.filter(e=>COMPRESSION.has(e)),extensionsUsed:extensions,textures}};
}
export async function auditBuiltIns(cwd=process.cwd()){
  const assets=[]; for(const entry of await avatarManifest(cwd))assets.push((await inspectAvatar(entry,cwd)).stats);
  const totals=assets.reduce((a,x)=>{for(const k of ['bytes','vertexCount','triangleCount','estimatedGeometryMemory','estimatedTextureMemory','estimatedDecodedGpuBytes'])a[k]+=x[k];return a;},{bytes:0,vertexCount:0,triangleCount:0,estimatedGeometryMemory:0,estimatedTextureMemory:0,estimatedDecodedGpuBytes:0});
  return {schemaVersion:1,generatedAt:new Date().toISOString(),assetCount:assets.length,totals,assets};
}
export function manifestFrom(a){return {schemaVersion:1,generatedAt:a.generatedAt,assets:a.assets.map(x=>({name:x.name,path:x.path,sha256:x.sha256,bytes:x.bytes,compression:x.compressionExtensions}))};}
export function budgetsFrom(a){const up=(v,s=1024)=>Math.ceil(v/s)*s,avatars={};for(const x of a.assets)avatars[x.name]={maxBytes:up(Math.max(x.bytes+65536,x.bytes*1.08)),maxTriangles:Math.max(x.triangleCount+1000,Math.ceil(x.triangleCount*1.15)),maxMaterials:x.materialCount+4,maxTextures:x.textureCount+2,maxAnimations:x.animationClipCount+2,maxBones:x.boneCount+8,maxTextureDimension:Math.max(4096,x.maxTextureDimension),requiredExtensions:x.compressionExtensions.includes('EXT_meshopt_compression')?['EXT_meshopt_compression']:[]};return {schemaVersion:1,generatedFrom:'measured optimized production assets',policy:{builtInCount:a.assetCount,maxTotalBytes:up(Math.max(a.totals.bytes+262144,a.totals.bytes*1.06)),maxPerAssetBytes:16*1024*1024,maxTextureDimension:Math.max(4096,...a.assets.map(x=>x.maxTextureDimension)),supportedProductionCompression:['EXT_meshopt_compression','KHR_mesh_quantization','EXT_texture_webp']},avatars};}
