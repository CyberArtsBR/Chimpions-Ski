import * as THREE from 'three';

// Bone names identify a supported convention; actual axes come from the
// untouched rest transforms, not a hard-coded 90-degree bone correction.
export function createRigPoseAxes(model,rig){
  const name=bone=>String(bone?.name||'').split(':').pop().toLowerCase();
  const unreal=['left','right'].every(side=>{
    const suffix=side==='left'?'l':'r';
    return name(rig[side+'Thigh'])==='thigh_'+suffix
      &&name(rig[side+'Shin'])==='calf_'+suffix
      &&name(rig[side+'Foot'])==='foot_'+suffix;
  })&&name(rig.hips)==='pelvis';
  const axes=new Map();
  if(!unreal)return {profile:'legacy',axes};
  model.updateWorldMatrix(true,true);
  const modelQ=model.getWorldQuaternion(new THREE.Quaternion());
  for(const key of ['hips','spine','chest','neck','head','leftThigh','leftShin','leftFoot','rightThigh','rightShin','rightFoot']){
    const bone=rig[key];if(!bone)continue;
    const inverse=bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    // Existing pose parameters use CC-style anatomical axes: leg X points
    // across the body, leg Y down; foot Y forward and Z up; torso XYZ standard.
    const foot=key.endsWith('Foot');
    const leg=foot||key.endsWith('Thigh')||key.endsWith('Shin');
    const basis=foot?[[ -1,0,0 ],[0,0,1],[0,1,0]]
      :leg?[[-1,0,0],[0,-1,0],[0,0,1]]:[[1,0,0],[0,1,0],[0,0,1]];
    axes.set(key,basis.map(v=>new THREE.Vector3(...v).applyQuaternion(modelQ).applyQuaternion(inverse).normalize()));
  }
  return {profile:'unreal-humanoid',axes};
}
