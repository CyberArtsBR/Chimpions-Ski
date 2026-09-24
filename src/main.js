import * as THREE from 'three';
import './style.css';
import './floatingUI.css';
import {createMountainWeather} from './mountainWeather.js';
import {createFallbackSkier,loadRiderAsset} from './skier.js';
import {readPad} from './input.js';
import {createGameplayInput} from './gameplayInput.js';
import {createTouchControls} from './touchControls.js';
import {createSkiAudio} from './audio.js';
import {createSkiEnvironment,decorateCourseObject} from './environment.js';
import {createBananaVisual} from './collectibleVisuals.js';
import {loadAvatarCatalog,createAvatarSelector,disposeAvatarObject} from './avatar-system.js';
import {createGameUI} from './ui.js';
import {progressSpeed,stepCarving,updateJumpAssist,tryManualJump,stepAir,launchRamp} from './skiPhysics.js';
import {createCourseDirector,getCourseDifficulty} from './course.js';
import {terrainHeight,sampleSkiGround,displaceTerrainChunk,dampTerrainContact} from './terrainContact.js';
import {createSkiCamera} from './skiCamera.js';
import {createGameFeedback} from './gameFeedback.js';
import {createStartCameraSequence,START_CAMERA_FRONT_HOLD_MS,START_CAMERA_ROTATE_MS} from './startCameraSequence.js';
import {createStartCrowd} from './startCrowd.js';
import {createStartGateScene} from './startGateScene.js';
import {createSkiTrails} from './snowTrails.js';
import {SKI_TUNING} from './gameplayTuning.js';
import {OBSTACLE_TUNING} from './obstacleTuning.js';
import {getCourseLookahead} from './courseStreaming.js';
import {breakSkillCombo,resetAirborneScoring,resetHazardScoring,scoreRiskBanana,tryScoreNearMiss,updateAirborneScoring,tryScoreAirborneClearance} from './airborneScoring.js';
import {createStartScreen} from './startScreen.js';
import {createScorePresentation} from './scorePresentation.js';
import {createCourseRenderBatches} from './courseRenderBatches.js';
import {createCollisionBroadphase} from './collisionBroadphase.js';
import {createTrickSystem} from './trickSystem.js';
import {announceTrickStart,resetTrickScoring,scoreTrickCompletion,scoreTrickFailure} from './trickScoring.js';
import {createHaptics} from './haptics.js';
import {RIDE_MODE,getRideProfile,normalizeRideMode,speedToKmh} from './rideMode.js';
import {resetPlayerOrientation,updateRidingOrientation,updateCrashOrientation} from './playerOrientation.js';
import {quality,QUALITY_PROFILE_NAMES} from './renderQuality.js';
import {BUILTIN_AVATAR_NAMES,DEFAULT_AVATAR_NAME,createBuiltinAvatarEntry} from './avatarRoster.js';
import {createPerformanceTelemetry} from './performanceTelemetry.js';
import {CAMERA_MOTION,CAMERA_VIEW,loadUserPreferences,saveAvatarPreference,saveCameraMotionPreference,saveCameraViewPreference,saveHapticsPreference,saveQualityPreference,saveRideModePreference} from './userPreferences.js';

const userPreferences=loadUserPreferences();

let requestedRunSeed=null;
try{
  const seedParam=new URLSearchParams(globalThis.location?.search||'').get('seed');
  requestedRunSeed=seedParam?String(seedParam):null;
}catch{}
function createRunSeed(){
  if(requestedRunSeed)return requestedRunSeed;
  try{
    const values=new Uint32Array(2);
    globalThis.crypto?.getRandomValues?.(values);
    if(values[0]||values[1])return `${values[0].toString(36)}-${values[1].toString(36)}`;
  }catch{}
  return `${Date.now().toString(36)}-${Math.floor(Math.random()*0xffffffff).toString(36)}`;
}

let explicitQualityOverride=false;
try{explicitQualityOverride=new URLSearchParams(globalThis.location?.search||'').has('quality');}catch{}
if(!explicitQualityOverride)quality.setProfile(userPreferences.quality||'auto');

const app=document.querySelector('#app');
app.innerHTML=`
  <div class="hud" aria-label="Run statistics">
    <div class="stat" aria-label="Distance"><small><svg class="hud-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m2 20 7-14 4 7 3-5 6 12Z M6 12l3 2 2-2"/></svg>DISTANCE</small><strong id="distance">0 m</strong></div>
    <div class="stat is-banana" aria-label="Bananas"><small><svg class="hud-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 3c2 9-4 15-13 13 3 6 12 6 15-1 2-4 1-8-2-12Z M18 3l-1-1"/></svg>BANANAS</small><strong id="bananas">0</strong></div>
    <div class="stat" aria-label="Speed"><small><svg class="hud-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19a10 10 0 1 1 16 0 M12 5v2 M5 9l2 1 M19 9l-2 1 M12 15l5-6"/><circle cx="12" cy="15" r="1.5"/></svg>SPEED</small><strong id="speed">0 km/h</strong></div>
  </div>
  <div class="overlay" id="overlay">
    <section class="card" aria-labelledby="game-title">
      <div class="badge">❄️ ALPINE ARCADE</div>
      <h1 class="logo" id="game-title">CHIMPIONS <span>SKI</span></h1>
      <p class="tagline">Carve the endless mountain, chase bananas, clear the jumps and keep your line as the descent gets faster.</p>
      <div class="selected-avatar" id="selected-avatar">
        <span class="selected-avatar-image" id="selected-avatar-image">🐵</span>
        <span><small>YOUR RIDER</small><strong id="selected-avatar-name">Loading Chimpions…</strong><em id="selected-ride-mode" class="selected-ride-mode">SKI · 150–300 KM/H</em></span>
      </div>
      <div class="menu-actions">
        <button class="secondary" id="choose" aria-label="Choose Chimpion" disabled>CHOOSE CHIMPION</button>
        <button class="primary" id="start" aria-label="Start skiing" disabled>LOADING CHIMPION…</button>
      </div>
      <div class="tip">A / D or LEFT STICK / D-PAD · CARVE &nbsp; · &nbsp; SPACE / A · CROSS · JUMP &nbsp; · &nbsp; ESC / START · MENU · PAUSE</div>
    </section>
  </div>
`;

const $=id=>document.getElementById(id);
const scene=new THREE.Scene();

const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.1,280);
camera.position.set(0,6.1,10.5);
camera.lookAt(0,1,-12);
const skiCamera=createSkiCamera(camera);
const reducedMotionMedia=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')||null;
let cameraViewMode=Object.values(CAMERA_VIEW).includes(userPreferences.cameraView)?userPreferences.cameraView:CAMERA_VIEW.CHASE;
skiCamera.setViewMode(cameraViewMode);
document.documentElement.dataset.cameraView=cameraViewMode;
let cameraMotionMode=userPreferences.cameraMotion;
if(cameraMotionMode===CAMERA_MOTION.AUTO){
  cameraMotionMode=reducedMotionMedia?.matches?CAMERA_MOTION.REDUCED:CAMERA_MOTION.FULL;
}
function applyCameraMotionPreference(mode=cameraMotionMode){
  cameraMotionMode=[CAMERA_MOTION.FULL,CAMERA_MOTION.FIXED,CAMERA_MOTION.REDUCED].includes(mode)
    ?mode
    :CAMERA_MOTION.FULL;
  skiCamera.setMotionMode?.(cameraMotionMode);
  document.documentElement.dataset.cameraMotion=cameraMotionMode;
  return cameraMotionMode;
}
applyCameraMotionPreference();

const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
const performanceTelemetry=createPerformanceTelemetry();
renderer.setPixelRatio(Math.min(devicePixelRatio,quality.getSettings().dprCap));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=false;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.05;
app.prepend(renderer.domElement);

const world=new THREE.Group();scene.add(world);
const environment=createSkiEnvironment({scene,world,renderer,camera});
quality.subscribe(settings=>renderer.setPixelRatio(Math.min(devicePixelRatio,settings.dprCap)));
const snowMat=environment.terrainMaterial;
const {
  trunk:trunkMat,
  pine:pineMat,
  rock:rockMat,
  banana:bananaMat,
  ramp:rampMat,
  log:logMat,
  logEnd:logEndMat
}=environment.courseMaterials;

const oilMat=new THREE.MeshStandardMaterial({
  color:0x10141b,roughness:.16,metalness:.42,transparent:true,opacity:.94
});
const oilSheenMat=new THREE.MeshBasicMaterial({
  color:0x39496f,transparent:true,opacity:.30,depthWrite:false
});

const tiles=[];
for(let i=0;i<9;i++){
  // Gameplay remains ±11.3, but the rendered mountain surface extends far beyond
  // the camera frustum so the player never sees a hard left/right snow border.
  const geometry=new THREE.PlaneGeometry(320,28,128,18);
  const uv=geometry.attributes.uv;
  for(let vertex=0;vertex<uv.count;vertex++)uv.setX(vertex,uv.getX(vertex)*10);
  uv.needsUpdate=true;
  const tile=new THREE.Mesh(geometry,snowMat);
  tile.rotation.x=-Math.PI/2;
  tile.position.set(0,0,-i*28+8);
  displaceTerrainChunk(geometry,tile.position.z);
  tile.receiveShadow=true;
  world.add(tile);
  tiles.push(tile);
}

function makeTree(){
  const g=new THREE.Group();
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.16,.24,1.6,8),trunkMat);trunk.position.y=.8;trunk.castShadow=true;g.add(trunk);
  for(let i=0;i<3;i++){const c=new THREE.Mesh(new THREE.ConeGeometry(1.05-i*.12,2.1,10),pineMat);c.position.y=1.35+i*.72;c.castShadow=true;g.add(c);}
  // Feet above ~3.7 m clear the full tree silhouette; manual jump cannot reach it,
  // but the upper part of a monster ramp arc can.
  g.userData.kind='tree';g.userData.radius=.72;g.userData.radiusX=.62;g.userData.radiusZ=.68;g.userData.clearance=3.70;decorateCourseObject(g,'tree');return g;
}
function makeRock(){
  const m=new THREE.Mesh(new THREE.DodecahedronGeometry(.64,0),rockMat);m.scale.set(1.15,.75,.9);m.position.y=.48;m.castShadow=true;m.userData.kind='rock';m.userData.radius=.62;m.userData.radiusX=.55;m.userData.radiusZ=.58;m.userData.clearance=.78;decorateCourseObject(m,'rock');return m;
}
function makeBanana(){
  const g=createBananaVisual(bananaMat);
  g.position.y=1.05;
  g.userData.kind='banana';
  g.userData.radius=.55;
  g.userData.radiusX=.48;
  g.userData.radiusZ=.58;
  g.userData.yOffset=1.05;
  decorateCourseObject(g,'banana');
  return g;
}
const rampCourseGeometry=new THREE.BoxGeometry(2.4,.22,3.2);
function makeRamp(){
  const g=new THREE.Group();
  const m=new THREE.Mesh(rampCourseGeometry,rampMat);m.rotation.x=.18;m.position.y=.34;m.castShadow=m.receiveShadow=true;g.add(m);
  g.userData.kind='ramp';g.userData.radius=1.15;g.userData.radiusX=1.16;g.userData.radiusZ=1.58;decorateCourseObject(g,'ramp');return g;
}
function makeLog(){
  const tuning=OBSTACLE_TUNING.log;
  const g=new THREE.Group();
  const log=new THREE.Mesh(new THREE.CylinderGeometry(.22,.28,tuning.length,12),logMat);
  log.rotation.z=Math.PI/2;log.position.y=.28;log.castShadow=log.receiveShadow=true;g.add(log);
  for(const side of [-1,1]){
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(.15,.15,.16,12),logEndMat);
    cap.rotation.z=Math.PI/2;cap.position.set(side*tuning.capOffset,.28,0);cap.castShadow=true;g.add(cap);
  }
  g.userData.kind='log';g.userData.radius=tuning.collisionHalfWidth;g.userData.radiusX=tuning.collisionHalfWidth;g.userData.radiusZ=tuning.radiusZ;g.userData.clearance=tuning.clearance;decorateCourseObject(g,'log');return g;
}
function makeWideLog(){
  const tuning=OBSTACLE_TUNING.wideLog;
  const g=new THREE.Group();
  const log=new THREE.Mesh(new THREE.CylinderGeometry(.30,.35,tuning.length,14),logMat);
  log.rotation.z=Math.PI/2;log.position.y=.35;log.castShadow=log.receiveShadow=true;g.add(log);
  for(const side of [-1,1]){
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(.23,.23,.18,14),logEndMat);
    cap.rotation.z=Math.PI/2;cap.position.set(side*tuning.capOffset,.35,0);cap.castShadow=true;g.add(cap);
  }
  g.userData.kind='wideLog';g.userData.radius=tuning.collisionHalfWidth;g.userData.radiusX=tuning.collisionHalfWidth;g.userData.radiusZ=tuning.radiusZ;g.userData.clearance=tuning.clearance;
  decorateCourseObject(g,'wideLog');
  return g;
}
function makeOil(){
  const tuning=OBSTACLE_TUNING.oil;
  const g=new THREE.Group();
  const puddle=new THREE.Mesh(new THREE.CircleGeometry(1,28),oilMat);
  puddle.rotation.x=-Math.PI/2;puddle.scale.set(tuning.visualScaleX,tuning.visualScaleZ,1);puddle.position.y=.024;g.add(puddle);
  const sheen=new THREE.Mesh(new THREE.RingGeometry(.46,.82,28),oilSheenMat);
  sheen.rotation.x=-Math.PI/2;sheen.scale.set(tuning.sheenScaleX,tuning.sheenScaleZ,1);sheen.position.y=.031;sheen.rotation.z=.38;g.add(sheen);
  g.userData.kind='oil';g.userData.radius=tuning.collisionHalfWidth;g.userData.radiusX=tuning.collisionHalfWidth;g.userData.radiusZ=tuning.radiusZ;g.userData.clearance=tuning.clearance;g.userData.yOffset=.012;
  return g;
}

const courseRenderBatches=createCourseRenderBatches({
  world,
  prototypes:{
    tree:makeTree(),
    rock:makeRock(),
    log:makeLog(),
    wideLog:makeWideLog(),
    oil:makeOil()
  },
  capacity:512,
  // Camera far plane is 280 m; keep a small margin without submitting hazards
  // tens of metres beyond anything the player can see.
  renderMinZ:-285,
  renderMaxZ:24
});
const courseBatchComponentCounts=courseRenderBatches.getComponentCounts();

const course=[];
const collisionBroadphase=createCollisionBroadphase({bucketSize:8});
const collisionQueryScratch=[];
const COLLISION_QUERY_HALF_Z=3.5;
let courseDirector=null;
let courseFrame=0;
let activeRamp=null;
const OPENING_CLEAR_DISTANCE=245;
// Keep the authored section frontier, including empty recovery/landing space.
// The first generated hazards begin near the far edge of the initial camera
// view so every run opens with a few seconds of clean downhill breathing room.
let courseEndZ=-OPENING_CLEAR_DISTANCE,courseTravel=0;

function routeCenter(z){
  return Math.sin((-z)*.035)*2.9+Math.sin((-z)*.011)*1.1;
}
const coursePool={tree:[],rock:[],log:[],wideLog:[],oil:[],banana:[],ramp:[]};
function clearActiveRamp(){
  if(activeRamp)activeRamp.userData.activated=false;
  activeRamp=null;
}
function countCourseMeshes(item){
  let count=0;
  item.traverse?.(child=>{if(child.isMesh)count++;});
  return count;
}
function makeCourseItem(kind){
  if(courseRenderBatches.isBatchedKind(kind))return courseRenderBatches.createHandle(kind);
  const item=kind==='banana'?makeBanana():makeRamp();
  item.visible=false;
  item.userData.sceneRegistered=true;
  item.userData.courseDrawCalls=countCourseMeshes(item);
  world.add(item);
  return item;
}
function acquireCourseItem(kind){
  const item=coursePool[kind].pop()||makeCourseItem(kind);
  item.visible=true;
  item.userData.activated=false;
  item.userData.consumed=false;
  item.userData.triggered=false;
  resetHazardScoring(item);
  courseRenderBatches.activate(item);
  return item;
}
function releaseCourseItem(item){
  if(item===activeRamp)clearActiveRamp();
  else item.userData.activated=false;
  collisionBroadphase.remove(item);
  item.userData.consumed=false;
  item.visible=false;
  courseRenderBatches.deactivate(item);
  coursePool[item.userData.kind]?.push(item);
}
function removeCourseAt(index){
  const item=course[index];
  const last=course.pop();
  if(index<course.length)course[index]=last;
  releaseCourseItem(item);
}
function removeCourseItem(item){
  const index=course.indexOf(item);
  if(index>=0)removeCourseAt(index);
}
function addCoursePlacement(placement){
  const item=acquireCourseItem(placement.kind);
  item.position.x=placement.x;
  item.position.z=placement.z+courseTravel;
  item.position.y=terrainHeight(item.position.x,placement.z)+(item.userData.yOffset||0);
  item.userData.spawnFrame=courseFrame;
  item.userData.section=placement.section;
  item.userData.safeX=placement.safeX;
  item.userData.runPhase=placement.runPhase||'';
  item.userData.expertPattern=placement.expertPattern||'';
  item.userData.routePressure=Number(placement.routePressure)||0;
  item.userData.riskReward=Number(placement.riskReward)||0;
  item.userData.rewardPoints=Number(placement.rewardPoints)||0;
  item.userData.activated=false;
  item.userData.landingZone=!!placement.landingZone;
  item.userData.jumpTarget=!!placement.jumpTarget;
  item.userData.courseLocalZ=placement.z;
  course.push(item);
  collisionBroadphase.add(item,placement.z);
}
function getCoursePerformanceSnapshot(){
  return {
    nearMisses:state.nearMisses||0,
    cleanLandings:state.cleanLandings||0,
    successfulTricks:state.successfulTricks||0,
    failedTricks:state.failedTricksCount||0,
    oilContacts:state.oilContacts||0,
    bananas:state.bananas||0,
    riskBananas:state.riskBananas||0,
    timeSinceMistake:Number.isFinite(state.lastMistakeTime)
      ?Math.max(0,state.time-state.lastMistakeTime)
      :Math.max(0,state.time),
    steeringCorrectionIntensity:state.steeringCorrectionIntensity||0
  };
}

function fillCourse(difficulty=0){
  const generationStarted=performance.now();
  const lookahead=getCourseLookahead(state?.speed??SKI_TUNING.BASE_SPEED);
  const targetWorldZ=player.position.z-lookahead;
  let guard=0;
  while(courseEndZ+courseTravel>targetWorldZ&&guard++<24){
    const section=courseDirector.next({
      startZ:courseEndZ-5.5,
      difficulty,
      speed:state.speed,
      postMaxTime:state.postMaxHazardTime,
      runTime:state.time,
      performance:getCoursePerformanceSnapshot()
    });
    for(const placement of section.placements)addCoursePlacement(placement);
    courseEndZ=section.endZ;
  }
  performanceTelemetry.record('courseGeneration',performance.now()-generationStarted);
}
function resetCourse(difficulty=0){
  clearActiveRamp();
  while(course.length)releaseCourseItem(course.pop());
  collisionBroadphase.clear();
  courseDirector.reset({seed:state.runSeed});
  courseEndZ=-OPENING_CLEAR_DISTANCE;courseTravel=0;
  fillCourse(difficulty);
}

function syncCourseVisuals(){
  const traversalStarted=performance.now();
  let nearestSectionItem=null;
  for(let i=course.length-1;i>=0;i--){
    const item=course[i];
    const localZ=Number.isFinite(item.userData.courseLocalZ)
      ?item.userData.courseLocalZ
      :item.position.z-courseTravel;
    item.userData.courseLocalZ=localZ;
    item.position.z=localZ+courseTravel;
    const itemGround=terrainHeight(item.position.x,localZ);
    item.position.y=itemGround+(item.userData.yOffset||0);

    if(item.userData.kind==='banana'){
      const phase=state.time*3.4+item.position.z*.085;
      item.rotation.y=Math.sin(phase)*.26;
      item.rotation.z=Math.sin(phase*.73)*.055;
    }

    if(item.position.z>17){
      removeCourseAt(i);
      continue;
    }
    if(item.position.z<=player.position.z&&(!nearestSectionItem||item.position.z>nearestSectionItem.position.z)){
      nearestSectionItem=item;
    }
  }

  if(nearestSectionItem){
    state.courseSection=nearestSectionItem.userData.section||state.courseSection;
    state.safeRouteX=nearestSectionItem.userData.safeX??state.safeRouteX;
  }
  performanceTelemetry.record('courseTraversal',performance.now()-traversalStarted);
}

// Continuous twin grooves use one bounded dynamic mesh instead of disconnected decals.
const skiTrails=createSkiTrails({world,terrainHeight,capacity:192});
let trailTimer=0;

const player=new THREE.Group();scene.add(player);
player.position.set(0,.12,2.2);

const specialAura=new THREE.Group();
specialAura.name='banana-power-aura';
specialAura.visible=false;
const specialAuraMaterial=new THREE.MeshBasicMaterial({
  color:0xffdf49,transparent:true,opacity:.58,depthWrite:false,blending:THREE.AdditiveBlending
});
const specialAuraRingLow=new THREE.Mesh(new THREE.TorusGeometry(.92,.045,8,28),specialAuraMaterial);
specialAuraRingLow.rotation.x=Math.PI/2;
specialAuraRingLow.position.y=.32;
const specialAuraRingHigh=new THREE.Mesh(new THREE.TorusGeometry(.70,.035,8,24),specialAuraMaterial.clone());
specialAuraRingHigh.rotation.x=Math.PI/2;
specialAuraRingHigh.position.y=1.72;
specialAura.add(specialAuraRingLow,specialAuraRingHigh);
player.add(specialAura);

const trickVisualPivot=new THREE.Group();
trickVisualPivot.name='trick-visual-pivot';
player.add(trickVisualPivot);
const tricks=createTrickSystem({visualTarget:trickVisualPivot});
const startCamera=createStartCameraSequence({camera,skiCamera,player});
const startCrowd=createStartCrowd({world,terrainHeight});
const startGate=createStartGateScene({world,terrainHeight});
const START_COUNTDOWN_DURATION_MS=2700;
const BANANA_POWER_GOAL=10;
const BANANA_POWER_DURATION=3;
const BANANA_BULLET_TIME_SCALE=.35;
let startCountdownStarted=false;
let skier=null,catalog=[],selectedAvatar=null,selector=null,ready=false;
let selectorReady=false;
let avatarCommitted=false;
let selectedRideMode=normalizeRideMode(userPreferences.rideMode||RIDE_MODE.SKI);
let initialSelectionFlow=false;
const initialRideProfile=getRideProfile(selectedRideMode);
const state={mode:'menu',rideMode:selectedRideMode,runSeed:createRunSeed(),cleanLandings:0,successfulTricks:0,failedTricksCount:0,oilContacts:0,lastMistakeTime:-Infinity,steeringCorrectionIntensity:0,lastSteerSign:0,distance:0,travel:0,time:0,bananas:0,bananaPowerProgress:0,specialReady:false,specialActiveTime:0,speed:initialRideProfile.baseSpeed,maxRunSpeed:initialRideProfile.baseSpeed,bestCombo:0,baseSpeed:initialRideProfile.baseSpeed,speedTier:0,speedTierTime:0,targetSpeed:initialRideProfile.baseSpeed,maxSpeed:initialRideProfile.maxSpeed,maxSpeedReached:false,postMaxHazardTime:0,x:0,vx:0,edge:0,heading:0,turnRate:0,y:.12,vy:0,air:false,grounded:true,jumping:false,jumpSource:'',jumpVelocity:0,jumpBufferTime:0,jumpBuffered:false,jumpInputHeld:false,jumpHoldTime:0,jumpCutApplied:false,jumpProfile:'',lastJumpProfile:'',coyoteTime:0,landingPulse:0,best:0,frame:0,rampGrace:0,counterSteer:false,airControl:false,landingReengageTime:0,oilSlipTime:0,difficulty:0,courseSection:'OPEN CARVE',safeRouteX:0,grip:.72,carveLoad:0,landingGripLoss:0,landingQuality:'none',groundPitch:0,groundRoll:0,leftGround:0,rightGround:0,centerGround:0,crashType:'',crashVelocity:null,crashDirection:0,crashTime:0};

const audio=createSkiAudio();
const mountainWeather=createMountainWeather({app,scene,camera,renderer,environment,audio});
audio.setRideMode?.(selectedRideMode);
const haptics=createHaptics({enabled:userPreferences.haptics});
const ui=createGameUI({
  audio,
  haptics,
  onStart:()=>beginRun(),
  onPause:()=>pauseGame(),
  onResume:()=>resumeGame(),
  onRestart:()=>beginRun(),
  onChoose:()=>{
    if(!ready)return;
    state.mode='menu';
    gameplayInput?.resetTransient?.();
    ui.showMenu();
    selector?.open();
  },
  onGiveUp:()=>{
    gameplayInput?.resetTransient?.();
    touchControls?.reset?.();
    audio.update({mode:'menu'});
    window.location.assign(startScreen.gameSelectionUrl);
  }
});

const CAMERA_VIEW_ORDER=[CAMERA_VIEW.CHASE,CAMERA_VIEW.FIXED,CAMERA_VIEW.HIGH_FAR,CAMERA_VIEW.FIRST_PERSON];
const CAMERA_MOTION_ORDER=[CAMERA_MOTION.FULL,CAMERA_MOTION.FIXED,CAMERA_MOTION.REDUCED];
function setCameraView(mode,{persist=true,announce=false}={}){
  cameraViewMode=Object.values(CAMERA_VIEW).includes(mode)?mode:CAMERA_VIEW.CHASE;
  skiCamera.setViewMode(cameraViewMode);
  document.documentElement.dataset.cameraView=cameraViewMode;
  ui.setCameraViewMode?.(cameraViewMode);
  if(persist)saveCameraViewPreference(cameraViewMode);
  if(announce)ui.showCameraMode?.(cameraViewMode);
  return cameraViewMode;
}
function cycleCameraView(){
  const current=Math.max(0,CAMERA_VIEW_ORDER.indexOf(cameraViewMode));
  return setCameraView(CAMERA_VIEW_ORDER[(current+1)%CAMERA_VIEW_ORDER.length],{persist:true,announce:true});
}
function setCameraMotion(mode,{persist=true,announce=false}={}){
  cameraMotionMode=CAMERA_MOTION_ORDER.includes(mode)?mode:CAMERA_MOTION.FULL;
  applyCameraMotionPreference(cameraMotionMode);
  ui.setCameraMotionMode?.(cameraMotionMode);
  if(persist)saveCameraMotionPreference(cameraMotionMode);
  if(announce)ui.showCameraMotion?.(cameraMotionMode);
  return cameraMotionMode;
}
function cycleCameraMotion(){
  const current=Math.max(0,CAMERA_MOTION_ORDER.indexOf(cameraMotionMode));
  return setCameraMotion(CAMERA_MOTION_ORDER[(current+1)%CAMERA_MOTION_ORDER.length],{persist:true,announce:true});
}

function collectBananaPower(){
  if(state.specialReady)return false;
  state.bananaPowerProgress=Math.min(BANANA_POWER_GOAL,(Number(state.bananaPowerProgress)||0)+1);
  if(state.bananaPowerProgress>=BANANA_POWER_GOAL){
    state.bananaPowerProgress=BANANA_POWER_GOAL;
    state.specialReady=true;
    return true;
  }
  return false;
}
function activateBananaPower(){
  if(state.mode!=='playing'||!state.specialReady)return false;
  state.specialReady=false;
  state.bananaPowerProgress=0;
  state.specialActiveTime=BANANA_POWER_DURATION;
  specialAura.visible=true;
  document.body.classList.add('banana-power-active','bullet-time-active');
  audio.play('go',.72,.82);
  haptics.rampTakeoff?.(1);
  ui.showBananaPowerActivated?.();
  return true;
}
function stepBananaPower(realDt){
  if(state.specialActiveTime>0){
    state.specialActiveTime=Math.max(0,state.specialActiveTime-realDt);
    if(state.specialActiveTime===0){
      specialAura.visible=false;
      document.body.classList.remove('banana-power-active','bullet-time-active');
    }
  }
}
function updateBananaPowerVisual(time=0){
  const active=state.specialActiveTime>0;
  specialAura.visible=active;
  if(!active)return;
  specialAura.rotation.y=time*2.4;
  specialAuraRingLow.rotation.z=time*1.8;
  specialAuraRingHigh.rotation.z=-time*2.2;
  const pulse=1+Math.sin(time*8)*.08;
  specialAuraRingLow.scale.setScalar(pulse);
  specialAuraRingHigh.scale.setScalar(1+(1-pulse)*.6);
}

// Integration bridge: one authoritative quality profile drives every scalable subsystem.
ui.configureQuality?.({
  mode:quality.current,
  options:QUALITY_PROFILE_NAMES,
  onChange:profile=>{
    quality.setProfile(profile);
    saveQualityPreference(profile);
  }
});
ui.configureSettings?.({
  cameraView:cameraViewMode,
  onCameraViewChange:mode=>{
    setCameraView(mode,{persist:true,announce:false});
  },
  cameraMotion:cameraMotionMode,
  onCameraMotionChange:mode=>{
    setCameraMotion(mode,{persist:true,announce:false});
  },
  onHapticsChange:enabled=>{
    haptics.setEnabled?.(enabled);
    saveHapticsPreference(enabled);
  }
});
function applyRuntimeQuality(settings=quality.getSettings()){
  environment.applyQuality?.(settings);
}
quality.subscribe(applyRuntimeQuality,{immediate:true});

const feedback=createGameFeedback({audio,ui});
const scorePresentation=createScorePresentation({hud:document.querySelector('.hud')});

const SESSION_TUTORIAL_KEY='chimpions-ski-tutorial-seen-v2';
let sessionTutorialVisible=false;
let sessionTutorialResolve=null;
let tutorialPreviousButtons=[];
let tutorialAwaitNeutral=true;

const sessionTutorialRoot=document.createElement('section');
sessionTutorialRoot.className='session-tutorial';
sessionTutorialRoot.hidden=true;
sessionTutorialRoot.setAttribute('role','dialog');
sessionTutorialRoot.setAttribute('aria-modal','true');
sessionTutorialRoot.setAttribute('aria-label','Chimpions Ski how to play tutorial');
sessionTutorialRoot.innerHTML=`
  <div class="session-tutorial-stage">
    <div class="session-tutorial-bg" aria-hidden="true"></div>
    <header class="session-tutorial-title">
      <strong>CHIMPIONS <span>SKI</span></strong>
      <em>HOW TO PLAY</em>
    </header>
    <div class="session-tutorial-grid">
      <section><h3><b>1</b> MOVEMENT</h3><div class="tutorial-controls"><kbd>A</kbd><kbd>D</kbd><span>or</span><i>LEFT STICK / D-PAD</i></div><p>Carve left and right to avoid obstacles.</p></section>
      <section><h3><b>2</b> JUMP + TRICKS</h3><div class="tutorial-controls"><kbd>SPACE</kbd><span>or</span><i class="pad-a">A</i></div><p>Jump ramps and clear hazards.</p><strong class="tutorial-highlight">↑ + JUMP · 360° SPIN &nbsp; ↓ + JUMP · BACKFLIP</strong></section>
      <section><h3><b>3</b> 🍌 BANANA POWER</h3><p>Collect 10 bananas to charge 1 Special.</p><div class="tutorial-controls"><kbd>Q</kbd><span>or</span><i class="pad-x">X</i><strong>= BULLET TIME</strong></div><p>Bullet Time lasts 3 seconds.</p></section>
      <section><h3><b>4</b> CAMERA</h3><div class="tutorial-controls"><kbd>E</kbd><span>or</span><i class="pad-y">Y</i><strong>CHANGE VIEW</strong></div><p>Chase · Fixed · High + Far · First Person</p><div class="tutorial-controls tutorial-motion-row"><kbd>R</kbd><span>or</span><i class="pad-b">B</i><strong>CAMERA MOTION</strong></div><p>Full · Fixed · Reduced</p></section>
      <section><h3><b>5</b> GOAL</h3><p>🏔️ Ski as far as possible.</p><p>🌲 Avoid trees, rocks, logs and oil.</p><p>🍌 Grab bananas and survive the increasing speed.</p></section>
      <section><h3><b>6</b> PAUSE</h3><div class="tutorial-controls"><kbd>ESC</kbd><span>or</span><i>START</i></div><p>Pause or resume the run.</p></section>
    </div>
    <footer class="session-tutorial-start">PRESS ANY KEY OR BUTTON TO START</footer>
  </div>
`;
document.body.append(sessionTutorialRoot);

function hasSeenSessionTutorial(){
  try{return sessionStorage.getItem(SESSION_TUTORIAL_KEY)==='1';}catch{return false;}
}
function markSessionTutorialSeen(){
  try{sessionStorage.setItem(SESSION_TUTORIAL_KEY,'1');}catch{}
}
function dismissSessionTutorial(){
  if(!sessionTutorialVisible)return false;
  sessionTutorialVisible=false;
  sessionTutorialRoot.hidden=true;
  document.body.classList.remove('session-tutorial-active');
  markSessionTutorialSeen();
  gameplayInput?.resetTransient?.();
  touchControls?.reset?.();
  tutorialPreviousButtons=[];
  const resolve=sessionTutorialResolve;
  sessionTutorialResolve=null;
  resolve?.(true);
  return true;
}
function showSessionTutorialOnce(){
  if(hasSeenSessionTutorial())return Promise.resolve(false);
  sessionTutorialVisible=true;
  sessionTutorialRoot.hidden=false;
  document.body.classList.add('session-tutorial-active');
  tutorialPreviousButtons=[];
  tutorialAwaitNeutral=true;
  return new Promise(resolve=>{sessionTutorialResolve=resolve;});
}
function updateSessionTutorialController(pad={}){
  if(!sessionTutorialVisible)return false;
  const buttons=Array.from(pad.buttons||[],Boolean);
  if(tutorialAwaitNeutral){
    tutorialPreviousButtons=buttons.slice();
    if(!buttons.some(Boolean))tutorialAwaitNeutral=false;
    return true;
  }
  const pressed=buttons.some((value,index)=>value&&!tutorialPreviousButtons[index]);
  tutorialPreviousButtons=buttons.slice();
  if(pressed)dismissSessionTutorial();
  return true;
}
addEventListener('keydown',event=>{
  if(!sessionTutorialVisible||event.repeat)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  dismissSessionTutorial();
},{capture:true});
addEventListener('pointerdown',event=>{
  if(!sessionTutorialVisible)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  dismissSessionTutorial();
},{capture:true});

const startScreen=createStartScreen({
  audio,
  onStart:()=>{
    if(!ready||!selector)return false;
    initialSelectionFlow=true;
    state.mode='menu';
    ui.showMenu();
    selector.open();
    // Keep spectator GLB work idle while the player is choosing a rider.
    // The selected rider is interaction-critical and should not compete with crowd parsing.
    return true;
  },
  assetUrl:'/start/chimpions-ski-start.jpg'
});
startScreen.setReady(false);
ui.setAvatarLoading(true);

function syncRideModePresentation(){
  const profile=getRideProfile(selectedRideMode);
  const label=document.getElementById('selected-ride-mode');
  if(label)label.textContent=profile.label+' · '+speedToKmh(profile.baseSpeed)+'–'+speedToKmh(profile.maxSpeed)+' KM/H';
  document.body.dataset.rideMode=selectedRideMode;
}

function applyRideProfileToState(mode,{resetSpeed=false}={}){
  const normalized=normalizeRideMode(mode);
  const profile=getRideProfile(normalized);
  state.rideMode=normalized;
  state.baseSpeed=profile.baseSpeed;
  state.maxSpeed=profile.maxSpeed;
  state.targetSpeed=Math.min(profile.maxSpeed,Math.max(profile.baseSpeed,state.targetSpeed||profile.baseSpeed));
  if(resetSpeed)state.speed=profile.baseSpeed;
  return profile;
}

function audioTrickType(type){
  return type==='BACKFLIP'?'backflip':type==='360'?'360':null;
}

function announceTrickAudio(event){
  const type=audioTrickType(event?.type);
  if(!type||!event)return;
  audio.playTrickStart?.(type,event.id);
  haptics.trickStart(type);
}

function resolveTrickAudio(event){
  const type=audioTrickType(event?.type);
  if(!type||!event)return;
  if(event.success){
    audio.playTrickSuccess?.(type,Math.max(1,Number(state.combo)||1),event.id);
    haptics.trickSuccess(type);
  }else{
    audio.playTrickFail?.(type,event.id);
    haptics.trickFail(type);
  }
}

let avatarRequest=0;
async function setAvatar(entry,rideMode=selectedRideMode){
  if(!entry)return;
  const nextRideMode=normalizeRideMode(rideMode);

  if(avatarCommitted&&selectedAvatar?.id===entry.id&&skier){
    selectedRideMode=nextRideMode;
    saveRideModePreference(selectedRideMode);
    if(!entry.localOnly)saveAvatarPreference(entry.name);
    audio.setRideMode?.(selectedRideMode);
    skier.userData.setRideMode?.(selectedRideMode);
    applyRideProfileToState(selectedRideMode,{resetSpeed:state.mode==='menu'});
    syncRideModePresentation();
    selector?.setSelected(entry,selectedRideMode);
    return;
  }

  const request=++avatarRequest;
  ready=false;
  startScreen.setReady(false);
  ui.setAvatarLoading(true);
  try{
    const sourceUrl=entry.localOnly?entry.localObjectUrl:'/'+entry.url;
    const avatarLoadStarted=performance.now();
    const nextSkier=await loadRiderAsset(sourceUrl,{rideMode:nextRideMode,requireGameplayRig:!!entry.localOnly,compatibilityInput:entry.name});
    performanceTelemetry.recordAvatarLoad(performance.now()-avatarLoadStarted);
    if(request!==avatarRequest){disposeAvatarObject(nextSkier);return;}
    const previousSkier=skier;
    skier=nextSkier;mountainWeather.setRider(skier);
    trickVisualPivot.add(skier);
    if(previousSkier){
      trickVisualPivot.remove(previousSkier);
      disposeAvatarObject(previousSkier);
    }
    selectedAvatar=entry;
    avatarCommitted=true;
    selectedRideMode=nextRideMode;
    saveRideModePreference(selectedRideMode);
    if(!entry.localOnly)saveAvatarPreference(entry.name);
    audio.setRideMode?.(selectedRideMode);
    skier.userData.setRideMode?.(selectedRideMode);
    applyRideProfileToState(selectedRideMode,{resetSpeed:state.mode==='menu'});
    ui.setAvatar(entry);
    syncRideModePresentation();
    selector?.setSelected(entry,selectedRideMode);
  }finally{
    if(request===avatarRequest){
      ready=!!skier&&selectorReady;
      startScreen.setReady(ready);
      ui.setAvatarLoading(!skier);
    }
  }
}
async function validateLocalAvatarEntry(entry){
  const candidate=await loadRiderAsset(entry.localObjectUrl,{
    rideMode:selectedRideMode,
    requireGameplayRig:true,
    compatibilityInput:entry.name
  });
  disposeAvatarObject(candidate);
  return true;
}

function installAvatarSelector(initialAvatar){
  selector=createAvatarSelector({
    catalog,
    onValidateLocalAvatar:validateLocalAvatarEntry,
    onSelect:async(entry,rideMode)=>{
      await setAvatar(entry,rideMode);
      // Choosing SKI or SNOWBOARD is the final selection step: launch immediately.
      initialSelectionFlow=false;
      setTimeout(()=>beginRun(),0);
    },
    selectedId:initialAvatar.id,
    selectedRideMode
  });
  selector.dialog.addEventListener('close',()=>{
    if(initialSelectionFlow)initialSelectionFlow=false;
  });
  selector.setSelected(initialAvatar,selectedRideMode);
  selectorReady=true;
  ready=!!skier;
  startScreen.setReady(ready);
  ui.setAvatarLoading(!ready);
}

(async()=>{
  try{
    catalog=await loadAvatarCatalog();
  }catch(error){
    console.warn(error);
    catalog=BUILTIN_AVATAR_NAMES.map(name=>createBuiltinAvatarEntry(name));
  }

  const savedAvatarName=BUILTIN_AVATAR_NAMES.includes(userPreferences.avatarName)?userPreferences.avatarName:DEFAULT_AVATAR_NAME;
  const initialAvatar=catalog.find(entry=>entry?.name===savedAvatarName)||catalog.find(entry=>entry?.name===DEFAULT_AVATAR_NAME)||catalog[0]||createBuiltinAvatarEntry(DEFAULT_AVATAR_NAME);
  skier=createFallbackSkier({rideMode:selectedRideMode});mountainWeather.setRider(skier);
  trickVisualPivot.add(skier);
  selectedAvatar=initialAvatar;
  avatarCommitted=false;
  ui.setAvatar(initialAvatar);
  syncRideModePresentation();
  installAvatarSelector(initialAvatar);
})();

resetAirborneScoring(state);
resetTrickScoring(state);
try{state.best=Number(localStorage.getItem('chimpions-ski-best'))||0}catch{}
courseDirector=createCourseDirector({routeCenter});
resetCourse(0);
const gameplayInput=createGameplayInput();
const keys=gameplayInput.keys;
const touchControls=createTouchControls({
  onSteer:value=>gameplayInput.setTouchSteer(value),
  onJump:pressed=>gameplayInput.setTouchJump(pressed),
  onTrick:(type,pressed)=>gameplayInput.setTouchTrick(type,pressed),
  onPause:()=>gameplayInput.requestPause()
});
let last=performance.now();
let physicsSubsteps=0;
let runPreparing=false;

function resetRunState(mode='countdown'){
  if(state.rideMode!==selectedRideMode)applyRideProfileToState(selectedRideMode);
  const rideProfile=getRideProfile(state.rideMode);
  Object.assign(state,{mode,runSeed:createRunSeed(),cleanLandings:0,successfulTricks:0,failedTricksCount:0,oilContacts:0,lastMistakeTime:-Infinity,steeringCorrectionIntensity:0,lastSteerSign:0,distance:0,travel:0,time:0,bananas:0,bananaPowerProgress:0,specialReady:false,specialActiveTime:0,speed:rideProfile.baseSpeed,maxRunSpeed:rideProfile.baseSpeed,bestCombo:0,baseSpeed:rideProfile.baseSpeed,speedTier:0,speedTierTime:0,targetSpeed:rideProfile.baseSpeed,maxSpeed:rideProfile.maxSpeed,maxSpeedReached:false,postMaxHazardTime:0,x:0,vx:0,edge:0,heading:0,turnRate:0,y:.12,vy:0,air:false,grounded:true,jumping:false,jumpSource:'',jumpVelocity:0,jumpBufferTime:0,jumpBuffered:false,jumpInputHeld:false,jumpHoldTime:0,jumpCutApplied:false,jumpProfile:'',lastJumpProfile:'',coyoteTime:0,landingPulse:0,frame:0,rampGrace:0,counterSteer:false,airControl:false,landingReengageTime:0,oilSlipTime:0,difficulty:0,courseSection:'OPEN CARVE',safeRouteX:0,grip:.72,carveLoad:0,landingGripLoss:0,landingQuality:'none',groundPitch:0,groundRoll:0,leftGround:0,rightGround:0,centerGround:0,crashType:'',crashVelocity:null,crashDirection:0,crashTime:0});
  skier?.userData?.setRideMode?.(state.rideMode);
  audio.setRideMode?.(state.rideMode);
  resetAirborneScoring(state);
  resetTrickScoring(state);
  tricks.reset();
  audio.resetRun?.();
  player.position.set(0,.12,2.2);resetPlayerOrientation(player);
  specialAura.visible=false;
  document.body.classList.remove('banana-power-active','bullet-time-active');
  startCountdownStarted=false;
  startCrowd.reset();startGate.reset();
  trailTimer=0;skiTrails.reset();
  keys.clear();
  tiles.forEach((tile,index)=>{
    tile.position.z=8-index*28;
    displaceTerrainChunk(tile.geometry,tile.position.z);
  });
  environment.reset();
  Object.assign(state,sampleSkiGround(terrainHeight,0,player.position.z,0,skier?.userData?.skiTrackSpacing));
  state.y=.12+state.centerGround;player.position.y=state.y;
  courseFrame=0;resetCourse(0);skiCamera.reset();startCamera.reset();feedback.reset();
  scorePresentation.reset({
    score:state.score??0,
    combo:state.combo??0,
    lastClearPoints:state.lastClearPoints??0,
    clearEvent:state.clearEvent??null,
    trickEvent:state.trickEvent??null
  });
  gameplayInput.resetTransient();
  touchControls.reset();
}
function startRaceCountdown(){
  if(startCountdownStarted||state.mode!=='countdown')return false;
  startCountdownStarted=true;
  startCamera.finish(state);
  ui.startCountdown({
    entry:selectedAvatar,
    durationMs:START_COUNTDOWN_DURATION_MS,
    onGo:()=>{
      if(state.mode!=='countdown')return;
      state.mode='playing';
      gameplayInput.resetTransient();
      touchControls.reset();
      ui.setMode('playing');
      last=performance.now();
    }
  });
  return true;
}
async function beginRun(){
  if(!ready||selector?.dialog?.open||document.hidden||runPreparing)return false;
  if(!avatarCommitted){
    selector?.open();
    return false;
  }
  runPreparing=true;
  try{
    if(!ready||selector?.dialog?.open||document.hidden)return false;
    await showSessionTutorialOnce();
    if(!ready||selector?.dialog?.open||document.hidden)return false;
    ui.showRunLoading?.();
    audio.unlock();
    audio.play('menu',.38);
    resetRunState('countdown');
    ui.prepareRun({best:state.best,speed:state.speed});
    startCamera.begin(state,performance.now());
    return true;
  }finally{
    ui.hideRunLoading?.();
    runPreparing=false;
  }
}
function pauseGame(){
  if(state.mode!=='playing')return;
  state.mode='paused';
  gameplayInput.resetTransient();
  touchControls.reset();
  ui.showPause();
  audio.play('menu',.24);
}
function resumeGame(){
  if(state.mode!=='paused')return;
  state.mode='playing';
  ui.hidePause();
  audio.play('menu',.22);
  last=performance.now();
}
function crash(kind='tree',item=null){
  if(state.mode!=='playing')return;
  clearActiveRamp();
  const interruptedTrick=kind==='trick'?null:tricks.abort({reason:'collision'});
  if(interruptedTrick){
    state.failedTricksCount=(state.failedTricksCount||0)+1;
    state.lastMistakeTime=state.time;
    resolveTrickAudio(scoreTrickFailure(state,interruptedTrick));
  }
  tricks.reset();
  const runDistance=Math.floor(state.distance);
  const previousBest=state.best;
  const newBest=runDistance>previousBest;
  const isTrickCrash=kind==='trick';
  if(isTrickCrash)state.failedTricksCount=(state.failedTricksCount||0)+1;
  state.lastMistakeTime=state.time;
  state.trickCrash=isTrickCrash;
  state.failedTrick=isTrickCrash||!!state.failedTrick;
  state.crashType=isTrickCrash?'trick_wipeout':kind==='wideLog'?'log':(['tree','rock','log'].includes(kind)?kind:'tree');
  state.crashVelocity={x:state.vx,y:state.vy,z:state.speed};
  state.crashDirection=Math.sign(state.x-(item?.position.x??state.x))||Math.sign(state.vx)||1;
  state.crashTime=0;
  state.specialActiveTime=0;
  specialAura.visible=false;
  document.body.classList.remove('banana-power-active','bullet-time-active');
  breakSkillCombo(state);
  state.mode='crashed';
  state.best=Math.max(state.best,runDistance);
  ui.setMode('crashed');
  const crashFeedback=feedback.onCrash({kind:state.crashType,velocity:state.crashVelocity});
  if(!isTrickCrash)haptics.crash(state.crashType,crashFeedback?.hapticStrength);
  try{localStorage.setItem('chimpions-ski-best',state.best)}catch{}
  ui.showResults({distance:runDistance,score:state.score,bananas:state.bananas,best:state.best,newBest,crashType:state.crashType,time:state.time,maxSpeedKmh:speedToKmh(state.maxRunSpeed||state.speed),bestCombo:state.bestCombo||0,rideMode:state.rideMode,runSeed:state.runSeed},650);
}
function suspendInput(){
  gameplayInput.resetTransient();
  touchControls.reset();
  if(state.mode==='playing')pauseGame();
  else if(state.mode==='countdown'){
    state.mode='menu';startCountdownStarted=false;startCamera.reset();ui.showMenu();
  }
  audio.update({mode:state.mode});
}
addEventListener('blur',suspendInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspendInput();});

function update(dt,frameMs=dt*1000){
  physicsSubsteps=0;
  const pad=readPad(navigator.getGamepads?.()||[]);
  const actions=gameplayInput.read(pad);
  haptics.setActiveGamepad?.(pad.activeGamepad);
  if(startScreen.isActive){
    startScreen.updateController(pad);
    return;
  }
  if(sessionTutorialVisible){
    updateSessionTutorialController(pad);
    return;
  }
  performanceTelemetry.beginFrame(frameMs);
  const wasPlaying=state.mode==='playing'&&!selector?.dialog?.open;
  ui.updateController(pad,selector);
  if(actions.pausePressed&&state.mode==='playing')pauseGame();
  if(actions.cameraPressed&&state.mode==='playing')cycleCameraView();
  if(actions.cameraMotionPressed&&state.mode==='playing')cycleCameraMotion();
  if(actions.specialPressed&&state.mode==='playing')activateBananaPower();
  const steer=actions.steer;
  const jumpPressed=wasPlaying&&state.mode==='playing'&&actions.jumpPressed;
  const jumpHeld=actions.jumpHeld;
  const trickIntent=jumpPressed?actions.trickIntent:null;
  let worldDistance=0;
  let simulationFrameDt=dt;
  if(state.mode==='playing'){
    stepBananaPower(dt);
    const bulletTimeActive=state.specialActiveTime>0;
    simulationFrameDt=dt*(bulletTimeActive?BANANA_BULLET_TIME_SCALE:1);
    // 150–300 km/h ride profiles use tight collision sampling so fast hazards cannot be skipped.
    const physicsStarted=performance.now();
    const steps=Math.max(1,Math.ceil(simulationFrameDt/SKI_TUNING.PHYSICS_SUBSTEP_SECONDS));
    const stepDt=simulationFrameDt/steps;
    for(let step=0;step<steps&&state.mode==='playing';step++){
    physicsSubsteps++;
    const dt=stepDt;
    const controlDt=bulletTimeActive?dt/BANANA_BULLET_TIME_SCALE:dt;
    state.time+=dt;
    updateAirborneScoring(state);
    state.frame++;
    courseFrame=state.frame;
    progressSpeed(state,dt);
    state.maxRunSpeed=Math.max(state.maxRunSpeed||0,state.speed);
    if(!state.maxSpeedReached&&state.speed>=state.maxSpeed-.12)state.maxSpeedReached=true;
    if(state.maxSpeedReached)state.postMaxHazardTime+=dt;
    const travelStep=state.speed*dt;
    state.distance+=travelStep*.74;
    state.travel+=travelStep;
    courseTravel=state.travel;
    worldDistance+=travelStep;
    skiTrails.update(dt,travelStep/dt);
    state.difficulty=getCourseDifficulty(state.distance,state.speed);

    state.rampGrace=Math.max(0,state.rampGrace-dt);

    state.steeringCorrectionIntensity=Math.max(
      0,
      (state.steeringCorrectionIntensity||0)-controlDt*.14
    );
    const steerSign=Math.abs(steer)>.20?Math.sign(steer):0;
    if(steerSign&&state.lastSteerSign&&steerSign!==state.lastSteerSign){
      state.steeringCorrectionIntensity=Math.min(
        1,
        (state.steeringCorrectionIntensity||0)+.22
      );
    }
    if(steerSign)state.lastSteerSign=steerSign;

    stepCarving(state,steer,controlDt);
    const contactTarget=sampleSkiGround(terrainHeight,state.x,player.position.z-state.travel,state.heading,skier?.userData?.skiTrackSpacing);
    dampTerrainContact(contactTarget,state,dt);
    const groundY=.12+state.centerGround;

    const pressedThisStep=step===0&&jumpPressed;
    updateJumpAssist(state,pressedThisStep,dt,jumpHeld);
    if(activeRamp?.visible&&Number.isFinite(activeRamp.userData.courseLocalZ)){
      activeRamp.position.z=activeRamp.userData.courseLocalZ+courseTravel;
      activeRamp.position.y=terrainHeight(activeRamp.position.x,activeRamp.userData.courseLocalZ)+(activeRamp.userData.yOffset||0);
    }
    const ridingRamp=!!(activeRamp&&activeRamp.visible&&activeRamp.userData.activated&&Math.abs(activeRamp.position.x-state.x)<=1.46&&Math.abs(activeRamp.position.z-player.position.z)<=1.78);
    if(!ridingRamp&&!activeRamp)tricks.clearRampArm();
    tricks.updateTiming(state,{landingHeight:groundY,gravity:SKI_TUNING.GRAVITY});

    if(pressedThisStep&&state.air){
      const airborneTrick=actions.airborneTrickIntent;
      if(tricks.requestAirborne(airborneTrick,state,{
        startTime:state.time,
        landingHeight:groundY,
        gravity:SKI_TUNING.GRAVITY
      })){
        announceTrickAudio(announceTrickStart(state,airborneTrick,state.jumpSource||'manual'));
      }
    }else if(pressedThisStep&&ridingRamp&&trickIntent){
      if(tricks.armRamp(trickIntent)){
        state.jumpBufferTime=0;
        state.jumpBuffered=false;
      }
    }

    if(!ridingRamp&&tryManualJump(state,groundY)){
      feedback.onManualTakeoff();
      ui.showTrickHint?.();
      if(trickIntent==='BACKFLIP'){
        // Ground backflips get a dedicated vertical launch. Keep the full arc
        // even if the player releases Jump quickly so the rotation happens in air.
        state.vy=Math.max(state.vy,SKI_TUNING.BACKFLIP_MANUAL_JUMP_VELOCITY);
        state.jumpVelocity=state.vy;
        state.jumpProfile='backflip';
        state.jumpCutApplied=true;
      }
      if(trickIntent&&tricks.start(trickIntent,{
        source:'manual',
        startTime:state.time,
        physicsState:state,
        landingHeight:groundY,
        gravity:SKI_TUNING.GRAVITY
      })){
        announceTrickAudio(announceTrickStart(state,trickIntent,'manual'));
      }
    }

    const landingSource=state.jumpSource;
    tricks.step(dt);
    const completedTrick=tricks.consumeCompletion();
    if(completedTrick){
      state.successfulTricks=(state.successfulTricks||0)+1;
      resolveTrickAudio(scoreTrickCompletion(state,completedTrick));
    }

    const landing=stepAir(state,dt,groundY);
    if(landing.landed){
      if(landing.quality==='clean'){
        state.cleanLandings=(state.cleanLandings||0)+1;
      }else{
        state.lastMistakeTime=state.time;
      }
      const trickLanding=tricks.land({jumpSource:landingSource});
      if(trickLanding.interrupted){
        resolveTrickAudio(scoreTrickFailure(state,trickLanding));
        crash('trick');
      }else if(state.mode==='playing'){
        const landingFeedback=feedback.onLanding(landing,{jumpSource:landingSource,verticalVelocity:landing.impact});
        haptics.land(landingFeedback?.hapticStrength??Math.min(1,(Number(landing.impact)||0)/18),landing.quality);
      }
    }

    player.position.x=state.x;player.position.y=state.y;
    updateRidingOrientation(player,state,controlDt);
    skier?.userData?.updateSkiPose?.({
      dt:controlDt,
      steer:state.edge,
      air:state.air,
      landing:state.landingPulse,
      speed:state.speed,
      rideMode:state.rideMode,
      time:state.time,
      verticalVelocity:state.vy,
      jumpSource:state.jumpSource,
      groundPitch:state.groundPitch,
      groundRoll:state.groundRoll,
      leftGround:state.leftGround,
      rightGround:state.rightGround,
      centerGround:state.centerGround
    });
    if(!state.air&&!ridingRamp){
      trailTimer-=dt;
      if(trailTimer<=0){
        skiTrails.emit({
          x:state.x,
          z:player.position.z,
          travel:state.travel,
          heading:state.heading,
          edge:state.edge,
          spacing:skier?.userData?.skiTrackSpacing??.245,
          skis:skier?.userData?.trailContacts??skier?.userData?.skis,
          rideMode:state.rideMode
        });
        const trailQualityScale=quality.active==='low'?1.65:quality.active==='medium'?1.28:1;
        trailTimer=Math.max(.018,.038-state.speed*.00028)*trailQualityScale;
      }
    }else{
      trailTimer=0;
      skiTrails.breakTrail();
    }

    const broadphaseStarted=performance.now();
    const collisionCandidates=collisionBroadphase.query(
      player.position.z-courseTravel,
      COLLISION_QUERY_HALF_Z,
      collisionQueryScratch
    );
    performanceTelemetry.record('collisionBroadphase',performance.now()-broadphaseStarted);
    performanceTelemetry.increment('collisionCandidates',collisionCandidates.length);

    for(let i=collisionCandidates.length-1;i>=0;i--){
      const item=collisionCandidates[i];
      if(state.mode!=='playing'||!item?.visible||item.userData.spawnFrame===courseFrame)continue;

      const localZ=Number.isFinite(item.userData.courseLocalZ)
        ?item.userData.courseLocalZ
        :item.position.z-courseTravel;
      const itemWorldZ=localZ+courseTravel;
      const previousItemZ=itemWorldZ-travelStep;
      item.position.z=itemWorldZ;
      const itemGround=terrainHeight(item.position.x,localZ);
      item.position.y=itemGround+(item.userData.yOffset||0);

      const dz=Math.abs(itemWorldZ-player.position.z);
      const dx=Math.abs(item.position.x-state.x);
      const radiusX=item.userData.radiusX??item.userData.radius??.6;
      const radiusZ=item.userData.radiusZ??.7;
      const requiredClearance=item.userData.clearance??.9;

      tryScoreAirborneClearance(state,item,{
        previousZ:previousItemZ,
        playerZ:player.position.z,
        itemGround,
        radiusX,
        requiredClearance
      });
      tryScoreNearMiss(state,item,{
        previousZ:previousItemZ,
        playerZ:player.position.z,
        radiusX,
        paddingX:SKI_TUNING.COURSE_COLLISION_PADDING_X
      });

      performanceTelemetry.increment('collisionChecks',1);
      if(dz>radiusZ+SKI_TUNING.COURSE_COLLISION_PADDING_Z||dx>radiusX+SKI_TUNING.COURSE_COLLISION_PADDING_X)continue;

      if(item.userData.kind==='banana'){
        if(state.y>item.position.y+.45||state.y+2.45<item.position.y-.35)continue;
        scoreRiskBanana(state,item);
        removeCourseItem(item);
        state.bananas++;
        const powerBecameReady=collectBananaPower();
        audio.play('banana',powerBecameReady ? .52 : 1,powerBecameReady ? 1.24 : 1);
        haptics.banana?.(powerBecameReady?1.45:1);
        if(powerBecameReady)ui.showBananaPowerActivated?.();
        continue;
      }

      if(item.userData.kind==='ramp'){
        const approachDepth=player.position.z-itemWorldZ;
        const previousApproachDepth=player.position.z-previousItemZ;
        const aligned=dx<=radiusX+SKI_TUNING.COURSE_COLLISION_PADDING_X;

        // Downhill travel is toward -Z. Engage on the uphill/low side (+Z end).
        // If the skier leaves the deck before the lip, cancel the engagement instead
        // of carrying stale ramp state into an off-ramp launch.
        if(item.userData.activated&&!aligned){
          item.userData.activated=false;
          if(activeRamp===item)activeRamp=null;
        }
        if(!activeRamp&&!item.userData.activated&&!item.userData.consumed&&!state.air&&state.rampGrace<=0&&aligned&&approachDepth<=1.72&&approachDepth>=.45){
          item.userData.activated=true;
          activeRamp=item;
        }

        // Crossing-based lip detection is robust at 300 km/h while preserving the
        // same -1.42 lip threshold used by the previous window test.
        const crossedLip=item.userData.activated&&aligned&&previousApproachDepth>-1.42&&approachDepth<=-1.42;
        if(item.userData.activated&&!state.air){
          state.y=Math.max(state.y,itemGround+.34+.11*Math.cos(.18)-approachDepth*Math.sin(.18));
          player.position.y=state.y;
        }
        if(crossedLip&&!state.air){
          item.userData.activated=false;
          item.userData.consumed=true;
          if(activeRamp===item)activeRamp=null;
          if(launchRamp(state,itemGround)){
            feedback.onRampTakeoff();
            haptics.rampTakeoff();
            const rampTrick=tricks.consumeRampArm();
            if(rampTrick&&tricks.start(rampTrick,{
              source:'ramp',
              startTime:state.time,
              physicsState:state,
              landingHeight:groundY,
              gravity:SKI_TUNING.GRAVITY
            })){
              announceTrickAudio(announceTrickStart(state,rampTrick,'ramp'));
            }
            skiTrails.breakTrail();
          }
        }
        continue;
      }

      const clearance=state.y-(.12+itemGround);
      if(state.air&&clearance>requiredClearance)continue;

      if(item.userData.kind==='oil'){
        if(!item.userData.triggered){
          item.userData.triggered=true;
          state.oilContacts=(state.oilContacts||0)+1;
          state.lastMistakeTime=state.time;
          breakSkillCombo(state);
          state.oilSlipTime=SKI_TUNING.OIL_SLIP_SECONDS;
          state.landingGripLoss=Math.max(state.landingGripLoss||0,.82);
          const slipDirection=Math.sign(state.x-item.position.x)||Math.sign(state.vx)||1;
          state.vx+=slipDirection*2.15;
          state.heading=THREE.MathUtils.clamp(
            state.heading+slipDirection*.055,
            -SKI_TUNING.HEADING_LIMIT_HIGH,
            SKI_TUNING.HEADING_LIMIT_HIGH
          );
          const rideProfile=getRideProfile(state.rideMode);
          state.speed=Math.max(rideProfile.baseSpeed*.92,state.speed*.94);
          audio.play('oil',.34);
          haptics.oil();
        }
        continue;
      }

      crash(item.userData.kind,item);
    }
    }
    performanceTelemetry.record('physics',performance.now()-physicsStarted);
    syncCourseVisuals();
    if(state.mode==='playing')fillCourse(state.difficulty);
  }else if(state.mode==='countdown'){
    skier?.userData?.updateSkiPose?.({
      dt,
      steer:0,
      air:false,
      landing:0,
      speed:state.speed,
      rideMode:state.rideMode,
      time:performance.now()/1000,
      groundPitch:state.groundPitch,
      groundRoll:state.groundRoll,
      leftGround:state.leftGround,
      rightGround:state.rightGround,
      centerGround:state.centerGround
    });
  }else if(state.mode==='crashed'){
    state.crashTime+=dt;
    updateCrashOrientation(player,state,dt);
  }
  for(const tile of tiles){
    tile.position.z+=worldDistance;
    if(tile.position.z>22){
      tile.position.z-=tiles.length*28;
      displaceTerrainChunk(tile.geometry,tile.position.z-state.travel);
    }
  }
  const batchSyncStarted=performance.now();
  courseRenderBatches.sync(course,worldDistance!==0);
  performanceTelemetry.record('courseBatchSync',performance.now()-batchSyncStarted);
  startCrowd.update(dt,{mode:state.mode,worldDistance,time:performance.now()/1000});
  startGate.update(worldDistance);
  const worldSpeed=worldDistance/dt;
  const environmentUpdateStarted=performance.now();
  environment.update(state.mode==='paused'?0:simulationFrameDt,worldSpeed,state.x,state.y,player.position.z,state.speed,state.edge,state.air,state.landingPulse,state.mode==='playing',.12+state.centerGround,state.time,state.rideMode);
  mountainWeather.update(state.mode==='paused'?0:simulationFrameDt,state);
  performanceTelemetry.record('environmentUpdate',performance.now()-environmentUpdateStarted);
  updateBananaPowerVisual(state.time);

  ui.updateHud({
    distance:state.distance,
    bananas:state.bananas,
    bananaPowerProgress:state.bananaPowerProgress,
    specialReady:state.specialReady,
    specialActiveTime:state.specialActiveTime,
    speed:state.speed,
    best:state.best,
    air:state.air,
    mode:state.mode
  });
  scorePresentation.update({
    score:state.score??0,
    combo:state.combo??0,
    lastClearPoints:state.lastClearPoints??0,
    clearEvent:state.clearEvent??null,
    trickEvent:state.trickEvent??null
  });
  audio.playClear?.(state.clearEvent??null);
  const audioTimeScale=state.specialActiveTime>0?BANANA_BULLET_TIME_SCALE:1;
  audio.update({
    mode:state.mode,
    speed:state.speed*audioTimeScale,
    baseSpeed:state.baseSpeed,
    maxSpeed:state.maxSpeed,
    carve:state.edge,
    edge:state.edge,
    carveLoad:state.carveLoad,
    lateralVelocity:state.vx,
    grounded:state.grounded,
    groundRoll:state.groundRoll,
    groundPitch:state.groundPitch,
    landingGripLoss:state.landingGripLoss,
    air:state.air,
    intensity:state.difficulty,
    jumpSource:state.jumpSource,
    time:state.time
  });
  haptics.update?.(dt,{
    mode:state.mode,
    speed:state.speed,
    baseSpeed:state.baseSpeed,
    maxSpeed:state.maxSpeed,
    edge:state.edge,
    air:state.air,
    oilSlipTime:state.oilSlipTime,
    groundRoll:state.groundRoll,
    groundPitch:state.groundPitch,
    time:state.time
  });
  feedback.update(state,dt);
  performanceTelemetry.endFrame();
}

function render(now){
  const frameMs=Math.max(0,now-last)||16;
  const dt=Math.min(.05,frameMs/1000||.016);last=now;
  quality.observeFrame(frameMs,now);
  update(dt,frameMs);
  if(startScreen.isActive){
    // Hold the 3D presentation completely still behind the artwork/fade.
  }else if(state.mode==='countdown'){
    if(startCamera.active){
      const cameraMoving=startCamera.update(state,now);
      if(!cameraMoving)startRaceCountdown();
    }else if(!startCountdownStarted)startRaceCountdown();
  }else if(state.mode!=='paused')skiCamera.update(state,dt);
  renderer.render(scene,camera);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

function resize(){
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,quality.getSettings().dprCap));
}
addEventListener('resize',resize);

window.chimpionsSki=()=>{
  const courseWorldEndZ=courseEndZ+courseTravel;
  const batch=courseRenderBatches.getDiagnostics();
  const broadphase=collisionBroadphase.getDiagnostics();
  let standaloneCourseObjects=0;
  let standaloneCourseDrawCalls=0;
  let activeHazardCount=0;
  let visibleHazardCount=0;
  for(const item of course){
    if(item.visible&&item.userData.kind!=='banana'){
      activeHazardCount++;
      if(item.position.z>=batch.renderMinZ&&item.position.z<=batch.renderMaxZ)visibleHazardCount++;
    }
    if(item.userData.batchedCourseRender)continue;
    standaloneCourseObjects++;
    if(item.visible&&item.position.z>=batch.renderMinZ&&item.position.z<=batch.renderMaxZ){
      standaloneCourseDrawCalls+=item.userData.courseDrawCalls||0;
    }
  }
  const pooledObjects=Object.values(coursePool).reduce((sum,pool)=>sum+pool.length,0);
  return {
    ...state,
    ...performanceTelemetry.getFlatSnapshot(),
    ...environment.getQualityDiagnostics?.(),
    ...quality.getDiagnostics(),
    ...broadphase,
    cameraViewMode,
    cameraMotionMode,
    cameraReducedMotion:document.documentElement.dataset.cameraMotion==='reduced',
    hapticsEnabled:haptics.isEnabled?.()!==false,
    inputState:gameplayInput.getDiagnostics(),
    touchControlsPresent:!!touchControls.root,
    qualityProfile:quality.active,
    qualityMode:quality.current,
    qualitySettings:quality.getSettings(),
    activeHazardCount,
    visibleHazardCount,
    rendererPixelRatio:renderer.getPixelRatio(),
    physicsSubsteps,
    activeRamp:!!activeRamp,
    activeRampState:activeRamp?(activeRamp.userData.consumed?'consumed':'engaged'):'none',
    activeCourseObjects:course.length,
    pooledObjects,
    standaloneCourseObjects,
    batchedCourseObjects:batch.activeLogical,
    batchedCourseInstances:batch.renderedInstances,
    courseBatchDrawCalls:batch.batchDrawCalls,
    courseDrawCallsEstimate:batch.batchDrawCalls+standaloneCourseDrawCalls,
    courseLegacyDrawCallsEstimate:batch.legacyDrawCalls+standaloneCourseDrawCalls,
    courseBatchOverflow:batch.overflow,
    courseBatchCapacity:batch.capacity,
    courseBatchComponentCounts,
    startCrowdCount:startCrowd.count,
    startCrowdLoadedCount:startCrowd.loadedCount,
    startCrowdPosedCount:startCrowd.posedCount,
    startCrowdModelSources:startCrowd.modelSourceCount,
    startCrowdPlaceholderCount:startCrowd.placeholderCount,
    startCrowdFailedCount:startCrowd.failedCount,
    startCrowdStartReady:startCrowd.startReady,
    startCrowdFullReady:startCrowd.fullReady,
    startCrowdProgressivePaused:startCrowd.progressivePaused,
    startCrowdCacheStats:startCrowd.cacheStats,
    startCrowdQuality:startCrowd.quality,
    startCrowdVisible:startCrowd.visible,
    startCrowdReleased:startCrowd.released,
    startCameraPhase:startCamera.phase,
    startCameraFrontHoldMs:START_CAMERA_FRONT_HOLD_MS,
    startCameraRotateMs:START_CAMERA_ROTATE_MS,
    startCountdownDurationMs:START_COUNTDOWN_DURATION_MS,
    startCountdownStarted,
    startGateVisible:startGate.visible,
    courseAhead:Math.max(0,player.position.z-courseWorldEndZ),
    courseLookaheadTarget:getCourseLookahead(state.speed),
    courseRunSeed:courseDirector.runSeed,
    courseMastery:courseDirector.mastery,
    courseEndZ,
    courseWorldEndZ,
    vx:state.vx,
    heading:state.heading,
    turnRate:state.turnRate,
    carveLoad:state.carveLoad,
    landingQuality:state.landingQuality,
    rampGrace:state.rampGrace,
    trickState:tricks.state.state,
    trickType:tricks.state.type||tricks.state.lastCompletedType||'',
    trickActive:tricks.state.state==='SPIN_360'||tricks.state.state==='BACKFLIP',
    trickRotation:tricks.state.rotation,
    trickProgress:tricks.state.progress,
    trickSystemProgress:tricks.state.progress,
    tricksThisAir:tricks.state.tricksThisAir,
    remainingAirTime:tricks.state.remainingAirTime,
    trickAllowed:tricks.state.trickAllowed,
    pendingTrick:tricks.state.pendingTrick,
    trickRejectionReason:tricks.state.rejectionReason,
    trickVisualPivot:trickVisualPivot.name,
    rendererCalls:renderer.info.render.calls,
    rendererTriangles:renderer.info.render.triangles,
    rendererGeometries:renderer.info.memory.geometries,
    rendererTextures:renderer.info.memory.textures,
    playableHalfWidth:SKI_TUNING.PLAYER_HALF_WIDTH,
    courseObjectHalfWidth:SKI_TUNING.COURSE_OBJECT_HALF_WIDTH,
    ready,
    selectorReady,
    catalogSize:catalog.length,
    selectedAvatar:selectedAvatar?.name||'',
    selectedAvatarLocal:!!selectedAvatar?.localOnly,
    rideMode:selectedRideMode,
    baseSpeed:getRideProfile(selectedRideMode).baseSpeed,
    maxSpeed:getRideProfile(selectedRideMode).maxSpeed,
    equipmentType:skier?.userData?.equipmentType||'unknown',
    poseMode:skier?.userData?.poseMode||'unknown',
    riderVisual:skier?.userData?.riderVisual?.name||'',
    skierFallback:!!skier?.userData?.fallback,
    rigReady:!!skier?.userData?.rigReady,
    localAvatarComplexity:skier?.userData?.localAvatarComplexity||null,
    modelForwardAxis:skier?.userData?.modelForwardAxis||'procedural',
    courseObjects:course.length,
    pooledCourseObjects:pooledObjects
  };
};

