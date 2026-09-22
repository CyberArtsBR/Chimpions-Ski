import * as THREE from 'three';
import './style.css';
import {loadSkier} from './skier.js';
import {readPad} from './input.js';
import {createSkiAudio} from './audio.js';
import {createSkiEnvironment,decorateCourseObject} from './environment.js';
import {loadAvatarCatalog,randomAvatar,createAvatarSelector} from './avatar-system.js';
import {progressSpeed,stepCarving,stepAir,launchRamp} from './skiPhysics.js';
import {createCourseDirector,getCourseDifficulty} from './course.js';

const app=document.querySelector('#app');
app.innerHTML=`
  <div class="hud">
    <div class="stat"><small>DISTANCE</small><strong id="distance">0 m</strong></div>
    <div class="stat"><small>BANANAS</small><strong id="bananas">0</strong></div>
    <div class="stat"><small>SPEED</small><strong id="speed">0</strong></div>
  </div>
  <div class="overlay" id="overlay">
    <section class="card">
      <div class="badge">❄️ FIRST RUN · v0.1</div>
      <h1 class="logo">CHIMPIONS <span>SKI</span></h1>
      <p class="tagline">Carve through an endless mountain. Dodge trees and rocks, collect bananas and hit ramps as the slope gets faster.</p>
      <div id="crash-copy"></div>
      <div class="selected-avatar" id="selected-avatar">
        <span class="selected-avatar-image" id="selected-avatar-image">🐵</span>
        <span><small>YOUR SKIER</small><strong id="selected-avatar-name">Loading Chimpions…</strong></span>
      </div>
      <div class="menu-actions">
        <button class="secondary" id="choose">CHOOSE CHIMPION</button>
        <button class="primary" id="start">START SKIING</button>
      </div>
      <div class="tip">← → / A D · Xbox / PlayStation controller</div>
    </section>
  </div>
`;

const $=id=>document.getElementById(id);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.1,180);
camera.position.set(0,6.1,10.5);
camera.lookAt(0,1,-12);

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
  const tile=new THREE.Mesh(new THREE.PlaneGeometry(32,28,1,1),snowMat);
  tile.rotation.x=-Math.PI/2;tile.position.set(0,0,-i*28+8);tile.receiveShadow=true;world.add(tile);tiles.push(tile);
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
  const g=new THREE.Group();
  const curve=new THREE.TorusGeometry(.38,.085,8,18,Math.PI*1.08);
  const m=new THREE.Mesh(curve,bananaMat);m.rotation.z=.35;m.castShadow=true;g.add(m);
  g.position.y=1.05;g.userData.kind='banana';g.userData.radius=.55;g.userData.radiusX=.48;g.userData.radiusZ=.58;g.userData.yOffset=1.05;decorateCourseObject(g,'banana');return g;
}
function makeRamp(){
  const g=new THREE.Group();
  const m=new THREE.Mesh(new THREE.BoxGeometry(2.4,.22,3.2),rampMat);m.rotation.x=-.18;m.position.y=.34;m.castShadow=m.receiveShadow=true;g.add(m);
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
function terrainWave(z){
  return Math.sin((-z)*.055)*.085+Math.sin((-z)*.019)*.055;
}
function terrainHeight(x,z){
  const broad=terrainWave(z);
  const cross=Math.sin(x*.34+z*.012)*.018;
  return broad+cross;
}
function makeCourseItem(kind){
  if(kind==='tree')return makeTree();
  if(kind==='rock')return makeRock();
  if(kind==='log')return makeLog();
  if(kind==='banana')return makeBanana();
  return makeRamp();
}
function addCoursePlacement(placement){
  const item=makeCourseItem(placement.kind);
  item.position.x=placement.x;
  item.position.z=placement.z;
  item.position.y=terrainHeight(item.position.x,item.position.z)+(item.userData.yOffset||0);
  item.userData.spawnFrame=courseFrame;
  item.userData.section=placement.section;
  item.userData.safeX=placement.safeX;
  item.userData.activated=false;
  item.userData.landingZone=!!placement.landingZone;
  item.userData.jumpTarget=!!placement.jumpTarget;
  world.add(item);
  course.push(item);
}
function fillCourse(difficulty=0){
  let farthest=course.length?Math.min(...course.map(item=>item.position.z)):-12;
  let guard=0;
  while(farthest>-166&&guard++<10){
    const section=courseDirector.next({startZ:farthest-5.5,difficulty});
    for(const placement of section.placements)addCoursePlacement(placement);
    farthest=section.endZ;
  }
}
function resetCourse(difficulty=0){
  for(const item of course)world.remove(item);
  course.length=0;
  courseDirector.reset();
  fillCourse(difficulty);
}

// Twin ski tracks and snow spray are pooled for the desktop high-quality build.
const trackGroup=new THREE.Group();world.add(trackGroup);
const trackMat=new THREE.MeshBasicMaterial({color:0x9fc7d8,transparent:true,opacity:.42,depthWrite:false});
const trackGeometry=new THREE.BoxGeometry(.064,.012,.86);
const trackPool=[];
for(let i=0;i<112;i++){
  const mark=new THREE.Mesh(trackGeometry,trackMat.clone());
  mark.position.set(0,-10,0);mark.visible=false;trackGroup.add(mark);trackPool.push(mark);
}
let trackCursor=0,trackTimer=0;
function emitTrack(x,z,steer){
  for(const side of [-1,1]){
    const mark=trackPool[trackCursor++%trackPool.length];
    mark.visible=true;mark.material.opacity=.42;
    mark.position.set(x+side*.23,.014,z-.5);
    mark.rotation.set(0,-steer*.13+side*steer*.018,0);
  }
}
const player=new THREE.Group();scene.add(player);
player.position.set(0,.12,2.2);
let skier=null,catalog=[],selectedAvatar=null,selector=null,ready=false;
const audio=createSkiAudio();

async function setAvatar(entry){
  selectedAvatar=entry;
  $('selected-avatar-name').textContent=entry.name;
  $('selected-avatar-image').innerHTML=entry.image?`<img src="${entry.image}" alt="">`:'🐵';
  if(skier)player.remove(skier);
  skier=await loadSkier('/'+entry.url);
  player.add(skier);
}
(async()=>{
  try{
    catalog=await loadAvatarCatalog();
    selector=createAvatarSelector({catalog,onSelect:setAvatar});
    await setAvatar(randomAvatar(catalog));
  }catch(error){
    console.warn(error);
    skier=await loadSkier();player.add(skier);
    $('selected-avatar-name').textContent='Fallback skier';
  }finally{ready=true;}
})();

const state={mode:'menu',distance:0,travel:0,time:0,bananas:0,speed:12,x:0,vx:0,edge:0,heading:0,turnRate:0,y:.12,vy:0,air:false,landingPulse:0,best:0,frame:0,rampGrace:0,counterSteer:false,difficulty:0,courseSection:'OPEN CARVE',safeRouteX:0};
try{state.best=Number(localStorage.getItem('chimpions-ski-best'))||0}catch{}
courseDirector=createCourseDirector({routeCenter});
resetCourse(0);
const keys=new Set();
let last=performance.now();

function control(){
  const keyboard=Number(keys.has('ArrowRight')||keys.has('KeyD'))-Number(keys.has('ArrowLeft')||keys.has('KeyA'));
  const pad=readPad(navigator.getGamepads?.()||[]);
  return THREE.MathUtils.clamp(keyboard||pad.axis,-1,1);
}
function reset(){
  audio.play('menu',.5);
  Object.assign(state,{mode:'playing',distance:0,travel:0,time:0,bananas:0,speed:12,x:0,vx:0,edge:0,heading:0,turnRate:0,y:.12,vy:0,air:false,landingPulse:0,frame:0,rampGrace:0,counterSteer:false,difficulty:0,courseSection:'OPEN CARVE',safeRouteX:0});
  player.position.set(0,.12,2.2);player.rotation.set(0,0,0);
  trackTimer=0;for(const mark of trackPool){mark.visible=false;mark.material.opacity=.42;}
  courseFrame=0;resetCourse(0);
  $('overlay').hidden=true;$('crash-copy').innerHTML='';
}
function crash(){
  if(state.mode!=='playing')return;
  state.mode='crashed';audio.play('crash',.9);
  state.best=Math.max(state.best,Math.floor(state.distance));
  try{localStorage.setItem('chimpions-ski-best',state.best)}catch{}
  $('crash-copy').innerHTML='<div class="crash">WIPEOUT · '+Math.floor(state.distance)+' m</div>';
  $('start').textContent='SKI AGAIN';
  $('overlay').hidden=false;
}
$('start').onclick=reset;
$('choose').onclick=()=>selector?.open();
addEventListener('keydown',e=>{keys.add(e.code);if(e.code==='Enter'&&state.mode!=='playing')reset();});
addEventListener('keyup',e=>keys.delete(e.code));

function update(dt){
  const steer=control();
  if(state.mode==='playing'){
    state.time+=dt;
    state.frame++;
    courseFrame=state.frame;
    progressSpeed(state,dt);
    state.distance+=state.speed*dt*.74;
    state.travel+=state.speed*dt;
    state.difficulty=getCourseDifficulty(state.distance,state.speed);

    stepCarving(state,steer,dt);
    state.rampGrace=Math.max(0,state.rampGrace-dt);
    const groundY=.12+terrainHeight(state.x,player.position.z-state.travel);
    const landing=stepAir(state,dt,groundY);
    if(landing.landed)audio.play('land',.55);

    player.position.x=state.x;player.position.y=state.y;
    player.rotation.z=THREE.MathUtils.damp(player.rotation.z,-state.edge*.30,7,dt);
    player.rotation.y=THREE.MathUtils.damp(player.rotation.y,-state.heading*.58,6,dt);
    skier?.userData?.updateSkiPose?.({
      steer:state.edge,
      air:state.air,
      landing:state.landingPulse,
      speed:state.speed,
      time:performance.now()/1000
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
      if(item.userData.kind==='banana')item.rotation.y+=dt*2.8;

      if(item.position.z>17){
        world.remove(item);
        course.splice(i,1);
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
        const onDeck=item.position.z>=player.position.z-1.62&&item.position.z<=player.position.z+.52;
        if(!item.userData.activated&&!state.air&&state.rampGrace<=0&&onDeck&&dx<=radiusX+.18){
          item.userData.activated=true;
          if(launchRamp(state,itemGround))audio.play('ramp');
        }
        continue;
      }

      const clearance=state.y-(.12+itemGround);
      const requiredClearance=item.userData.clearance??.9;
      if(state.air&&clearance>requiredClearance)continue;

      crash();
      break;
    }

    fillCourse(state.difficulty);
    if(nearestSectionItem){
      state.courseSection=nearestSectionItem.userData.section||state.courseSection;
      state.safeRouteX=nearestSectionItem.userData.safeX??state.safeRouteX;
    }
  }else if(state.mode==='crashed'){
    player.rotation.z=THREE.MathUtils.damp(player.rotation.z,.95,5,dt);
  }
  for(const tile of tiles){
    tile.position.z+=state.mode==='playing'?state.speed*dt:0;
    const tileWorldZ=tile.position.z-state.travel;
    tile.position.y=terrainHeight(0,tileWorldZ)*.65;
    tile.rotation.x=-Math.PI/2+Math.sin((-tileWorldZ)*.045)*.006;
    if(tile.position.z>22)tile.position.z-=tiles.length*28;
  }
  const worldSpeed=state.mode==='playing'?state.speed:0;
  for(const mark of trackPool){
    if(!mark.visible)continue;
    mark.position.z+=worldSpeed*dt;
    mark.material.opacity=Math.max(0,mark.material.opacity-dt*.145);
    if(mark.position.z>16||mark.material.opacity<=.02)mark.visible=false;
  }
  environment.update(dt,worldSpeed,state.x,state.y,player.position.z,state.speed,state.edge,state.air,state.landingPulse);

  $('distance').textContent=Math.floor(state.distance)+' m';
  $('bananas').textContent=state.bananas;
  $('speed').textContent=Math.round(state.speed*3.6)+' km/h';
}

function render(now){
  const dt=Math.min(.05,(now-last)/1000||.016);last=now;
  update(dt);
  const speed01=THREE.MathUtils.clamp((state.speed-12)/19,0,1);
  const desiredCameraX=state.x*.26-state.heading*1.05;
  camera.position.x=THREE.MathUtils.damp(camera.position.x,desiredCameraX,2.55,dt);
  camera.position.y=THREE.MathUtils.damp(camera.position.y,6.1+speed01*.55+state.y*.12,2.4,dt);
  camera.position.z=THREE.MathUtils.damp(camera.position.z,10.5+speed01*1.2,2.2,dt);
  const targetFov=55+speed01*5;
  camera.fov=THREE.MathUtils.damp(camera.fov,targetFov,2.5,dt);camera.updateProjectionMatrix();
  camera.lookAt(camera.position.x*.14+state.heading*.42,1.05,-12.8-speed01*1.8);
  camera.rotation.z=THREE.MathUtils.damp(camera.rotation.z,-state.edge*(.012+speed01*.018),3.5,dt);
  renderer.render(scene,camera);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

function resize(){
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
}
addEventListener('resize',resize);

window.chimpionsSki=()=>({...state,ready,catalogSize:catalog.length,selectedAvatar:selectedAvatar?.name||'',skierFallback:!!skier?.userData?.fallback,rigReady:!!skier?.userData?.rigReady,courseObjects:course.length});
