import * as THREE from 'three';
import './style.css';
import {loadSkier} from './skier.js';
import {readPad} from './input.js';
import {createSkiAudio} from './audio.js';
import {createSkiEnvironment,decorateCourseObject} from './environment.js';
import {loadAvatarCatalog,randomAvatar,createAvatarSelector,disposeAvatarObject} from './avatar-system.js';
import {createGameUI} from './ui.js';
import {progressSpeed,stepCarving,stepAir,launchRamp} from './skiPhysics.js';
import {createCourseDirector,getCourseDifficulty} from './course.js';

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
      <div class="tip">← → / A D · LEFT STICK / D-PAD · ENTER / A</div>
    </section>
  </div>
`;

const $=id=>document.getElementById(id);
const scene=new THREE.Scene();
scene.background=new THREE.Color(0xdff4ff);
scene.fog=new THREE.FogExp2(0xdff4ff,.021);

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

scene.add(new THREE.HemisphereLight(0xeaf8ff,0x718a9b,1.72));
const sun=new THREE.DirectionalLight(0xfff4dc,3.2);
sun.position.set(-8,14,8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.00045;sun.shadow.normalBias=.025;
Object.assign(sun.shadow.camera,{left:-14,right:14,top:18,bottom:-8,near:.5,far:45});
scene.add(sun);

const world=new THREE.Group();scene.add(world);
const environment=createSkiEnvironment({scene,world,renderer,camera});
const snowMat=new THREE.MeshStandardMaterial({color:0xf5fbff,roughness:.96});
const shadowSnow=new THREE.MeshStandardMaterial({color:0xe4f1f7,roughness:1});
const trunkMat=new THREE.MeshStandardMaterial({color:0x68452e,roughness:.9});
const pineMat=new THREE.MeshStandardMaterial({color:0x174e49,roughness:.85});
const rockMat=new THREE.MeshStandardMaterial({color:0x72818b,roughness:.92});
const bananaMat=new THREE.MeshStandardMaterial({color:0xffd74e,roughness:.55,emissive:0x3d2700,emissiveIntensity:.08});
const rampMat=new THREE.MeshStandardMaterial({color:0xc7e8f2,roughness:.8});
const logMat=new THREE.MeshStandardMaterial({color:0x7d5134,roughness:.92});

const tiles=[];
for(let i=0;i<9;i++){
  const tile=new THREE.Mesh(new THREE.PlaneGeometry(32,28,1,1),i%2?snowMat:shadowSnow);
  tile.rotation.x=-Math.PI/2;tile.position.set(0,0,-i*28+8);tile.receiveShadow=true;world.add(tile);tiles.push(tile);
}

for(let i=0;i<12;i++){
  const m=new THREE.Mesh(new THREE.ConeGeometry(8+Math.random()*5,12+Math.random()*8,5),new THREE.MeshStandardMaterial({color:i%2?0x9cbac7:0xb4ced7,roughness:1}));
  m.position.set((i-6)*13,-1,-75-Math.random()*65);m.rotation.y=Math.random()*Math.PI;m.receiveShadow=true;world.add(m);
}

// High-quality desktop snow field. Particles are recycled around the camera instead of allocated every frame.
const snowCount=700;
const snowPositions=new Float32Array(snowCount*3);
for(let i=0;i<snowCount;i++){
  snowPositions[i*3]=THREE.MathUtils.randFloat(-17,17);
  snowPositions[i*3+1]=THREE.MathUtils.randFloat(.4,15);
  snowPositions[i*3+2]=THREE.MathUtils.randFloat(-48,12);
}
const snowGeometry=new THREE.BufferGeometry();
snowGeometry.setAttribute('position',new THREE.BufferAttribute(snowPositions,3));
const snowMaterial=new THREE.PointsMaterial({color:0xffffff,size:.075,transparent:true,opacity:.78,depthWrite:false});
const snowfall=new THREE.Points(snowGeometry,snowMaterial);scene.add(snowfall);

// Decorative forest stays outside the playable corridor and gives the slope depth without affecting collision.
const forest=new THREE.Group();world.add(forest);
for(let i=0;i<54;i++){
  const side=i%2?-1:1;
  const tree=makeTree();
  tree.scale.setScalar(THREE.MathUtils.randFloat(.72,1.45));
  tree.position.set(side*THREE.MathUtils.randFloat(9.5,15.2),0,-8-i*4.2-Math.random()*4);
  tree.rotation.y=Math.random()*Math.PI*2;
  tree.userData.decorative=true;
  forest.add(tree);
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
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(.15,.15,.16,12),new THREE.MeshStandardMaterial({color:0x9a704d,roughness:.95}));
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
const sprayCount=170;
const sprayPositions=new Float32Array(sprayCount*3);
const sprayVelocity=new Float32Array(sprayCount*3);
const sprayLife=new Float32Array(sprayCount);
for(let i=0;i<sprayCount;i++)sprayPositions[i*3+1]=-100;
const sprayGeometry=new THREE.BufferGeometry();
sprayGeometry.setAttribute('position',new THREE.BufferAttribute(sprayPositions,3));
const sprayMaterial=new THREE.PointsMaterial({color:0xf8fdff,size:.085,transparent:true,opacity:.9,depthWrite:false});
const sprayPoints=new THREE.Points(sprayGeometry,sprayMaterial);scene.add(sprayPoints);
let sprayCursor=0;

function emitTrack(x,z,steer){
  for(const side of [-1,1]){
    const mark=trackPool[trackCursor++%trackPool.length];
    mark.visible=true;mark.material.opacity=.42;
    mark.position.set(x+side*.23,.014,z-.5);
    mark.rotation.set(0,-steer*.13+side*steer*.018,0);
  }
}
function emitSpray(x,y,z,steer,speed){
  const amount=2+Math.floor(Math.abs(steer)*5+speed/11);
  for(let n=0;n<amount;n++){
    const i=sprayCursor++%sprayCount;
    sprayPositions[i*3]=x+THREE.MathUtils.randFloat(-.32,.32);
    sprayPositions[i*3+1]=y+THREE.MathUtils.randFloat(.04,.18);
    sprayPositions[i*3+2]=z+THREE.MathUtils.randFloat(.32,.62);
    sprayVelocity[i*3]=THREE.MathUtils.randFloat(-.7,.7)-steer*1.25;
    sprayVelocity[i*3+1]=THREE.MathUtils.randFloat(.8,2.2);
    sprayVelocity[i*3+2]=THREE.MathUtils.randFloat(1.3,3.2);
    sprayLife[i]=THREE.MathUtils.randFloat(.28,.62);
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

const state={mode:'menu',distance:0,travel:0,time:0,bananas:0,speed:12,x:0,vx:0,edge:0,heading:0,turnRate:0,y:.12,vy:0,air:false,landingPulse:0,best:0,frame:0,rampGrace:0,counterSteer:false,difficulty:0,courseSection:'OPEN CARVE',safeRouteX:0,crashType:''};
try{state.best=Number(localStorage.getItem('chimpions-ski-best'))||0}catch{}
courseDirector=createCourseDirector({routeCenter});
resetCourse(0);
const keys=new Set();
let last=performance.now();

function control(pad){
  const keyboard=Number(keys.has('ArrowRight')||keys.has('KeyD'))-Number(keys.has('ArrowLeft')||keys.has('KeyA'));
  return THREE.MathUtils.clamp(keyboard||pad.axis,-1,1);
}
function resetRunState(mode='countdown'){
  Object.assign(state,{mode,distance:0,travel:0,time:0,bananas:0,speed:12,x:0,vx:0,edge:0,heading:0,turnRate:0,y:.12,vy:0,air:false,landingPulse:0,frame:0,rampGrace:0,counterSteer:false,difficulty:0,courseSection:'OPEN CARVE',safeRouteX:0,crashType:''});
  player.position.set(0,.12,2.2);player.rotation.set(0,0,0);
  trackTimer=0;for(const mark of trackPool){mark.visible=false;mark.material.opacity=.42;}sprayLife.fill(0);
  courseFrame=0;resetCourse(0);
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
function crash(crashType=''){
  if(state.mode!=='playing')return;
  const runDistance=Math.floor(state.distance);
  const previousBest=state.best;
  const newBest=runDistance>previousBest;
  state.mode='crashed';
  state.crashType=crashType||state.crashType||'';
  state.best=Math.max(state.best,runDistance);
  ui.setMode('crashed');
  audio.play('crash',.9);
  try{localStorage.setItem('chimpions-ski-best',state.best)}catch{}
  ui.showResults({distance:runDistance,bananas:state.bananas,best:state.best,newBest,crashType:state.crashType},650);
}
addEventListener('keydown',e=>keys.add(e.code));
addEventListener('keyup',e=>keys.delete(e.code));

function update(dt){
  const pad=readPad(navigator.getGamepads?.()||[]);
  ui.updateController(pad,selector);
  const steer=control(pad);
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
      if(Math.abs(state.edge)>.12||state.speed>18)emitSpray(state.x,state.y,player.position.z,state.edge,state.speed);
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
  for(let i=0;i<sprayCount;i++){
    if(sprayLife[i]<=0)continue;
    sprayLife[i]-=dt;
    sprayVelocity[i*3+1]-=5.8*dt;
    sprayPositions[i*3]+=sprayVelocity[i*3]*dt;
    sprayPositions[i*3+1]+=sprayVelocity[i*3+1]*dt;
    sprayPositions[i*3+2]+=(sprayVelocity[i*3+2]+worldSpeed*.22)*dt;
    if(sprayLife[i]<=0||sprayPositions[i*3+1]<.01)sprayPositions[i*3+1]=-100;
  }
  sprayGeometry.attributes.position.needsUpdate=true;
  for(const tree of forest.children){
    tree.position.z+=worldSpeed*dt;
    if(tree.position.z>18){
      const side=tree.position.x<0?-1:1;
      tree.position.z=-205-Math.random()*28;
      tree.position.x=side*THREE.MathUtils.randFloat(9.5,15.2);
    }
  }
  const snow=snowGeometry.attributes.position.array;
  for(let i=0;i<snowCount;i++){
    snow[i*3+1]-=dt*(1.8+state.speed*.035);
    snow[i*3+2]+=dt*(2.4+worldSpeed*.45);
    snow[i*3]+=state.vx*dt*.018;
    if(snow[i*3+1]<.2){snow[i*3+1]=THREE.MathUtils.randFloat(8,15);}
    if(snow[i*3+2]>14){snow[i*3+2]=THREE.MathUtils.randFloat(-48,-32);snow[i*3]=THREE.MathUtils.randFloat(-17,17);}
  }
  snowGeometry.attributes.position.needsUpdate=true;
  environment.update(dt,worldSpeed,state.x,state.y,player.position.z,state.speed,state.edge,state.air,state.landingPulse);

  ui.updateHud({distance:state.distance,bananas:state.bananas,speed:state.speed,best:state.best});
  audio.update({mode:state.mode,speed:state.speed,carve:state.edge,air:state.air,intensity:state.difficulty});
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
