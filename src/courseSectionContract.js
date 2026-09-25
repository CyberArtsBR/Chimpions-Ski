const DEFAULT_BOUNDS=Object.freeze({min:20,max:120});

export const RAMP_SECTION_LAYOUT=Object.freeze({
  rampOffset:34,
  postLandingOffset:18,
  followUpSpacing:24,
  endPadding:14,
  minimumLength:126,
  maximumReactionSpacingScale:1.22
});

export const COURSE_SECTION_LENGTH_BOUNDS=Object.freeze({
  'OPEN CARVE':Object.freeze({min:20,max:120}),
  'BANANA LINE':Object.freeze({min:20,max:120}),
  'GATE':Object.freeze({min:20,max:120}),
  'FOREST':Object.freeze({min:20,max:140}),
  'ROCK SLALOM':Object.freeze({min:20,max:140}),
  'RECOVERY':Object.freeze({min:20,max:120})
});

export function getCourseSectionLengthBounds(type,{maxJumpLength=120}={}){
  if(type==='RAMP'||type==='LOG JUMP'){
    const numeric=Number(maxJumpLength);
    return Object.freeze({min:20,max:Number.isFinite(numeric)?Math.max(120,numeric):120});
  }
  return COURSE_SECTION_LENGTH_BOUNDS[type]||DEFAULT_BOUNDS;
}

export function getRampSectionLength({protectedEndDistance=0,reactionSpacingScale=1}={}){
  const protectedDistance=Math.max(0,Number(protectedEndDistance)||0);
  const spacingScale=Math.max(0,Number(reactionSpacingScale)||0);
  const layout=RAMP_SECTION_LAYOUT;
  return Math.max(
    layout.minimumLength,
    layout.rampOffset+protectedDistance+layout.postLandingOffset+
      layout.followUpSpacing*spacingScale+layout.endPadding
  );
}
