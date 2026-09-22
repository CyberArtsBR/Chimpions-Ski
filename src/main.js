import * as THREE from 'three';
import './style.css';
import {loadSkier} from './skier.js';
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
import {SKI_TUNING} from './gameplayTuning.js';

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
        <span><small>YOUR SKIER</small><strong id="selected-avatar-name">Loading Chimpions…</strong></span>
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

const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.1,180);
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

const tiles=[];
for(let i=0;i<9;i++){
  const geometry=new THREE.PlaneGeometry(32,28,18,18);
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
  g.userData.kind='tree';g.userData.radius=.72;g.userData.radiusX=.62;g.userData.radiusZ=.68;g.userData.clearance=99;decorateCourseObject(g,'tree');return g;
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
function makeRamp(){
  const g=new THREE.Group();
  const m=new THREE.Mesh(new THREE.BoxGeometry(2.4,.22,3.2),rampMat);m.rotation.x=.18;m.position.y=.34;m.castShadow=m.receiveShadow=true;g.add(m);
  g.userData.kind='ramp';g.userData.radius=1.15;g.userData.radiusX=1.16;g.userData.radiusZ=1.58;decorateCourseObject(g,'ramp');return g;
}
function makeLog(){
  const g=new THREE.Group();
  const log=new THREE.Mesh(new THREE.CylinderGeometry(.22,.28,2.2,12),logMat);
  log.rotation.z=Math.PI/2;log.position.y=.28;log.castShadow=log.receiveShadow=true;g.add(log);
  for(const side of [-1,1]){
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(.15,.15,.16,12),logEndMat);
    cap.rotation.z=Math.PI/2;cap.position.set(side*1.12,.28,0);cap.castShadow=true;g.add(cap);
  }
  g.userData.kind='log';g.userData.radius=1.15;g.userData.radiusX=1.02;g.userData.radiusZ=.48;g.userData.clearance=.60;decorateCourseObject(g,'log');return g;
}

const course=[];
let courseDirector=null;
let courseFrame=0;

function routeCenter(z){
  return Math.sin((-z)*.035)*2.9+Math.sin((-z)*.011)*1.1;
}
const coursePool={tree:[],rock:[],log:[],banana:[],ramp:[]};
function makeCourseItem(kind){
  if(kind==='tree')return makeTree();
  if(kind==='rock')return makeRock();
  if(kind==='log')return makeLog();
  if(kind==='banana')return makeBanana();
  return makeRamp();
}
function acquireCourseItem(kind){
  const item=coursePool[kind].pop()||makeCourseItem(kind);
  item.visible=true;
  item.userData.activated=false;
  world.add(item);
  return item;
}
function releaseCourseItem(item){
  item.visible=false;
  world.remove(item);
  coursePool[item.userData.kind]?.push(item);
}
function addCoursePlacement(placement){
  const item=acquireCourseItem(placement.kind);
  item.position.x=placement.x;
  item.position.z=placement.z;
  item.position.y=terrainHeight(item.position.x,item.position.z)+(item.userData.yOffset||0);
  item.userData.spawnFrame=courseFrame;
  item.userData.section=placement.section;
  item.userData.safeX=placement.safeX;
  item.userData.activated=false;
  item.userData.landingZone=!!placement.landingZone;
  item.userData.jumpTarget=!!placement.jumpTarget;
  course.push(item);
}
function fillCourse(difficulty=0){
  let farthest=course.length?Math.min(...course.map(item=>item.position.z)):-12;
  let guard=0;
  while(farthest>-260&&guard++<10){
    const section=courseDirector.next({startZ:farthest-5.5,difficulty});
    for(const placement of section.placements)addCoursePlacement(placement);
    farthest=section.endZ;
  }
}
function resetCourse(difficulty=0){
  while(course.length)releaseCourseItem(course.pop());
  courseDirector.reset();
  fillCourse(difficulty);
}

// Twin ski tracks and snow spray are pooled for the desktop high-quality build.
const trackGroup=new THREE.Group();world.add(trackGroup);
const trackMat=new THREE.MeshBasicMaterial({
  color:0x7faabd,
  transparent:true,
  opacity:.30,
  depthWrite:false,
  polygonOffset:true,
  polygonOffsetFactor:-1,
  polygonOffsetUnits:-1
});
const trackGeometry=new THREE.PlaneGeometry(.078,.94);
const trackPool=[];
for(let i=0;i<128;i++){
  const mark=new THREE.Mesh(trackGeometry,trackMat.clone());
  mark.rotation.x=-Math.PI/2;
  mark.position.set(0,-10,0);
  mark.visible=false;
  trackGroup.add(mark);
  trackPool.push(mark);
}
let trackCursor=0,trackTimer=0;
function emitTrack(x,z,steer){
  for(const side of [-1,1]){
    const mark=trackPool[trackCursor++%trackPool.length];
    mark.visible=true;
    mark.material.opacity=.30;
    const markX=x+side*.24;
    const markZ=z-.5;
    mark.position.set(markX,terrainHeight(markX,markZ-state.travel)+.010,markZ);
    mark.rotation.set(-Math.PI/2,-steer*.18+side*steer*.02,0);
  }
}

const player=new THREE.Group();scene.add(player);
player.position.set(0,.12,2.2);
let skier=null,catalog=[],selectedAvatar=null,selector=null,ready=false;
const audio=createSkiAudio();
const ui=createGameUI({
  audio,
  onStart:()=>beginRun(),
  onPause:()=>pauseGame(),
  onResume:()=>resumeGame(),
  onRestart:()=>beginRun(),
  onChoose:()=>selector?.open()
});
const feedback=createGameFeedback({audio,ui});
ui.setAvatarLoading(true);

async function setAvatar(entry){
  if(!entry)return;
  ui.setAvatarLoading(true);
  const nextSkier=await loadSkier('/'+entry.url);
  const previousSkier=skier;
  skier=nextSkier;
  player.add(skier);
  if(previousSkier){
    player.remove(previousSkier);
    disposeAvatarObject(previousSkier);
  }
  selectedAvatar=entry;
  ui.setAvatar(entry);
  selector?.setSelected(entry);
  ui.setAvatarLoading(false);
}
(async()=>{
  try{
    catalog=await loadAvatarCatalog();
    const initialAvatar=randomAvatar(catalog);
    await setAvatar(initialAvatar);
    selector=createAvatarSelector({catalog,onSelect:setAvatar,selectedId:initialAvatar.id});
    selector.setSelected(initialAvatar);
  }catch(error){
    console.warn(error);
    const previousSkier=skier;
    skier=await loadSkier();
    player.add(skier);
    if(previousSkier){
      player.remove(previousSkier);
      disposeAvatarObject(previousSkier);
    }
    selectedAvatar={name:'Fallback skier',image:''};
    ui.setAvatar(selectedAvatar);
  }finally{
    ready=true;
    ui.setAvatarLoading(false);
  }
})();

const state={mode:'menu',distance:0,travel:0,time:0,bananas:0,speed:SKI_TUNING.BASE_SPEED,speedTier:0,speedTierTime:0,targetSpeed:SKI_TUNING.BASE_SPEED,maxSpeed:SKI_TUNING.MAX_SPEED,x:0,vx:0,edge:0,heading:0,turnRate:0,y:.12,vy:0,air:false,grounded:true,jumping:false,jumpSource:'',jumpVelocity:0,jumpBufferTime:0,jumpBuffered:false,coyoteTime:0,landingPulse:0,best:0,frame:0,rampGrace:0,counterSteer:false,difficulty:0,courseSection:'OPEN CARVE',safeRouteX:0,grip:.72,carveLoad:0,landingGripLoss:0,landingQuality:'none',groundPitch:0,groundRoll:0,leftGround:0,rightGround:0,centerGround:0,crashType:'',crashVelocity:null,crashDirection:0,crashTime:0};
try{state.best=Number(localStorage.getItem('chimpions-ski-best'))||0}catch{}
courseDirector=createCourseDirector({routeCenter});
resetCourse(0);
const keys=new Set();
let jumpKeyPressed=false,lastPadJump=false;
let last=performance.now();

function control(pad){
  const keyboard=Number(keys.has('ArrowRight')||keys.has('KeyD'))-Number(keys.has('ArrowLeft')||keys.has('KeyA'));
  return THREE.MathUtils.clamp(keyboard||pad.axis,-1,1);
}
function resetRunState(mode='countdown'){
  Object.assign(state,{mode,distance:0,travel:0,time:0,bananas:0,speed:SKI_TUNING.BASE_SPEED,speedTier:0,speedTierTime:0,targetSpeed:SKI_TUNING.BASE_SPEED,maxSpeed:SKI_TUNING.MAX_SPEED,x:0,vx:0,edge:0,heading:0,turnRate:0,y:.12,vy:0,air:false,grounded:true,jumping:false,jumpSource:'',jumpVelocity:0,jumpBufferTime:0,jumpBuffered:false,coyoteTime:0,landingPulse:0,frame:0,rampGrace:0,counterSteer:false,difficulty:0,courseSection:'OPEN CARVE',safeRouteX:0,grip:.72,carveLoad:0,landingGripLoss:0,landingQuality:'none',groundPitch:0,groundRoll:0,leftGround:0,rightGround:0,centerGround:0,crashType:'',crashVelocity:null,crashDirection:0,crashTime:0});
  player.position.set(0,.12,2.2);player.rotation.set(0,0,0);
  trackTimer=0;for(const mark of trackPool){mark.visible=false;mark.material.opacity=.30;}
  courseFrame=0;resetCourse(0);skiCamera.reset();feedback.reset();jumpKeyPressed=false;lastPadJump=false;
}
function beginRun(){
  if(!ready)return;
  audio.unlock();
  audio.play('menu',.38);
  resetRunState('countdown');
  ui.prepareRun({best:state.best});
  ui.startCountdown({
    entry:selectedAvatar,
    onGo:()=>{
      if(state.mode!=='countdown')return;
      state.mode='playing';
      ui.setMode('playing');
      last=performance.now();
    }
  });
}
function pauseGame(){
  if(state.mode!=='playing')return;
  state.mode='paused';
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
  const runDistance=Math.floor(state.distance);
  const previousBest=state.best;
  const newBest=runDistance>previousBest;
  state.crashType=['tree','rock','log'].includes(kind)?kind:'tree';
  state.crashVelocity={x:state.vx,y:state.vy,z:state.speed};
  state.crashDirection=Math.sign(state.x-(item?.position.x??state.x))||Math.sign(state.vx)||1;
  state.crashTime=0;
  state.mode='crashed';
  state.best=Math.max(state.best,runDistance);
  ui.setMode('crashed');
  feedback.onCrash();
  try{localStorage.setItem('chimpions-ski-best',state.best)}catch{}
  ui.showResults({distance:runDistance,bananas:state.bananas,best:state.best,newBest,crashType:state.crashType},650);
}
addEventListener('keydown',e=>{
  keys.add(e.code);
  if(e.code==='Space'&&!e.repeat){jumpKeyPressed=true;e.preventDefault();}
});
addEventListener('keyup',e=>keys.delete(e.code));

function update(dt){
  const pad=readPad(navigator.getGamepads?.()||[]);
  ui.updateController(pad,selector);
  const steer=control(pad);
  const padJumpPressed=!!pad.jump&&!lastPadJump;
  lastPadJump=!!pad.jump;
  const jumpPressed=jumpKeyPressed||padJumpPressed;
  jumpKeyPressed=false;
  if(state.mode==='playing'){
    state.time+=dt;
    state.frame++;
    courseFrame=state.frame;
    progressSpeed(state,dt);
    state.distance+=state.speed*dt*.74;
    state.travel+=state.speed*dt;
    state.difficulty=getCourseDifficulty(state.distance,state.speed);

    state.rampGrace=Math.max(0,state.rampGrace-dt);

    const contactTarget=sampleSkiGround(terrainHeight,state.x,player.position.z-state.travel,state.heading);
    dampTerrainContact(contactTarget,state,dt);
    const groundY=.12+state.centerGround;

    updateJumpAssist(state,jumpPressed,dt);
    tryManualJump(state,groundY);
    stepCarving(state,steer,dt);
    const landing=stepAir(state,dt,groundY);
    if(landing.landed)feedback.onLanding(landing);

    player.position.x=state.x;player.position.y=state.y;
    const terrainPitch=state.air?THREE.MathUtils.clamp(-state.vy*.012,-.09,.09):state.groundPitch*.68;
    const terrainRoll=state.air?0:state.groundRoll*.70;
    player.rotation.x=THREE.MathUtils.damp(player.rotation.x,terrainPitch,7.2,dt);
    player.rotation.z=THREE.MathUtils.damp(player.rotation.z,-state.edge*.29+terrainRoll,7.4,dt);
    player.rotation.y=THREE.MathUtils.damp(player.rotation.y,-state.heading*.58,6,dt);
    skier?.userData?.updateSkiPose?.({
      steer:state.edge,
      air:state.air,
      landing:state.landingPulse,
      speed:state.speed,
      time:performance.now()/1000,
      groundPitch:state.groundPitch,
      groundRoll:state.groundRoll,
      leftGround:state.leftGround,
      rightGround:state.rightGround,
      centerGround:state.centerGround
    });
    if(!state.air){
      trackTimer-=dt;
      if(trackTimer<=0){
        emitTrack(state.x,player.position.z,state.edge);
        trackTimer=Math.max(.045,.09-state.speed*.0013);
      }
    }

    let nearestSectionItem=null;
    for(let i=course.length-1;i>=0;i--){
      const item=course[i];
      item.position.z+=state.speed*dt;
      const itemGround=terrainHeight(item.position.x,item.position.z-state.travel);
      item.position.y=itemGround+(item.userData.yOffset||0);
      if(item.userData.kind==='banana'){
        const phase=state.time*3.4+item.position.z*.085;
        item.rotation.y=Math.sin(phase)*.26;
        item.rotation.z=Math.sin(phase*.73)*.055;
      }

      if(item.position.z>17){
        course.splice(i,1);
        releaseCourseItem(item);
        continue;
      }

      if(item.position.z<=player.position.z&&(!nearestSectionItem||item.position.z>nearestSectionItem.position.z)){
        nearestSectionItem=item;
      }
      if(!item.visible||item.userData.spawnFrame===courseFrame)continue;

      const dz=Math.abs(item.position.z-player.position.z);
      const dx=Math.abs(item.position.x-state.x);
      const radiusX=item.userData.radiusX??item.userData.radius??.6;
      const radiusZ=item.userData.radiusZ??.7;
      if(dz>radiusZ+.20||dx>radiusX+.30)continue;

      if(item.userData.kind==='banana'){
        item.visible=false;
        state.bananas++;
        audio.play('banana');
        continue;
      }

      if(item.userData.kind==='ramp'){
        const approachDepth=player.position.z-item.position.z;
        const aligned=dx<=radiusX+.30;

        // Downhill travel is toward -Z. Engage on the uphill/low side (+Z end),
        // then launch only as the skier reaches the downhill/high lip (-Z end).
        if(!item.userData.activated&&!state.air&&state.rampGrace<=0&&aligned&&approachDepth<=1.72&&approachDepth>=.45){
          item.userData.activated=true;
        }
        const atLip=item.userData.activated&&approachDepth<=-1.02&&approachDepth>=-1.72;
        if(atLip&&!state.air){
          item.userData.activated=false;
          if(launchRamp(state,itemGround))feedback.onRampTakeoff();
        }
        continue;
      }

      const clearance=state.y-(.12+itemGround);
      const requiredClearance=item.userData.clearance??.9;
      if(state.air&&clearance>requiredClearance)continue;

      crash(item.userData.kind,item);
      break;
    }

    fillCourse(state.difficulty);
    if(nearestSectionItem){
      state.courseSection=nearestSectionItem.userData.section||state.courseSection;
      state.safeRouteX=nearestSectionItem.userData.safeX??state.safeRouteX;
    }
  }else if(state.mode==='crashed'){
    state.crashTime+=dt;
    player.rotation.z=THREE.MathUtils.damp(player.rotation.z,(state.crashDirection||1)*.92,4.6,dt);
  }
  for(const tile of tiles){
    tile.position.z+=state.mode==='playing'?state.speed*dt:0;
    if(tile.position.z>22){
      tile.position.z-=tiles.length*28;
      displaceTerrainChunk(tile.geometry,tile.position.z-state.travel);
    }
  }
  const worldSpeed=state.mode==='playing'?state.speed:0;
  for(const mark of trackPool){
    if(!mark.visible)continue;
    mark.position.z+=worldSpeed*dt;
    mark.material.opacity=Math.max(0,mark.material.opacity-dt*.105);
    if(mark.position.z>16||mark.material.opacity<=.02)mark.visible=false;
  }
  environment.update(dt,worldSpeed,state.x,state.y,player.position.z,state.speed,state.edge,state.air,state.landingPulse);

  ui.updateHud({distance:state.distance,bananas:state.bananas,speed:state.speed,best:state.best,air:state.air,mode:state.mode});
  audio.update({mode:state.mode,speed:state.speed,carve:state.edge,air:state.air,intensity:state.difficulty});
  feedback.update(state,dt);
}

function render(now){
  const dt=Math.min(.05,(now-last)/1000||.016);last=now;
  update(dt);
  skiCamera.update(state,dt);
  renderer.render(scene,camera);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

function resize(){
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
}
addEventListener('resize',resize);

window.chimpionsSki=()=>({...state,playableHalfWidth:SKI_TUNING.PLAYER_HALF_WIDTH,courseObjectHalfWidth:SKI_TUNING.COURSE_OBJECT_HALF_WIDTH,ready,catalogSize:catalog.length,selectedAvatar:selectedAvatar?.name||'',skierFallback:!!skier?.userData?.fallback,rigReady:!!skier?.userData?.rigReady,modelForwardAxis:skier?.userData?.modelForwardAxis||'procedural',courseObjects:course.length,pooledCourseObjects:Object.values(coursePool).reduce((sum,pool)=>sum+pool.length,0)});
