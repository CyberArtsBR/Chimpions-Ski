import * as THREE from 'three';
import {SKI_TUNING as T,getSpeedProgress} from './gameplayTuning.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function estimateUsefulLateralSpeed(speed=T.BASE_SPEED){
  const speed01=getSpeedProgress(speed);
  const headingLimit=THREE.MathUtils.lerp(T.HEADING_LIMIT_LOW,T.HEADING_LIMIT_HIGH,speed01);
  const lateralScale=THREE.MathUtils.lerp(T.LATERAL_SCALE_LOW,T.LATERAL_SCALE_HIGH,speed01);
  return Math.sin(headingLimit)*speed*lateralScale;
}

export function maxReachableLateralDelta(dz,speed=T.BASE_SPEED){
  const longitudinal=Math.max(0,Math.abs(dz));
  const safeSpeed=Math.max(1,Number(speed)||T.BASE_SPEED);
  const availableTime=longitudinal/safeSpeed;
  const usefulLateralSpeed=estimateUsefulLateralSpeed(safeSpeed);
  const delta=T.SAFE_ROUTE_BASE_REACH+
    usefulLateralSpeed*availableTime*T.SAFE_ROUTE_ACCELERATION_FACTOR;
  return clamp(delta,T.SAFE_ROUTE_MIN_REACH,T.SAFE_ROUTE_MAX_REACH);
}

export function getPerceptionReactionSeconds(speed=T.BASE_SPEED){
  const speed01=getSpeedProgress(speed);
  return THREE.MathUtils.lerp(.105,.165,speed01);
}

export function getSpeedAwarePerceptionMargin(speed=T.BASE_SPEED){
  const speed01=getSpeedProgress(speed);
  return THREE.MathUtils.lerp(.06,.14,speed01);
}

export function maxHumanReachableLateralDelta(dz,speed=T.BASE_SPEED){
  const longitudinal=Math.max(0,Math.abs(dz));
  if(longitudinal<=1e-6)return 0;
  const safeSpeed=Math.max(1,Number(speed)||T.BASE_SPEED);
  const availableTime=longitudinal/safeSpeed;
  const reactionReserve=Math.min(
    getPerceptionReactionSeconds(safeSpeed),
    availableTime*.38
  );
  const steeringTime=Math.max(0,availableTime-reactionReserve);
  const usefulLateralSpeed=estimateUsefulLateralSpeed(safeSpeed);
  const responseAllowance=T.SAFE_ROUTE_BASE_REACH*clamp(availableTime/.24,0,1);
  const delta=responseAllowance+
    usefulLateralSpeed*steeringTime*T.SAFE_ROUTE_ACCELERATION_FACTOR;
  return clamp(delta,0,T.SAFE_ROUTE_MAX_REACH);
}

function normalizeIntervals(intervals,minX,maxX,minWidth=0){
  const sorted=(intervals||[])
    .map(interval=>({
      min:clamp(Math.min(interval.min,interval.max),minX,maxX),
      max:clamp(Math.max(interval.min,interval.max),minX,maxX)
    }))
    .filter(interval=>interval.max-interval.min>=minWidth)
    .sort((a,b)=>a.min-b.min);
  const merged=[];
  for(const interval of sorted){
    const previous=merged.at(-1);
    if(previous&&interval.min<=previous.max+.001){
      previous.max=Math.max(previous.max,interval.max);
    }else merged.push({...interval});
  }
  return merged;
}

function expandIntervals(intervals,amount,minX,maxX){
  return normalizeIntervals(
    intervals.map(interval=>({min:interval.min-amount,max:interval.max+amount})),
    minX,
    maxX
  );
}

function subtractBlocked(intervals,blocked,minWidth,minX,maxX){
  const blockMin=clamp(Math.min(blocked.min,blocked.max),minX,maxX);
  const blockMax=clamp(Math.max(blocked.min,blocked.max),minX,maxX);
  const result=[];
  for(const interval of intervals){
    if(blockMax<=interval.min||blockMin>=interval.max){
      result.push(interval);
      continue;
    }
    if(blockMin>interval.min)result.push({min:interval.min,max:blockMin});
    if(blockMax<interval.max)result.push({min:blockMax,max:interval.max});
  }
  return normalizeIntervals(result,minX,maxX,minWidth);
}

export function chooseReachableCorridorX(intervals,desiredX=0){
  if(!intervals?.length)return null;
  let best=null;
  let bestDistance=Infinity;
  for(const interval of intervals){
    const candidate=clamp(desiredX,interval.min,interval.max);
    const distance=Math.abs(candidate-desiredX);
    if(distance<bestDistance){
      bestDistance=distance;
      best=candidate;
    }
  }
  return best;
}

export function validateReachableCorridor({
  placements=[],
  startZ=0,
  endZ=-100,
  speed=T.BASE_SPEED,
  startX=0,
  corridorMin=-T.SAFE_ROUTE_HALF_WIDTH,
  corridorMax=T.SAFE_ROUTE_HALF_WIDTH,
  hazardKinds=null,
  hazardHalfWidth=()=>.6,
  minPassageWidth=.46
}={}){
  const safeSpeed=Math.max(1,Number(speed)||T.BASE_SPEED);
  const perceptionMargin=getSpeedAwarePerceptionMargin(safeSpeed);
  const collisionFootprint=T.COURSE_COLLISION_PADDING_X+perceptionMargin;
  const kinds=hazardKinds instanceof Set?hazardKinds:null;
  const top=Math.max(startZ,endZ);
  const bottom=Math.min(startZ,endZ);
  const hazards=(placements||[])
    .filter(item=>item&&Number.isFinite(item.z)&&item.z<=top&&item.z>=bottom)
    .filter(item=>!kinds||kinds.has(item.kind))
    .sort((a,b)=>b.z-a.z);

  const seedHalfWidth=Math.max(.72,T.SAFE_ROUTE_BASE_REACH*.72);
  let intervals=normalizeIntervals([
    {min:startX-seedHalfWidth,max:startX+seedHalfWidth}
  ],corridorMin,corridorMax,minPassageWidth);
  let previousZ=startZ;
  let narrowestWidth=intervals.length
    ?Math.min(...intervals.map(interval=>interval.max-interval.min))
    :0;
  let firstDecisionReadTime=Infinity;

  for(let index=0;index<hazards.length;index++){
    const hazard=hazards[index];
    const dz=previousZ-hazard.z;
    const lateralReach=maxHumanReachableLateralDelta(dz,safeSpeed);
    intervals=expandIntervals(intervals,lateralReach,corridorMin,corridorMax);

    if(index===0)firstDecisionReadTime=Math.max(0,startZ-hazard.z)/safeSpeed;

    const halfWidth=Math.max(0,Number(hazardHalfWidth(hazard.kind,hazard))||0);
    const blockedHalfWidth=halfWidth+collisionFootprint;
    intervals=subtractBlocked(
      intervals,
      {min:hazard.x-blockedHalfWidth,max:hazard.x+blockedHalfWidth},
      minPassageWidth,
      corridorMin,
      corridorMax
    );

    if(!intervals.length){
      return {
        valid:false,
        failureZ:hazard.z,
        hazardIndex:index,
        firstDecisionReadTime:Number.isFinite(firstDecisionReadTime)?firstDecisionReadTime:0,
        reactionSeconds:getPerceptionReactionSeconds(safeSpeed),
        perceptionMargin,
        intervals:[]
      };
    }

    narrowestWidth=Math.min(
      narrowestWidth||Infinity,
      ...intervals.map(interval=>interval.max-interval.min)
    );
    previousZ=hazard.z;
  }

  const finalReach=maxHumanReachableLateralDelta(previousZ-endZ,safeSpeed);
  intervals=expandIntervals(intervals,finalReach,corridorMin,corridorMax);
  return {
    valid:intervals.length>0,
    failureZ:null,
    firstDecisionReadTime:Number.isFinite(firstDecisionReadTime)?firstDecisionReadTime:Infinity,
    reactionSeconds:getPerceptionReactionSeconds(safeSpeed),
    perceptionMargin,
    narrowestWidth:Number.isFinite(narrowestWidth)?narrowestWidth:0,
    intervals
  };
}

export function createSafeRouteTracker(initialX=0,initialZ=null){
  let previousSafeX=clamp(initialX,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
  let previousSafeZ=Number.isFinite(initialZ)?initialZ:null;

  function constrain(desiredX,z,speed=T.BASE_SPEED){
    const desired=clamp(desiredX,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
    if(previousSafeZ==null){
      previousSafeX=desired;
      previousSafeZ=z;
      return previousSafeX;
    }

    const maxDelta=maxReachableLateralDelta(z-previousSafeZ,speed);
    const next=clamp(
      desired,
      previousSafeX-maxDelta,
      previousSafeX+maxDelta
    );
    previousSafeX=clamp(next,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
    previousSafeZ=z;
    return previousSafeX;
  }

  function reset(x=0,z=null){
    previousSafeX=clamp(x,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
    previousSafeZ=Number.isFinite(z)?z:null;
  }

  return {
    constrain,
    reset,
    get previousSafeX(){return previousSafeX;},
    get previousSafeZ(){return previousSafeZ;}
  };
}
