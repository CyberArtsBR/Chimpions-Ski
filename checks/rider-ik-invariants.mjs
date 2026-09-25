import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTerrainLegIK} from '../src/riderIK.js';

function buildLeg(root,side,x){
  const thigh=new THREE.Bone();
  const shin=new THREE.Bone();
  const foot=new THREE.Bone();
  thigh.name=side+'Thigh';
  shin.name=side+'Shin';
  foot.name=side+'Foot';
  thigh.position.set(x,2,0);
  shin.position.set(0,-1,0);
  foot.position.set(0,-1,0);
  root.add(thigh);
  thigh.add(shin);
  shin.add(foot);
  return {thigh,shin,foot};
}

const root=new THREE.Group();
const left=buildLeg(root,'left',-.2);
const right=buildLeg(root,'right',.2);
root.updateWorldMatrix(true,true);

const rig={
  leftThigh:left.thigh,leftShin:left.shin,leftFoot:left.foot,
  rightThigh:right.thigh,rightShin:right.shin,rightFoot:right.foot
};
const ik=createTerrainLegIK(rig);
assert.equal(ik.result.enabled,true,'complete two-bone legs enable terrain IK');

const uneven=ik.update({
  leftGround:.08,
  rightGround:0,
  centerGround:0,
  groundPitch:.05,
  groundRoll:.03,
  air:false
},1);
assert(uneven.leftCompression>uneven.rightCompression,'higher left ski contact creates more left-leg compression');
assert(Math.abs(uneven.pelvisRoll)>0,'independent ski heights create bounded pelvis compensation');
assert(Math.abs(uneven.pelvisOffsetY)<=.018,'pelvis vertical correction stays bounded');

const airborne=ik.update({
  leftGround:.1,
  rightGround:-.1,
  centerGround:0,
  groundPitch:.1,
  groundRoll:.1,
  air:true
},1);
assert.equal(airborne.leftCompression,0,'terrain IK disables while airborne');
assert.equal(airborne.rightCompression,0,'terrain IK disables both legs while airborne');

const partial=createTerrainLegIK({leftThigh:left.thigh,leftShin:left.shin,leftFoot:left.foot});
assert.equal(partial.result.enabled,false,'incomplete optional rig safely disables terrain IK');

console.log(JSON.stringify({check:'rider-ik-invariants',enabled:ik.result.enabled}));
