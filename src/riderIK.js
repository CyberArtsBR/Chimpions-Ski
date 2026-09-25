import * as THREE from 'three';

const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number(v)||0));

function legMetrics(rig,side){
  const thigh=rig[side+'Thigh'],shin=rig[side+'Shin'],foot=rig[side+'Foot'];
  if(!thigh||!shin||!foot)return null;
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  thigh.getWorldPosition(a);shin.getWorldPosition(b);foot.getWorldPosition(c);
  const upper=Math.max(.001,a.distanceTo(b));
  const lower=Math.max(.001,b.distanceTo(c));
  const reach=clamp(a.distanceTo(c),Math.abs(upper-lower)+.001,upper+lower-.001);
  const cosine=clamp((upper*upper+lower*lower-reach*reach)/(2*upper*lower),-1,1);
  return {thigh,shin,foot,upper,lower,restReach:reach,restKnee:Math.acos(cosine)};
}

export function createTerrainLegIK(rig){
  const left=legMetrics(rig,'left');
  const right=legMetrics(rig,'right');
  const axisX=new THREE.Vector3(1,0,0);
  const axisZ=new THREE.Vector3(0,0,1);
  const delta=new THREE.Quaternion();
  const result={
    enabled:!!(left&&right),
    pelvisOffsetY:0,
    pelvisRoll:0,
    leftCompression:0,
    rightCompression:0
  };
  if(!result.enabled)return {update:()=>result,result};

  function solve(leg,contactDelta,groundPitch,groundRoll,weight){
    const desiredReach=clamp(
      leg.restReach-contactDelta,
      Math.abs(leg.upper-leg.lower)+.001,
      leg.upper+leg.lower-.001
    );
    const cosine=clamp(
      (leg.upper*leg.upper+leg.lower*leg.lower-desiredReach*desiredReach)/(2*leg.upper*leg.lower),
      -1,1
    );
    const knee=Math.acos(cosine);
    const flex=clamp(leg.restKnee-knee,-.10,.24)*weight;
    leg.thigh.quaternion.multiply(delta.setFromAxisAngle(axisX,-flex*.44));
    leg.shin.quaternion.multiply(delta.setFromAxisAngle(axisX,flex*.86));
    leg.foot.quaternion.multiply(delta.setFromAxisAngle(axisX,clamp(groundPitch,-.18,.18)*.18*weight-flex*.20));
    leg.foot.quaternion.multiply(delta.setFromAxisAngle(axisZ,clamp(groundRoll,-.18,.18)*.12*weight));
    return flex;
  }

  function update(frame={},weight=1){
    const leftGround=frame.leftGround??0;
    const rightGround=frame.rightGround??0;
    const centerGround=frame.centerGround??0;
    const groundPitch=frame.groundPitch??0;
    const groundRoll=frame.groundRoll??0;
    const air=!!frame.air;
    const ikWeight=air?0:clamp(weight,0,1);
    const leftDelta=clamp((Number(leftGround)||0)-(Number(centerGround)||0),-.10,.10);
    const rightDelta=clamp((Number(rightGround)||0)-(Number(centerGround)||0),-.10,.10);
    result.leftCompression=solve(left,leftDelta,groundPitch,groundRoll,ikWeight);
    result.rightCompression=solve(right,rightDelta,groundPitch,groundRoll,ikWeight);
    const average=(leftDelta+rightDelta)*.5;
    result.pelvisOffsetY=clamp(average*.18,-.018,.018)*ikWeight;
    result.pelvisRoll=clamp((rightDelta-leftDelta)*.22,-.025,.025)*ikWeight;
    return result;
  }

  return {update,result};
}
