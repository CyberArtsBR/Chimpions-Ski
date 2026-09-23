import {CONFIG,analyzeCourse,analyzeMetric,frameMark,frameSummarySince,pending,readDiagnostics,round,runtimeSnapshot,sampleRuntime,speedBins} from './core.mjs';
import {closeSelector,openSelector} from './selector.mjs';

async function clickStart(page){
  const diag=await readDiagnostics(page);
  if(diag?.mode==='playing')return {status:'PASS',alreadyPlaying:true};
  const started=Date.now();
  const action=await page.evaluate(()=>{
    const startScreen=document.querySelector('.start-screen');
    const startScreenPlay=startScreen?.querySelector('.start-screen-play');
    if(startScreen&&!startScreen.hidden&&startScreenPlay&&!startScreenPlay.disabled){startScreenPlay.click();return 'start-screen';}
    const start=document.querySelector('#start');
    if(start&&!start.disabled){start.click();return 'menu';}
    return null;
  });
  if(!action)return pending('No enabled start control was available');
  try{
    await page.waitForFunction(()=>window.chimpionsSki?.().mode==='playing',undefined,{timeout:12_000});
  }catch{
    return pending('Start control was invoked but gameplay did not reach mode=playing');
  }
  return {status:'PASS',action,timeToPlayingMs:Date.now()-started};
}

async function releaseSteering(page,current){
  if(current)try{await page.keyboard.up(current);}catch{}
  return null;
}
async function applySteering(page,diag,current){
  if(diag?.mode!=='playing'||!Number.isFinite(diag?.x)||!Number.isFinite(diag?.safeRouteX))return releaseSteering(page,current);
  const delta=diag.safeRouteX-diag.x;
  const desired=delta>.85?'ArrowRight':delta<-.85?'ArrowLeft':null;
  if(desired===current)return current;
  if(current)await page.keyboard.up(current);
  if(desired)await page.keyboard.down(desired);
  return desired;
}
async function recoverCrash(page){
  const diag=await readDiagnostics(page);
  if(diag?.mode!=='crashed')return false;
  const clicked=await page.evaluate(()=>{
    const button=document.querySelector('#restart-result');
    if(!button||button.disabled)return false;
    button.click();
    return true;
  });
  if(!clicked)return false;
  try{
    await page.waitForFunction(()=>window.chimpionsSki?.().mode==='playing',undefined,{timeout:12_000});
    return true;
  }catch{return false;}
}
export async function benchmarkGameplay(page,seconds,{trickHeavy=false,label='gameplay'}={}){
  const start=await clickStart(page);
  if(start.status!=='PASS')return start;
  const frameStart=await frameMark(page);
  const wallStart=Date.now();
  const samples=[];
  let steering=null;
  let recoveries=0;
  let jumpAttempts=0;
  let lastJumpAt=0;
  const jumpCadence=trickHeavy?CONFIG.trickJumpMs:CONFIG.autoJumpMs;

  try{
    while(Date.now()-wallStart<seconds*1000){
      let diag=await readDiagnostics(page);
      if(diag?.mode==='crashed'){
        steering=await releaseSteering(page,steering);
        if(await recoverCrash(page))recoveries++;
        diag=await readDiagnostics(page);
      }
      if(diag?.mode==='paused'||diag?.mode==='menu'||diag?.mode==='countdown'){
        steering=await releaseSteering(page,steering);
      }else{
        steering=await applySteering(page,diag,steering);
      }
      const now=Date.now();
      if(jumpCadence>0&&diag?.mode==='playing'&&!diag?.air&&now-lastJumpAt>=jumpCadence){
        if(trickHeavy){
          await page.keyboard.down('ArrowDown');
          await page.keyboard.press('Space');
          await page.keyboard.up('ArrowDown');
        }else{
          await page.keyboard.press('Space');
        }
        jumpAttempts++;
        lastJumpAt=now;
      }
      samples.push(await sampleRuntime(page));
      const remaining=seconds*1000-(Date.now()-wallStart);
      if(remaining<=0)break;
      await page.waitForTimeout(Math.min(CONFIG.sampleIntervalMs,remaining));
    }
  }finally{
    await releaseSteering(page,steering);
    try{await page.keyboard.up('ArrowDown');}catch{}
  }

  const frames=await frameSummarySince(page,frameStart);
  const domValues=samples.map(sample=>sample.domNodes).filter(Number.isFinite);
  const trickDomValues=samples.map(sample=>sample.trickDomNodes).filter(Number.isFinite);
  const scoreDomValues=samples.map(sample=>sample.scoreFeedbackNodes).filter(Number.isFinite);
  return {
    status:'PASS',
    label,
    requestedSeconds:seconds,
    observedSeconds:round((Date.now()-wallStart)/1000,2),
    recoveries,
    jumpAttempts,
    frames,
    course:analyzeCourse(samples),
    hotspots:{
      courseTraversalMs:analyzeMetric(samples,'perfCourseTraversalMs'),
      courseBatchSyncMs:analyzeMetric(samples,'perfCourseBatchSyncMs'),
      environmentUpdateMs:analyzeMetric(samples,'perfEnvironmentUpdateMs')
    },
    speedBins:speedBins(samples),
    maxDomNodes:domValues.length?Math.max(...domValues):null,
    maxTrickDomNodes:trickDomValues.length?Math.max(...trickDomValues):null,
    maxScoreFeedbackNodes:scoreDomValues.length?Math.max(...scoreDomValues):null,
    samples
  };
}

export async function benchmarkRestarts(page,iterations){
  if(iterations<=0)return pending('RESTART_ITERATIONS=0');
  const started=await clickStart(page);
  if(started.status!=='PASS')return started;
  const cycles=[];
  for(let i=0;i<iterations;i++){
    const mark=await frameMark(page);
    const before=await runtimeSnapshot(page,`restart-${i+1}-before`);
    await page.keyboard.press('Escape');
    try{await page.waitForFunction(()=>window.chimpionsSki?.().mode==='paused',undefined,{timeout:3000});}catch{}
    const wall=Date.now();
    const clicked=await page.evaluate(()=>{
      const button=document.querySelector('#restart-pause');
      if(!button||button.disabled)return false;
      button.click();
      return true;
    });
    if(!clicked)return pending('Pause/restart control unavailable during restart cycle');
    try{await page.waitForFunction(()=>window.chimpionsSki?.().mode==='playing',undefined,{timeout:12_000});}catch{return pending('Restart did not return to playing state');}
    const after=await runtimeSnapshot(page,`restart-${i+1}-after`);
    cycles.push({iteration:i+1,restartToPlayingMs:Date.now()-wall,before,after,frames:await frameSummarySince(page,mark)});
  }
  return {status:'PASS',iterations:cycles};
}

export async function selectRideMode(page,rideMode){
  if(await page.evaluate(()=>document.querySelector('#chimpion-selector')?.open===true))await closeSelector(page);
  const opened=await openSelector(page);
  if(opened.status!=='PASS')return pending(`Cannot open selector to choose ${rideMode}: ${opened.reason||'unknown reason'}`);
  const exists=await page.evaluate(mode=>!!document.querySelector(`.ride-mode-card[data-ride-mode="${mode}"]`),rideMode);
  if(!exists){
    await closeSelector(page);
    return pending(`Ride mode controls are absent; ${rideMode.toUpperCase()} benchmark will activate after rider-mode integration`);
  }
  const selected=await page.evaluate(mode=>{
    const dialog=document.querySelector('#chimpion-selector');
    const card=dialog?.querySelector('.chimpion-card.is-selected')||dialog?.querySelector('.chimpion-card');
    if(!card)return {ok:false,reason:'No Chimpion card available to advance to ride-mode step'};
    card.click();
    const button=dialog.querySelector(`.ride-mode-card[data-ride-mode="${mode}"]`);
    if(!button)return {ok:false,reason:`${mode} ride-mode button not found`};
    return {ok:true};
  },rideMode);
  if(!selected.ok){await closeSelector(page);return pending(selected.reason);}
  try{
    await page.waitForFunction(mode=>{
      const step=document.querySelector('#ride-mode-step');
      const button=document.querySelector(`.ride-mode-card[data-ride-mode="${mode}"]`);
      return !!button&&step&&!step.hidden;
    },rideMode,{timeout:3000});
  }catch{
    await closeSelector(page);
    return pending(`Ride-mode step did not become visible for ${rideMode}`);
  }
  await page.evaluate(mode=>document.querySelector(`.ride-mode-card[data-ride-mode="${mode}"]`)?.click(),rideMode);
  try{
    await page.waitForFunction(mode=>{
      const dialog=document.querySelector('#chimpion-selector');
      const d=window.chimpionsSki?.();
      return !dialog?.open&&String(d?.rideMode||'').toLowerCase()===mode;
    },rideMode,{timeout:CONFIG.readyTimeoutMs});
  }catch{
    return pending(`Selecting ${rideMode} did not produce matching rideMode diagnostics`);
  }
  return {status:'PASS',rideMode};
}
export async function benchmarkRideMode(page,rideMode){
  const selected=await selectRideMode(page,rideMode);
  if(selected.status!=='PASS')return selected;
  const started=await clickStart(page);
  if(started.status!=='PASS')return started;
  const initial=await readDiagnostics(page);
  const run=await benchmarkGameplay(page,CONFIG.modeRunSeconds,{label:`${rideMode}-mode`});
  if(run.status!=='PASS')return run;
  return {
    ...run,
    rideMode,
    initialSpeedKmh:Number.isFinite(initial?.speed)?round(initial.speed*3.6):null,
    baseSpeedKmh:Number.isFinite(initial?.baseSpeed)?round(initial.baseSpeed*3.6):null,
    maxSpeedKmh:Number.isFinite(initial?.maxSpeed)?round(initial.maxSpeed*3.6):null
  };
}

function analyzeCounterAccumulation(samples){
  const keys=new Set();
  for(const sample of samples)for(const key of Object.keys(sample.futureCounters||{}))keys.add(key);
  if(!keys.size)return {status:'UNAVAILABLE',reason:'No trick/score counter diagnostics are exposed'};
  const metrics={};
  for(const key of keys){
    const points=samples.map(sample=>({t:sample.t,value:Number(sample.futureCounters?.[key])})).filter(point=>Number.isFinite(point.value));
    if(points.length)metrics[key]=analyzeMetric(points.map(point=>({t:point.t,[key]:point.value})),key);
    else metrics[key]={status:'OBSERVED_NON_NUMERIC'};
  }
  return {status:'PASS',metrics};
}
export async function benchmarkTricks(page){
  const diagnostics=await readDiagnostics(page);
  if(!diagnostics||!Object.prototype.hasOwnProperty.call(diagnostics,'trickState')){
    return pending('Trick diagnostics are absent; trick-heavy benchmark will activate after trick-system integration');
  }
  const before=await runtimeSnapshot(page,'trick-heavy-before');
  const run=await benchmarkGameplay(page,CONFIG.trickRunSeconds,{trickHeavy:true,label:'trick-heavy'});
  if(run.status!=='PASS')return run;
  const after=await runtimeSnapshot(page,'trick-heavy-after');
  const states={};
  for(const sample of run.samples){
    const state=String(sample.trickState??'null');
    states[state]=(states[state]||0)+1;
  }
  const counterAccumulation=analyzeCounterAccumulation(run.samples);
  const availableKeys=Object.keys(counterAccumulation.metrics||{});
  return {
    ...run,
    before,
    after,
    observedTrickStates:states,
    counterAccumulation,
    pivotAccumulationCheck:availableKeys.some(key=>/pivot/i.test(key))?'see counterAccumulation':pending('No trick-pivot count is exposed by diagnostics'),
    timerAccumulationCheck:availableKeys.some(key=>/timer/i.test(key))?'see counterAccumulation':pending('No timer count is exposed by diagnostics'),
    eventReferenceGrowthCheck:availableKeys.some(key=>/(event|ref)/i.test(key))?'see counterAccumulation':pending('No event/reference count is exposed by diagnostics')
  };
}

export function heapDelta(a,b){
  const first=a?.memory?.usedJSHeapSize,last=b?.memory?.usedJSHeapSize;
  return Number.isFinite(first)&&Number.isFinite(last)?last-first:null;
}
export function modeComparison(ski,snowboard){
  if(ski?.status!=='PASS'||snowboard?.status!=='PASS')return pending('Both SKI and SNOWBOARD phases must be available for comparison');
  const ski230=ski.speedBins?.['230'];
  const board230=snowboard.speedBins?.['230'];
  return {
    status:'PASS',
    ski:{initialSpeedKmh:ski.initialSpeedKmh,averageFps:ski.frames?.averageFps,p95FrameMs:ski.frames?.p95FrameMs,maxSpeedKmh:ski.maxSpeedKmh},
    snowboard:{initialSpeedKmh:snowboard.initialSpeedKmh,averageFps:snowboard.frames?.averageFps,p95FrameMs:snowboard.frames?.p95FrameMs,maxSpeedKmh:snowboard.maxSpeedKmh},
    speed230:{
      status:(ski230||board230)?'PASS':'PENDING',
      reason:(ski230||board230)?undefined:'230 km/h was not naturally reached during configured mode runs; increase MODE_RUN_SECONDS or LONG_RUN_SECONDS without altering game balance',
      ski:ski230||null,
      snowboard:board230||null
    }
  };
}

