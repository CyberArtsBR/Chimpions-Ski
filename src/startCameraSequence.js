import * as THREE from 'three';

export const START_CAMERA_FRONT_HOLD_MS=2000;
export const START_CAMERA_ROTATE_MS=3600;
export const START_CAMERA_SEQUENCE_MS=START_CAMERA_FRONT_HOLD_MS+START_CAMERA_ROTATE_MS;

const FRONT_FOV=55;

function smootherstep(t){
  const x=THREE.MathUtils.clamp(t,0,1);
  return x*x*x*(x*(x*6-15)+10);
}
function smoothRange(edge0,edge1,value){
  const x=THREE.MathUtils.clamp((value-edge0)/(edge1-edge0),0,1);
  return x*x*(3-2*x);
}

export function createStartCameraSequence({camera,skiCamera,player}){
  const chasePosition=new THREE.Vector3();
  const chaseLook=new THREE.Vector3();
  const frontPosition=new THREE.Vector3();
  const orbitPosition=new THREE.Vector3();
  const heroLook=new THREE.Vector3();
  const finalLook=new THREE.Vector3();
  let active=false;
  let startTime=0;
  let phase='idle';

  function setFrontFrame(state){
    skiCamera.getChaseFrame(state,chasePosition,chaseLook);
    frontPosition.set(
      player.position.x,
      player.position.y+4.15,
      player.position.z-10.8
    );
    heroLook.set(
      player.position.x,
      player.position.y+2.2,
      player.position.z+3.8
    );
    camera.position.copy(frontPosition);
    camera.lookAt(heroLook);
    camera.fov=FRONT_FOV;
    camera.updateProjectionMatrix();
  }

  function applyRotation(state,rotationProgress){
    const progress=THREE.MathUtils.clamp(rotationProgress,0,1);
    const eased=smootherstep(progress);
    const chaseFov=skiCamera.getChaseFrame(state,chasePosition,chaseLook);
    const startRadius=Math.max(8,Math.hypot(
      frontPosition.x-player.position.x,
      frontPosition.z-player.position.z
    ));
    const chaseRadius=Math.max(6.8,Math.hypot(
      chasePosition.x-player.position.x,
      chasePosition.z-player.position.z
    ));
    const radius=THREE.MathUtils.lerp(startRadius,chaseRadius,eased);
    const angle=Math.PI*(1-eased);

    orbitPosition.set(
      player.position.x+Math.sin(angle)*radius,
      THREE.MathUtils.lerp(frontPosition.y,chasePosition.y,eased)+Math.sin(Math.PI*progress)*.18,
      player.position.z+Math.cos(angle)*radius
    );

    const settle=smoothRange(.70,1,progress);
    orbitPosition.lerp(chasePosition,settle);
    camera.position.copy(orbitPosition);

    const lookBlend=smoothRange(.18,.94,progress);
    finalLook.copy(heroLook).lerp(chaseLook,lookBlend);
    camera.lookAt(finalLook);

    camera.fov=THREE.MathUtils.lerp(FRONT_FOV,chaseFov,smootherstep(progress));
    camera.updateProjectionMatrix();
  }

  function update(state,now=performance.now()){
    if(!active)return false;
    const elapsed=Math.max(0,now-startTime);
    if(elapsed<START_CAMERA_FRONT_HOLD_MS){
      phase='front-hold';
      setFrontFrame(state);
      return true;
    }

    const rotationProgress=(elapsed-START_CAMERA_FRONT_HOLD_MS)/START_CAMERA_ROTATE_MS;
    if(rotationProgress<1){
      phase='rotate';
      applyRotation(state,rotationProgress);
      return true;
    }

    finish(state);
    return false;
  }

  function begin(state,now=performance.now()){
    active=true;
    startTime=now;
    phase='front-hold';
    setFrontFrame(state);
  }

  function finish(state){
    const chaseFov=skiCamera.getChaseFrame(state,chasePosition,chaseLook);
    camera.position.copy(chasePosition);
    camera.lookAt(chaseLook);
    camera.fov=chaseFov;
    camera.updateProjectionMatrix();
    active=false;
    phase='ready';
  }

  function reset(){
    active=false;
    startTime=0;
    phase='idle';
  }

  return {
    begin,update,finish,reset,
    get active(){return active;},
    get phase(){return phase;}
  };
}
