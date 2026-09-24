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
results.push(result('speed progression interval = 30 seconds',tierSecs===30?STATUS.PASS:STATUS.FAIL,String(tierSecs)));
results.push(result('shared progression increment = +20 km/h',tierInc!=null&&near(msToKmh(tierInc),20,.25)?STATUS.PASS:STATUS.FAIL,tierInc==null?'not found':`${msToKmh(tierInc).toFixed(2)} km/h`));
results.push(result('shared maximum speed = 300 km/h',max!=null&&near(msToKmh(max),300,.25)?STATUS.PASS:STATUS.FAIL,max==null?'MAX_SPEED not found':`${msToKmh(max).toFixed(2)} km/h`));
results.push(result('speed progression uses current tuning/profile constants',/T\.MAX_SPEED/.test(skiPhysics)&&/T\.BASE_SPEED/.test(skiPhysics)&&/SPEED_TIER_INCREMENT/.test(skiPhysics)?STATUS.PASS:STATUS.FAIL,'progressSpeed must remain profile-driven or tuning-driven'));

if(!featurePresent){
  for(const name of [
    'SNOWBOARD start speed = 180 km/h','SNOWBOARD progression = +20 km/h each 30 seconds','SNOWBOARD max speed = 300 km/h',
    'landing paths reject legacy 210/230 caps','current ride mode determines speed progression'
  ])results.push(result(name,STATUS.PENDING,'snowboard/ride-mode source not present'));
}else{
  const snowboardSlices=[];
  for(const path of allPaths){const s=read(root,path); if(/snowboard/i.test(s))snowboardSlices.push(`// ${path}\n${s}`);}
  const sb=snowboardSlices.join('\n');
  const has180=/baseSpeed\s*:\s*180\s*\*\s*KMH_TO_MPS/.test(sb)||/\b50(?:\.0+)?\b/.test(sb);
  const usesSharedTier=/tierIncrement\s*:\s*SKI_TUNING\.SPEED_TIER_INCREMENT/.test(sb);
  const usesSharedMax=/maxSpeed\s*:\s*SKI_TUNING\.MAX_SPEED/.test(sb);
  results.push(result('SNOWBOARD start speed = 180 km/h',has180?STATUS.PASS:STATUS.FAIL,'expected 180 km/h / 50 m/s in snowboard profile'));
  results.push(result('SNOWBOARD progression = +20 km/h each 30 seconds',has180&&usesSharedTier&&tierSecs===30&&tierInc!=null&&near(msToKmh(tierInc),20,.25)?STATUS.PASS:STATUS.FAIL,'snowboard must share 30s / +20 km/h progression'));
  results.push(result('SNOWBOARD max speed = 300 km/h',usesSharedMax&&max!=null&&near(msToKmh(max),300,.25)?STATUS.PASS:STATUS.FAIL,'snowboard must share 300 km/h cap'));
  const landingStart=skiPhysics.indexOf('export function stepAir');
  const landingEnd=skiPhysics.indexOf('export function launchRamp');
  const landingContext=landingStart>=0
    ?skiPhysics.slice(landingStart,landingEnd>landingStart?landingEnd:undefined)
    :'';
  const legacyClamp=/(?:\b210\b|\b230\b|58\.3333\b|63\.8889\b)/.test(landingContext);
  results.push(result('landing paths reject legacy 210/230 caps',legacyClamp?STATUS.FAIL:STATUS.PASS,legacyClamp?'legacy speed cap marker found in landing context':'no legacy 210/230 landing cap'));
  const modeProgress=/progressSpeed[\s\S]{0,900}(rideMode|rideProfile|modeProfile|maxSpeed)|(?:rideMode|rideProfile|modeProfile)[\s\S]{0,900}progressSpeed/i.test(all);
  results.push(result('current ride mode determines speed progression',modeProgress?STATUS.PASS:STATUS.FAIL,'speed progression should read active ride profile'));
}
finish('ride-mode-invariants',results,{json:!!args.json,extra:{root,featurePresent}});
