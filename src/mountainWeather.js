import * as THREE from 'three';
import './mountainWeather.css';
import {createWeatherState,weatherName} from './weatherState.js';
import {createAlpineWeather} from './alpineWeather.js';
import {createStaticEnvironment} from './weatherAssets.js';
import {quality} from './renderQuality.js';
import {saveQualityPreference} from './userPreferences.js';
const budgets={
  high:{snowCount:850,rainCount:1400,splashCount:64,mistCount:18,glow:1},
  max:{snowCount:1200,rainCount:2000,splashCount:96,mistCount:24,glow:1},
  medium:{snowCount:420,rainCount:650,splashCount:32,mistCount:10,glow:.6},
  low:{snowCount:220,rainCount:320,splashCount:16,mistCount:6,glow:.35}
};
export function createMountainWeather({app,scene,camera,renderer,environment,audio}){
  let saved={};try{saved=JSON.parse(localStorage.getItem('chimpions-ski-atmosphere')||'{}')||{};}catch{}
  const query=new URLSearchParams(location.search);
  const preferences={weather:weatherName(query.get('weather')||saved.weather||'auto'),reducedFlashes:saved.reducedFlashes??matchMedia('(prefers-reduced-motion: reduce)').matches};
  const controller=createWeatherState(preferences.weather,preferences.reducedFlashes);
  const bindings=environment.weatherBindings,{sky,snowLayers,sun,ambient,rim,fill,snowMaterials,atmosphere,snowParticles,surfaceDetail,infrastructure}=bindings;
  sky.visible=false;for(const layer of snowLayers){layer.points.visible=false;layer.points.userData.externalWeather=true;}
  if(!sun.target.parent)scene.add(sun.target);
  scene.environment??=createStaticEnvironment(renderer);
  const rendererWeather=createAlpineWeather({scene,camera,renderer,sun,ambient,rim,settings:budgets[quality.active]||budgets.high});
  const lightningTint=new THREE.Color(0xe8f3ff);
  const sceneMaterials=new Set(),sceneBaseColors=new Map();atmosphere.traverse(o=>{for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m?.color){sceneMaterials.add(m);sceneBaseColors.set(m,m.color.clone());}});
  app.insertAdjacentHTML('beforeend',`<details class="graphics-panel" id="mountain-atmosphere"><summary aria-label="Mountain atmosphere settings"><span aria-hidden="true">❄</span> Mountain atmosphere</summary><div class="graphics-content"><div class="graphics-heading">MAKE IT YOUR MOUNTAIN</div><label>Graphics<select id="atmosphere-quality"><option value="auto">Auto</option><option value="high">High</option><option value="max">Max</option><option value="medium">Balanced</option><option value="low">Low</option></select></label><label>Atmosphere<select id="atmosphere-mode"><option value="auto">Changing skies</option><option value="day">Alpine daylight</option><option value="sunset">Golden hour</option><option value="night">Moonlit night</option><option value="snow">Windblown snow</option><option value="rain">Night rain</option><option value="storm">Thunderstorm</option></select></label><label class="graphics-toggle"><input type="checkbox" id="atmosphere-flashes"> Gentle lightning</label><p>Skies change gradually. Audio follows your sound settings. Skiing physics stay the same.</p></div></details>`);
  const panel=document.getElementById('mountain-atmosphere'),mode=document.getElementById('atmosphere-mode'),qualitySelect=document.getElementById('atmosphere-quality'),flashes=document.getElementById('atmosphere-flashes');
  const persist=()=>{try{localStorage.setItem('chimpions-ski-atmosphere',JSON.stringify(preferences));}catch{}};
  mode.value=preferences.weather;flashes.checked=preferences.reducedFlashes;
  panel.addEventListener('keydown',event=>event.stopPropagation());
  mode.addEventListener('change',()=>{preferences.weather=weatherName(mode.value);controller.setMode(preferences.weather);persist();});
  flashes.addEventListener('change',()=>{preferences.reducedFlashes=flashes.checked;controller.setReducedFlashes(flashes.checked);persist();});
  qualitySelect.addEventListener('change',()=>{quality.setProfile(qualitySelect.value);saveQualityPreference(qualitySelect.value);});
  quality.subscribe(settings=>{rendererWeather.setQuality(budgets[settings.profile]||budgets.high);qualitySelect.value=quality.current;},{immediate:true});
  const dryRoughness=new Map(),wetMaterials=new Set();
  for(const [name,m] of Object.entries(environment.courseMaterials))if(['rock','trunk','log','logEnd'].includes(name)){wetMaterials.add(m);dryRoughness.set(m,m.roughness);}
  const equipment=new Set();
  function setRider(root){
    equipment.clear();if(!root)return;
    for(const ski of root.userData?.skis||[])ski.traverse(o=>{for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m?.isMeshStandardMaterial){equipment.add(m);m.userData.atmosphereDryRoughness??=m.roughness;}});
  }
  function update(dt,state){
    const w=controller.update(dt);rendererWeather.update(dt,state,w);
    const wet=THREE.MathUtils.clamp(Number(w.wet)||0,0,1);
    fill.color.copy(w.ambient).lerp(lightningTint,w.flash*.10);fill.intensity=.25+w.night*.14+w.flash*.16;
    snowMaterials.setWeatherState?.(w);snowMaterials.setWetness?.(wet);
    snowMaterials.terrain.color.copy(w.snow);snowMaterials.bank.color.copy(w.snow);snowMaterials.shadowBank.color.copy(w.snow).multiplyScalar(.79);
    snowMaterials.terrain.roughness=.965-wet*.055;snowMaterials.terrain.envMapIntensity=.08+wet*.10;
    snowMaterials.bank.roughness=.955-wet*.045;snowMaterials.bank.envMapIntensity=.06+wet*.08;
    snowMaterials.shadowBank.roughness=.94-wet*.035;
    snowParticles.setTint(w.snow);snowParticles.setWind?.(w.wind);surfaceDetail.setWind?.(w.wind);infrastructure?.setWind?.(w.wind);surfaceDetail.moundMaterial.color.copy(w.snow);surfaceDetail.ridgeMaterial.color.copy(w.snow).multiplyScalar(.80);
    const atmosphereFade=THREE.MathUtils.clamp(w.fogDensity*18,0,.34),stormDesat=THREE.MathUtils.clamp(w.cloud*.16+w.rain*.12,0,.25);
    for(const m of sceneMaterials){const base=sceneBaseColors.get(m);if(base)m.color.copy(base).lerp(w.fog,atmosphereFade).lerp(w.ambient,stormDesat+w.flash*.05);}
    for(const m of wetMaterials){m.roughness=Math.max(.35,dryRoughness.get(m)-w.wet*.25);m.envMapIntensity=.35+w.wet*.25;}
    for(const m of equipment){m.roughness=Math.max(.16,m.userData.atmosphereDryRoughness-w.wet*.13);m.envMapIntensity=.65+w.wet*.2;}
    audio.updateWeather?.(w,state.mode);if(w.thunder)audio.playWeatherThunder?.();
  }
  return {update,setRider,getState:()=>({mode:preferences.weather,preset:controller.values.preset,rain:controller.values.rain,reducedFlashes:preferences.reducedFlashes})};
}
