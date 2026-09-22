import * as THREE from 'three';
import {SKI_TUNING as T} from './gameplayTuning.js';

export function resetPlayerOrientation(root){
  root.rotation.set(0,0,0);
}

export function updateRidingOrientation(root,state,dt){
  const terrainPitch=state.air?THREE.MathUtils.clamp(-state.vy*.012,-.09,.09):state.groundPitch*.68;
  const terrainRoll=state.air?0:state.groundRoll*.70;
  root.rotation.x=THREE.MathUtils.damp(root.rotation.x,terrainPitch,7.2,dt);
  root.rotation.z=THREE.MathUtils.damp(root.rotation.z,-state.edge*.29+terrainRoll,T.PLAYER_BANK_RESPONSE,dt);
  root.rotation.y=THREE.MathUtils.damp(root.rotation.y,-state.heading*.58,T.PLAYER_YAW_RESPONSE,dt);
}

export function updateCrashOrientation(root,state,dt){
  root.rotation.z=THREE.MathUtils.damp(root.rotation.z,(state.crashDirection||1)*.92,4.6,dt);
}
