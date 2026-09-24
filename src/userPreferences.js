export const CAMERA_MOTION=Object.freeze({
  AUTO:'auto',
  FULL:'full',
  REDUCED:'reduced'
});

const KEYS=Object.freeze({
  avatar:'chimpions-ski-avatar',
  rideMode:'chimpions-ski-ride-mode',
  quality:'chimpions-ski-quality',
  cameraMotion:'chimpions-ski-camera-motion',
  haptics:'chimpions-ski-haptics-enabled'
});

function read(key,fallback=''){
  try{
    const value=globalThis.localStorage?.getItem(key);
    return value==null?fallback:value;
  }catch{
    return fallback;
  }
}
function write(key,value){
  try{
    globalThis.localStorage?.setItem(key,String(value));
    return true;
  }catch{
    return false;
  }
}
function normalizedChoice(value,allowed,fallback){
  const normalized=String(value??'').trim().toLowerCase();
  return allowed.includes(normalized)?normalized:fallback;
}

export function loadUserPreferences(){
  return {
    avatarName:read(KEYS.avatar,''),
    rideMode:normalizedChoice(read(KEYS.rideMode,'ski'),['ski','snowboard'],'ski'),
    quality:normalizedChoice(read(KEYS.quality,'auto'),['auto','high','medium','low'],'auto'),
    cameraMotion:normalizedChoice(read(KEYS.cameraMotion,CAMERA_MOTION.AUTO),Object.values(CAMERA_MOTION),CAMERA_MOTION.AUTO),
    haptics:read(KEYS.haptics,'1')!=='0'
  };
}

export function saveAvatarPreference(name){
  const value=String(name??'').trim();
  return value?write(KEYS.avatar,value):false;
}
export function saveRideModePreference(mode){
  return write(KEYS.rideMode,normalizedChoice(mode,['ski','snowboard'],'ski'));
}
export function saveQualityPreference(mode){
  return write(KEYS.quality,normalizedChoice(mode,['auto','high','medium','low'],'auto'));
}
export function saveCameraMotionPreference(mode){
  return write(KEYS.cameraMotion,normalizedChoice(mode,Object.values(CAMERA_MOTION),CAMERA_MOTION.AUTO));
}
export function saveHapticsPreference(enabled){
  return write(KEYS.haptics,enabled?1:0);
}
