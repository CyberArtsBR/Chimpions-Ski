const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,min,max,fallback)=>Math.max(min,Math.min(max,finite(value,fallback)));

export const DEFAULT_ENVIRONMENT_QUALITY=Object.freeze({
  particleDensityMultiplier:1,
  decorativeDensity:1,
  distantSceneryDetail:1,
  decorativeShadows:true,
  snowDetailLevel:1
});

export function normalizeEnvironmentQuality(input={}){
  const source={...DEFAULT_ENVIRONMENT_QUALITY,...(input||{})};
  return Object.freeze({
    particleDensityMultiplier:clamp(source.particleDensityMultiplier,0,1.5,1),
    decorativeDensity:clamp(source.decorativeDensity,0,1,1),
    distantSceneryDetail:clamp(source.distantSceneryDetail,0,1,1),
    decorativeShadows:source.decorativeShadows!==false,
    snowDetailLevel:clamp(source.snowDetailLevel,0,1,1)
  });
}
