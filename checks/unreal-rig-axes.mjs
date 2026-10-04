import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createRigPoseAxes} from '../src/rigPoseAxes.js';
import {resolveAvatarRig} from '../src/avatarCompatibility.js';
import {makeRigController} from '../src/skier.js';

function fixture(){
 const model=new THREE.Group(),hips=new THREE.Bone();hips.name='pelvis';model.add(hips);hips.position.y=2;
 for(const side of ['l','r']){
  const thigh=new THREE.Bone(),shin=new THREE.Bone(),foot=new THREE.Bone();
  thigh.name='thigh_'+side;shin.name='calf_'+side;foot.name='foot_'+side;
  thigh.position.x=side==='l'?.2:-.2;thigh.rotation.set(Math.PI,Math.PI/2,0);
  shin.position.y=1;foot.position.y=1;foot.rotation.set(.2,.4,-.3);
  hips.add(thigh);thigh.add(shin);shin.add(foot);
 }return model;
}
function verify(model,label){
 model.updateWorldMatrix(true,true);
 const resolution=resolveAvatarRig(model);assert.deepEqual(resolution.missingRequired,[]);
 const calibration=createRigPoseAxes(model,resolution.rig);
 assert.equal(calibration.profile,'unreal-humanoid');
 const modelQ=model.getWorldQuaternion(new THREE.Quaternion());
 for(const key of ['leftThigh','rightThigh','leftShin','rightShin','leftFoot','rightFoot']){
  const actual=calibration.axes.get(key)[0].clone().applyQuaternion(resolution.rig[key].getWorldQuaternion(new THREE.Quaternion()));
  const expected=new THREE.Vector3(-1,0,0).applyQuaternion(modelQ);
  assert(actual.distanceTo(expected)<1e-5,key+' must flex across the rider, independent of authored bone roll');
 }
 const control=makeRigController(model,undefined,resolution);assert.equal(control.rigPoseProfile,'unreal-humanoid');
 const samples=[];
 for(const rideMode of ['ski','snowboard']){
  control.setRideMode(rideMode);
  for(let i=0;i<240;i++)control({rideMode,dt:1/60,speed:12,steer:0,time:0,leftGround:.04,rightGround:0,centerGround:0});
  model.updateWorldMatrix(true,true);
  const sample={mode:rideMode};
  for(const key of ['leftThigh','leftShin','leftFoot','rightThigh','rightShin','rightFoot']){
   const bone=resolution.rig[key];assert(bone.quaternion.toArray().every(Number.isFinite));assert(Math.abs(bone.quaternion.length()-1)<1e-5);
   sample[key]=bone.getWorldPosition(new THREE.Vector3()).toArray();
  }
  // Once input settles, IK must not progressively accumulate into the base pose.
  const q=resolution.rig.leftShin.quaternion.clone();
  for(let i=0;i<240;i++)control({rideMode,dt:1/60,speed:12,steer:0,time:0,leftGround:.04,rightGround:0,centerGround:0});
  assert(q.angleTo(resolution.rig.leftShin.quaternion)<1e-4,'terrain corrections must not accumulate');
  for(const side of ['left','right']){
   const thigh=model.worldToLocal(new THREE.Vector3(...sample[side+'Thigh']));
   const knee=model.worldToLocal(new THREE.Vector3(...sample[side+'Shin']));
   assert(Math.abs(knee.x-thigh.x)<Math.abs(knee.y-thigh.y)*.3,'crouching must bend knees forward rather than sideways');
  }
  model.updateWorldMatrix(true,true);
  for(const side of ['left','right']){
   const foot=resolution.rig[side+'Foot'];
   const toe=foot.children.find(b=>b.isBone&&/^(ball|toe)(_|$)/i.test(b.name.split(':').pop()));
   if(toe){
    const heading=model.worldToLocal(toe.getWorldPosition(new THREE.Vector3())).sub(model.worldToLocal(foot.getWorldPosition(new THREE.Vector3())));
    assert(heading.z>0&&Math.abs(heading.x)<heading.z*.02,'feet point along the rider forward axis instead of toeing outward');
   }
   const upper=resolution.rig[side+'UpperArm'],elbow=resolution.rig[side+'Forearm'],hand=resolution.rig[side+'Hand'];
   if(upper&&elbow&&hand){
    const shoulder=model.worldToLocal(upper.getWorldPosition(new THREE.Vector3()));
    const wrist=model.worldToLocal(hand.getWorldPosition(new THREE.Vector3()));
    const elbowPoint=model.worldToLocal(elbow.getWorldPosition(new THREE.Vector3()));
    const upperLength=shoulder.distanceTo(elbowPoint);
    assert(shoulder.y-elbowPoint.y>upperLength*.7,'upper arms stay below a T-pose');
    assert(wrist.y<elbowPoint.y,'hands stay below elbows in the neutral riding pose');
   }
  }
  samples.push(sample);
 }
 console.log(JSON.stringify({label,profile:calibration.profile,modes:samples.map(s=>s.mode),axisAndKneeChecks:'passed'}));
}
verify(fixture(),'synthetic Unreal rig');
const rotated=fixture();rotated.rotation.y=.7;verify(rotated,'rotated carrier');
const namespaced=fixture();namespaced.traverse(b=>{if(b.isBone)b.name='Armature:'+b.name;});verify(namespaced,'namespaced Unreal rig');
const legacy=fixture();legacy.traverse(b=>{if(b.isBone)b.name=b.name.replace('thigh_l','LeftUpLeg').replace('thigh_r','RightUpLeg');});
assert.equal(createRigPoseAxes(legacy,resolveAvatarRig(legacy).rig).profile,'legacy');
if(process.argv[2]){
 const bytes=fs.readFileSync(process.argv[2]);const length=bytes.readUInt32LE(12);
 const json=JSON.parse(bytes.subarray(20,20+length));
 const start=20+length;const binary=bytes.subarray(start+8,start+8+bytes.readUInt32LE(start));
 json.buffers[0].uri='data:application/octet-stream;base64,'+binary.toString('base64');
 // Skeleton/mesh verification needs no image decoding in Node; source is untouched.
 delete json.images;delete json.textures;delete json.materials;
 for(const mesh of json.meshes)for(const primitive of mesh.primitives)delete primitive.material;
 globalThis.ProgressEvent??=class ProgressEvent{};
 const gltf=await new GLTFLoader().parseAsync(JSON.stringify(json),'');verify(gltf.scene,process.argv[2]);
}
