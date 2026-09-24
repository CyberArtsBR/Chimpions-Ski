export const MAX_LOCAL_GLB_BYTES=50*1024*1024;
export const LOCAL_AVATAR_ID='local-user-glb';

export const LOCAL_GLB_COMPLEXITY_LIMITS=Object.freeze({
  vertices:500000,
  meshes:96,
  materials:64,
  textures:48,
  maxTextureDimension:4096,
  bones:180,
  animations:24,
  animationTracks:700,
  estimatedDecodedGpuBytes:256*1024*1024
});

export const UPLOAD_AVATAR_ACTION=Object.freeze({
  id:'__upload-local-glb__',
  name:'UPLOAD YOUR 3D CHARACTER (GLB)',
  tribe:'LOCAL FILE · NO UPLOAD',
  image:'',
  url:'',
  localUploadAction:true
});

export function isUploadAvatarAction(entry){
  return entry?.id===UPLOAD_AVATAR_ACTION.id||entry?.localUploadAction===true;
}

export async function validateLocalGlbFile(file,{maxBytes=MAX_LOCAL_GLB_BYTES}={}){
  const name=String(file?.name||'');
  const size=Number(file?.size)||0;
  if(!/\.glb$/i.test(name))throw new Error('Choose a .glb file.');
  if(size<12)throw new Error('This GLB is empty or incomplete.');
  if(size>maxBytes)throw new Error('This GLB is too large. Maximum size is '+Math.round(maxBytes/1048576)+' MB.');
  if(typeof file?.slice!=='function')throw new Error('The selected file cannot be read.');

  const header=await file.slice(0,12).arrayBuffer();
  if(header.byteLength<12)throw new Error('This GLB is incomplete.');
  const view=new DataView(header);
  if(view.getUint32(0,true)!==0x46546c67)throw new Error('Invalid GLB file header.');
  if(view.getUint32(4,true)!==2)throw new Error('Only GLB version 2 is supported.');
  if(view.getUint32(8,true)!==size)throw new Error('The GLB file length does not match its header.');
  return {name,size};
}

function textureSize(texture){
  const source=texture?.source?.data??texture?.image??texture?.source;
  const width=Number(source?.width??source?.videoWidth??0)||0;
  const height=Number(source?.height??source?.videoHeight??0)||0;
  return {width,height};
}

export function inspectParsedLocalGlb(gltf){
  const root=gltf?.scene??gltf;
  const geometries=new Set();
  const materials=new Set();
  const textures=new Set();
  const bones=new Set();
  let meshes=0;
  let vertices=0;
  let geometryBytes=0;
  let textureBytes=0;
  let maxTextureDimension=0;

  root?.traverse?.(object=>{
    if(object?.isBone)bones.add(object);
    if(!object?.isMesh)return;
    meshes++;
    const geometry=object.geometry;
    if(geometry&&!geometries.has(geometry)){
      geometries.add(geometry);
      const position=geometry.attributes?.position;
      vertices+=Number(position?.count)||0;
      for(const attribute of Object.values(geometry.attributes||{})){
        const array=attribute?.array;
        if(array?.byteLength)geometryBytes+=array.byteLength;
      }
      if(geometry.index?.array?.byteLength)geometryBytes+=geometry.index.array.byteLength;
      for(const morphList of Object.values(geometry.morphAttributes||{})){
        for(const attribute of morphList||[]){
          const array=attribute?.array;
          if(array?.byteLength)geometryBytes+=array.byteLength;
        }
      }
    }

    const list=Array.isArray(object.material)?object.material:[object.material];
    for(const material of list){
      if(!material)continue;
      materials.add(material);
      for(const value of Object.values(material)){
        if(value?.isTexture)textures.add(value);
      }
      for(const uniform of Object.values(material.uniforms||{})){
        const value=uniform?.value;
        if(value?.isTexture)textures.add(value);
      }
    }
  });

  for(const texture of textures){
    const {width,height}=textureSize(texture);
    maxTextureDimension=Math.max(maxTextureDimension,width,height);
    if(width>0&&height>0)textureBytes+=Math.ceil(width*height*4*4/3);
  }

  const animations=Array.isArray(gltf?.animations)?gltf.animations:[];
  const animationTracks=animations.reduce((sum,clip)=>sum+(clip?.tracks?.length||0),0);
  const estimatedDecodedGpuBytes=geometryBytes+textureBytes;

  return {
    vertices,
    meshes,
    geometries:geometries.size,
    materials:materials.size,
    textures:textures.size,
    maxTextureDimension,
    bones:bones.size,
    animations:animations.length,
    animationTracks,
    geometryBytes,
    textureBytes,
    estimatedDecodedGpuBytes
  };
}

export function validateParsedLocalGlb(gltf,{limits=LOCAL_GLB_COMPLEXITY_LIMITS}={}){
  const stats=inspectParsedLocalGlb(gltf);
  const failures=[];
  const check=(key,label,format=value=>String(value))=>{
    const limit=Number(limits?.[key]);
    if(Number.isFinite(limit)&&stats[key]>limit)failures.push(`${label} ${format(stats[key])} (limit ${format(limit)})`);
  };
  check('vertices','vertices');
  check('meshes','meshes');
  check('materials','materials');
  check('textures','textures');
  check('maxTextureDimension','texture dimension',value=>Math.round(value)+' px');
  check('bones','bones');
  check('animations','animations');
  check('animationTracks','animation tracks');
  check('estimatedDecodedGpuBytes','estimated decoded GPU memory',value=>Math.round(value/1048576)+' MB');

  if(failures.length){
    const error=new Error('This local GLB is too complex for safe real-time use: '+failures.join('; ')+'. Try reducing texture resolution, mesh count, or animation data.');
    error.code='LOCAL_GLB_TOO_COMPLEX';
    error.stats=stats;
    throw error;
  }
  return stats;
}

export function createLocalAvatarEntry(file,objectUrl){
  if(!objectUrl||!String(objectUrl).startsWith('blob:'))throw new Error('Local avatar must use a browser object URL.');
  const displayName=String(file?.name||'Custom Chimpion').replace(/\.glb$/i,'').trim()||'Custom Chimpion';
  return {
    id:LOCAL_AVATAR_ID,
    name:displayName,
    image:'',
    tribe:'LOCAL GLB · SESSION ONLY',
    url:'',
    localObjectUrl:String(objectUrl),
    localOnly:true,
    fileName:String(file?.name||''),
    fileSize:Number(file?.size)||0,
    lastModified:Number(file?.lastModified)||0
  };
}
