import * as THREE from 'three';

export function createSkiCamera(camera){
  const lookTarget=new THREE.Vector3();
  let roll=0;
  let landingKick=0;
  let landingOpen=0;
  let previousLanding=0;
  let previousAir=false;
  let crashSettle=0;

  function reset(){
    roll=0;
    landingKick=0;
    landingOpen=0;
    previousLanding=0;
    previousAir=false;
    crashSettle=0;
  }

  function update(state,dt){
    const speed01=THREE.MathUtils.clamp((state.speed-12)/19,0,1);
    const crash=state.mode==='crashed';
    const air=!!state.air;
    const ground=state.centerGround||0;
    const airHeight=air?THREE.MathUtils.clamp(state.y-ground-.12,0,3.4):0;
    const lateralVelocity=THREE.MathUtils.clamp(state.vx||0,-8,8);

    const landingEdge=!air&&previousAir;
    if(landingEdge||(!air&&state.landingPulse>previousLanding+.10)){
      const hard=state.landingQuality==='hard';
      const rough=state.landingQuality==='rough';
      landingKick=-(hard?.22:rough?.15:.09);
      landingOpen=hard?.62:rough?.42:.24;
    }
    previousAir=air;
    previousLanding=state.landingPulse;
    landingKick=THREE.MathUtils.damp(landingKick,0,7.2,dt);
    landingOpen=THREE.MathUtils.damp(landingOpen,0,4.8,dt);

    const crashTime=state.crashTime||0;
    const crashDir=state.crashDirection||0;
    crashSettle=THREE.MathUtils.damp(crashSettle,crash?1:0,crash?3.4:6.0,dt);

    const steerLead=state.heading*(1.18+speed01*.52)+lateralVelocity*.025;
    const desiredX=state.x*.31-steerLead+(crash?crashDir*.52:0);
    const desiredY=5.98+speed01*.58+state.y*.14+airHeight*.16+landingKick+(crash?Math.min(.48,crashTime*.20):0);
    const desiredZ=10.35+speed01*1.48+airHeight*.16+landingOpen+(crash?Math.min(1.72,crashTime*.78):0);

    const lateralResponse=crash?2.25:(air?4.35:5.15);
    camera.position.x=THREE.MathUtils.damp(camera.position.x,desiredX,lateralResponse,dt);
    camera.position.y=THREE.MathUtils.damp(camera.position.y,desiredY,crash?2.1:(air?3.6:3.25),dt);
    camera.position.z=THREE.MathUtils.damp(camera.position.z,desiredZ,crash?2.05:(air?3.4:2.9),dt);

    const targetFov=54.5+speed01*6.9+(air?Math.min(1.15,.35+airHeight*.28):0)+landingOpen*.45-(crash?1.0*crashSettle:0);
    camera.fov=THREE.MathUtils.damp(camera.fov,targetFov,crash?2.8:4.1,dt);
    camera.updateProjectionMatrix();

    const lookAhead=1.14+speed01*.95;
    const lateralLook=state.heading*lookAhead+lateralVelocity*.035;
    const airLookDepth=air?Math.min(1.25,.35+airHeight*.30):0;
    lookTarget.set(
      state.x*.15+lateralLook+(crash?crashDir*.22:0),
      1.02+state.y*.10+airHeight*.028-(air?.04:0),
      -12.9-speed01*2.85-airLookDepth+(crash?1.05:0)
    );
    camera.lookAt(lookTarget);

    const carveRoll=-state.edge*(.013+speed01*.018);
    const terrainRoll=-(state.groundRoll||0)*.055;
    const crashRoll=THREE.MathUtils.clamp(-crashDir*.042,-.045,.045)*crashSettle;
    const targetRoll=crash?crashRoll:THREE.MathUtils.clamp(carveRoll+terrainRoll,-.038,.038);
    roll=THREE.MathUtils.damp(roll,targetRoll,crash?3.0:5.0,dt);
    camera.rotateZ(roll);
  }

  return {update,reset};
}
