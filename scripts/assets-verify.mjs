import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {auditBuiltIns,avatarManifest,avatarPath} from './lib/asset-audit.mjs';
const cwd=process.cwd(),budget=JSON.parse(await fs.readFile(path.join(cwd,'config/asset-budgets.json'),'utf8')),audit=await auditBuiltIns(cwd),manifest=await avatarManifest(cwd);
assert.equal(audit.assetCount,budget.policy.builtInCount,'built-in asset count drifted');
assert.equal(manifest.length,budget.policy.builtInCount,'avatar manifest count drifted');
assert(audit.totals.bytes<=budget.policy.maxTotalBytes,`total GLB bytes ${audit.totals.bytes} exceed ${budget.policy.maxTotalBytes}`);
for(const x of audit.assets){
 const b=budget.avatars[x.name]||{}; assert(x.bytes<=(b.maxBytes||budget.policy.maxPerAssetBytes),`${x.name} size regression`);assert(x.skinnedMeshCount>0,`${x.name} has no skinned mesh`);assert(x.boneCount>0,`${x.name} has no skeleton joints`);
 for(const [key,limit] of [['triangleCount',b.maxTriangles],['materialCount',b.maxMaterials],['textureCount',b.maxTextures],['animationClipCount',b.maxAnimations],['boneCount',b.maxBones]])if(Number.isFinite(limit))assert(x[key]<=limit,`${x.name} ${key} regression: ${x[key]} > ${limit}`);
 assert(x.maxTextureDimension<=(b.maxTextureDimension||budget.policy.maxTextureDimension),`${x.name} texture dimension regression`);
 for(const ext of x.compressionExtensions)assert(budget.policy.supportedProductionCompression.includes(ext),`${x.name} unsupported production compression: ${ext}`);
 for(const ext of b.requiredExtensions||[])assert(x.compressionExtensions.includes(ext),`${x.name} lost required ${ext}`);
}
for(const entry of manifest)await fs.access(avatarPath(entry,cwd));
try{const committed=JSON.parse(await fs.readFile(path.join(cwd,'reports/assets/asset-manifest.json'),'utf8'));for(const item of committed.assets||[]){const current=audit.assets.find(x=>x.name===item.name);assert(current,`manifest asset missing: ${item.name}`);assert.equal(current.sha256,item.sha256,`${item.name} hash differs from generated manifest`);assert.equal(current.bytes,item.bytes,`${item.name} byte size differs from generated manifest`);}}catch(error){if(error?.code!=='ENOENT')throw error;}
console.log(JSON.stringify({check:'assets-verify',assets:audit.assetCount,totalBytes:audit.totals.bytes}));
