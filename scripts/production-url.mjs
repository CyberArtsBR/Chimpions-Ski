export const DEFAULT_PRODUCTION_URL='https://chimpions-ski.onrender.com';

export function resolveProductionUrl(env=process.env,{allowBaseUrl=false}={}){
  const candidate=
    (allowBaseUrl&&env.BASE_URL)||
    env.PRODUCTION_URL||
    env.CHIMPIONS_SKI_PRODUCTION_URL||
    DEFAULT_PRODUCTION_URL;
  let url;
  try{url=new URL(String(candidate));}
  catch{throw new Error('Invalid Chimpions Ski production URL: '+String(candidate));}
  if(url.protocol!=='http:'&&url.protocol!=='https:'){
    throw new Error('Chimpions Ski production URL must use http(s): '+url.protocol);
  }
  return url.href.replace(/\/+$/,'');
}
