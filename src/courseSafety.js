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
