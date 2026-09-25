import * as THREE from 'three';
import './mountainWeather.css';
import {createWeatherState,weatherName} from './weatherState.js';
import {createAlpineWeather} from './alpineWeather.js';
import {createStaticEnvironment,softSprite} from './weatherAssets.js';
import {quality} from './renderQuality.js';
import {saveQualityPreference} from './userPreferences.js';
import {terrainHeight} from './terrainContact.js';
import {COURSE_FLAG_X} from './environmentCorridor.js';
const budgets={
  high:{snowCount:850,rainCount:1400,splashCount:64,mistCount:18,glow:1},
  max:{snowCount:1200,rainCount:2000,splashCount:96,mistCount:24,glow:1},
  medium:{snowCount:420,rainCount:650,splashCount:32,mistCount:10,glow:.6},
  low:{snowCount:220,rainCount:320,splashCount:16,mistCount:6,glow:.35}
};
export function createMountainWeather({app,scene,camera,renderer,environment,audio}){
  let saved={};try{saved=JSON.parse(localStorage.getItem('chimpions-ski-atmosphere')||'{}')||{};}catch{}
  const query=new URLSearchParams(location.search);
  const preferences={weather:weatherName(query.get('weather')||'auto'),reducedFlashes:saved.reducedFlashes??matchMedia('(prefers-reduced-motion: reduce)').matches};
  const controller=createWeatherState(preferences.weather,preferences.reducedFlashes);
  const bindings=environment.weatherBindings,{sky,snowLayers,sun,ambient,rim,fill,snowMaterials,atmosphere,snowParticles,surfaceDetail}=bindings;
  sky.visible=false;for(const layer of snowLayers){layer.points.visible=false;layer.points.userData.externalWeather=true;}
  if(!sun.target.parent)scene.add(sun.target);
  scene.environment??=createStaticEnvironment(renderer);
  const rendererWeather=createAlpineWeather({scene,camera,renderer,sun,ambient,rim,settings:budgets[quality.active]||budgets.high});
  const sceneMaterials=new Set();atmosphere.traverse(o=>{for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m?.color)sceneMaterials.add(m);});
  // Lights are emissive caps and small world-space glows: no extra light/shadow passes.
  const count=44,dummy=new THREE.Object3D(),positions=new Float32Array(count*3);
  const material=new THREE.MeshStandardMaterial({color:0xffd7a5,emissive:0xffbc73,emissiveIntensity:.12,roughness:.45});
  const lamps=new THREE.InstancedMesh(new THREE.SphereGeometry(.085,6,4),material,count);lamps.frustumCulled=false;scene.add(lamps);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const glowMaterial=new THREE.PointsMaterial({color:0xffb66b,map:softSprite(),size:1.2,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
  const glow=new THREE.Points(geometry,glowMaterial);glow.frustumCulled=false;scene.add(glow);
  let budget=budgets[quality.active]||budgets.high;
  app.insertAdjacentHTML('beforeend',`<details class="graphics-panel" id="mountain-atmosphere"><summary aria-label="Mountain atmosphere settings"><span aria-hidden="true">❄</span> Mountain atmosphere</summary><div class="graphics-content"><div class="graphics-heading">MAKE IT YOUR MOUNTAIN</div><label>Graphics<select id="atmosphere-quality"><option value="auto">Auto</option><option value="high">High</option><option value="max">Max</option><option value="medium">Balanced</option><option value="low">Low</option></select></label><label>Atmosphere<select id="atmosphere-mode"><option value="auto">Changing skies</option><option value="day">Alpine daylight</option><option value="sunset">Golden hour</option><option value="night">Moonlit night</option><option value="snow">Windblown snow</option><option value="rain">Night rain</option><option value="storm">Thunderstorm</option></select></label><label class="graphics-toggle"><input type="checkbox" id="atmosphere-flashes"> Gentle lightning</label><p>Skies change gradually. Audio follows your sound settings. Skiing physics stay the same.</p></div></details>`);
  const panel=document.getElementById('mountain-atmosphere'),mode=document.getElementById('atmosphere-mode'),qualitySelect=document.getElementById('atmosphere-quality'),flashes=document.getElementById('atmosphere-flashes');
  const persist=()=>{try{localStorage.setItem('chimpions-ski-atmosphere',JSON.stringify(preferences));}catch{}};
  mode.value=preferences.weather;flashes.checked=preferences.reducedFlashes;
  panel.addEventListener('keydown',event=>event.stopPropagation());
  mode.addEventListener('change',()=>{preferences.weather=weatherName(mode.value);controller.setMode(preferences.weather);persist();});
  flashes.addEventListener('change',()=>{preferences.reducedFlashes=flashes.checked;controller.setReducedFlashes(flashes.checked);persist();});
  qualitySelect.addEventListener('change',()=>{quality.setProfile(qualitySelect.value);saveQualityPreference(qualitySelect.value);});
  quality.subscribe(settings=>{budget=budgets[settings.profile]||budgets.high;rendererWeather.setQuality(budget);qualitySelect.value=quality.current;},{immediate:true});
  const dryRoughness=new Map(),wetMaterials=new Set();
  for(const [name,m] of Object.entries(environment.courseMaterials))if(['rock','trunk','log','logEnd'].includes(name)){wetMaterials.add(m);dryRoughness.set(m,m.roughness);}
  const equipment=new Set();
  function setRider(root){
    equipment.clear();if(!root)return;
    for(const ski of root.userData?.skis||[])ski.traverse(o=>{for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m?.isMeshStandardMaterial){equipment.add(m);m.userData.atmosphereDryRoughness??=m.roughness;}});
  }
  function update(dt,state){
    const w=controller.update(dt);rendererWeather.update(dt,state,w);
    fill.color.copy(w.ambient);fill.intensity=.25+w.night*.14;
    snowMaterials.terrain.color.copy(w.snow);snowMaterials.bank.color.copy(w.snow);snowMaterials.shadowBank.color.copy(w.snow).multiplyScalar(.77);
    snowMaterials.terrain.roughness=.86-w.wet*.08;snowMaterials.terrain.envMapIntensity=.12+w.wet*.14;
    snowParticles.setTint(w.snow);surfaceDetail.moundMaterial.color.copy(w.snow);surfaceDetail.ridgeMaterial.color.copy(w.snow).multiplyScalar(.77);
    for(const m of sceneMaterials)m.color.copy(w.snow).lerp(w.fog,.25);
    for(const m of wetMaterials){m.roughness=Math.max(.35,dryRoughness.get(m)-w.wet*.25);m.envMapIntensity=.35+w.wet*.25;}
    for(const m of equipment){m.roughness=Math.max(.16,m.userData.atmosphereDryRoughness-w.wet*.13);m.envMapIntensity=.65+w.wet*.2;}
    material.emissiveIntensity=.12+w.night*1.6;glowMaterial.opacity=w.night*.52*budget.glow;
    for(let i=0;i<count;i++){
      const x=(i%2?-1:1)*(COURSE_FLAG_X+.28),z=16-((Math.floor(i/2)*12-state.travel)%264+264)%264,y=terrainHeight(x,z-state.travel)+1.95;
      dummy.position.set(x,y,z);dummy.updateMatrix();lamps.setMatrixAt(i,dummy.matrix);positions[i*3]=x;positions[i*3+1]=y;positions[i*3+2]=z;
    }
    lamps.instanceMatrix.needsUpdate=true;geometry.attributes.position.needsUpdate=true;
    audio.updateWeather?.(w,state.mode);if(w.thunder)audio.playWeatherThunder?.();
  }
  return {update,setRider,getState:()=>({mode:preferences.weather,preset:controller.values.preset,rain:controller.values.rain,reducedFlashes:preferences.reducedFlashes})};
}
