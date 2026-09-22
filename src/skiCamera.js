import * as THREE from 'three';
import {getSpeedFeel} from './gameplayTuning.js';

function smoothstep01(value){
  const t=THREE.MathUtils.clamp(value,0,1);
  return t*t*(3-2*t);
}

export function createSkiCamera(camera){
  const chasePosition=new THREE.Vector3();
  const lookTarget=new THREE.Vector3();
  let roll=0;
  let landingKick=0;
  let landingOpen=0;
  let previousLanding=0;
  let previousAir=false;
  let crashSettle=0;
  let lateralFollow=0;

  function reset(){
    roll=0;
    landingKick=0;
    landingOpen=0;
    previousLanding=0;
    previousAir=false;
    crashSettle=0;
    lateralFollow=0;
  }

  function lateralTarget(state){
    const x=state.x||0;
    const absX=Math.abs(x);
    const deadStart=2.05;
    const deadEnd=3.0;
    const engage=smoothstep01((absX-deadStart)/(deadEnd-deadStart));
    const edgeFeel=THREE.MathUtils.clamp((absX-deadEnd)/5.2,0,1);
    const followFraction=THREE.MathUtils.lerp(.38,.52,edgeFeel);
    return x*followFraction*engage;
  }

  function getChaseFrame(state,positionOut=chasePosition,lookOut=lookTarget){
    const speed01=getSpeedFeel(state.speed);
    const air=!!state.air;
    const rampAir=air&&state.jumpSource==='ramp';
    const manualAir=air&&state.jumpSource==='manual';
    const ground=state.centerGround||0;
    const airHeight=air?THREE.MathUtils.clamp(state.y-ground-.12,0,8):0;
    const lateralVelocity=THREE.MathUtils.clamp(state.vx||0,-14,14);
    const verticalVelocity=state.vy||0;
    const apex=rampAir?THREE.MathUtils.clamp(1-Math.abs(verticalVelocity)/8,0,1):0;
    const descent=rampAir?THREE.MathUtils.clamp(-verticalVelocity/11,0,1):0;

    const steerLead=state.heading*(.82+speed01*.34)+lateralVelocity*.014;
    const downhillCameraLift=.30+speed01*.18;
    positionOut.set(
      lateralFollow-steerLead,
      6.02+speed01*.78+downhillCameraLift+state.y*.14+airHeight*(rampAir?.17:manualAir?.08:0)+(rampAir?apex*.18:0),
      10.48+speed01*1.98+(rampAir?1.05+airHeight*.14+apex*.42:manualAir?airHeight*.07:0)
    );

    const lookAhead=1.36+speed01*1.52;
    const lateralLook=state.heading*lookAhead+lateralVelocity*.042;
    const rampFraming=rampAir?(.88+descent*.08):1;
    const downhillLookBias=(1.62+speed01*.84)*rampFraming;
    const downhillLookDistance=1.35+speed01*1.18;
    lookOut.set(
      lateralFollow*.24+state.x*.12+lateralLook,
      .34+state.y*.072-downhillLookBias+airHeight*(rampAir?.012:.025)-descent*.12,
      -15.85-speed01*5.35-downhillLookDistance-(rampAir?2.35+descent*1.95:air?.85:0)
    );

    const fov=54.5+speed01*7.4+(rampAir?1.35+apex*.75:manualAir?.42:0);
    return THREE.MathUtils.clamp(fov,54.5,64.2);
  }

  function update(state,dt){
    const crash=state.mode==='crashed';
    const air=!!state.air;
    const landingEdge=!air&&previousAir;
    if(landingEdge||(!air&&state.landingPulse>previousLanding+.10)){
      const hard=state.landingQuality==='hard';
      const rough=state.landingQuality==='rough';
      landingKick=-(hard?.20:rough?.14:.075);
      landingOpen=hard?.52:rough?.34:.18;
    }
    previousAir=air;
    previousLanding=state.landingPulse;
    landingKick=THREE.MathUtils.damp(landingKick,0,8.2,dt);
    landingOpen=THREE.MathUtils.damp(landingOpen,0,5.6,dt);

    const desiredLateral=lateralTarget(state);
    const returning=Math.abs(desiredLateral)<Math.abs(lateralFollow);
    lateralFollow=THREE.MathUtils.damp(lateralFollow,desiredLateral,returning?4.25:5.15,dt);

    const baseFov=getChaseFrame(state,chasePosition,lookTarget);
    const crashTime=state.crashTime||0;
    const crashDir=state.crashDirection||0;
    crashSettle=THREE.MathUtils.damp(crashSettle,crash?1:0,crash?3.8:7.0,dt);

    if(crash){
      chasePosition.x+=crashDir*.48;
      chasePosition.y+=Math.min(.42,crashTime*.18);
      chasePosition.z+=Math.min(1.6,crashTime*.72);
      lookTarget.x+=crashDir*.20;
      lookTarget.z+=1.05;
    }else{
      chasePosition.y+=landingKick;
      chasePosition.z+=landingOpen;
    }

    const rampAir=air&&state.jumpSource==='ramp';
    const lateralResponse=crash?2.4:rampAir?6.7:air?7.4:8.0;
    camera.position.x=THREE.MathUtils.damp(camera.position.x,chasePosition.x,lateralResponse,dt);
    camera.position.y=THREE.MathUtils.damp(camera.position.y,chasePosition.y,crash?2.2:rampAir?4.8:4.4,dt);
    camera.position.z=THREE.MathUtils.damp(camera.position.z,chasePosition.z,crash?2.1:rampAir?4.7:4.0,dt);

    const targetFov=baseFov+landingOpen*.32-(crash?.9*crashSettle:0);
    camera.fov=THREE.MathUtils.damp(camera.fov,targetFov,crash?3.0:5.0,dt);
    camera.updateProjectionMatrix();
    camera.lookAt(lookTarget);

    const speed01=getSpeedFeel(state.speed);
    const carveRoll=-state.edge*(.009+speed01*.014);
    const terrainRoll=-(state.groundRoll||0)*.042;
    const crashRoll=THREE.MathUtils.clamp(-crashDir*.038,-.040,.040)*crashSettle;
    const targetRoll=crash?crashRoll:THREE.MathUtils.clamp(carveRoll+terrainRoll,-.029,.029);
    roll=THREE.MathUtils.damp(roll,targetRoll,crash?3.2:6.2,dt);
    camera.rotateZ(roll);
  }

  return {update,reset,getChaseFrame};
}
