import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_BASE_URL='http://localhost:4173';
const DEFAULT_RESULTS_PATH='benchmark-results.json';

function numberEnv(name,fallback,{min=0,max=Number.POSITIVE_INFINITY}={}){
  const raw=process.env[name];
  if(raw==null||raw==='')return fallback;
  const value=Number(raw);
  if(!Number.isFinite(value)||value<min||value>max){
    throw new Error(`${name} must be a finite number between ${min} and ${max}`);
  }
  return value;
}
function integerEnv(name,fallback,limits={}){
  return Math.round(numberEnv(name,fallback,limits));
}
function boolEnv(name,fallback=true){
  const raw=process.env[name];
  if(raw==null||raw==='')return fallback;
  return !['0','false','no','off'].includes(String(raw).trim().toLowerCase());
}
function listEnv(name,fallback){
  const raw=process.env[name];
  if(!raw)return fallback;
  return raw.split(',').map(value=>value.trim()).filter(Boolean);
}
function qualityProfileEnv(){
  const value=String(process.env.QUALITY_PROFILE||'').trim().toLowerCase();
  if(!value)return null;
  if(value==='reduced')return 'medium';
  if(!['auto','max','high','medium','low'].includes(value))throw new Error('QUALITY_PROFILE must be auto, max, high, medium or low');
  return value;
}
function normalizeBaseUrl(value){
  const url=new URL(value);
  if(!['http:','https:'].includes(url.protocol))throw new Error(`BASE_URL must use http:// or https://`);
  url.hash='';
  return url.toString().replace(/\/$/,'');
}
function classifyTarget(baseUrl){
  const hostname=new URL(baseUrl).hostname.toLowerCase();
  return ['localhost','127.0.0.1','::1'].includes(hostname)?'local':'public';
}

export const CONFIG=Object.freeze({
  baseUrl:normalizeBaseUrl(process.env.BASE_URL||DEFAULT_BASE_URL),
  targetMode:classifyTarget(process.env.BASE_URL||DEFAULT_BASE_URL),
  qualityProfile:qualityProfileEnv(),
  headless:boolEnv('HEADLESS',true),
  viewportWidth:integerEnv('VIEWPORT_WIDTH',1440,{min:640,max:7680}),
  viewportHeight:integerEnv('VIEWPORT_HEIGHT',900,{min:480,max:4320}),
  readyTimeoutMs:integerEnv('READY_TIMEOUT_MS',45_000,{min:5_000,max:180_000}),
  idleSeconds:numberEnv('IDLE_SECONDS',3,{min:0,max:60}),
  gameplaySeconds:numberEnv('GAMEPLAY_SECONDS',30,{min:5,max:180}),
  longRunSeconds:numberEnv('LONG_RUN_SECONDS',60,{min:0,max:3600}),
  modeRunSeconds:numberEnv('MODE_RUN_SECONDS',20,{min:5,max:600}),
  trickRunSeconds:numberEnv('TRICK_RUN_SECONDS',20,{min:5,max:600}),
  sampleIntervalMs:integerEnv('SAMPLE_INTERVAL_MS',1000,{min:250,max:10_000}),
  restartIterations:integerEnv('RESTART_ITERATIONS',3,{min:0,max:20}),
  selectorIterations:integerEnv('SELECTOR_ITERATIONS',3,{min:0,max:20}),
  autoJumpMs:integerEnv('AUTO_JUMP_MS',2500,{min:0,max:60_000}),
  trickJumpMs:integerEnv('TRICK_JUMP_MS',1700,{min:500,max:60_000}),
  searchTerms:listEnv('SEARCH_TERMS',['the','alpha','zzzz-no-match']),
  writeResults:boolEnv('WRITE_RESULTS',true),
  resultsPath:path.resolve(process.cwd(),process.env.RESULTS_PATH||DEFAULT_RESULTS_PATH)
});

export function benchmarkTargetUrl(){
  const url=new URL(CONFIG.baseUrl);
  if(CONFIG.qualityProfile)url.searchParams.set('quality',CONFIG.qualityProfile);
  return url.toString();
}

export function round(value,digits=2){
  if(!Number.isFinite(value))return null;
  const scale=10**digits;
  return Math.round(value*scale)/scale;
}
function percentile(sorted,p){
  if(!sorted.length)return null;
  const index=(sorted.length-1)*p;
  const lo=Math.floor(index),hi=Math.ceil(index);
  if(lo===hi)return sorted[lo];
  return sorted[lo]+(sorted[hi]-sorted[lo])*(index-lo);
}
export function summarizeFrames(frameTimes){
  const clean=frameTimes.filter(value=>Number.isFinite(value)&&value>0&&value<1000);
  if(!clean.length)return {status:'UNAVAILABLE',reason:'No requestAnimationFrame samples were captured'};
  const sorted=[...clean].sort((a,b)=>a-b);
  const mean=clean.reduce((sum,value)=>sum+value,0)/clean.length;
  const med=percentile(sorted,.5);
  const p95=percentile(sorted,.95);
  const p99=percentile(sorted,.99);
  const first=clean.slice(0,Math.max(1,Math.floor(clean.length/4)));
  const last=clean.slice(Math.max(0,clean.length-Math.max(1,Math.floor(clean.length/4))));
  const firstMean=first.reduce((sum,value)=>sum+value,0)/first.length;
  const lastMean=last.reduce((sum,value)=>sum+value,0)/last.length;
  const countOver=threshold=>clean.filter(value=>value>threshold).length;
  return {
    status:'PASS',
    frames:clean.length,
    durationMs:round(clean.reduce((sum,value)=>sum+value,0)),
    averageFrameMs:round(mean,3),
    p50FrameMs:round(med,3),
    averageFps:round(1000/mean,2),
    medianFps:round(1000/med,2),
    onePercentLowFpsApprox:round(1000/p99,2),
    p95FrameMs:round(p95,3),
    p99FrameMs:round(p99,3),
    framesOver16_7ms:countOver(16.7),
    framesOver25ms:countOver(25),
    framesOver33ms:countOver(33),
    framesOver50ms:countOver(50),
    frameTimeDegradationPct:round(((lastMean-firstMean)/Math.max(firstMean,.001))*100,2)
  };
}
function linearSlopePerMinute(values){
  const points=values.filter(point=>Number.isFinite(point.t)&&Number.isFinite(point.value));
  if(points.length<3)return null;
  const base=points[0].t;
  const xs=points.map(point=>(point.t-base)/60_000);
  const ys=points.map(point=>point.value);
  const meanX=xs.reduce((a,b)=>a+b,0)/xs.length;
  const meanY=ys.reduce((a,b)=>a+b,0)/ys.length;
  let numerator=0,denominator=0;
  for(let i=0;i<xs.length;i++){
    numerator+=(xs[i]-meanX)*(ys[i]-meanY);
    denominator+=(xs[i]-meanX)**2;
  }
  return denominator?numerator/denominator:null;
}
export function analyzeMetric(samples,key){
  const points=samples
    .map(sample=>({t:sample.t,value:Number(sample[key])}))
    .filter(point=>Number.isFinite(point.value));
  if(!points.length)return {status:'UNAVAILABLE'};
  const values=points.map(point=>point.value);
  let nonDecreasing=0;
  for(let i=1;i<values.length;i++)if(values[i]>=values[i-1])nonDecreasing++;
  const monotonicUpFraction=values.length>1?nonDecreasing/(values.length-1):0;
  const sorted=[...values].sort((a,b)=>a-b);
  const start=values[0],end=values.at(-1);
  const meaningfulGrowth=end-start>Math.max(8,Math.abs(start)*.25);
  const slope=linearSlopePerMinute(points);
  return {
    status:'PASS',
    samples:values.length,
    start:round(start),
    end:round(end),
    min:round(Math.min(...values)),
    max:round(Math.max(...values)),
    median:round(percentile(sorted,.5)),
    slopePerMinute:round(slope),
    monotonicUpFraction:round(monotonicUpFraction,3),
    suspiciousMonotonicGrowth:!!(values.length>=8&&meaningfulGrowth&&monotonicUpFraction>=.75&&(slope??0)>0)
  };
}
export function analyzeCourse(samples){
  return {
    activeCourseObjects:analyzeMetric(samples,'activeCourseObjects'),
    pooledObjects:analyzeMetric(samples,'pooledObjects'),
    batchedCourseInstances:analyzeMetric(samples,'batchedCourseInstances'),
    courseDrawCallsEstimate:analyzeMetric(samples,'courseDrawCallsEstimate'),
    courseLegacyDrawCallsEstimate:analyzeMetric(samples,'courseLegacyDrawCallsEstimate'),
    courseBatchDrawCalls:analyzeMetric(samples,'courseBatchDrawCalls'),
    courseAhead:analyzeMetric(samples,'courseAhead'),
    physicsSubsteps:analyzeMetric(samples,'physicsSubsteps'),
    collisionCandidates:analyzeMetric(samples,'collisionCandidates'),
    collisionChecks:analyzeMetric(samples,'collisionChecks'),
    broadphaseBuckets:analyzeMetric(samples,'broadphaseBuckets'),
    visibleHazardCount:analyzeMetric(samples,'visibleHazardCount')
  };
}
export function speedBins(samples){
  const bins=new Map();
  for(const sample of samples){
    const kmh=Number(sample.speedKmh);
    if(!Number.isFinite(kmh))continue;
    const bucket=Math.round(kmh/10)*10;
    const list=bins.get(bucket)||[];
    list.push(sample);
    bins.set(bucket,list);
  }
  return Object.fromEntries([...bins.entries()].sort((a,b)=>a[0]-b[0]).map(([bucket,list])=>[
    String(bucket),
    {
      samples:list.length,
      averageSpeedKmh:round(list.reduce((sum,s)=>sum+s.speedKmh,0)/list.length),
      activeCourseObjects:round(list.reduce((sum,s)=>sum+(s.activeCourseObjects??0),0)/list.length),
      pooledObjects:round(list.reduce((sum,s)=>sum+(s.pooledObjects??0),0)/list.length),
      drawCalls:round(list.reduce((sum,s)=>sum+(s.courseDrawCallsEstimate??0),0)/list.length),
      physicsSubsteps:round(list.reduce((sum,s)=>sum+(s.physicsSubsteps??0),0)/list.length),
      collisionCandidates:round(list.reduce((sum,s)=>sum+(s.collisionCandidates??0),0)/list.length),
      collisionChecks:round(list.reduce((sum,s)=>sum+(s.collisionChecks??0),0)/list.length),
      visibleHazards:round(list.reduce((sum,s)=>sum+(s.visibleHazardCount??0),0)/list.length)
    }
  ]));
}
export function pending(reason){return {status:'PENDING',reason};}

export async function importPlaywright(){
  try{
    return await import('@playwright/test');
  }catch(error){
    const report={
      schemaVersion:1,
      generatedAt:new Date().toISOString(),
      status:'UNAVAILABLE',
      reason:'@playwright/test is not available. Install repository dependencies as already declared; this harness will not modify package.json.',
      error:String(error?.message||error),
      config:CONFIG
    };
    if(CONFIG.writeResults)await writeFile(CONFIG.resultsPath,JSON.stringify(report,null,2)+'\n','utf8');
    console.error(JSON.stringify(report,null,2));
    process.exitCode=2;
    return null;
  }
}

export async function attachFrameProbe(page){
  await page.addInitScript(()=>{
    const frameTimes=[];
    const longTasks=[];
    let last=null;
    function tick(timestamp){
      if(last!=null&&frameTimes.length<100_000)frameTimes.push(timestamp-last);
      last=timestamp;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    try{
      new PerformanceObserver(list=>{
        for(const entry of list.getEntries()){
          if(longTasks.length>=10_000)break;
          longTasks.push({startTime:entry.startTime,duration:entry.duration});
        }
      }).observe({entryTypes:['longtask']});
    }catch{}
    Object.defineProperty(window,'__chimpionsBenchmarkFrames',{value:{
      mark:()=>({frameIndex:frameTimes.length,longTaskIndex:longTasks.length}),
      sliceFrom:mark=>{
        const index=typeof mark==='object'?Number(mark?.frameIndex)||0:Number(mark)||0;
        return frameTimes.slice(Math.max(0,index));
      },
      longTasksFrom:mark=>{
        const index=typeof mark==='object'?Number(mark?.longTaskIndex)||0:0;
        return longTasks.slice(Math.max(0,index));
      },
      count:()=>frameTimes.length
    }});
  });
}
export async function frameMark(page){
  return page.evaluate(()=>window.__chimpionsBenchmarkFrames?.mark?.()??{frameIndex:0,longTaskIndex:0});
}
export async function frameSummarySince(page,mark){
  const captured=await page.evaluate(current=>({
    times:window.__chimpionsBenchmarkFrames?.sliceFrom?.(current)??[],
    longTasks:window.__chimpionsBenchmarkFrames?.longTasksFrom?.(current)??[]
  }),mark);
  const summary=summarizeFrames(captured.times);
  const durations=captured.longTasks.map(item=>Number(item.duration)).filter(Number.isFinite);
  summary.longTasks={
    count:durations.length,
    totalDurationMs:round(durations.reduce((sum,value)=>sum+value,0),3),
    maxDurationMs:durations.length?round(Math.max(...durations),3):0
  };
  return summary;
}

export async function createNetworkTracker(context,page){
  const cdp=await context.newCDPSession(page);
  await cdp.send('Network.enable');
  const active=new Map();
  const finished=[];
  const failed=[];

  function finish(requestId,extra={}){
    const record=active.get(requestId);
    if(!record)return;
    Object.assign(record,extra);
    finished.push(record);
    active.delete(requestId);
  }
  cdp.on('Network.requestWillBeSent',event=>{
    if(event.redirectResponse&&active.has(event.requestId)){
      finish(event.requestId,{status:event.redirectResponse.status,redirected:true});
    }
    active.set(event.requestId,{
      requestId:event.requestId,
      url:event.request.url,
      method:event.request.method,
      resourceType:event.type||'Other',
      status:null,
      mimeType:null,
      encodedDataLength:0,
      failed:false
    });
  });
  cdp.on('Network.responseReceived',event=>{
    const record=active.get(event.requestId);
    if(record){record.status=event.response.status;record.mimeType=event.response.mimeType||null;}
  });
  cdp.on('Network.loadingFinished',event=>finish(event.requestId,{encodedDataLength:event.encodedDataLength||0}));
  cdp.on('Network.loadingFailed',event=>{
    const record=active.get(event.requestId);
    if(record){
      record.failed=true;
      record.errorText=event.errorText||'loadingFailed';
      failed.push({...record});
    }
    finish(event.requestId,{failed:true,errorText:event.errorText||'loadingFailed'});
  });

  return {
    async stop(){
      try{await cdp.send('Network.disable');}catch{}
    },
    summarize(portraitUrls=new Set()){
      const records=[...finished,...active.values()];
      const byUrl=new Map();
      for(const record of records){
        if(!record.url||record.url.startsWith('data:')||record.url.startsWith('blob:'))continue;
        const list=byUrl.get(record.url)||[];
        list.push(record);
        byUrl.set(record.url,list);
      }
      const glb=records.filter(record=>/\.glb(?:$|[?#])/i.test(record.url||''));
      const audio=records.filter(record=>/\.(?:mp3|ogg|wav|m4a|aac)(?:$|[?#])/i.test(record.url||'')||record.resourceType==='Media');
      const portraits=records.filter(record=>portraitUrls.has(record.url));
      const httpFailures=records.filter(record=>(record.status??0)>=400);
      const duplicates=[...byUrl.entries()]
        .filter(([,list])=>list.length>1)
        .map(([url,list])=>({url,count:list.length}))
        .sort((a,b)=>b.count-a.count||a.url.localeCompare(b.url));
      const remoteMusic=records.filter(record=>{
        try{
          const url=new URL(record.url);
          return url.hostname==='chimp-jump.onrender.com'&&url.pathname==='/audio/music-full.mp3';
        }catch{return false;}
      });
      const baseOrigin=new URL(CONFIG.baseUrl).origin;
      const localMusic=records.filter(record=>{
        try{
          const url=new URL(record.url);
          return url.origin===baseOrigin&&url.pathname==='/audio/music-full.mp3';
        }catch{return false;}
      });
      const transferredBytes=records.reduce((sum,record)=>sum+(Number(record.encodedDataLength)||0),0);
      return {
        requests:records.length,
        transferredBytes:round(transferredBytes,0),
        glbRequests:glb.length,
        glbUniqueUrls:new Set(glb.map(record=>record.url)).size,
        portraitImageRequests:portraits.length,
        portraitUniqueUrls:new Set(portraits.map(record=>record.url)).size,
        audioRequests:audio.length,
        failedRequests:httpFailures.length+failed.length,
        httpFailures:httpFailures.map(record=>({url:record.url,status:record.status})),
        loadingFailures:failed.map(record=>({url:record.url,errorText:record.errorText})),
        duplicateIdenticalResources:duplicates,
        musicFullMp3:{
          status:remoteMusic.length?'FAIL':localMusic.length?'PASS':'PENDING',
          localRequests:localMusic.length,
          forbiddenRemoteRequests:remoteMusic.length,
          note:remoteMusic.length?'Forbidden runtime dependency detected':localMusic.length?'Music loaded from the benchmark target origin':'music-full.mp3 was not requested during this run'
        }
      };
    }
  };
}

export async function runtimeSnapshot(page,label){
  return page.evaluate(currentLabel=>{
    let diagnostics=null;
    try{diagnostics=typeof window.chimpionsSki==='function'?window.chimpionsSki():null;}catch{}
    const memory=performance.memory?{
      usedJSHeapSize:performance.memory.usedJSHeapSize,
      totalJSHeapSize:performance.memory.totalJSHeapSize,
      jsHeapSizeLimit:performance.memory.jsHeapSizeLimit
    }:null;
    return {
      label:currentLabel,
      t:performance.now(),
      domNodes:document.getElementsByTagName('*').length,
      memory,
      diagnostics
    };
  },label);
}
export async function readDiagnostics(page){
  return page.evaluate(()=>{
    try{return typeof window.chimpionsSki==='function'?window.chimpionsSki():null;}catch{return null;}
  });
}
export async function sampleRuntime(page){
  return page.evaluate(()=>{
    let d=null;
    try{d=typeof window.chimpionsSki==='function'?window.chimpionsSki():null;}catch{}
    const futureCounters={};
    if(d&&typeof d==='object'){
      for(const [key,value] of Object.entries(d)){
        if(!/(trick|score).*(count|node|timer|pivot|event|ref)/i.test(key))continue;
        if(typeof value==='number'||typeof value==='string'||typeof value==='boolean'||value==null)futureCounters[key]=value;
        else if(Array.isArray(value))futureCounters[key]=value.length;
      }
    }
    return {
      t:performance.now(),
      mode:d?.mode??null,
      rideMode:d?.rideMode??null,
      speedKmh:Number.isFinite(d?.speed)?d.speed*3.6:null,
      baseSpeedKmh:Number.isFinite(d?.baseSpeed)?d.baseSpeed*3.6:null,
      maxSpeedKmh:Number.isFinite(d?.maxSpeed)?d.maxSpeed*3.6:null,
      activeCourseObjects:d?.activeCourseObjects??d?.courseObjects??null,
      pooledObjects:d?.pooledObjects??d?.pooledCourseObjects??null,
      courseDrawCallsEstimate:d?.courseDrawCallsEstimate??null,
      courseLegacyDrawCallsEstimate:d?.courseLegacyDrawCallsEstimate??null,
      courseBatchDrawCalls:d?.courseBatchDrawCalls??null,
      batchedCourseInstances:d?.batchedCourseInstances??null,
      courseAhead:d?.courseAhead??null,
      courseLookaheadTarget:d?.courseLookaheadTarget??null,
      physicsSubsteps:d?.physicsSubsteps??null,
      collisionCandidates:d?.collisionCandidates??null,
      collisionChecks:d?.collisionChecks??null,
      broadphaseBuckets:d?.broadphaseBuckets??null,
      nearbyCandidateCount:d?.nearbyCandidateCount??null,
      visibleHazardCount:d?.visibleHazardCount??null,
      activeHazardCount:d?.activeHazardCount??null,
      activeRamp:d?.activeRamp??null,
      x:d?.x??null,
      safeRouteX:d?.safeRouteX??null,
      air:d?.air??null,
      trickState:d?.trickState??null,
      trickRotation:d?.trickRotation??null,
      trickProgress:d?.trickProgress??null,
      rendererCalls:d?.rendererCalls??null,
      rendererTriangles:d?.rendererTriangles??null,
      rendererGeometries:d?.rendererGeometries??null,
      rendererTextures:d?.rendererTextures??null,
      qualityProfile:d?.qualityProfile??null,
      rendererPixelRatio:d?.rendererPixelRatio??null,
      renderPipeline:d?.renderPipeline??null,
      postProcessingEnabled:d?.postProcessingEnabled??null,
      renderTargetType:d?.renderTargetType??null,
      renderTargetSamples:d?.renderTargetSamples??null,
      managedRenderTargetCount:d?.managedRenderTargetCount??null,
      bloomEnabled:d?.bloomEnabled??null,
      bloomStrength:d?.bloomStrength??null,
      shadowEnabled:d?.shadowEnabled??null,
      shadowMapSize:d?.shadowMapSize??null,
      gpuTimerSupported:d?.gpuTimerSupported??null,
      gpuFrameP50Ms:d?.gpuFrameP50Ms??null,
      gpuFrameP95Ms:d?.gpuFrameP95Ms??null,
      gpuFrameP99Ms:d?.gpuFrameP99Ms??null,
      renderCpuP50Ms:d?.renderCpuP50Ms??null,
      renderCpuP95Ms:d?.renderCpuP95Ms??null,
      renderCpuP99Ms:d?.renderCpuP99Ms??null,
      postProcessCpuP95Ms:d?.postProcessCpuP95Ms??null,
      staticFrameSkips:d?.staticFrameSkips??null,
      environmentShadowMapSize:d?.environmentShadowMapSize??null,
      decorativeShadowCasting:d?.decorativeShadowCasting??null,
      activeBanks:d?.activeBanks??null,
      activeWindBanks:d?.activeWindBanks??null,
      activeDecorativeTrees:d?.activeDecorativeTrees??null,
      activeSnowLayerParticles:d?.activeSnowLayerParticles??null,
      snowParticleMistActive:d?.snowParticlePool?.mistActive??null,
      snowParticleChunksActive:d?.snowParticlePool?.chunksActive??null,
      snowSurfaceMoundsActive:d?.snowSurfaceDetail?.activeMounds??null,
      snowSurfaceRidgesActive:d?.snowSurfaceDetail?.activeRidges??null,
      perfFrameTotalMs:d?.perfFrameTotalMs??null,
      perfFrameTotalP95Ms:d?.perfFrameTotalP95Ms??null,
      perfFrameTotalP99Ms:d?.perfFrameTotalP99Ms??null,
      perfPhysicsMs:d?.perfPhysicsMs??null,
      perfPhysicsP95Ms:d?.perfPhysicsP95Ms??null,
      perfCollisionBroadphaseMs:d?.perfCollisionBroadphaseMs??null,
      perfCollisionBroadphaseP95Ms:d?.perfCollisionBroadphaseP95Ms??null,
      perfCourseGenerationMs:d?.perfCourseGenerationMs??null,
      perfCourseTraversalMs:d?.perfCourseTraversalMs??null,
      perfCourseTraversalP95Ms:d?.perfCourseTraversalP95Ms??null,
      perfCourseBatchSyncMs:d?.perfCourseBatchSyncMs??null,
      perfCourseBatchSyncP95Ms:d?.perfCourseBatchSyncP95Ms??null,
      perfEnvironmentUpdateMs:d?.perfEnvironmentUpdateMs??null,
      perfEnvironmentUpdateP95Ms:d?.perfEnvironmentUpdateP95Ms??null,
      domNodes:document.getElementsByTagName('*').length,
      trickDomNodes:document.querySelectorAll('[class*="trick" i],[id*="trick" i]').length,
      scoreFeedbackNodes:document.querySelectorAll('.score-pop-layer *,.landing-callout,.speed-up-callout').length,
      futureCounters
    };
  });
}

export async function waitUntilReady(page){
  await page.waitForFunction(()=>typeof window.chimpionsSki==='function'&&window.chimpionsSki()?.ready===true,undefined,{timeout:CONFIG.readyTimeoutMs});
}
