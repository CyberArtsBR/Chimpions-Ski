import {SKI_TUNING as T} from './gameplayTuning.js';
import {estimateRampFlightEnvelope} from './rampTrajectory.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const DEFAULT_BOUNDS=Object.freeze({min:20,max:120});

export const JUMP_SECTION_CONTRACT=Object.freeze({
  approachOffset:12,
  rampOffset:34,
  minimumLength:126,
  postLandingOffset:18,
  followUpGapBase:24,
  reactionSpacingScaleMin:.98,
  reactionSpacingScaleMax:1.22,
  trailingPadding:14,
  recoverySectionLength:92
});

export const COURSE_SECTION_LENGTH_BOUNDS=Object.freeze({
  'OPEN CARVE':Object.freeze({min:20,max:120}),
  'BANANA LINE':Object.freeze({min:20,max:120}),
  'GATE':Object.freeze({min:20,max:120}),
  'FOREST':Object.freeze({min:20,max:140}),
  'ROCK SLALOM':Object.freeze({min:20,max:140}),
  'RECOVERY':Object.freeze({min:20,max:120})
});

export function calculateJumpSectionContract({
  startZ=0,
  speed=T.BASE_SPEED,
  reactionSpacingScale=1
}={}){
  const envelope=estimateRampFlightEnvelope(speed);
  const spacingScale=clamp(
    Number(reactionSpacingScale)||1,
    JUMP_SECTION_CONTRACT.reactionSpacingScaleMin,
    JUMP_SECTION_CONTRACT.reactionSpacingScaleMax
  );
  const approachZ=startZ-JUMP_SECTION_CONTRACT.approachOffset;
  const rampZ=startZ-JUMP_SECTION_CONTRACT.rampOffset;
  const touchdownZ=rampZ-envelope.landingDistance;
  const landingEndZ=rampZ-envelope.protectedEndDistance;
  const postLandingZ=landingEndZ-JUMP_SECTION_CONTRACT.postLandingOffset;
  const followUpGap=JUMP_SECTION_CONTRACT.followUpGapBase*spacingScale;
  const followUpZ=postLandingZ-followUpGap;
  const requiredEndZ=followUpZ-JUMP_SECTION_CONTRACT.trailingPadding;
  const length=Math.max(JUMP_SECTION_CONTRACT.minimumLength,startZ-requiredEndZ);
  const endZ=startZ-length;

  return Object.freeze({
    startZ,
    endZ,
    length,
    approachZ,
    rampZ,
    touchdownZ,
    landingEndZ,
    postLandingZ,
    followUpZ,
    followUpGap,
    reactionSpacingScale:spacingScale,
    recoverySectionLength:JUMP_SECTION_CONTRACT.recoverySectionLength,
    envelope
  });
}

export function getMaxJumpSectionLength(speed=T.MAX_SPEED){
  return calculateJumpSectionContract({
    startZ:0,
    speed,
    reactionSpacingScale:JUMP_SECTION_CONTRACT.reactionSpacingScaleMax
  }).length;
}

export function getCourseSectionLengthBounds(type){
  if(type==='RAMP'||type==='LOG JUMP'){
    return Object.freeze({
      min:JUMP_SECTION_CONTRACT.minimumLength,
      max:getMaxJumpSectionLength(T.MAX_SPEED)
    });
  }
  return COURSE_SECTION_LENGTH_BOUNDS[type]||DEFAULT_BOUNDS;
}
