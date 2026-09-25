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
  CRASH_MIN_FOV:46,
  MAX_FOV:64.2,
  MAX_GAMEPLAY_ROLL:.029,
  MAX_CRASH_ROLL:.040,
  MAX_PREDICTION_TIME:2.75,
  MAX_LANDING_LEAD:6.2,
  MAX_LATERAL_LANDING_LEAD:1.35,
  FIRST_PERSON_MIN_FOV:64,
  FIRST_PERSON_MAX_FOV:75.5,
  VIEW_TRANSITION_SECONDS:.16,
  REDUCED_MOTION_SCALE:.34
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
  const transitionStartPosition=new THREE.Vector3();
  const transitionStartQuaternion=new THREE.Quaternion();
  const transitionTargetPosition=new THREE.Vector3();
  const transitionTargetQuaternion=new THREE.Quaternion();
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
  let motionMode='full';
  let viewMode=SKI_CAMERA_VIEW.CHASE;
  let transitionStartFov=finite(camera.fov,58);
  let viewTransitionElapsed=SKI_CAMERA_LIMITS.VIEW_TRANSITION_SECONDS;

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
    viewTransitionElapsed=SKI_CAMERA_LIMITS.VIEW_TRANSITION_SECONDS;
  }

  function setMotionMode(mode='full'){
    const next=['full','fixed','reduced'].includes(String(mode).toLowerCase())
      ?String(mode).toLowerCase()
      :'full';
    motionMode=next;
    motionScale=next==='reduced'?SKI_CAMERA_LIMITS.REDUCED_MOTION_SCALE:next==='fixed'?0:1;
    if(next==='fixed'){
      roll=0;
      landingKick=0;
      landingOpen=0;
      airborneLookBlend=0;
      previewForwardLead=0;
      previewLateralLead=0;
      previewLookDown=0;
    }
    return motionMode;
  }

  function setReducedMotion(enabled=false){
    setMotionMode(enabled?'reduced':'full');
    return motionScale;
  }

  function normalizeViewMode(mode){
    return Object.values(SKI_CAMERA_VIEW).includes(mode)?mode:SKI_CAMERA_VIEW.CHASE;
  }

  function setViewMode(mode=SKI_CAMERA_VIEW.CHASE){
    const next=normalizeViewMode(mode);
    if(next!==viewMode){
      transitionStartPosition.copy(camera.position);
      transitionStartQuaternion.copy(camera.quaternion);
      transitionStartFov=finite(camera.fov,58);
      viewMode=next;
      reset();
      viewTransitionElapsed=0;
    }
    return viewMode;
  }

  function applyViewTransition(dt){
    if(viewTransitionElapsed>=SKI_CAMERA_LIMITS.VIEW_TRANSITION_SECONDS)return;
    transitionTargetPosition.copy(camera.position);
    transitionTargetQuaternion.copy(camera.quaternion);
    const targetFov=finite(camera.fov,transitionStartFov);
    viewTransitionElapsed=Math.min(
      SKI_CAMERA_LIMITS.VIEW_TRANSITION_SECONDS,
      viewTransitionElapsed+Math.max(0,finite(dt,1/60))
    );
    const t=smoothstep01(viewTransitionElapsed/SKI_CAMERA_LIMITS.VIEW_TRANSITION_SECONDS);
    camera.position.lerpVectors(transitionStartPosition,transitionTargetPosition,t);
    camera.quaternion.slerpQuaternions(transitionStartQuaternion,transitionTargetQuaternion,t);
    camera.fov=THREE.MathUtils.lerp(transitionStartFov,targetFov,t);
    camera.updateProjectionMatrix();
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
    const speed01=getSpeedFeel(finite(state.speed,T.BASE_SPEED));
    const groundPitch=THREE.MathUtils.clamp(finite(state.groundPitch,0),-.16,.16);
    const eyeY=finite(state.y,.12)+1.58;
    const forwardX=Math.sin(heading);
    const forwardZ=-Math.cos(heading);
    const lookDistance=22+speed01*8;
    const eyeForward=.78;
    camera.position.set(
      finite(state.x,0)+forwardX*eyeForward,
      eyeY,
      1.58+forwardZ*eyeForward
    );
    camera.fov=THREE.MathUtils.clamp(
      SKI_CAMERA_LIMITS.FIRST_PERSON_MIN_FOV+speed01*9.6+(state.air?.65:0),
      SKI_CAMERA_LIMITS.FIRST_PERSON_MIN_FOV,
      SKI_CAMERA_LIMITS.FIRST_PERSON_MAX_FOV
    );
    camera.updateProjectionMatrix();
    camera.up.set(0,1,0);
    camera.lookAt(
      finite(state.x,0)+forwardX*lookDistance,
      eyeY-.30-groundPitch*2.15+(state.air?THREE.MathUtils.clamp(finite(state.vy,0)*.018,-.12,.10):0),
      1.58+forwardZ*lookDistance
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
    const speedResponseScale=motionMode==='fixed'?.14:motionMode==='reduced'?.48:1;
    const airResponseScale=motionMode==='fixed'?0:motionMode==='reduced'?.44:1;
    const previewMotionScale=motionMode==='fixed'?0:motionMode==='reduced'?.46:1;
    const previewStrength=airborneLookBlend*previewWeight*previewMotionScale;

    const centeredChase=viewMode===SKI_CAMERA_VIEW.CHASE||motionMode==='fixed';
    const tacticalHigh=viewMode===SKI_CAMERA_VIEW.HIGH_FAR;
    const steerScale=tacticalHigh?.34:1;
    const steerLead=centeredChase?0:(heading*(.82+speed01*.34)+lateralVelocity*.014)*steerScale;
    const downhillCameraLift=.30+speed01*.18*speedResponseScale;
    positionOut.set(
      centeredChase?finite(state.x,0):lateralFollow-steerLead,
      6.02+speed01*.78*speedResponseScale+downhillCameraLift+y*.14+(airHeight*(rampAir?.17:manualAir?.08:0)+(rampAir?apex*.18:0))*airResponseScale,
      10.48+speed01*1.98*speedResponseScale+(rampAir?1.05+airHeight*.14+apex*.42:manualAir?airHeight*.07:0)*airResponseScale+previewForwardLead*previewStrength*.085
    );

    const lookAhead=1.36+speed01*1.52*speedResponseScale;
    const lateralLook=centeredChase?0:(heading*lookAhead+lateralVelocity*.042)*(tacticalHigh?.38:1);
    const rampFraming=rampAir?(.88+descent*.08):1;
    const downhillLookBias=(1.62+speed01*.84*speedResponseScale)*rampFraming;
    const downhillLookDistance=1.35+speed01*1.18*speedResponseScale;
    lookOut.set(
      centeredChase
        ?finite(state.x,0)
        :lateralFollow*.24+finite(state.x,0)*.12+lateralLook+previewLateralLead*previewStrength,
      .34+y*.072-downhillLookBias+(airHeight*(rampAir?.012:.025)-descent*.12)*airResponseScale-previewLookDown*previewStrength,
      -15.85-speed01*5.35*speedResponseScale-downhillLookDistance-(rampAir?2.35+descent*1.95:air?.85:0)*airResponseScale-previewForwardLead*previewStrength
    );

    const fov=54.5+speed01*7.4*speedResponseScale+(rampAir?1.35+apex*.75:manualAir?.42:0)*airResponseScale;
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
      applyViewTransition(safeDt);
      return;
    }
    if(viewMode===SKI_CAMERA_VIEW.FIRST_PERSON){
      previousAir=air;
      previousLanding=landingPulse;
      applyFirstPersonView(state);
      applyViewTransition(safeDt);
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

    const centeredChase=viewMode===SKI_CAMERA_VIEW.CHASE||motionMode==='fixed';
    const desiredLateral=centeredChase?finite(state.x,0):lateralTarget(state);
    const returning=Math.abs(desiredLateral)<Math.abs(lateralFollow);
    lateralFollow=THREE.MathUtils.damp(lateralFollow,desiredLateral,returning?5.4:6.2,safeDt);

    if(motionMode==='fixed'){
      airborneLookBlend=0;
      previewForwardLead=0;
      previewLateralLead=0;
      previewLookDown=0;
      predictedLandingTime=0;
    }else{
      updatePrediction(state,safeDt);
    }
    let baseFov=getChaseFrame(state,chasePosition,lookTarget);
    if(viewMode===SKI_CAMERA_VIEW.HIGH_FAR){
      chasePosition.y+=2.70;
      chasePosition.z+=4.55;
      chasePosition.x=THREE.MathUtils.lerp(chasePosition.x,finite(state.x,0),.42);
      lookTarget.x=THREE.MathUtils.lerp(lookTarget.x,finite(state.x,0),.28);
      lookTarget.y-=.34;
      lookTarget.z-=3.35;
      baseFov+=.85;
    }
    const crashTime=Math.max(0,finite(state.crashTime,0));
    const crashDir=THREE.MathUtils.clamp(finite(state.crashDirection,0),-1,1);
    crashSettle=THREE.MathUtils.damp(crashSettle,crash?1:0,crash?3.8:7.0,safeDt);

    const crashZoomIn=smoothstep01(crashTime/.72);
    const crashZoomOut=smoothstep01((crashTime-1.55)/.95);
    const crashZoom=crashZoomIn*(1-crashZoomOut);
    if(crash){
      const crashX=finite(state.crashVisualX,finite(state.x,0));
      const crashY=finite(state.crashVisualY,finite(state.y,0));
      const crashZ=finite(state.crashVisualZ,0);
      chasePosition.x=THREE.MathUtils.lerp(chasePosition.x,crashX-crashDir*.62,.68);
      chasePosition.y=THREE.MathUtils.lerp(chasePosition.y,crashY+3.65+crashZoom*.34,.68);
      chasePosition.z=THREE.MathUtils.lerp(chasePosition.z,crashZ+7.75-crashZoom*1.62,.72);
      lookTarget.x=THREE.MathUtils.lerp(lookTarget.x,crashX,.74);
      lookTarget.y=THREE.MathUtils.lerp(lookTarget.y,crashY+.70,.70);
      lookTarget.z=THREE.MathUtils.lerp(lookTarget.z,crashZ-.18,.64);
    }else{
      chasePosition.y+=landingKick;
      chasePosition.z+=landingOpen;
    }

    const rampAir=air&&state.jumpSource==='ramp';
    const lateralResponse=crash?2.4:rampAir?6.7:air?7.4:8.0;
    if(!Number.isFinite(camera.position.x))camera.position.x=chasePosition.x;
    if(!Number.isFinite(camera.position.y))camera.position.y=chasePosition.y;
    if(!Number.isFinite(camera.position.z))camera.position.z=chasePosition.z;
    if(viewMode===SKI_CAMERA_VIEW.CHASE&&!crash)camera.position.x=chasePosition.x;
    else camera.position.x=THREE.MathUtils.damp(camera.position.x,chasePosition.x,lateralResponse,safeDt);
    camera.position.y=THREE.MathUtils.damp(camera.position.y,chasePosition.y,crash?2.2:rampAir?4.8:4.4,safeDt);
    camera.position.z=THREE.MathUtils.damp(camera.position.z,chasePosition.z,crash?2.1:rampAir?4.7:4.0,safeDt);

    const minimumFov=crash?SKI_CAMERA_LIMITS.CRASH_MIN_FOV:SKI_CAMERA_LIMITS.MIN_FOV;
    const targetFov=THREE.MathUtils.clamp(
      baseFov+landingOpen*.32-(crash?(2.0+8.6*crashZoom)*crashSettle:0),
      minimumFov,
      SKI_CAMERA_LIMITS.MAX_FOV
    );
    const currentFov=Number.isFinite(camera.fov)?camera.fov:targetFov;
    camera.fov=THREE.MathUtils.clamp(
      THREE.MathUtils.damp(currentFov,targetFov,crash?4.2:5.0,safeDt),
      minimumFov,
      SKI_CAMERA_LIMITS.MAX_FOV
    );
    camera.updateProjectionMatrix();
    camera.lookAt(lookTarget);

    const speed01=getSpeedFeel(finite(state.speed,T.BASE_SPEED));
    const carveRoll=(viewMode===SKI_CAMERA_VIEW.CHASE||motionMode==='fixed')
      ?0
      :-finite(state.edge,0)*(.009+speed01*.014);
    const terrainRoll=motionMode==='fixed'?0:-finite(state.groundRoll,0)*.042;
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
    applyViewTransition(safeDt);
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
      motionMode,
      viewMode
    };
  }

  return {
    update,
    reset,
    getChaseFrame,
    setReducedMotion,
    setMotionMode,
    getMotionMode:()=>motionMode,
    setViewMode,
    getViewMode:()=>viewMode,
    getDiagnostics
  };
}
