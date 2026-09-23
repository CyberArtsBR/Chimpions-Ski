export const MAX_LOCAL_GLB_BYTES=50*1024*1024;
export const LOCAL_AVATAR_ID='local-user-glb';

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
