import {createHash} from 'node:crypto';
import {mkdir,readdir,readFile,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const MiB=1024*1024;
const GiB=1024*1024*1024;
const GLB_MAGIC=0x46546c67;
const JSON_CHUNK=0x4e4f534a;
const BIN_CHUNK=0x004e4942;

function parseArgs(argv){
  const options={
    dir:'public/model/characters',
    json:'docs/avatar-asset-audit.json',
    markdown:'docs/avatar-asset-audit.md',
    sourceSha:process.env.ASSET_AUDIT_SOURCE_SHA||''
  };
  for(let i=2;i<argv.length;i++){
    const arg=argv[i];
    const next=()=>argv[++i];
    if(arg==='--dir')options.dir=next();
    else if(arg==='--json')options.json=next();
    else if(arg==='--markdown')options.markdown=next();
    else if(arg==='--source-sha')options.sourceSha=next();
    else if(arg==='--no-markdown')options.markdown='';
    else if(arg==='--help'){
      console.log('Usage: node scripts/audit-avatar-assets.mjs [--dir DIR] [--json FILE] [--markdown FILE] [--source-sha SHA]');
      process.exit(0);
    }else throw new Error('Unknown argument: '+arg);
  }
  return options;
}

function sha256(buffer){
  return createHash('sha256').update(buffer).digest('hex');
}

function stableObject(value){
  if(Array.isArray(value))return value.map(stableObject);
  if(value&&typeof value==='object'){
    const out={};
    for(const key of Object.keys(value).sort()){
      if(key==='name'||key==='extras')continue;
      out[key]=stableObject(value[key]);
    }
    return out;
  }
  return value;
}

function stableJson(value){
  return JSON.stringify(stableObject(value));
}

function hashJson(value){
  return sha256(Buffer.from(stableJson(value)));
}

function pct(value,total){
  return total>0?Number((value*100/total).toFixed(1)):0;
}

function mb(bytes){
  return Number((bytes/MiB).toFixed(3));
}

function parsePngSize(buffer){
  if(buffer.length<24||buffer.toString('ascii',1,4)!=='PNG')return null;
  if(buffer[0]!==0x89)return null;
  return {width:buffer.readUInt32BE(16),height:buffer.readUInt32BE(20),format:'png'};
}

function parseJpegSize(buffer){
  if(buffer.length<4||buffer[0]!==0xff||buffer[1]!==0xd8)return null;
  const sof=new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
  let offset=2;
  while(offset+4<=buffer.length){
    while(offset<buffer.length&&buffer[offset]!==0xff)offset++;
    while(offset<buffer.length&&buffer[offset]===0xff)offset++;
    if(offset>=buffer.length)break;
    const marker=buffer[offset++];
    if(marker===0xd8||marker===0xd9||marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
    if(offset+2>buffer.length)break;
    const length=buffer.readUInt16BE(offset);
    if(length<2||offset+length>buffer.length)break;
    if(sof.has(marker)&&length>=7){
      return {
        width:buffer.readUInt16BE(offset+5),
        height:buffer.readUInt16BE(offset+3),
        format:'jpeg'
      };
    }
    offset+=length;
  }
  return null;
}

function readUInt24LE(buffer,offset){
  return buffer[offset]|(buffer[offset+1]<<8)|(buffer[offset+2]<<16);
}

function parseWebpSize(buffer){
  if(buffer.length<30||buffer.toString('ascii',0,4)!=='RIFF'||buffer.toString('ascii',8,12)!=='WEBP')return null;
  const chunk=buffer.toString('ascii',12,16);
  if(chunk==='VP8X'&&buffer.length>=30){
    return {
      width:1+readUInt24LE(buffer,24),
      height:1+readUInt24LE(buffer,27),
      format:'webp'
    };
  }
  if(chunk==='VP8L'&&buffer.length>=25&&buffer[20]===0x2f){
    const bits=buffer.readUInt32LE(21);
    return {
      width:1+(bits&0x3fff),
      height:1+((bits>>14)&0x3fff),
      format:'webp'
    };
  }
  if(chunk==='VP8 '&&buffer.length>=30){
    return {
      width:buffer.readUInt16LE(26)&0x3fff,
      height:buffer.readUInt16LE(28)&0x3fff,
      format:'webp'
    };
  }
  return {width:null,height:null,format:'webp'};
}

function imageDimensions(buffer,mimeType=''){
  return parsePngSize(buffer)||parseJpegSize(buffer)||parseWebpSize(buffer)||{
    width:null,
    height:null,
    format:mimeType.split('/')[1]||'unknown'
  };
}

function accessorBufferViews(gltf,accessorIndex,target){
  if(accessorIndex==null)return;
  const accessor=gltf.accessors?.[accessorIndex];
  if(!accessor)return;
  if(accessor.bufferView!=null)target.add(accessor.bufferView);
  if(accessor.sparse?.indices?.bufferView!=null)target.add(accessor.sparse.indices.bufferView);
  if(accessor.sparse?.values?.bufferView!=null)target.add(accessor.sparse.values.bufferView);
}

function sumBufferViews(gltf,set){
  let total=0;
  for(const index of set){
    total+=gltf.bufferViews?.[index]?.byteLength||0;
  }
  return total;
}

function getBufferViewBytes(buffer,gltf,binStart,index){
  const view=gltf.bufferViews?.[index];
  if(!view||view.buffer!==0||binStart==null)return null;
  const start=binStart+(view.byteOffset||0);
  const end=start+(view.byteLength||0);
  if(start<0||end>buffer.length||end<start)return null;
  return buffer.subarray(start,end);
}

function parseGlb(buffer,filename){
  if(buffer.length<20)throw new Error('GLB is too small');
  const magic=buffer.readUInt32LE(0);
  const version=buffer.readUInt32LE(4);
  const declaredLength=buffer.readUInt32LE(8);
  if(magic!==GLB_MAGIC)throw new Error('Invalid GLB magic');
  if(version!==2)throw new Error('Unsupported GLB version '+version);
  if(declaredLength>buffer.length)throw new Error('Declared GLB length exceeds file length');

  let offset=12;
  let json=null;
  let jsonBytes=0;
  let binStart=null;
  let binBytes=0;
  while(offset+8<=Math.min(declaredLength,buffer.length)){
    const chunkLength=buffer.readUInt32LE(offset);
    const chunkType=buffer.readUInt32LE(offset+4);
    const start=offset+8;
    const end=start+chunkLength;
    if(end>buffer.length)throw new Error('GLB chunk extends beyond file');
    if(chunkType===JSON_CHUNK){
      jsonBytes=chunkLength;
      const text=buffer.subarray(start,end).toString('utf8').replace(/[\u0000\u0020]+$/g,'');
      json=JSON.parse(text);
    }else if(chunkType===BIN_CHUNK&&binStart==null){
      binStart=start;
      binBytes=chunkLength;
    }
    offset=end;
  }
  if(!json)throw new Error('Missing GLB JSON chunk');

  const geometryViews=new Set();
  const animationViews=new Set();
  const skinViews=new Set();
  const imageViews=new Set();
  let primitiveCount=0;
  let vertexCount=0;
  let indexCount=0;

  for(const mesh of json.meshes||[]){
    for(const primitive of mesh.primitives||[]){
      primitiveCount++;
      for(const accessorIndex of Object.values(primitive.attributes||{})){
        accessorBufferViews(json,accessorIndex,geometryViews);
      }
      for(const target of primitive.targets||[]){
        for(const accessorIndex of Object.values(target||{}))accessorBufferViews(json,accessorIndex,geometryViews);
      }
      if(primitive.indices!=null){
        accessorBufferViews(json,primitive.indices,geometryViews);
        indexCount+=json.accessors?.[primitive.indices]?.count||0;
      }
      const positionAccessor=primitive.attributes?.POSITION;
      if(positionAccessor!=null)vertexCount+=json.accessors?.[positionAccessor]?.count||0;
      const dracoView=primitive.extensions?.KHR_draco_mesh_compression?.bufferView;
      if(dracoView!=null)geometryViews.add(dracoView);
    }
  }

  for(const animation of json.animations||[]){
    for(const sampler of animation.samplers||[]){
      accessorBufferViews(json,sampler.input,animationViews);
      accessorBufferViews(json,sampler.output,animationViews);
    }
  }

  for(const skin of json.skins||[]){
    accessorBufferViews(json,skin.inverseBindMatrices,skinViews);
  }

  const images=[];
  for(let i=0;i<(json.images||[]).length;i++){
    const image=json.images[i];
    let bytes=null;
    let embedded=false;
    let byteLength=0;
    if(image.bufferView!=null){
      imageViews.add(image.bufferView);
      bytes=getBufferViewBytes(buffer,json,binStart,image.bufferView);
      embedded=!!bytes;
      byteLength=bytes?.length||json.bufferViews?.[image.bufferView]?.byteLength||0;
    }else if(typeof image.uri==='string'&&image.uri.startsWith('data:')){
      const comma=image.uri.indexOf(',');
      if(comma>=0){
        const meta=image.uri.slice(0,comma);
        const body=image.uri.slice(comma+1);
        bytes=meta.includes(';base64')?Buffer.from(body,'base64'):Buffer.from(decodeURIComponent(body));
        embedded=true;
        byteLength=bytes.length;
      }
    }
    const dimensions=bytes?imageDimensions(bytes,image.mimeType):{width:null,height:null,format:image.mimeType?.split('/')[1]||'external'};
    images.push({
      index:i,
      name:image.name||'',
      mimeType:image.mimeType||'',
      embedded,
      bytes:byteLength,
      sha256:bytes?sha256(bytes):null,
      width:dimensions.width,
      height:dimensions.height,
      format:dimensions.format,
      uri:image.uri&&!image.uri.startsWith('data:')?image.uri:null
    });
  }

  const materialHashes=(json.materials||[]).map(material=>hashJson(material));
  const materialGroups=new Map();
  for(const hash of materialHashes)materialGroups.set(hash,(materialGroups.get(hash)||0)+1);
  const duplicateMaterialGroups=[...materialGroups.entries()]
    .filter(([,count])=>count>1)
    .map(([hash,count])=>({sha256:hash,count,duplicates:count-1}))
    .sort((a,b)=>b.count-a.count||a.sha256.localeCompare(b.sha256));

  const geometryChunks=[];
  for(const viewIndex of [...geometryViews].sort((a,b)=>a-b)){
    const bytes=getBufferViewBytes(buffer,json,binStart,viewIndex);
    if(!bytes)continue;
    geometryChunks.push({
      bufferView:viewIndex,
      bytes:bytes.length,
      sha256:sha256(bytes)
    });
  }

  const parents=new Map();
  for(let i=0;i<(json.nodes||[]).length;i++){
    for(const child of json.nodes[i].children||[])parents.set(child,i);
  }
  const referencedNodes=new Set();
  const visitNode=index=>{
    if(index==null||referencedNodes.has(index)||!json.nodes?.[index])return;
    referencedNodes.add(index);
    for(const child of json.nodes[index].children||[])visitNode(child);
  };
  for(const scene of json.scenes||[])for(const root of scene.nodes||[])visitNode(root);
  const markNodeAndParents=index=>{
    let current=index;
    while(current!=null&&!referencedNodes.has(current)){
      referencedNodes.add(current);
      current=parents.get(current);
    }
  };
  for(const skin of json.skins||[]){
    for(const joint of skin.joints||[])markNodeAndParents(joint);
    if(skin.skeleton!=null)markNodeAndParents(skin.skeleton);
  }
  for(const animation of json.animations||[]){
    for(const channel of animation.channels||[]){
      if(channel.target?.node!=null)markNodeAndParents(channel.target.node);
    }
  }
  const unusedNodes=[];
  for(let i=0;i<(json.nodes||[]).length;i++){
    if(!referencedNodes.has(i))unusedNodes.push({index:i,name:json.nodes[i].name||''});
  }

  const usedViews=new Set([...geometryViews,...animationViews,...skinViews,...imageViews]);
  const allViewBytes=(json.bufferViews||[]).reduce((sum,view)=>sum+(view.byteLength||0),0);
  const usedViewBytes=sumBufferViews(json,usedViews);

  const embeddedImageBytes=images.reduce((sum,image)=>sum+(image.embedded?image.bytes:0),0);
  const maxTexturePixels=images.reduce((max,image)=>{
    if(!image.width||!image.height)return max;
    return Math.max(max,image.width*image.height);
  },0);
  const oversizedTextures=images.filter(image=>
    (image.width&&image.width>2048)||(image.height&&image.height>2048)
  ).map(image=>({
    index:image.index,
    name:image.name,
    width:image.width,
    height:image.height,
    bytes:image.bytes,
    sha256:image.sha256
  }));

  const extensionsUsed=[...(json.extensionsUsed||[])].sort();
  const extensionsRequired=[...(json.extensionsRequired||[])].sort();

  return {
    filename,
    bytes:buffer.length,
    mb:mb(buffer.length),
    glbVersion:version,
    declaredBytes:declaredLength,
    jsonBytes,
    binBytes,
    meshCount:json.meshes?.length||0,
    primitiveCount,
    vertexCount,
    indexCount,
    nodeCount:json.nodes?.length||0,
    unusedNodeCount:unusedNodes.length,
    unusedNodes,
    materialCount:json.materials?.length||0,
    duplicateMaterialCount:duplicateMaterialGroups.reduce((sum,g)=>sum+g.duplicates,0),
    duplicateMaterialGroups,
    materialHashes,
    textureCount:json.textures?.length||0,
    imageCount:images.length,
    embeddedImageCount:images.filter(image=>image.embedded).length,
    embeddedImageBytes,
    embeddedImageMb:mb(embeddedImageBytes),
    images,
    maxTexturePixels,
    oversizedTextures,
    animationCount:json.animations?.length||0,
    skinCount:json.skins?.length||0,
    hasSkeleton:(json.skins?.length||0)>0,
    geometryBytes:sumBufferViews(json,geometryViews),
    animationBytes:sumBufferViews(json,animationViews),
    skinBytes:sumBufferViews(json,skinViews),
    imageBufferViewBytes:sumBufferViews(json,imageViews),
    otherBufferViewBytes:Math.max(0,allViewBytes-usedViewBytes),
    geometryChunks,
    extensionsUsed,
    extensionsRequired,
    compression:{
      draco:extensionsUsed.includes('KHR_draco_mesh_compression'),
      meshopt:extensionsUsed.includes('EXT_meshopt_compression'),
      ktx2:extensionsUsed.includes('KHR_texture_basisu')
    }
  };
}

function contributorEvidence(model){
  const contributors=[
    ['embedded textures',model.embeddedImageBytes],
    ['mesh/geometry buffers',model.geometryBytes],
    ['animation buffers',model.animationBytes],
    ['skin buffers',model.skinBytes],
    ['JSON metadata',model.jsonBytes]
  ].filter(([,bytes])=>bytes>0).sort((a,b)=>b[1]-a[1]);
  const dominant=contributors.slice(0,3).map(([label,bytes])=>({
    label,
    bytes,
    mb:mb(bytes),
    percentOfGlb:pct(bytes,model.bytes)
  }));
  const reasons=[];
  const first=dominant[0];
  if(first)reasons.push(first.label+' '+first.percentOfGlb+'% ('+first.mb+' MiB)');
  if(model.oversizedTextures.length)reasons.push(model.oversizedTextures.length+' texture(s) > 2048 px');
  if(model.animationBytes/model.bytes>.15)reasons.push('animation buffers '+pct(model.animationBytes,model.bytes)+'%');
  if(model.geometryBytes/model.bytes>.35)reasons.push('geometry buffers '+pct(model.geometryBytes,model.bytes)+'%');
  if(model.embeddedImageBytes/model.bytes>.35)reasons.push('embedded textures '+pct(model.embeddedImageBytes,model.bytes)+'%');
  if(!model.compression.draco&&!model.compression.meshopt)reasons.push('no Draco/Meshopt geometry extension');
  if(model.imageCount&&!model.compression.ktx2)reasons.push('no KTX2/Basis texture extension');
  return {dominant,reasons:[...new Set(reasons)]};
}

function duplicateGroups(records,keyGetter,bytesGetter,fileGetter){
  const map=new Map();
  for(const record of records){
    const key=keyGetter(record);
    if(!key)continue;
    let group=map.get(key);
    if(!group){
      group={sha256:key,bytes:bytesGetter(record),occurrences:0,files:new Set()};
      map.set(key,group);
    }
    group.occurrences++;
    group.files.add(fileGetter(record));
  }
  return [...map.values()]
    .filter(group=>group.occurrences>1)
    .map(group=>({
      sha256:group.sha256,
      bytes:group.bytes,
      mb:mb(group.bytes),
      occurrences:group.occurrences,
      uniqueFiles:group.files.size,
      files:[...group.files].sort(),
      theoreticalSavingsBytes:group.bytes*(group.occurrences-1),
      theoreticalSavingsMb:mb(group.bytes*(group.occurrences-1))
    }))
    .sort((a,b)=>b.theoreticalSavingsBytes-a.theoreticalSavingsBytes||a.sha256.localeCompare(b.sha256));
}

function median(values){
  if(!values.length)return 0;
  const sorted=[...values].sort((a,b)=>a-b);
  const middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
}

function markdownTable(headers,rows){
  const safe=value=>String(value??'').replace(/\|/g,'\\|').replace(/\n/g,' ');
  return [
    '| '+headers.map(safe).join(' | ')+' |',
    '| '+headers.map(()=> '---').join(' | ')+' |',
    ...rows.map(row=>'| '+row.map(safe).join(' | ')+' |')
  ].join('\n');
}

function makeMarkdown(report){
  const s=report.summary;
  const lines=[
    '# Chimpions Ski avatar asset audit',
    '',
    'Source baseline: `'+(report.sourceSha||'not supplied')+'`',
    '',
    'This report is generated by `scripts/audit-avatar-assets.mjs`. The audit is non-destructive: no production GLB is modified.',
    '',
    '## Collection summary',
    '',
    '- GLBs: **'+s.totalGlbs+'**',
    '- Total: **'+s.totalMiB.toFixed(2)+' MiB** ('+s.totalGiB.toFixed(3)+' GiB)',
    '- Mean: **'+s.meanMiB.toFixed(3)+' MiB**',
    '- Median: **'+s.medianMiB.toFixed(3)+' MiB**',
    '- > 4 MiB: **'+s.thresholds.over4MiB+'**',
    '- > 8 MiB: **'+s.thresholds.over8MiB+'**',
    '- > 12 MiB: **'+s.thresholds.over12MiB+'**',
    '- > 16 MiB: **'+s.thresholds.over16MiB+'**',
    '- Exact duplicated embedded-image theoretical savings: **'+report.duplicates.images.theoreticalSavingsMiB.toFixed(2)+' MiB**',
    '- Exact duplicated geometry-buffer theoretical savings: **'+report.duplicates.geometry.theoreticalSavingsMiB.toFixed(2)+' MiB**',
    '',
    '## Largest 20',
    '',
    markdownTable(
      ['Rank','GLB','MiB','Meshes','Prims','Vertices','Materials','Textures','Image MiB','Animations','Skins'],
      report.largest20.map(m=>[
        m.rankLargest,m.filename,m.mb.toFixed(3),m.meshCount,m.primitiveCount,m.vertexCount,
        m.materialCount,m.textureCount,m.embeddedImageMb.toFixed(3),m.animationCount,m.skinCount
      ])
    ),
    '',
    '## Why the largest files are large',
    ''
  ];
  for(const model of report.largest20){
    lines.push(
      '- **'+model.filename+'** — '+model.mb.toFixed(3)+' MiB. '+
      (model.sizeEvidence.reasons.join('; ')||'no single dominant contributor')
    );
  }
  lines.push(
    '',
    '## Smallest 20',
    '',
    markdownTable(
      ['Smallest rank','GLB','MiB','Meshes','Prims','Vertices','Textures','Skins'],
      report.smallest20.map(m=>[
        m.rankSmallest,m.filename,m.mb.toFixed(3),m.meshCount,m.primitiveCount,m.vertexCount,m.textureCount,m.skinCount
      ])
    ),
    '',
    '## Duplicate resources',
    '',
    '### Exact embedded images',
    ''
  );
  if(report.duplicates.images.groups.length){
    lines.push(markdownTable(
      ['MiB each','Occurrences','Files','Theoretical saving MiB','SHA-256'],
      report.duplicates.images.groups.slice(0,20).map(g=>[
        g.mb.toFixed(3),g.occurrences,g.uniqueFiles,g.theoreticalSavingsMb.toFixed(3),g.sha256.slice(0,16)+'…'
      ])
    ));
  }else lines.push('No exact duplicate embedded images detected.');
  lines.push('','### Exact geometry buffer chunks','');
  if(report.duplicates.geometry.groups.length){
    lines.push(markdownTable(
      ['MiB each','Occurrences','Files','Theoretical saving MiB','SHA-256'],
      report.duplicates.geometry.groups.slice(0,20).map(g=>[
        g.mb.toFixed(3),g.occurrences,g.uniqueFiles,g.theoreticalSavingsMb.toFixed(3),g.sha256.slice(0,16)+'…'
      ])
    ));
  }else lines.push('No exact duplicate geometry buffer chunks detected.');
  lines.push(
    '',
    '### Material duplication',
    '',
    '- Models containing exact duplicate material JSON definitions: **'+report.duplicates.materials.modelsWithDuplicates+'**',
    '- Duplicate material definitions beyond the first instance: **'+report.duplicates.materials.duplicateDefinitions+'**',
    '- Cross-model exact material fingerprints repeated: **'+report.duplicates.materials.crossModelGroups+'**',
    '',
    '## Texture-resolution flags',
    '',
    '- Models with at least one embedded image over 2048 px on either axis: **'+report.textureAudit.modelsOver2048+'**',
    '- Embedded images over 2048 px: **'+report.textureAudit.imagesOver2048+'**',
    '- Embedded images at/over 4096 px on either axis: **'+report.textureAudit.imagesAtLeast4096+'**',
    '',
    '## Suggested lightweight preload candidates',
    '',
    'These are selected strictly from asset evidence: valid skinned GLBs, sorted by file size, excluding models with >4096 px embedded textures. Runtime/visual smoke testing is still required before changing selection policy.',
    '',
    markdownTable(
      ['GLB','MiB','Vertices','Textures','Image MiB','Animations'],
      report.preloadCandidates.map(m=>[
        m.filename,m.mb.toFixed(3),m.vertexCount,m.textureCount,m.embeddedImageMb.toFixed(3),m.animationCount
      ])
    ),
    '',
    '## Optimization plan',
    '',
    '1. **Prioritize the >8 MiB cohort first.** The report records evidence per model so texture-heavy, geometry-heavy, and animation-heavy files can be treated differently.',
    '2. **Meshopt or Draco:** use for models whose mesh/geometry buffers are a dominant contributor. Meshopt is attractive for web decode/runtime integration; Draco can produce strong geometry compression but adds decoder considerations. Do not transcode blindly—validate skinned attributes, morph targets, normals, UVs, and rig behavior.',
    '3. **KTX2/Basis:** strongest general option for texture-heavy GLBs, especially repeated 2K/4K color maps. Preserve alpha where needed and use normal-map-appropriate encoding.',
    '4. **Texture resize:** downscale only images flagged by measured dimensions. Large maps should be reviewed by role; face/branding details may justify resolution that clothing/accessory maps do not.',
    '5. **JPEG/WebP source replacement:** suitable for opaque photographic/color textures where alpha is unnecessary. Do not use lossy encoding for masks or normal maps without visual validation.',
    '6. **Material deduplication:** merge exact duplicate material definitions where shader semantics and texture bindings remain identical.',
    '7. **Animation cleanup:** files with material animation-buffer share can be audited for clips unused by Chimpions Ski. Remove only after confirming the runtime does not consume them.',
    '8. **Geometry simplification:** target individual outliers after compression. Preserve silhouette, hands/face, skis attachment regions, skin weights, and joint topology.',
    '9. **Shared-resource architecture:** exact duplicate image/geometry hashes quantify theoretical savings, but standalone GLBs cannot share their embedded payload automatically. Realizing those savings requires external shared assets or a build-time packaging strategy.',
    '',
    '## Method notes',
    '',
    '- Vertex count is the sum of POSITION accessor counts across mesh primitives.',
    '- Geometry bytes are unique bufferView bytes referenced by primitive attributes, indices, morph targets, or Draco primitive bufferViews.',
    '- Embedded image sizes are exact bufferView/data-URI payload bytes.',
    '- Duplicate images and geometry are byte-identical SHA-256 matches, not perceptual similarity.',
    '- Material duplicates are exact normalized JSON matches with presentation-only `name`/`extras` removed.',
    '- Unused nodes are nodes unreachable from scenes, skin joints/skeleton roots, or animation target nodes.',
    '- Reports contain no timestamps so identical assets and source SHA yield deterministic output.',
    ''
  );
  return lines.join('\n');
}

async function main(){
  const options=parseArgs(process.argv);
  const names=(await readdir(options.dir))
    .filter(name=>name.toLowerCase().endsWith('.glb'))
    .sort((a,b)=>a.localeCompare(b,'en'));
  if(!names.length)throw new Error('No GLBs found in '+options.dir);

  const models=[];
  const errors=[];
  for(const filename of names){
    const filePath=path.join(options.dir,filename);
    try{
      const buffer=await readFile(filePath);
      const parsed=parseGlb(buffer,filename);
      const st=await stat(filePath);
      parsed.statBytes=st.size;
      parsed.valid=st.size===parsed.bytes;
      models.push(parsed);
    }catch(error){
      const st=await stat(filePath).catch(()=>({size:0}));
      errors.push({filename,bytes:st.size,error:String(error?.message||error)});
    }
  }

  const ranked=[...models].sort((a,b)=>b.bytes-a.bytes||a.filename.localeCompare(b.filename,'en'));
  ranked.forEach((model,index)=>{model.rankLargest=index+1;model.percentileLargest=Number(((index+1)*100/models.length).toFixed(2));});
  const smallest=[...models].sort((a,b)=>a.bytes-b.bytes||a.filename.localeCompare(b.filename,'en'));
  smallest.forEach((model,index)=>{model.rankSmallest=index+1;});

  for(const model of models)model.sizeEvidence=contributorEvidence(model);

  const imageRecords=[];
  const geometryRecords=[];
  const materialRecords=[];
  for(const model of models){
    for(const image of model.images){
      if(image.sha256)imageRecords.push({...image,filename:model.filename});
    }
    for(const chunk of model.geometryChunks)geometryRecords.push({...chunk,filename:model.filename});
    for(const hash of model.materialHashes)materialRecords.push({sha256:hash,filename:model.filename,bytes:0});
  }

  const imageDupes=duplicateGroups(imageRecords,r=>r.sha256,r=>r.bytes,r=>r.filename);
  const geometryDupes=duplicateGroups(geometryRecords,r=>r.sha256,r=>r.bytes,r=>r.filename);
  const materialDupes=duplicateGroups(materialRecords,r=>r.sha256,()=>0,r=>r.filename);

  const totalBytes=models.reduce((sum,m)=>sum+m.bytes,0);
  const sizes=models.map(m=>m.bytes);
  const preloadCandidates=[...models]
    .filter(m=>m.hasSkeleton&&!m.oversizedTextures.some(t=>(t.width||0)>4096||(t.height||0)>4096))
    .sort((a,b)=>a.bytes-b.bytes||a.embeddedImageBytes-b.embeddedImageBytes||a.vertexCount-b.vertexCount||a.filename.localeCompare(b.filename,'en'))
    .slice(0,12);

  const allOversized=models.flatMap(model=>model.oversizedTextures.map(texture=>({filename:model.filename,...texture})));
  const report={
    schemaVersion:1,
    sourceSha:options.sourceSha,
    assetDirectory:options.dir.replace(/\\/g,'/'),
    summary:{
      totalGlbs:names.length,
      validGlbs:models.length,
      invalidGlbs:errors.length,
      totalBytes,
      totalMiB:totalBytes/MiB,
      totalGiB:totalBytes/GiB,
      meanBytes:models.length?totalBytes/models.length:0,
      meanMiB:models.length?totalBytes/models.length/MiB:0,
      medianBytes:median(sizes),
      medianMiB:median(sizes)/MiB,
      thresholds:{
        over4MiB:models.filter(m=>m.bytes>4*MiB).length,
        over8MiB:models.filter(m=>m.bytes>8*MiB).length,
        over12MiB:models.filter(m=>m.bytes>12*MiB).length,
        over16MiB:models.filter(m=>m.bytes>16*MiB).length
      }
    },
    largest20:ranked.slice(0,20),
    smallest20:smallest.slice(0,20),
    loadTimePriority:ranked.slice(0,30).map(model=>({
      filename:model.filename,
      bytes:model.bytes,
      mb:model.mb,
      embeddedImageBytes:model.embeddedImageBytes,
      geometryBytes:model.geometryBytes,
      animationBytes:model.animationBytes,
      vertexCount:model.vertexCount,
      textureCount:model.textureCount,
      oversizedTextureCount:model.oversizedTextures.length,
      reasons:model.sizeEvidence.reasons
    })),
    preloadCandidates,
    duplicates:{
      images:{
        groups:imageDupes,
        theoreticalSavingsBytes:imageDupes.reduce((sum,g)=>sum+g.theoreticalSavingsBytes,0),
        theoreticalSavingsMiB:imageDupes.reduce((sum,g)=>sum+g.theoreticalSavingsBytes,0)/MiB
      },
      geometry:{
        groups:geometryDupes,
        theoreticalSavingsBytes:geometryDupes.reduce((sum,g)=>sum+g.theoreticalSavingsBytes,0),
        theoreticalSavingsMiB:geometryDupes.reduce((sum,g)=>sum+g.theoreticalSavingsBytes,0)/MiB
      },
      materials:{
        modelsWithDuplicates:models.filter(m=>m.duplicateMaterialCount>0).length,
        duplicateDefinitions:models.reduce((sum,m)=>sum+m.duplicateMaterialCount,0),
        crossModelGroups:materialDupes.filter(g=>g.uniqueFiles>1).length,
        groups:materialDupes
      }
    },
    textureAudit:{
      modelsOver2048:models.filter(m=>m.oversizedTextures.length>0).length,
      imagesOver2048:allOversized.length,
      imagesAtLeast4096:allOversized.filter(t=>(t.width||0)>=4096||(t.height||0)>=4096).length,
      flagged:allOversized
    },
    compressionAudit:{
      dracoModels:models.filter(m=>m.compression.draco).length,
      meshoptModels:models.filter(m=>m.compression.meshopt).length,
      ktx2Models:models.filter(m=>m.compression.ktx2).length
    },
    errors,
    models:[...models].sort((a,b)=>a.filename.localeCompare(b.filename,'en'))
  };

  if(options.json){
    await mkdir(path.dirname(options.json),{recursive:true});
    await writeFile(options.json,JSON.stringify(report,null,2)+'\n');
  }
  if(options.markdown){
    await mkdir(path.dirname(options.markdown),{recursive:true});
    await writeFile(options.markdown,makeMarkdown(report)+'\n');
  }

  console.log(JSON.stringify({
    audit:'avatar-assets',
    sourceSha:report.sourceSha,
    totalGlbs:report.summary.totalGlbs,
    totalMiB:Number(report.summary.totalMiB.toFixed(2)),
    medianMiB:Number(report.summary.medianMiB.toFixed(3)),
    meanMiB:Number(report.summary.meanMiB.toFixed(3)),
    thresholds:report.summary.thresholds,
    duplicateImageSavingsMiB:Number(report.duplicates.images.theoreticalSavingsMiB.toFixed(2)),
    duplicateGeometrySavingsMiB:Number(report.duplicates.geometry.theoreticalSavingsMiB.toFixed(2)),
    largest20:report.largest20.map(m=>({filename:m.filename,mb:m.mb,reasons:m.sizeEvidence.reasons})),
    preloadCandidates:report.preloadCandidates.map(m=>({filename:m.filename,mb:m.mb}))
  },null,2));
}

await main();
