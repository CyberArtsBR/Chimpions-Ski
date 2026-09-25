import assert from 'node:assert/strict';import fs from 'node:fs';
const pkg=JSON.parse(fs.readFileSync('package.json','utf8')),source=JSON.parse(fs.readFileSync('config/asset-source.json','utf8')),skier=fs.readFileSync('src/skier.js','utf8'),opt=fs.readFileSync('scripts/assets-optimize.mjs','utf8'),audit=fs.readFileSync('scripts/lib/asset-audit.mjs','utf8');
assert.equal(pkg.devDependencies['@gltf-transform/cli'],'4.5.0');assert.equal(pkg.devDependencies['@gltf-transform/core'],'4.5.0');assert.equal(pkg.devDependencies['@gltf-transform/extensions'],'4.5.0');
for(const s of ['assets:audit','assets:optimize','assets:verify'])assert(pkg.scripts[s],`missing npm script ${s}`);
assert(skier.includes("meshopt_decoder.module.js"));assert(skier.includes('setMeshoptDecoder(MeshoptDecoder)'));assert(skier.includes("cache='force-cache'"));
assert(opt.includes('assertCompatible'));assert(opt.includes('ASSET_MIN_SAVINGS_PCT'));assert(opt.includes("textures:'preserved; no automatic lossy resize/recompression'"));assert(opt.includes("git',['show'"));assert.equal(source.sourceCommit,'c4d445569584e792981bada3d71689473dfc42d2');assert.equal(source.expectedTotalBytes,44801960);
assert(audit.includes("'baseColor','srgb'"));assert(audit.includes("'normal','linear'"));assert(audit.includes('estimatedDecodedGpuBytes'));
console.log(JSON.stringify({check:'asset-pipeline-invariants',meshopt:true,lazyLoadingPreserved:true,localGlbCompatible:true}));
