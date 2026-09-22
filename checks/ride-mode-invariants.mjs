import {parseArgs,getRoot,read,sourceBundle,jsSources,numberAfter,near,msToKmh,result,finish,STATUS} from './integration-check-utils.mjs';

const args=parseArgs(); const root=getRoot(args);
const tuning=read(root,'src/gameplayTuning.js');
const skiPhysics=read(root,'src/skiPhysics.js');
const allPaths=jsSources(root);
const all=sourceBundle(root,allPaths);
const featurePresent=/\bsnowboard\b/i.test(all)||/rideMode|rideProfile|ride-mode/i.test(all);
const results=[];

const base=numberAfter(tuning,'BASE_SPEED');
const tierSecs=numberAfter(tuning,'SPEED_TIER_SECONDS');
const tierInc=numberAfter(tuning,'SPEED_TIER_INCREMENT');
const max=numberAfter(tuning,'MAX_SPEED');

results.push(result('SKI start speed = 160 km/h',base!=null&&near(msToKmh(base),160,.25)?STATUS.PASS:STATUS.FAIL,base==null?'BASE_SPEED not found':`${msToKmh(base).toFixed(2)} km/h`));
results.push(result('SKI progression interval = 30 seconds',tierSecs===30?STATUS.PASS:STATUS.FAIL,String(tierSecs)));
results.push(result('SKI progression increment = +10 km/h',tierInc!=null&&near(msToKmh(tierInc),10,.25)?STATUS.PASS:STATUS.FAIL,tierInc==null?'not found':`${msToKmh(tierInc).toFixed(2)} km/h`));
results.push(result('SKI max speed = 210 km/h',max!=null&&near(msToKmh(max),210,.25)?STATUS.PASS:STATUS.FAIL,max==null?'MAX_SPEED not found':`${msToKmh(max).toFixed(2)} km/h`));
results.push(result('SKI progression still uses current tuning constants',/T\.MAX_SPEED/.test(skiPhysics)&&/T\.BASE_SPEED/.test(skiPhysics)&&/SPEED_TIER_INCREMENT/.test(skiPhysics)?STATUS.PASS:STATUS.FAIL,'progressSpeed must remain profile-driven or tuning-driven'));

if(!featurePresent){
  for(const name of [
    'SNOWBOARD start speed = 180 km/h','SNOWBOARD progression = +10 km/h each 30 seconds','SNOWBOARD max speed = 230 km/h',
    'landing paths use current mode max (no 210 clamp)','current ride mode determines speed progression','SKI values remain unchanged after adding SNOWBOARD'
  ])results.push(result(name,STATUS.PENDING,'snowboard/ride-mode source not merged yet'));
}else{
  const snowboardSlices=[];
  for(const path of allPaths){const s=read(root,path); if(/snowboard/i.test(s))snowboardSlices.push(`// ${path}\n${s}`);}
  const sb=snowboardSlices.join('\n');
  const has180=/(180(?:\.0+)?\b|50(?:\.0+)?\b)/.test(sb);
  const has230=/(230(?:\.0+)?\b|63\.8(?:8|9)\d*\b)/.test(sb);
  const has30=/30\b/.test(sb)||/SPEED_TIER_SECONDS/.test(sb);
  const has10=/(10(?:\.0+)?\b|2\.77\d*\b|SPEED_TIER_INCREMENT)/.test(sb);
  results.push(result('SNOWBOARD start speed = 180 km/h',has180?STATUS.PASS:STATUS.FAIL,'expected 180 km/h / 50 m/s in snowboard profile'));
  results.push(result('SNOWBOARD progression = +10 km/h each 30 seconds',has30&&has10?STATUS.PASS:STATUS.FAIL,'expected 30s tier and +10 km/h increment'));
  results.push(result('SNOWBOARD max speed = 230 km/h',has230?STATUS.PASS:STATUS.FAIL,'expected 230 km/h / ~63.889 m/s in snowboard profile'));
  const landingContexts=[...all.matchAll(/.{0,240}(?:landing|landed|rough|hard).{0,320}/gis)].map(m=>m[0]).join('\n');
  const hardSkiClamp=/(?:210\b|58\.3333\b|SKI_TUNING\.MAX_SPEED|T\.MAX_SPEED)/.test(landingContexts)&&!/rideProfile|modeProfile|currentProfile|maxSpeed/.test(landingContexts);
  results.push(result('landing paths use current mode max (no 210 clamp)',hardSkiClamp?STATUS.FAIL:STATUS.PASS,hardSkiClamp?'ski-only max found in landing context without mode-profile reference':'no obvious ski-only landing clamp'));
  const modeProgress=/progressSpeed[\s\S]{0,900}(rideMode|rideProfile|modeProfile|maxSpeed)|(?:rideMode|rideProfile|modeProfile)[\s\S]{0,900}progressSpeed/i.test(all);
  results.push(result('current ride mode determines speed progression',modeProgress?STATUS.PASS:STATUS.FAIL,'speed progression should read active ride profile'));
  results.push(result('SKI values remain unchanged after adding SNOWBOARD',base!=null&&near(msToKmh(base),160,.25)&&max!=null&&near(msToKmh(max),210,.25)?STATUS.PASS:STATUS.FAIL,'baseline SKI constants must remain 160→210'));
}
finish('ride-mode-invariants',results,{json:!!args.json,extra:{root,featurePresent}});
