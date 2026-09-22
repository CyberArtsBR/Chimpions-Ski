import * as THREE from 'three';
import './style.css';
import {loadSkier} from './skier.js';
import {readPad} from './input.js';
import {createSkiAudio} from './audio.js';
import {loadAvatarCatalog,randomAvatar,createAvatarSelector} from './avatar-system.js';

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

scene.add(new THREE.HemisphereLight(0xeaf8ff,0x718a9b,2.1));
const sun=new THREE.DirectionalLight(0xfff4dc,3.2);
sun.position.set(-8,14,8);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
Object.assign(sun.shadow.camera,{left:-14,right:14,top:18,bottom:-8,near:.5,far:45});
scene.add(sun);

const world=new THREE.Group();scene.add(world);
const snowMat=new THREE.MeshStandardMaterial({color:0xf5fbff,roughness:.96});
const shadowSnow=new THREE.MeshStandardMaterial({color:0xe4f1f7,roughness:1});
const trunkMat=new THREE.MeshStandardMaterial({color:0x68452e,roughness:.9});
const pineMat=new THREE.MeshStandardMaterial({color:0x174e49,roughness:.85});
const rockMat=new THREE.MeshStandardMaterial({color:0x72818b,roughness:.92});
const bananaMat=new THREE.MeshStandardMaterial({color:0xffd74e,roughness:.55,emissive:0x3d2700,emissiveIntensity:.08});
const rampMat=new THREE.MeshStandardMaterial({color:0xc7e8f2,roughness:.8});

const tiles=[];
for(let i=0;i<9;i++){
  const tile=new THREE.Mesh(new THREE.PlaneGeometry(32,28,1,1),i%2?snowMat:shadowSnow);
  tile.rotation.x=-Math.PI/2;tile.position.set(0,0,-i*28+8);tile.receiveShadow=true;world.add(tile);tiles.push(tile);
}

for(let i=0;i<12;i++){
  const m=new THREE.Mesh(new THREE.ConeGeometry(8+Math.random()*5,12+Math.random()*8,5),new THREE.MeshStandardMaterial({color:i%2?0x9cbac7:0xb4ced7,roughness:1}));
  m.position.set((i-6)*13,-1,-75-Math.random()*65);m.rotation.y=Math.random()*Math.PI;m.receiveShadow=true;world.add(m);
}

function makeTree(){
  const g=new THREE.Group();
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.16,.24,1.6,8),trunkMat);trunk.position.y=.8;trunk.castShadow=true;g.add(trunk);
  for(let i=0;i<3;i++){const c=new THREE.Mesh(new THREE.ConeGeometry(1.05-i*.12,2.1,10),pineMat);c.position.y=1.35+i*.72;c.castShadow=true;g.add(c);}
  g.userData.kind='tree';g.userData.radius=.72;return g;
}
function makeRock(){
  const m=new THREE.Mesh(new THREE.DodecahedronGeometry(.64,0),rockMat);m.scale.set(1.15,.75,.9);m.position.y=.48;m.castShadow=true;m.userData.kind='rock';m.userData.radius=.62;return m;
}
function makeBanana(){
  const g=new THREE.Group();
  const curve=new THREE.TorusGeometry(.38,.085,8,18,Math.PI*1.08);
  const m=new THREE.Mesh(curve,bananaMat);m.rotation.z=.35;m.castShadow=true;g.add(m);
  g.position.y=1.05;g.userData.kind='banana';g.userData.radius=.55;return g;
}
function makeRamp(){
  const g=new THREE.Group();
  const m=new THREE.Mesh(new THREE.BoxGeometry(2.4,.22,3.2),rampMat);m.rotation.x=-.18;m.position.y=.34;m.castShadow=m.receiveShadow=true;g.add(m);
  g.userData.kind='ramp';g.userData.radius=1.15;return g;
}

const course=[];
function spawn(z=-90){
  const roll=Math.random();
  const item=roll<.48?makeTree():roll<.68?makeRock():roll<.88?makeBanana():makeRamp();
  item.position.x=THREE.MathUtils.randFloat(-7.2,7.2);
  item.position.z=z;
  world.add(item);course.push(item);
}
for(let i=0;i<34;i++)spawn(-12-i*5.3-Math.random()*2);

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

const state={mode:'menu',distance:0,bananas:0,speed:12,x:0,vx:0,y:.12,vy:0,air:false,best:0};
try{state.best=Number(localStorage.getItem('chimpions-ski-best'))||0}catch{}
const keys=new Set();
let last=performance.now();

function control(){
  const keyboard=Number(keys.has('ArrowRight')||keys.has('KeyD'))-Number(keys.has('ArrowLeft')||keys.has('KeyA'));
  const pad=readPad(navigator.getGamepads?.()||[]);
  return THREE.MathUtils.clamp(keyboard||pad.axis,-1,1);
}
function recycle(item){
  item.position.z=-105-Math.random()*32;
  item.position.x=THREE.MathUtils.randFloat(-7.4,7.4);
  if(item.userData.kind==='banana')item.visible=true;
}
function reset(){
  audio.play('menu',.5);
  state.mode='playing';state.distance=0;state.bananas=0;state.speed=12;state.x=0;state.vx=0;state.y=.12;state.vy=0;state.air=false;
  player.position.set(0,.12,2.2);player.rotation.set(0,0,0);
  course.forEach((o,i)=>{o.visible=true;o.position.z=-12-i*5.3-Math.random()*2;o.position.x=THREE.MathUtils.randFloat(-7.2,7.2);});
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
    state.speed=Math.min(31,state.speed+dt*.42);
    state.distance+=state.speed*dt*.74;
    const desired=steer*7.4;
    state.vx=THREE.MathUtils.damp(state.vx,desired,4.8,dt);
    state.x=THREE.MathUtils.clamp(state.x+state.vx*dt,-8.1,8.1);
    if(state.air){
      state.vy-=17.8*dt;state.y+=state.vy*dt;
      if(state.y<=.12){state.y=.12;state.vy=0;state.air=false;}
    }
    player.position.x=state.x;player.position.y=state.y;
    player.rotation.z=THREE.MathUtils.damp(player.rotation.z,-steer*.28,7,dt);
    player.rotation.y=THREE.MathUtils.damp(player.rotation.y,-state.vx*.045,7,dt);
    skier?.userData?.updateSkiPose?.({
      steer,
      air:state.air,
      landing:!state.air&&state.y<=.12?Math.max(0,Math.min(1,Math.abs(state.vy)/8)):0,
      speed:state.speed,
      time:performance.now()/1000
    });

    for(const item of course){
      item.position.z+=state.speed*dt;
      if(item.userData.kind==='banana')item.rotation.y+=dt*2.8;
      if(item.position.z>15)recycle(item);
      const dz=Math.abs(item.position.z-player.position.z);
      const dx=Math.abs(item.position.x-state.x);
      if(dz<1.05&&dx<item.userData.radius+.38){
        if(item.userData.kind==='banana'&&item.visible){
          item.visible=false;state.bananas++;audio.play('banana');continue;
        }
        if(item.userData.kind==='ramp'&&!state.air){
          state.air=true;state.vy=7.2+state.speed*.045;audio.play('ramp');continue;
        }
        if(!state.air||state.y<.85)crash();
      }
    }
  }else if(state.mode==='crashed'){
    player.rotation.z=THREE.MathUtils.damp(player.rotation.z,.95,5,dt);
  }
  for(const tile of tiles){
    tile.position.z+=state.mode==='playing'?state.speed*dt:0;
    if(tile.position.z>22)tile.position.z-=tiles.length*28;
  }
  $('distance').textContent=Math.floor(state.distance)+' m';
  $('bananas').textContent=state.bananas;
  $('speed').textContent=Math.round(state.speed*3.6)+' km/h';
}

function render(now){
  const dt=Math.min(.05,(now-last)/1000||.016);last=now;
  update(dt);
  const lean=state.vx*.035;
  camera.position.x=THREE.MathUtils.damp(camera.position.x,state.x*.16,2.6,dt);
  camera.rotation.z=THREE.MathUtils.damp(camera.rotation.z,-lean*.11,3,dt);
  renderer.render(scene,camera);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

function resize(){
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
}
addEventListener('resize',resize);

window.chimpionsSki=()=>({...state,ready,catalogSize:catalog.length,selectedAvatar:selectedAvatar?.name||'',skierFallback:!!skier?.userData?.fallback,rigReady:!!skier?.userData?.rigReady});
