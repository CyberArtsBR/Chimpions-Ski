import * as THREE from 'three';

export const START_CAMERA_SEQUENCE_MS=3200;

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
  const orbitPosition=new THREE.Vector3();
  const heroLook=new THREE.Vector3();
  const finalLook=new THREE.Vector3();
  let active=false;
  let startTime=0;

  function apply(state,t){
    const progress=THREE.MathUtils.clamp(t,0,1);
    const eased=smootherstep(progress);
    const chaseFov=skiCamera.getChaseFrame(state,chasePosition,chaseLook);

    const chaseRadius=Math.max(6.8,Math.hypot(
      chasePosition.x-player.position.x,
      chasePosition.z-player.position.z
    ));
    const radius=THREE.MathUtils.lerp(6.4,chaseRadius,eased);
    const angle=Math.PI*(1-eased);

    orbitPosition.set(
      player.position.x+Math.sin(angle)*radius,
      THREE.MathUtils.lerp(player.position.y+3.05,chasePosition.y,eased)+Math.sin(Math.PI*progress)*.24,
      player.position.z+Math.cos(angle)*radius
    );

    const settle=smoothRange(.72,1,progress);
    orbitPosition.lerp(chasePosition,settle);
    camera.position.copy(orbitPosition);

    heroLook.set(player.position.x,player.position.y+1.38,player.position.z-.05);
    const lookBlend=smoothRange(.54,1,progress);
    finalLook.copy(heroLook).lerp(chaseLook,lookBlend);
    camera.lookAt(finalLook);

    camera.fov=THREE.MathUtils.lerp(49.5,chaseFov,smootherstep(progress));
    camera.updateProjectionMatrix();
  }

  function begin(state,now=performance.now()){
    active=true;
    startTime=now;
    apply(state,0);
  }

  function update(state,now=performance.now()){
    if(!active)return false;
    const t=(now-startTime)/START_CAMERA_SEQUENCE_MS;
    apply(state,t);
    return t<1;
  }

  function finish(state){
    apply(state,1);
    active=false;
  }

  function reset(){
    active=false;
    startTime=0;
  }

  return {begin,update,finish,reset,get active(){return active;}};
}
