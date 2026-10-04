import * as THREE from 'three';

// Shared upload template: proportions are measured from each avatar, never
// selected by file name. Values are rider-space directions and leg fractions.
export const UNREAL_RIDE_TEMPLATE=Object.freeze({
  ski:Object.freeze({upperOut:.24,upperDown:1,upperForward:.10,foreOut:.14,foreDown:.95,foreForward:.28,crouch:.035}),
  snowboard:Object.freeze({upperOut:.58,upperDown:1,upperForward:.10,foreOut:.42,foreDown:.95,foreForward:.16,crouch:.055}),
});

export function createUnrealRideProfile(model,rig){
  model.updateWorldMatrix(true,true);
  const hipsRest=rig.hips.position.clone();
  const modelQ=model.getWorldQuaternion(new THREE.Quaternion());
  const legs=['left','right'].map(side=>{
    const thigh=rig[side+'Thigh'],shin=rig[side+'Shin'],foot=rig[side+'Foot'];
    const ankle=model.worldToLocal(foot.getWorldPosition(new THREE.Vector3()));
    const hip=model.worldToLocal(thigh.getWorldPosition(new THREE.Vector3()));
    const knee=model.worldToLocal(shin.getWorldPosition(new THREE.Vector3()));
    const footQ=modelQ.clone().invert().multiply(foot.getWorldQuaternion(new THREE.Quaternion()));
    const toe=foot.children.find(b=>b.isBone&&/^(ball|toe)(_|$)/i.test(b.name.split(':').pop()));
    // Preserve the mesh's authored neutral sole orientation, removing only its
    // measured toe-out yaw. A missing toe leaves the authored heading intact.
    if(toe){
      const direction=model.worldToLocal(toe.getWorldPosition(new THREE.Vector3())).sub(ankle);
      if(Math.hypot(direction.x,direction.z)>1e-5){
        footQ.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-Math.atan2(direction.x,direction.z)));
      }
    }
    return {side,thigh,shin,foot,ankle,footQ,length:hip.distanceTo(knee)+knee.distanceTo(ankle)};
  });
  const length=Math.min(...legs.map(l=>l.length));
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  const target=new THREE.Vector3(),direction=new THREE.Vector3(),pole=new THREE.Vector3(),kneeTarget=new THREE.Vector3();
  const q=new THREE.Quaternion(),parentQ=new THREE.Quaternion(),worldQ=new THREE.Quaternion();
  const hipPoint=new THREE.Vector3(),modelRotation=new THREE.Quaternion(),scaleScratch=new THREE.Vector3();
  function aim(bone,child,point){
    bone.getWorldPosition(a);child.getWorldPosition(b);
    direction.copy(b).sub(a).normalize();pole.copy(point).sub(a).normalize();
    q.setFromUnitVectors(direction,pole);
    bone.getWorldQuaternion(worldQ);worldQ.premultiply(q);
    bone.parent.getWorldQuaternion(parentQ).invert();
    bone.quaternion.copy(parentQ.multiply(worldQ)).normalize();
    bone.updateWorldMatrix(false,true);
  }
  function reset(){rig.hips.position.copy(hipsRest);}
  function update(pose,frame,mode){
    reset();model.updateWorldMatrix(true,true);
    const tune=UNREAL_RIDE_TEMPLATE[mode];
    const compression=length*(tune.crouch+pose.landingAbsorb*.06+pose.trickTuck*.05);
    model.worldToLocal(rig.hips.getWorldPosition(hipPoint));
    hipPoint.y-=compression;
    rig.hips.position.copy(rig.hips.parent.worldToLocal(model.localToWorld(hipPoint)));
    model.updateWorldMatrix(true,true);
    model.getWorldQuaternion(modelRotation);
    for(const leg of legs){
      leg.thigh.getWorldPosition(a);leg.shin.getWorldPosition(b);leg.foot.getWorldPosition(c);
      const upper=a.distanceTo(b),lower=b.distanceTo(c);
      target.copy(leg.ankle);
      // Both skis may follow separate contact heights; the snowboard stays a
      // single stance. Airborne posing has no terrain correction.
      if(!frame.air&&mode==='ski')target.y+=THREE.MathUtils.clamp((frame[leg.side+'Ground']||0)-(frame.centerGround||0),-.04,.04)/Math.max(.001,model.getWorldScale(scaleScratch).y);
      model.localToWorld(target);
      direction.copy(target).sub(a);
      const reach=THREE.MathUtils.clamp(direction.length(),Math.abs(upper-lower)+1e-5,(upper+lower)*.9999);
      direction.normalize();
      const along=(upper*upper-lower*lower+reach*reach)/(2*reach);
      const height=Math.sqrt(Math.max(0,upper*upper-along*along));
      // A forward pole keeps both knees in their own hip-to-ankle plane;
      // authored bone roll can no longer produce inward C-shaped legs.
      pole.set(0,0,1).applyQuaternion(modelRotation);
      pole.addScaledVector(direction,-pole.dot(direction)).normalize();
      kneeTarget.copy(a).addScaledVector(direction,along).addScaledVector(pole,height);
      target.copy(a).addScaledVector(direction,reach);
      aim(leg.thigh,leg.shin,kneeTarget);
      aim(leg.shin,leg.foot,target);
      leg.foot.parent.getWorldQuaternion(parentQ).invert();
      leg.foot.quaternion.copy(parentQ.multiply(worldQ.copy(modelRotation).multiply(leg.footQ))).normalize();
      leg.foot.updateWorldMatrix(false,true);
    }
  }
  return {update,reset,template:UNREAL_RIDE_TEMPLATE};
}
