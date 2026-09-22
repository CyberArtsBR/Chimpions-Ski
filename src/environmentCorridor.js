import {SKI_TUNING as T} from './gameplayTuning.js';

export const COURSE_FLAG_X=T.PLAYER_HALF_WIDTH;
export const FLAG_VISUAL_MARGIN=.35;

export const COURSE_OBJECT_VISUAL_HALF_WIDTH=Object.freeze({
  tree:1.25,
  rock:.90,
  banana:.65,
  ramp:1.70,
  log:1.25,
  wideLog:2.75,
  oil:1.60
});

export function gameplayObjectCenterLimit(kind){
  const halfWidth=COURSE_OBJECT_VISUAL_HALF_WIDTH[kind]??1;
  return Math.max(0,Math.min(
    T.COURSE_OBJECT_HALF_WIDTH,
    COURSE_FLAG_X-FLAG_VISUAL_MARGIN-halfWidth
  ));
}

export function clampGameplayObjectX(kind,x){
  const limit=gameplayObjectCenterLimit(kind);
  const value=Number.isFinite(x)?x:0;
  return Math.max(-limit,Math.min(limit,value));
}

export const MAX_GAMEPLAY_OBJECT_CENTER_X=Math.max(
  ...Object.keys(COURSE_OBJECT_VISUAL_HALF_WIDTH).map(gameplayObjectCenterLimit)
);

export const MOUNTAIN_CLEARANCE=1.5;
export const MOUNTAIN_FIELD_LAYOUTS=Object.freeze({
  far:Object.freeze({exclusionHalfWidth:52,outerEdge:122}),
  midFar:Object.freeze({exclusionHalfWidth:43,outerEdge:106}),
  mid:Object.freeze({exclusionHalfWidth:34,outerEdge:88}),
  near:Object.freeze({exclusionHalfWidth:27,outerEdge:72})
});

export const RIDGE_LAYOUTS=Object.freeze({
  far:Object.freeze({innerEdge:60,width:86}),
  midFar:Object.freeze({innerEdge:52,width:78}),
  mid:Object.freeze({innerEdge:43,width:68}),
  near:Object.freeze({innerEdge:35,width:58})
});

// Keep foreground decorative forest well outside the flag shoulder so it reads
// as scenery rather than a second playable obstacle field.
export const SCENERY_SIDE_MIN_CENTER_X=COURSE_FLAG_X+9.5;

export function sideForIndex(index){
  return Math.abs(Math.trunc(index))%2===0?-1:1;
}

export function mountainVisualHalfWidth(scaleX,scaleZ,rotationY=0){
  return Math.abs(Math.cos(rotationY))*Math.abs(scaleX)+
    Math.abs(Math.sin(rotationY))*Math.abs(scaleZ);
}

export function mountainCenterForSide({
  side,
  visualHalfWidth,
  exclusionHalfWidth,
  outerEdge,
  jitter01=.5
}){
  const signedSide=side<0?-1:1;
  const halfWidth=Math.max(0,visualHalfWidth);
  const innerCenter=exclusionHalfWidth+MOUNTAIN_CLEARANCE+halfWidth;
  const outerCenter=Math.max(innerCenter,outerEdge-halfWidth);
  const t=Math.max(0,Math.min(1,jitter01));
  return signedSide*(innerCenter+(outerCenter-innerCenter)*t);
}
