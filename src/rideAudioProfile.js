const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));

export const RIDE_AUDIO_PROFILES=Object.freeze({
  ski:Object.freeze({
    mode:'ski',
    minSpeedKmh:150,
    maxSpeedKmh:300,
    feelFloor:.62,
    contactGain:1,
    carveGain:1,
    windGain:1,
    contactFrequencyScale:1,
    carveFrequencyScale:1,
    carveQ:.90,
    snowboardScrapeGain:0
  }),
  snowboard:Object.freeze({
    mode:'snowboard',
    minSpeedKmh:150,
    maxSpeedKmh:300,
    feelFloor:.62,
    contactGain:1.07,
    carveGain:1.12,
    windGain:1.07,
    contactFrequencyScale:.86,
    carveFrequencyScale:.78,
    carveQ:.58,
    snowboardScrapeGain:1
  })
});

export const DEFAULT_RIDE_MODE='ski';

export function normalizeRideMode(mode){
  return mode==='snowboard'?'snowboard':'ski';
}

export function getRideAudioProfile(mode=DEFAULT_RIDE_MODE){
  return RIDE_AUDIO_PROFILES[normalizeRideMode(mode)];
}

export function normalizeRideSpeed(speedMetersPerSecond,mode=DEFAULT_RIDE_MODE){
  const profile=getRideAudioProfile(mode);
  const kmh=Math.max(0,Number(speedMetersPerSecond)||0)*3.6;
  const range=Math.max(.001,profile.maxSpeedKmh-profile.minSpeedKmh);
  return clamp((kmh-profile.minSpeedKmh)/range);
}

export function getRideSpeedFeel(speedMetersPerSecond,mode=DEFAULT_RIDE_MODE){
  const profile=getRideAudioProfile(mode);
  const normalized=normalizeRideSpeed(speedMetersPerSecond,mode);
  return profile.feelFloor+(1-profile.feelFloor)*normalized;
}
