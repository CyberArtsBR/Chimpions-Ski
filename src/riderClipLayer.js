import * as THREE from 'three';
import {RIDER_ANIMATION_STATE} from './riderAnimationState.js';

const STATE_PATTERNS=[
  [RIDER_ANIMATION_STATE.READY,/ready|idle/i],
  [RIDER_ANIMATION_STATE.START_COMPRESSION,/ready|crouch|start/i],
  [RIDER_ANIMATION_STATE.START_RELEASE,/start|push|ride|ski|snow/i],
  [RIDER_ANIMATION_STATE.DOWNHILL_NEUTRAL,/ride|ski|snow|idle/i],
  [RIDER_ANIMATION_STATE.JUMP_ANTICIPATION,/jump|takeoff|crouch/i],
  [RIDER_ANIMATION_STATE.TAKEOFF,/jump|takeoff/i],
  [RIDER_ANIMATION_STATE.ASCENT,/jump|air/i],
  [RIDER_ANIMATION_STATE.APEX,/jump|air|float/i],
  [RIDER_ANIMATION_STATE.DESCENT,/jump|air|land/i],
  [RIDER_ANIMATION_STATE.LANDING,/land|impact/i],
  [RIDER_ANIMATION_STATE.LANDING_RECOVERY,/land|ride|ski|snow/i],
  [RIDER_ANIMATION_STATE.TRICK,/trick|spin|flip/i],
  [RIDER_ANIMATION_STATE.CRASH,/crash|fall|hit/i]
];

export function createRiderClipLayer(gltf,model){
  const clips=Array.isArray(gltf?.animations)?gltf.animations.filter(clip=>clip?.tracks?.length):[];
  if(!model||!clips.length)return null;
  const mixer=new THREE.AnimationMixer(model);
  const byState=new Map();
  const actions=new Set();
  for(const [state,pattern] of STATE_PATTERNS){
    const clip=clips.find(candidate=>pattern.test(candidate.name||''));
    if(!clip)continue;
    const action=mixer.clipAction(clip);
    action.enabled=true;
    action.setEffectiveWeight(0);
    action.play();
    byState.set(state,action);
    actions.add(action);
  }
  if(!actions.size){
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
    return null;
  }

  let active=null;
  function update(state,dt,{weight=.16,reducedMotion=false}={}){
    const next=byState.get(state)||byState.get(RIDER_ANIMATION_STATE.DOWNHILL_NEUTRAL)||null;
    const targetWeight=Math.max(0,Math.min(reducedMotion?.08:.22,Number(weight)||0));
    for(const action of actions)action.setEffectiveWeight(action===next?targetWeight:0);
    active=next;
    mixer.update(Math.max(0,Math.min(.1,Number(dt)||0)));
    return !!active;
  }
  function dispose(){
    mixer.stopAllAction();
    for(const clip of clips)mixer.uncacheClip(clip);
    mixer.uncacheRoot(model);
    actions.clear();
    byState.clear();
    active=null;
  }
  return {mixer,update,dispose,get active(){return active;}};
}
