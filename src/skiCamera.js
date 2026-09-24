import * as THREE from 'three';
import {getSpeedFeel,SKI_TUNING as T} from './gameplayTuning.js';

export const SKI_CAMERA_VIEW=Object.freeze({
  CHASE:'chase',
  FIXED:'fixed',
  HIGH_FAR:'high-far',
  FIRST_PERSON:'first-person'
});

export const SKI_CAMERA_LIMITS=Object.freeze({
  MIN_FOV:54.5,
  MAX_FOV:64.2,
  MAX_GAMEPLAY_ROLL:.029,
  MAX_CRASH_ROLL:.040,
  MAX_PREDICTION_TIME:2.75,
  MAX_LANDING_LEAD:6.2,
  MAX_LATERAL_LANDING_LEAD:1.35,
  REDUCED_MOTION_SCALE:.38
});

function smoothstep01(value){
  const t=THREE.MathUtils.clamp(value,0,1);
  return t*t*(3-2*t);
}

function finite(value,fallback=0){
  const number=Number(value);
  return Number.isFinite(number)?number:fallback;
}

export function predictAirborneLanding(state={}){
  if(!state.air){
    return {active:false,time:0,distance:0,forwardLead:0,lateralLead:0,lookDown:0,confidence:0};
  }

  const gravity=Math.max(.001,finite(T.GRAVITY,17.8));
  const ground=.12+finite(state.centerGround,0);
  const height=Math.max(0,finite(state.y,ground)-ground);
  const vy=finite(state.vy,0);
  const discriminant=Math.max(0,vy*vy+2*gravity*height);
  const rawTime=(vy+Math.sqrt(discriminant))/gravity;
  const time=THREE.MathUtils.clamp(rawTime,0,SKI_CAMERA_LIMITS.MAX_PREDICTION_TIME);
  const speed=THREE.MathUtils.clamp(Math.abs(finite(state.speed,T.BASE_SPEED)),0,T.MAX_SPEED*1.05);
  const distance=speed*time;
  const vx=THREE.MathUtils.clamp(finite(state.vx,0),-14,14);
  const x=finite(state.x,0);
  const predictedX=THREE.MathUtils.clamp(x+vx*time*.72,-T.PLAYER_HALF_WIDTH,T.PLAYER_HALF_WIDTH);
  const lateralLead=THREE.MathUtils.clamp(
    (predictedX-x)*.18,
    -SKI_CAMERA_LIMITS.MAX_LATERAL_LANDING_LEAD,
    SKI_CAMERA_LIMITS.MAX_LATERAL_LANDING_LEAD
  );
  const forwardLead=THREE.MathUtils.clamp(distance*.041,0,SKI_CAMERA_LIMITS.MAX_LANDING_LEAD);
  const lookDown=THREE.MathUtils.clamp(time*.23+height*.025,0,.72);
  const confidence=smoothstep01((time-.16)/.74);

  return {active:true,time,distance,forwardLead,lateralLead,lookDown,confidence};
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
  let airborneLookBlend=0;
  let previewForwardLead=0;
  let previewLateralLead=0;
  let previewLookDown=0;
  let predictedLandingTime=0;
  let motionScale=1;
  let viewMode=SKI_CAMERA_VIEW.CHASE;

  function reset(){
    roll=0;
    landingKick=0;
    landingOpen=0;
    previousLanding=0;
    previousAir=false;
    crashSettle=0;
    lateralFollow=0;
    airborneLookBlend=0;
    previewForwardLead=0;
    previewLateralLead=0;
    previewLookDown=0;
    predictedLandingTime=0;
  }

  function setReducedMotion(enabled=false){
    motionScale=enabled?SKI_CAMERA_LIMITS.REDUCED_MOTION_SCALE:1;
    return motionScale;
  }

  function normalizeViewMode(mode){
    return Object.values(SKI_CAMERA_VIEW).includes(mode)?mode:SKI_CAMERA_VIEW.CHASE;
  }

  function setViewMode(mode=SKI_CAMERA_VIEW.CHASE){
    const next=normalizeViewMode(mode);
    if(next!==viewMode){
      viewMode=next;
      reset();
    }
    return viewMode;
  }

  function applyFixedView(){
    camera.position.set(0,7.25,13.15);
    camera.fov=58;
    camera.updateProjectionMatrix();
    camera.up.set(0,1,0);
    camera.lookAt(0,.15,-18.75);
    roll=0;
  }

  function applyFirstPersonView(state){
    const heading=THREE.MathUtils.clamp(finite(state.heading,0),-.48,.48);
    const groundRoll=THREE.MathUtils.clamp(finite(state.groundRoll,0),-.4,.4);
    const eyeY=finite(state.y,.12)+1.62;
    const forwardX=Math.sin(heading);
    const forwardZ=-Math.cos(heading);
    camera.position.set(
      finite(state.x,0)+forwardX*.42,
      eyeY,
      1.58+forwardZ*.50
    );
    camera.fov=68;
    camera.updateProjectionMatrix();
    camera.up.set(0,1,0);
    camera.lookAt(
      finite(state.x,0)+forwardX*22,
      eyeY-.34-finite(state.groundPitch,0)*4.2-groundRoll*.18,
      1.58+forwardZ*22
    );
    roll=0;
  }

  function lateralTarget(state){
    const x=finite(state.x,0);
    const absX=Math.abs(x);
    const deadStart=2.05;
    const deadEnd=3.0;
    const engage=smoothstep01((absX-deadStart)/(deadEnd-deadStart));
    const edgeFeel=THREE.MathUtils.clamp((absX-deadEnd)/5.2,0,1);
    const followFraction=THREE.MathUtils.lerp(.38,.52,edgeFeel);
    return x*followFraction*engage;
  }

  function getChaseFrame(state,positionOut=chasePosition,lookOut=lookTarget){
    const speed=finite(state.speed,T.BASE_SPEED);
    const speed01=getSpeedFeel(speed);
    const air=!!state.air;
    const rampAir=air&&state.jumpSource==='ramp';
    const manualAir=air&&state.jumpSource==='manual';
    const ground=finite(state.centerGround,0);
    const y=finite(state.y,.12+ground);
    const airHeight=air?THREE.MathUtils.clamp(y-ground-.12,0,8):0;
    const lateralVelocity=THREE.MathUtils.clamp(finite(state.vx,0),-14,14);
    const verticalVelocity=finite(state.vy,0);
    const heading=finite(state.heading,0);
    const apex=rampAir?THREE.MathUtils.clamp(1-Math.abs(verticalVelocity)/8,0,1):0;
    const descent=rampAir?THREE.MathUtils.clamp(-verticalVelocity/11,0,1):0;
    const previewWeight=air?(rampAir?.72:manualAir?.56:.62):1;
    const previewStrength=airborneLookBlend*previewWeight;

    const steerLead=heading*(.82+speed01*.34)+lateralVelocity*.014;
    const downhillCameraLift=.30+speed01*.18;
    positionOut.set(
      lateralFollow-steerLead,
      6.02+speed01*.78+downhillCameraLift+y*.14+airHeight*(rampAir?.17:manualAir?.08:0)+(rampAir?apex*.18:0),
      10.48+speed01*1.98+(rampAir?1.05+airHeight*.14+apex*.42:manualAir?airHeight*.07:0)+previewForwardLead*previewStrength*.085
    );

    const lookAhead=1.36+speed01*1.52;
    const lateralLook=heading*lookAhead+lateralVelocity*.042;
    const rampFraming=rampAir?(.88+descent*.08):1;
    const downhillLookBias=(1.62+speed01*.84)*rampFraming;
    const downhillLookDistance=1.35+speed01*1.18;
    lookOut.set(
      lateralFollow*.24+finite(state.x,0)*.12+lateralLook+previewLateralLead*previewStrength,
      .34+y*.072-downhillLookBias+airHeight*(rampAir?.012:.025)-descent*.12-previewLookDown*previewStrength,
      -15.85-speed01*5.35-downhillLookDistance-(rampAir?2.35+descent*1.95:air?.85:0)-previewForwardLead*previewStrength
    );

    const fov=54.5+speed01*7.4+(rampAir?1.35+apex*.75:manualAir?.42:0);
    return THREE.MathUtils.clamp(fov,SKI_CAMERA_LIMITS.MIN_FOV,SKI_CAMERA_LIMITS.MAX_FOV);
  }

  function updatePrediction(state,dt){
    const prediction=predictAirborneLanding(state);
    const rampAir=prediction.active&&state.jumpSource==='ramp';
    const manualAir=prediction.active&&state.jumpSource==='manual';
    const targetBlend=prediction.active
      ?prediction.confidence*(rampAir?1:manualAir?.86:.92)
      :0;
    const response=prediction.active
      ?(targetBlend>airborneLookBlend?4.8:3.8)
      :3.15;
    airborneLookBlend=THREE.MathUtils.damp(airborneLookBlend,targetBlend,response,dt);

    if(prediction.active){
      previewForwardLead=THREE.MathUtils.damp(previewForwardLead,prediction.forwardLead,5.4,dt);
      previewLateralLead=THREE.MathUtils.damp(previewLateralLead,prediction.lateralLead,6.0,dt);
      previewLookDown=THREE.MathUtils.damp(previewLookDown,prediction.lookDown,5.0,dt);
      predictedLandingTime=prediction.time;
    }else{
      predictedLandingTime=0;
      if(airborneLookBlend<.002){
        airborneLookBlend=0;
        previewForwardLead=0;
        previewLateralLead=0;
        previewLookDown=0;
      }
    }
  }

  function update(state,dt){
    const safeDt=THREE.MathUtils.clamp(finite(dt,1/60),0,0.1);
    const crash=state.mode==='crashed';
    const air=!!state.air;
    const landingPulse=finite(state.landingPulse,0);

    if(viewMode===SKI_CAMERA_VIEW.FIXED){
      previousAir=air;
      previousLanding=landingPulse;
      applyFixedView();
      return;
    }
    if(viewMode===SKI_CAMERA_VIEW.FIRST_PERSON){
      previousAir=air;
      previousLanding=landingPulse;
      applyFirstPersonView(state);
      return;
    }

    const landingEdge=!air&&previousAir;
    if(landingEdge||(!air&&landingPulse>previousLanding+.10)){
      const hard=state.landingQuality==='hard';
      const rough=state.landingQuality==='rough';
      landingKick=-(hard?.20:rough?.14:.075)*motionScale;
      const openScale=.72+motionScale*.28;
      landingOpen=(hard?.52:rough?.34:.18)*openScale;
    }
    previousAir=air;
    previousLanding=landingPulse;
    landingKick=THREE.MathUtils.damp(landingKick,0,8.2,safeDt);
    landingOpen=THREE.MathUtils.damp(landingOpen,0,5.6,safeDt);

    const desiredLateral=lateralTarget(state);
    const returning=Math.abs(desiredLateral)<Math.abs(lateralFollow);
    lateralFollow=THREE.MathUtils.damp(lateralFollow,desiredLateral,returning?4.25:5.15,safeDt);

    updatePrediction(state,safeDt);
    let baseFov=getChaseFrame(state,chasePosition,lookTarget);
    if(viewMode===SKI_CAMERA_VIEW.HIGH_FAR){
      chasePosition.y+=2.45;
      chasePosition.z+=4.15;
      chasePosition.x*=.82;
      lookTarget.y-=.42;
      lookTarget.z-=2.85;
      baseFov+=1.15;
    }
    const crashTime=Math.max(0,finite(state.crashTime,0));
    const crashDir=THREE.MathUtils.clamp(finite(state.crashDirection,0),-1,1);
    crashSettle=THREE.MathUtils.damp(crashSettle,crash?1:0,crash?3.8:7.0,safeDt);

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
    if(!Number.isFinite(camera.position.x))camera.position.x=chasePosition.x;
    if(!Number.isFinite(camera.position.y))camera.position.y=chasePosition.y;
    if(!Number.isFinite(camera.position.z))camera.position.z=chasePosition.z;
    camera.position.x=THREE.MathUtils.damp(camera.position.x,chasePosition.x,lateralResponse,safeDt);
    camera.position.y=THREE.MathUtils.damp(camera.position.y,chasePosition.y,crash?2.2:rampAir?4.8:4.4,safeDt);
    camera.position.z=THREE.MathUtils.damp(camera.position.z,chasePosition.z,crash?2.1:rampAir?4.7:4.0,safeDt);

    const targetFov=THREE.MathUtils.clamp(
      baseFov+landingOpen*.32-(crash?.9*crashSettle:0),
      SKI_CAMERA_LIMITS.MIN_FOV,
      SKI_CAMERA_LIMITS.MAX_FOV
    );
    const currentFov=Number.isFinite(camera.fov)?camera.fov:targetFov;
    camera.fov=THREE.MathUtils.clamp(
      THREE.MathUtils.damp(currentFov,targetFov,crash?3.0:5.0,safeDt),
      SKI_CAMERA_LIMITS.MIN_FOV,
      SKI_CAMERA_LIMITS.MAX_FOV
    );
    camera.updateProjectionMatrix();
    camera.lookAt(lookTarget);

    const speed01=getSpeedFeel(finite(state.speed,T.BASE_SPEED));
    const carveRoll=-finite(state.edge,0)*(.009+speed01*.014);
    const terrainRoll=-finite(state.groundRoll,0)*.042;
    const crashRoll=THREE.MathUtils.clamp(-crashDir*.038,-SKI_CAMERA_LIMITS.MAX_CRASH_ROLL,SKI_CAMERA_LIMITS.MAX_CRASH_ROLL)*crashSettle;
    const gameplayRoll=THREE.MathUtils.clamp(
      carveRoll+terrainRoll,
      -SKI_CAMERA_LIMITS.MAX_GAMEPLAY_ROLL,
      SKI_CAMERA_LIMITS.MAX_GAMEPLAY_ROLL
    );
    const targetRoll=(crash?crashRoll:gameplayRoll)*motionScale;
    roll=THREE.MathUtils.damp(roll,targetRoll,crash?3.2:6.2,safeDt);
    roll=THREE.MathUtils.clamp(
      roll,
      -SKI_CAMERA_LIMITS.MAX_CRASH_ROLL*motionScale,
      SKI_CAMERA_LIMITS.MAX_CRASH_ROLL*motionScale
    );
    camera.rotateZ(roll);
  }

  function getDiagnostics(){
    return {
      roll,
      landingKick,
      landingOpen,
      lateralFollow,
      airborneLookBlend,
      previewForwardLead,
      previewLateralLead,
      previewLookDown,
      predictedLandingTime,
      motionScale,
      viewMode
    };
  }

  return {update,reset,getChaseFrame,setReducedMotion,setViewMode,getViewMode:()=>viewMode,getDiagnostics};
}
