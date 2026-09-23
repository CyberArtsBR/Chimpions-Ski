import * as THREE from 'three';
import './style.css';
import {loadRiderAsset} from './skier.js';
import {readPad} from './input.js';
import {createSkiAudio} from './audio.js';
import {createSkiEnvironment,decorateCourseObject} from './environment.js';
import {createBananaVisual} from './collectibleVisuals.js';
import {loadAvatarCatalog,randomAvatar,createAvatarSelector,disposeAvatarObject} from './avatar-system.js';
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
import {resetAirborneScoring,resetHazardScoring,updateAirborneScoring,tryScoreAirborneClearance} from './airborneScoring.js';
import {createStartScreen} from './startScreen.js';
import {createScorePresentation} from './scorePresentation.js';
import {createCourseRenderBatches} from './courseRenderBatches.js';
import {readAirborneTrickIntent,readTrickIntent} from './trickInput.js';
import {createTrickSystem} from './trickSystem.js';
import {announceTrickStart,resetTrickScoring,scoreTrickCompletion,scoreTrickFailure} from './trickScoring.js';
import {createHaptics} from './haptics.js';
import {RIDE_MODE,getRideProfile,normalizeRideMode,speedToKmh} from './rideMode.js';
import {resetPlayerOrientation,updateRidingOrientation,updateCrashOrientation} from './playerOrientation.js';

const app=document.querySelector('#app');
app.innerHTML=`
  <div class="hud" aria-label="Run statistics">
    <div class="stat" aria-label="Distance"><small>DISTANCE</small><strong id="distance">0 m</strong></div>
    <div class="stat is-banana" aria-label="Bananas"><small>BANANAS</small><strong id="bananas">0</strong></div>
    <div class="stat" aria-label="Speed"><small>SPEED</small><strong id="speed">0 km/h</strong></div>
  </div>
  <div class="overlay" id="overlay">
    <section class="card" aria-labelledby="game-title">
      <div class="badge">❄️ ALPINE ARCADE</div>
      <h1 class="logo" id="game-title">CHIMPIONS <span>SKI</span></h1>
      <p class="tagline">Carve the endless mountain, chase bananas, clear the jumps and keep your line as the descent gets faster.</p>
      <div class="selected-avatar" id="selected-avatar">
        <span class="selected-avatar-image" id="selected-avatar-image">🐵</span>
        <span><small>YOUR RIDER</small><strong id="selected-avatar-name">Loading Chimpions…</strong><em id="selected-ride-mode" class="selected-ride-mode">SKI · 160–300 KM/H</em></span>
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

const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.05;
app.prepend(renderer.domElement);

const world=new THREE.Group();scene.add(world);
const environment=createSkiEnvironment({scene,world,renderer,camera});
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
const wideLogSnowMat=new THREE.MeshStandardMaterial({
  color:0xf1f8fb,roughness:.94
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
  const snow=new THREE.Mesh(new THREE.BoxGeometry(tuning.snowLength,.08,.34),wideLogSnowMat);
  snow.position.set(0,.64,-.03);snow.rotation.z=.012;snow.castShadow=true;g.add(snow);
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
  renderMinZ:-315,
  renderMaxZ:28
});
const courseBatchComponentCounts=courseRenderBatches.getComponentCounts();

const course=[];
let courseDirector=null;
let courseFrame=0;
let activeRamp=null;
// Keep the authored section frontier, including empty recovery/landing space.
let courseEndZ=-12,courseTravel=0;

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
function addCoursePlacement(placement){
  const item=acquireCourseItem(placement.kind);
  item.position.x=placement.x;
  item.position.z=placement.z+courseTravel;
  item.position.y=terrainHeight(item.position.x,placement.z)+(item.userData.yOffset||0);
  item.userData.spawnFrame=courseFrame;
  item.userData.section=placement.section;
  item.userData.safeX=placement.safeX;
  item.userData.activated=false;
  item.userData.landingZone=!!placement.landingZone;
  item.userData.jumpTarget=!!placement.jumpTarget;
  course.push(item);
}
function fillCourse(difficulty=0){
  const lookahead=getCourseLookahead(state?.speed??SKI_TUNING.BASE_SPEED);
  const targetWorldZ=player.position.z-lookahead;
  let guard=0;
  while(courseEndZ+courseTravel>targetWorldZ&&guard++<24){
    const section=courseDirector.next({
      startZ:courseEndZ-5.5,
      difficulty,
      speed:state.speed,
      postMaxTime:state.postMaxHazardTime
    });
    for(const placement of section.placements)addCoursePlacement(placement);
    courseEndZ=section.endZ;
  }
}
function resetCourse(difficulty=0){
  clearActiveRamp();
  while(course.length)releaseCourseItem(course.pop());
  courseDirector.reset();
  courseEndZ=-12;courseTravel=0;
  fillCourse(difficulty);
}

// Continuous twin grooves use one bounded dynamic mesh instead of disconnected decals.
const skiTrails=createSkiTrails({world,terrainHeight,capacity:192});
let trailTimer=0;

const player=new THREE.Group();scene.add(player);
player.position.set(0,.12,2.2);
const trickVisualPivot=new THREE.Group();
trickVisualPivot.name='trick-visual-pivot';
player.add(trickVisualPivot);
const tricks=createTrickSystem({visualTarget:trickVisualPivot});
const startCamera=createStartCameraSequence({camera,skiCamera,player});
const smokeTestMode=new URLSearchParams(window.location.search).has('test');
const startCrowd=createStartCrowd({
  world,
  terrainHeight,
  // CI/browser smoke tests validate flow with a tiny crowd; production keeps
  // the full 50 unique Chimpion start line enforced by START_CROWD_COUNT.
  maxSpectators:smokeTestMode?4:undefined
});
const startGate=createStartGateScene({world,terrainHeight});
const START_COUNTDOWN_DURATION_MS=2700;
let startCountdownStarted=false;
let skier=null,catalog=[],selectedAvatar=null,selector=null,ready=false;
let selectorReady=false;
let selectedRideMode=RIDE_MODE.SKI;
let initialSelectionFlow=false;
const initialRideProfile=getRideProfile(selectedRideMode);
const state={mode:'menu',rideMode:selectedRideMode,distance:0,travel:0,time:0,bananas:0,speed:initialRideProfile.baseSpeed,baseSpeed:initialRideProfile.baseSpeed,speedTier:0,speedTierTime:0,targetSpeed:initialRideProfile.baseSpeed,maxSpeed:initialRideProfile.maxSpeed,maxSpeedReached:false,postMaxHazardTime:0,x:0,vx:0,edge:0,heading:0,turnRate:0,y:.12,vy:0,air:false,grounded:true,jumping:false,jumpSource:'',jumpVelocity:0,jumpBufferTime:0,jumpBuffered:false,jumpInputHeld:false,jumpHoldTime:0,jumpCutApplied:false,jumpProfile:'',lastJumpProfile:'',coyoteTime:0,landingPulse:0,best:0,frame:0,rampGrace:0,counterSteer:false,airControl:false,landingReengageTime:0,oilSlipTime:0,difficulty:0,courseSection:'OPEN CARVE',safeRouteX:0,grip:.72,carveLoad:0,landingGripLoss:0,landingQuality:'none',groundPitch:0,groundRoll:0,leftGround:0,rightGround:0,centerGround:0,crashType:'',crashVelocity:null,crashDirection:0,crashTime:0};

const audio=createSkiAudio();
audio.setRideMode?.(selectedRideMode);
const haptics=createHaptics();
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
    keys.clear();
    ui.showMenu();
    selector?.open();
  },
  onGiveUp:()=>{
    keys.clear();
    jumpKeyPressed=false;
    audio.update({mode:'menu'});
    window.location.assign(startScreen.gameSelectionUrl);
  }
});
const feedback=createGameFeedback({audio,ui});
const scorePresentation=createScorePresentation({hud:document.querySelector('.hud')});
const startScreen=createStartScreen({
  audio,
  onStart:()=>{
    if(!ready||!selector)return false;
    initialSelectionFlow=true;
    state.mode='menu';
    ui.showMenu();
    selector.open();
    // Keep spectator GLB work idle while the player is choosing a rider.
    // The selected rider is interaction-critical and must never compete with
    // crowd parsing on the main thread.
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

  if(selectedAvatar?.id===entry.id&&skier){
    selectedRideMode=nextRideMode;
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
    const nextSkier=await loadRiderAsset('/'+entry.url,{rideMode:nextRideMode});
    if(request!==avatarRequest){disposeAvatarObject(nextSkier);return;}
    const previousSkier=skier;
    skier=nextSkier;
    trickVisualPivot.add(skier);
    if(previousSkier){
      trickVisualPivot.remove(previousSkier);
      disposeAvatarObject(previousSkier);
    }
    selectedAvatar=entry;
    selectedRideMode=nextRideMode;
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
(async()=>{
  try{
    catalog=await loadAvatarCatalog();
    // START GAME always opens the selector, so do not gamble boot time on a
    // random heavyweight GLB that the player has not chosen. Use a known light
    // collection model only as the invisible boot/rig seed; the player's actual
    // choice replaces it before the run begins.
    const initialAvatar=
      catalog.find(entry=>entry?.name==='The Drownsy')||
      catalog.find(entry=>String(entry?.id)==='56')||
      catalog[0]||
      randomAvatar(catalog);
    await setAvatar(initialAvatar,RIDE_MODE.SKI);
    selector=createAvatarSelector({
      catalog,
      onSelect:async(entry,rideMode)=>{
        await setAvatar(entry,rideMode);
        // Rider selection has priority. Only after its GLB is ready do we give
        // the start crowd a chance to warm the critical subset before beginRun().
        startCrowd.setSpectators(catalog).catch(error=>console.warn('Could not preload start crowd:',error));
        if(initialSelectionFlow){
          initialSelectionFlow=false;
          setTimeout(()=>beginRun(),0);
        }
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
  }catch(error){
    console.warn(error);
    const previousSkier=skier;
    skier=await loadRiderAsset('/models/default.glb',{rideMode:selectedRideMode});
    trickVisualPivot.add(skier);
    if(previousSkier){
      trickVisualPivot.remove(previousSkier);
      disposeAvatarObject(previousSkier);
    }
    selectedAvatar={name:'Fallback skier',image:''};
    ui.setAvatar(selectedAvatar);
    syncRideModePresentation();
  }finally{
    ready=!!skier&&selectorReady;
    startScreen.setReady(ready);
    ui.setAvatarLoading(!ready);
  }
})();

resetAirborneScoring(state);
resetTrickScoring(state);
try{state.best=Number(localStorage.getItem('chimpions-ski-best'))||0}catch{}
courseDirector=createCourseDirector({routeCenter});
resetCourse(0);
const keys=new Set();
let jumpKeyPressed=false,lastPadJump=false;
let last=performance.now();
let physicsSubsteps=0;
let runPreparing=false;

function control(pad){
  const keyboard=Number(keys.has('ArrowRight')||keys.has('KeyD'))-Number(keys.has('ArrowLeft')||keys.has('KeyA'));
  return THREE.MathUtils.clamp(keyboard||pad.axis,-1,1);
}
function resetRunState(mode='countdown'){
  if(state.rideMode!==selectedRideMode)applyRideProfileToState(selectedRideMode);
  const rideProfile=getRideProfile(state.rideMode);
  Object.assign(state,{mode,distance:0,travel:0,time:0,bananas:0,speed:rideProfile.baseSpeed,baseSpeed:rideProfile.baseSpeed,speedTier:0,speedTierTime:0,targetSpeed:rideProfile.baseSpeed,maxSpeed:rideProfile.maxSpeed,maxSpeedReached:false,postMaxHazardTime:0,x:0,vx:0,edge:0,heading:0,turnRate:0,y:.12,vy:0,air:false,grounded:true,jumping:false,jumpSource:'',jumpVelocity:0,jumpBufferTime:0,jumpBuffered:false,jumpInputHeld:false,jumpHoldTime:0,jumpCutApplied:false,jumpProfile:'',lastJumpProfile:'',coyoteTime:0,landingPulse:0,frame:0,rampGrace:0,counterSteer:false,airControl:false,landingReengageTime:0,oilSlipTime:0,difficulty:0,courseSection:'OPEN CARVE',safeRouteX:0,grip:.72,carveLoad:0,landingGripLoss:0,landingQuality:'none',groundPitch:0,groundRoll:0,leftGround:0,rightGround:0,centerGround:0,crashType:'',crashVelocity:null,crashDirection:0,crashTime:0});
  skier?.userData?.setRideMode?.(state.rideMode);
  audio.setRideMode?.(state.rideMode);
  resetAirborneScoring(state);
  resetTrickScoring(state);
  tricks.reset();
  audio.resetRun?.();
  player.position.set(0,.12,2.2);resetPlayerOrientation(player);
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
  jumpKeyPressed=false;lastPadJump=false;
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
      keys.clear();jumpKeyPressed=false;
      ui.setMode('playing');
      last=performance.now();
    }
  });
  return true;
}
async function beginRun(){
  if(!ready||selector?.dialog?.open||document.hidden||runPreparing)return false;
  runPreparing=true;
  ui.showRunLoading?.();
  try{
    // The start crowd is fully disposed once the previous race is underway.
    // Rehydrate it only when a new run is explicitly requested.
    await startCrowd.ensureLoaded(catalog);
    if(!ready||selector?.dialog?.open||document.hidden)return false;
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
  keys.clear();jumpKeyPressed=false;
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
  if(interruptedTrick)resolveTrickAudio(scoreTrickFailure(state,interruptedTrick));
  tricks.reset();
  const runDistance=Math.floor(state.distance);
  const previousBest=state.best;
  const newBest=runDistance>previousBest;
  const isTrickCrash=kind==='trick';
  state.trickCrash=isTrickCrash;
  state.failedTrick=isTrickCrash||!!state.failedTrick;
  state.crashType=isTrickCrash?'trick_wipeout':kind==='wideLog'?'log':(['tree','rock','log'].includes(kind)?kind:'tree');
  state.crashVelocity={x:state.vx,y:state.vy,z:state.speed};
  state.crashDirection=Math.sign(state.x-(item?.position.x??state.x))||Math.sign(state.vx)||1;
  state.crashTime=0;
  state.mode='crashed';
  state.best=Math.max(state.best,runDistance);
  ui.setMode('crashed');
  feedback.onCrash();
  if(!isTrickCrash)haptics.crash(state.crashType);
  try{localStorage.setItem('chimpions-ski-best',state.best)}catch{}
  ui.showResults({distance:runDistance,bananas:state.bananas,best:state.best,newBest,crashType:state.crashType},650);
}
addEventListener('keydown',e=>{
  if(state.mode!=='playing'||selector?.dialog?.open||e.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
  keys.add(e.code);
  if(e.code==='Space'&&!e.repeat){
    if(state.mode==='playing')jumpKeyPressed=true;
    e.preventDefault();
  }
});
addEventListener('keyup',e=>keys.delete(e.code));
function suspendInput(){
  keys.clear();jumpKeyPressed=false;
  if(state.mode==='playing')pauseGame();
  else if(state.mode==='countdown'){
    state.mode='menu';startCountdownStarted=false;startCamera.reset();ui.showMenu();
  }
  audio.update({mode:state.mode});
}
addEventListener('blur',suspendInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspendInput();});

function update(dt){
  physicsSubsteps=0;
  const pad=readPad(navigator.getGamepads?.()||[]);
  if(startScreen.isActive){
    startScreen.updateController(pad);
    lastPadJump=!!pad.jump;
    return;
  }
  const wasPlaying=state.mode==='playing'&&!selector?.dialog?.open;
  ui.updateController(pad,selector);
  const steer=control(pad);
  const padJumpPressed=wasPlaying&&state.mode==='playing'&&!!pad.jump&&!lastPadJump;
  lastPadJump=!!pad.jump;
  const jumpPressed=jumpKeyPressed||padJumpPressed;
  const jumpHeld=keys.has('Space')||!!pad.jump;
  const trickIntent=jumpPressed?readTrickIntent(keys,pad):null;
  jumpKeyPressed=false;
  let worldDistance=0;
  if(state.mode==='playing'){
    // 160–300 km/h ride profiles use tight collision sampling so fast hazards cannot be skipped.
    const steps=Math.ceil(dt/(1/180));
    const stepDt=dt/steps;
    for(let step=0;step<steps&&state.mode==='playing';step++){
    physicsSubsteps++;
    const dt=stepDt;
    state.time+=dt;
    updateAirborneScoring(state);
    state.frame++;
    courseFrame=state.frame;
    progressSpeed(state,dt);
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

    stepCarving(state,steer,dt);
    const contactTarget=sampleSkiGround(terrainHeight,state.x,player.position.z-state.travel,state.heading,skier?.userData?.skiTrackSpacing);
    dampTerrainContact(contactTarget,state,dt);
    const groundY=.12+state.centerGround;

    const pressedThisStep=step===0&&jumpPressed;
    updateJumpAssist(state,pressedThisStep,dt,jumpHeld);
    const ridingRamp=!!(activeRamp&&activeRamp.visible&&activeRamp.userData.activated&&Math.abs(activeRamp.position.x-state.x)<=1.46&&Math.abs(activeRamp.position.z-player.position.z)<=1.78);
    if(!ridingRamp&&!activeRamp)tricks.clearRampArm();
    tricks.updateTiming(state,{landingHeight:groundY,gravity:SKI_TUNING.GRAVITY});

    if(pressedThisStep&&state.air){
      const airborneTrick=readAirborneTrickIntent(keys,pad);
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
      resolveTrickAudio(scoreTrickCompletion(state,completedTrick));
    }

    const landing=stepAir(state,dt,groundY);
    if(landing.landed){
      const trickLanding=tricks.land({jumpSource:landingSource});
      if(trickLanding.interrupted){
        resolveTrickAudio(scoreTrickFailure(state,trickLanding));
        crash('trick');
      }else{
        haptics.land(Math.min(1,(Number(landing.impact)||0)/18),landing.quality);
      }
      if(state.mode==='playing')feedback.onLanding(landing);
    }

    player.position.x=state.x;player.position.y=state.y;
    updateRidingOrientation(player,state,dt);
    skier?.userData?.updateSkiPose?.({
      dt,
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
          skis:skier?.userData?.trailContacts??skier?.userData?.skis
        });
        trailTimer=Math.max(.018,.038-state.speed*.00028);
      }
    }else{
      trailTimer=0;
      skiTrails.breakTrail();
    }

    let nearestSectionItem=null;
    for(let i=course.length-1;i>=0;i--){
      const item=course[i];
      const previousItemZ=item.position.z;
      item.position.z+=travelStep;
      const itemGround=terrainHeight(item.position.x,item.position.z-state.travel);
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
      if(state.mode!=='playing'||!item.visible||item.userData.spawnFrame===courseFrame)continue;

      const dz=Math.abs(item.position.z-player.position.z);
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

      if(dz>radiusZ+.20||dx>radiusX+.30)continue;

      if(item.userData.kind==='banana'){
        if(state.y>item.position.y+.45||state.y+2.45<item.position.y-.35)continue;
        removeCourseAt(i);
        state.bananas++;
        audio.play('banana');
        haptics.banana?.();
        continue;
      }

      if(item.userData.kind==='ramp'){
        const approachDepth=player.position.z-item.position.z;
        const previousApproachDepth=player.position.z-previousItemZ;
        const aligned=dx<=radiusX+.30;

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

    if(nearestSectionItem){
      state.courseSection=nearestSectionItem.userData.section||state.courseSection;
      state.safeRouteX=nearestSectionItem.userData.safeX??state.safeRouteX;
    }
    }
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
  courseRenderBatches.sync(course,worldDistance!==0);
  startCrowd.update(dt,{mode:state.mode,worldDistance,time:performance.now()/1000});
  startGate.update(worldDistance);
  const worldSpeed=worldDistance/dt;
  environment.update(state.mode==='paused'?0:dt,worldSpeed,state.x,state.y,player.position.z,state.speed,state.edge,state.air,state.landingPulse,state.mode==='playing',.12+state.centerGround,state.time);

  ui.updateHud({distance:state.distance,bananas:state.bananas,speed:state.speed,best:state.best,air:state.air,mode:state.mode});
  scorePresentation.update({
    score:state.score??0,
    combo:state.combo??0,
    lastClearPoints:state.lastClearPoints??0,
    clearEvent:state.clearEvent??null,
    trickEvent:state.trickEvent??null
  });
  audio.playClear?.(state.clearEvent??null);
  audio.update({
    mode:state.mode,
    speed:state.speed,
    carve:state.edge,
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
}

function render(now){
  const dt=Math.min(.05,(now-last)/1000||.016);last=now;
  update(dt);
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
  renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
}
addEventListener('resize',resize);

window.chimpionsSki=()=>{
  const courseWorldEndZ=courseEndZ+courseTravel;
  const batch=courseRenderBatches.getDiagnostics();
  let standaloneCourseObjects=0;
  let standaloneCourseDrawCalls=0;
  for(const item of course){
    if(item.userData.batchedCourseRender)continue;
    standaloneCourseObjects++;
    if(item.visible&&item.position.z>=batch.renderMinZ&&item.position.z<=batch.renderMaxZ){
      standaloneCourseDrawCalls+=item.userData.courseDrawCalls||0;
    }
  }
  const pooledObjects=Object.values(coursePool).reduce((sum,pool)=>sum+pool.length,0);
  return {
    ...state,
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
    rideMode:selectedRideMode,
    baseSpeed:getRideProfile(selectedRideMode).baseSpeed,
    maxSpeed:getRideProfile(selectedRideMode).maxSpeed,
    equipmentType:skier?.userData?.equipmentType||'unknown',
    poseMode:skier?.userData?.poseMode||'unknown',
    riderVisual:skier?.userData?.riderVisual?.name||'',
    skierFallback:!!skier?.userData?.fallback,
    rigReady:!!skier?.userData?.rigReady,
    modelForwardAxis:skier?.userData?.modelForwardAxis||'procedural',
    courseObjects:course.length,
    pooledCourseObjects:pooledObjects
  };
};

// Destructive crowd lifecycle controls are exposed only for the dedicated
// production benchmark URL. Normal gameplay has no global teardown hook.
if(new URLSearchParams(window.location.search).has('crowdBenchmark')){
  window.chimpionsSkiCrowdBenchmark={
    prepareFull:()=>startCrowd.prepareFull(catalog),
    prepareStart:()=>startCrowd.setSpectators(catalog),
    release:()=>startCrowd.release(),
    rebuildCrowd:async()=>{
      // Benchmark only: isolate the crowd restart path from transient gameplay
      // guards/UI state while exercising the exact ensureLoaded()+reset lifecycle.
      if(state.mode==='playing')pauseGame();
      const loadedCount=await startCrowd.ensureLoaded(catalog);
      startCrowd.reset();
      return {ok:true,loadedCount,mode:state.mode};
    }
  };
}
