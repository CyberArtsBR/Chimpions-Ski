import assert from 'node:assert/strict';
import {createWeatherState,WEATHER_MODES} from '../src/weatherState.js';
import {quality,QUALITY_PROFILES} from '../src/renderQuality.js';

const finiteObject=(object,label)=>{for(const [key,value] of Object.entries(object)){if(typeof value==='number')assert(Number.isFinite(value),`${label}.${key} became non-finite`);}};
const weather={};
for(const mode of WEATHER_MODES){
  const state=createWeatherState(mode,false);let strikes=0,maxFlash=0;
  for(let i=0;i<60*180;i++){
    const values=state.update(1/60);finiteObject(values,`weather.${mode}`);if(values.strike)strikes++;maxFlash=Math.max(maxFlash,values.flash||0);
  }
  weather[mode]={preset:state.values.preset,strikes,maxFlash:Number(maxFlash.toFixed(4)),rain:Number(state.values.rain.toFixed(3)),snowfall:Number(state.values.snowfall.toFixed(3))};
}
assert(weather.storm.strikes>0,'storm soak never produced lightning');
const reduced=createWeatherState('storm',true);let reducedMax=0;for(let i=0;i<60*180;i++){reduced.update(1/60);reducedMax=Math.max(reducedMax,reduced.values.flash||0);}assert(reducedMax<=.05,'reduced-flash mode exceeded safety cap');

const manual={};
for(const profile of ['max','high','medium','low']){
  quality.setProfile(profile);for(let i=0;i<1000;i++)quality.observeFrame(45,i*50);
  const d=quality.getDiagnostics();assert.equal(d.qualityMode,profile,`manual ${profile} changed itself under slow frames`);assert.equal(d.activeQualityProfile,profile);
  manual[profile]={...d,settings:quality.getSettings()};
}
assert(QUALITY_PROFILES.max.dprCap>QUALITY_PROFILES.high.dprCap,'MAX must provide more DPR headroom than HIGH');
assert(QUALITY_PROFILES.low.dprCap<QUALITY_PROFILES.high.dprCap,'LOW DPR must remain cheaper than HIGH');
assert(QUALITY_PROFILES.low.environmentDecorationDensity<QUALITY_PROFILES.high.environmentDecorationDensity,'LOW environment density must remain cheaper than HIGH');

quality.setProfile('auto');
let stamp=0,previous=quality.getDiagnostics(),changes=0;
for(let i=0;i<3600;i++){
  stamp+=33;quality.observeFrame(32,stamp);const next=quality.getDiagnostics();
  if(next.activeQualityProfile!==previous.activeQualityProfile||next.autoResolutionScale!==previous.autoResolutionScale)changes++;
  previous=next;
}
const degraded=quality.getDiagnostics();
assert(degraded.activeQualityProfile!=='high'||degraded.autoResolutionScale<.999,'AUTO did not reduce quality under sustained slow frames');
for(let i=0;i<5000;i++){stamp+=14;quality.observeFrame(14,stamp);}
const recovered=quality.getDiagnostics();
assert(recovered.autoResolutionScale>=degraded.autoResolutionScale,'AUTO failed to recover resolution under sustained headroom');
assert(changes<80,'AUTO quality oscillated excessively under sustained pressure');
console.log(JSON.stringify({check:'aaa-weather-quality-soak',weather,reducedFlashMax:Number(reducedMax.toFixed(4)),manual,auto:{degraded,recovered,pressureChanges:changes}}));
