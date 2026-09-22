import * as THREE from 'three';

export function createSkiCamera(camera){
  const lookTarget=new THREE.Vector3();
  let roll=0;
  let landingKick=0;
  let previousLanding=0;

  function reset(){
    roll=0;
    landingKick=0;
    previousLanding=0;
  }

  function update(state,dt){
    const speed01=THREE.MathUtils.clamp((state.speed-12)/19,0,1);
    const crash=state.mode==='crashed';
    const airHeight=state.air?THREE.MathUtils.clamp(state.y-(state.centerGround||0)-.12,0,3):0;

    if(!state.air&&state.landingPulse>previousLanding+.12){
      landingKick=Math.min(landingKick-.08-state.landingPulse*.12,-.08);
    }
    previousLanding=state.landingPulse;
    landingKick=THREE.MathUtils.damp(landingKick,0,5.6,dt);

    const crashTime=state.crashTime||0;
    const crashDir=state.crashDirection||0;
    const desiredX=state.x*.27-state.heading*(1.05+speed01*.42)+(crash?crashDir*.45:0);
    const desiredY=6.05+speed01*.62+state.y*.13+airHeight*.11+landingKick+(crash?Math.min(.45,crashTime*.18):0);
    const desiredZ=10.45+speed01*1.55+(crash?Math.min(1.5,crashTime*.75):0);

    camera.position.x=THREE.MathUtils.damp(camera.position.x,desiredX,crash?1.9:2.75,dt);
    camera.position.y=THREE.MathUtils.damp(camera.position.y,desiredY,crash?1.8:2.55,dt);
    camera.position.z=THREE.MathUtils.damp(camera.position.z,desiredZ,crash?1.7:2.35,dt);

    const targetFov=55+speed01*5.8+(crash?-1.2:0);
    camera.fov=THREE.MathUtils.damp(camera.fov,targetFov,2.7,dt);
    camera.updateProjectionMatrix();

    const lookAhead=1.0+speed01*.75;
    lookTarget.set(
      state.x*.13+state.heading*lookAhead+(crash?crashDir*.18:0),
      1.02+state.y*.10+airHeight*.035,
      -12.7-speed01*2.35+(crash?1.25:0)
    );
    camera.lookAt(lookTarget);

    const targetRoll=crash
      ?THREE.MathUtils.clamp(-crashDir*.035,-.04,.04)
      :-state.edge*(.012+speed01*.019)-(state.groundRoll||0)*.07;
    roll=THREE.MathUtils.damp(roll,targetRoll,crash?2.0:3.8,dt);

    // Apply roll after lookAt so the orientation calculation cannot erase it.
    camera.rotateZ(roll);
  }

  return {update,reset};
}
