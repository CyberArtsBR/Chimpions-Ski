import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

const TARGET_URL=new URL(process.env.CHIMPIONS_SKI_BENCHMARK_URL||'http://127.0.0.1:4173/');
TARGET_URL.searchParams.set('crowdBenchmark','1');
const TARGET=TARGET_URL.href;
const OUTPUT=process.env.CHIMPIONS_SKI_CROWD_BENCHMARK_JSON||'';
const TIMEOUT=Number(process.env.CHIMPIONS_SKI_CROWD_TIMEOUT_MS)||60000;
const FULL_TIMEOUT=Number(process.env.CHIMPIONS_SKI_CROWD_FULL_TIMEOUT_MS)||120000;
const RESTARTS=Math.max(1,Number(process.env.CHIMPIONS_SKI_CROWD_RESTARTS)||3);
const PRODUCTION_COUNT=50;
const STRICT_FULL=/^(1|true|yes|on)$/i.test(process.env.CHIMPIONS_SKI_CROWD_STRICT_FULL||'');

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const isGlb=url=>/\.glb(?:[?#]|$)/i.test(url);

async function diagnostics(page){
  return page.evaluate(()=>window.chimpionsSki?.()||null);
}

async function waitDiag(page,predicate,timeout=TIMEOUT){
  const started=Date.now();
  let last=null;
  while(Date.now()-started<timeout){
    last=await diagnostics(page);
    if(last&&predicate(last))return last;
    await sleep(40);
  }
  return last||diagnostics(page);
}

async function heapBytes(page){
  return page.evaluate(()=>performance.memory?.usedJSHeapSize??null);
}

async function glbResourceSummary(page){
  return page.evaluate(()=>{
    const rows=performance.getEntriesByType('resource')
      .filter(entry=>/\.glb(?:[?#]|$)/i.test(entry.name))
      .map(entry=>({
        url:entry.name,
        duration:entry.duration,
        transferSize:entry.transferSize||0,
        encodedBodySize:entry.encodedBodySize||0,
        decodedBodySize:entry.decodedBodySize||0
      }));
    const unique=new Map();
    for(const row of rows)if(!unique.has(row.url))unique.set(row.url,row);
    return {
      entries:rows.length,
      uniqueUrls:unique.size,
      duplicateEntries:Math.max(0,rows.length-unique.size),
      transferBytes:rows.reduce((sum,row)=>sum+row.transferSize,0),
      encodedBytes:rows.reduce((sum,row)=>sum+row.encodedBodySize,0),
      decodedBytes:rows.reduce((sum,row)=>sum+row.decodedBodySize,0),
      rows
    };
  });
}

function attachGlbNetworkTracker(page){
  const requests=[];
  const failures=[];
  page.on('request',request=>{
    if(isGlb(request.url()))requests.push(request.url());
  });
  page.on('requestfailed',request=>{
    if(isGlb(request.url()))failures.push({url:request.url(),kind:'requestfailed',error:request.failure()?.errorText||''});
  });
  page.on('response',response=>{
    if(isGlb(response.url())&&response.status()>=400)failures.push({url:response.url(),kind:'http',status:response.status()});
  });
  return {
    snapshot(){
      return {
        requestCount:requests.length,
        uniqueRequestUrls:new Set(requests).size,
        failedCount:failures.length,
        failures:[...failures]
      };
    }
  };
}

async function sampleFrames(page,durationMs=1000){
  return page.evaluate(duration=>new Promise(resolve=>{
    const samples=[];
    let last=performance.now();
    const end=last+duration;
    function frame(now){
      samples.push(now-last);
      last=now;
      if(now>=end){
        const sorted=[...samples].sort((a,b)=>a-b);
        const mean=samples.reduce((sum,value)=>sum+value,0)/Math.max(1,samples.length);
        resolve({
          frames:samples.length,
          meanMs:mean,
          p95Ms:sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*.95))]||0,
          maxMs:Math.max(0,...samples),
          over33ms:samples.filter(value=>value>33.34).length,
          over50ms:samples.filter(value=>value>50).length
        });
        return;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }),durationMs);
}

async function boot(page){
  await page.goto(TARGET,{waitUntil:'domcontentloaded',timeout:TIMEOUT});
  const ready=await waitDiag(page,d=>d.ready===true&&Number(d.catalogSize)>0,20000);
  if(!ready?.ready)throw new Error('Game did not become ready');
  if(Number(ready.startCrowdCount)!==PRODUCTION_COUNT){
    throw new Error(`Expected production crowd count ${PRODUCTION_COUNT}, got ${ready.startCrowdCount}`);
  }
  return ready;
}

async function openSelector(page){
  const start=page.locator('.start-screen-play');
  await start.waitFor({state:'visible',timeout:10000});
  await page.waitForFunction(()=>{const button=document.querySelector('.start-screen-play');return button&&!button.disabled;},null,{timeout:10000});
  await start.click();
  await page.locator('#chimpion-selector[open]').waitFor({state:'visible',timeout:10000});
}

async function chooseCurrentAvatarAndSki(page){
  await page.locator('#chimpion-selector[open]').waitFor({state:'visible',timeout:10000});
  const selected=page.locator('.chimpion-card.is-selected').first();
  const card=(await selected.count())?selected:page.locator('.chimpion-card').first();
  await card.click();
  await page.locator('#ride-mode-step:not([hidden])').waitFor({state:'visible',timeout:5000});
  const started=performance.now();
  const [countdown,frameTiming]=await Promise.all([
    (async()=>{
      await page.locator('[data-ride-mode="ski"]').first().click();
      return waitDiag(page,d=>d.mode==='countdown'||d.mode==='playing',10000);
    })(),
    sampleFrames(page,1600)
  ]);
  return {blockingMs:performance.now()-started,countdown,frameTiming};
}

async function observeRunOutcome(page,timeout=14000){
  const started=Date.now();
  let maxLoaded=0;
  let maxSources=0;
  let last=null;
  while(Date.now()-started<timeout){
    last=await diagnostics(page);
    maxLoaded=Math.max(maxLoaded,Number(last?.startCrowdLoadedCount)||0);
    maxSources=Math.max(maxSources,Number(last?.startCrowdModelSources)||0);
    if(last?.startCrowdReleased===true||last?.mode==='crashed'){
      return {naturalRelease:last?.startCrowdReleased===true,mode:last?.mode||'',maxLoaded,maxSources,last};
    }
    await sleep(40);
  }
  return {naturalRelease:!!last?.startCrowdReleased,mode:last?.mode||'',maxLoaded,maxSources,last};
}

async function forceBenchmarkRelease(page){
  const result=await page.evaluate(()=>{
    const hook=window.chimpionsSkiCrowdBenchmark;
    if(!hook?.release)return {available:false,released:false};
    return {available:true,released:hook.release()};
  });
  if(!result.available)throw new Error('Crowd benchmark release hook is unavailable');
  const released=await waitDiag(page,d=>d.startCrowdReleased===true,1500);
  if(!released?.startCrowdReleased)throw new Error('Crowd benchmark teardown did not reach released state');
  return true;
}

async function restartAfterTeardown(page){
  let state=await diagnostics(page);
  if(state?.mode!=='playing'&&state?.mode!=='crashed'){
    state=await waitDiag(page,d=>d.mode==='playing'||d.mode==='crashed',14000);
  }
  await forceBenchmarkRelease(page);

  let restartSelector='';
  if(state?.mode==='crashed'){
    restartSelector='#restart-result';
  }else{
    await page.keyboard.press('Escape');
    await page.locator('#pause-overlay:not([hidden])').waitFor({state:'visible',timeout:3000});
    restartSelector='#restart-pause';
  }

  const started=performance.now();
  const [countdown,frameTiming]=await Promise.all([
    (async()=>{
      await page.locator(restartSelector).click();
      return waitDiag(page,d=>(d.mode==='countdown'||d.mode==='playing')&&d.startCrowdReleased===false,10000);
    })(),
    sampleFrames(page,1400)
  ]);
  return {blockingMs:performance.now()-started,countdown,frameTiming,releasedBeforeRestart:true,restartFrom:state?.mode||'unknown'};
}

async function coldFullPreparation(browser){
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await context.newPage();
  const network=attachGlbNetworkTracker(page);
  try{
    const ready=await boot(page);
    const heapBefore=await heapBytes(page);
    const started=performance.now();
    const fullProfileStarted=await page.evaluate(()=>{
      const hook=window.chimpionsSkiCrowdBenchmark;
      if(!hook?.prepareFull)return false;
      hook.prepareFull();
      return true;
    });
    if(!fullProfileStarted)throw new Error('Full production crowd profiling hook is unavailable');
    const framePromise=sampleFrames(page,2000);
    const full=await waitDiag(page,d=>Number(d.startCrowdLoadedCount)>=PRODUCTION_COUNT,FULL_TIMEOUT);
    const wallMs=performance.now()-started;
    const resources=await glbResourceSummary(page);
    const networkStats=network.snapshot();
    return {
      completed:Number(full?.startCrowdLoadedCount)>=PRODUCTION_COUNT,
      wallMs,
      fullProfileStarted,
      initialCrowdCount:Number(ready.startCrowdCount),
      loadedCount:Number(full?.startCrowdLoadedCount)||0,
      modelSourceCount:Number(full?.startCrowdModelSources)||0,
      posedCount:Number(full?.startCrowdPosedCount)||0,
      frameTiming:await framePromise,
      heapBefore,
      heapAfter:await heapBytes(page),
      rendererGeometries:Number(full?.rendererGeometries)||null,
      rendererTextures:Number(full?.rendererTextures)||null,
      cacheStats:full?.startCrowdCacheStats||null,
      quality:full?.startCrowdQuality||null,
      network:networkStats,
      resources
    };
  }finally{
    await context.close();
  }
}

async function coldStartAndWarmRestarts(browser){
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await context.newPage();
  const network=attachGlbNetworkTracker(page);
  try{
    const ready=await boot(page);
    await openSelector(page);
    const beforeStartResources=await glbResourceSummary(page);
    const beforeStartNetwork=network.snapshot();
    const cold=await chooseCurrentAvatarAndSki(page);
    const atCountdownResources=await glbResourceSummary(page);
    const atCountdownNetwork=network.snapshot();
    const firstRun=await observeRunOutcome(page);

    const warmRestarts=[];
    for(let index=0;index<RESTARTS;index++){
      const beforeResources=await glbResourceSummary(page);
      const beforeNetwork=network.snapshot();
      const beforeHeap=await heapBytes(page);
      const restarted=await restartAfterTeardown(page);
      const afterResources=await glbResourceSummary(page);
      const afterNetwork=network.snapshot();
      const lifecycle=await observeRunOutcome(page);
      warmRestarts.push({
        iteration:index+1,
        blockingMs:restarted.blockingMs,
        loadedAtCountdown:Number(restarted.countdown?.startCrowdLoadedCount)||0,
        modelSourcesAtCountdown:Number(restarted.countdown?.startCrowdModelSources)||0,
        frameTiming:restarted.frameTiming,
        maxLoadedBeforeOutcome:lifecycle.maxLoaded,
        maxSourcesBeforeOutcome:lifecycle.maxSources,
        naturalRelease:lifecycle.naturalRelease,
        heapBefore:beforeHeap,
        heapAfterCountdown:await heapBytes(page),
        newGlbResourceEntries:afterResources.entries-beforeResources.entries,
        newGlbRequests:afterNetwork.requestCount-beforeNetwork.requestCount,
        newFailedGlbRequests:afterNetwork.failedCount-beforeNetwork.failedCount,
        rendererGeometries:Number(restarted.countdown?.rendererGeometries)||null,
        rendererTextures:Number(restarted.countdown?.rendererTextures)||null,
        progressivePaused:restarted.countdown?.startCrowdProgressivePaused===true,
        cacheStats:restarted.countdown?.startCrowdCacheStats||null,
        releasedBeforeRestart:restarted.releasedBeforeRestart,
        restartFrom:restarted.restartFrom
      });
    }

    return {
      initialCrowdCount:Number(ready.startCrowdCount),
      cold:{
        blockingMs:cold.blockingMs,
        loadedAtCountdown:Number(cold.countdown?.startCrowdLoadedCount)||0,
        modelSourcesAtCountdown:Number(cold.countdown?.startCrowdModelSources)||0,
        frameTiming:cold.frameTiming,
        maxLoadedBeforeOutcome:firstRun.maxLoaded,
        maxSourcesBeforeOutcome:firstRun.maxSources,
        naturalRelease:firstRun.naturalRelease,
        outcomeMode:firstRun.mode,
        glbResourceEntriesAtCountdown:atCountdownResources.entries-beforeStartResources.entries,
        glbRequestsAtCountdown:atCountdownNetwork.requestCount-beforeStartNetwork.requestCount,
        progressivePaused:cold.countdown?.startCrowdProgressivePaused===true,
        cacheStats:cold.countdown?.startCrowdCacheStats||null
      },
      warmRestarts,
      network:network.snapshot(),
      resources:await glbResourceSummary(page),
      heapAfter:await heapBytes(page)
    };
  }finally{
    await context.close();
  }
}

const report={
  schemaVersion:2,
  target:TARGET,
  startedAt:new Date().toISOString(),
  productionCrowdExpected:PRODUCTION_COUNT,
  coldFullPreparation:null,
  startLifecycle:null,
  limitations:[
    'performance.memory is Chromium-specific and may be null depending on launch/runtime settings.',
    'Resource Timing transferSize may be zero for memory/disk-cache responses; encodedBodySize is reported separately.',
    'Renderer memory counters are aggregate game totals, not crowd-exclusive GPU allocations.'
  ]
};

let coldBrowser;
let lifecycleBrowser;
try{
  coldBrowser=await chromium.launch({headless:true});
  report.coldFullPreparation=await coldFullPreparation(coldBrowser);
  console.log('COLD_FULL '+JSON.stringify({
    completed:report.coldFullPreparation.completed,
    wallMs:report.coldFullPreparation.wallMs,
    loadedCount:report.coldFullPreparation.loadedCount,
    modelSourceCount:report.coldFullPreparation.modelSourceCount,
    glbRequests:report.coldFullPreparation.network.requestCount,
    failedGlbRequests:report.coldFullPreparation.network.failedCount,
    transferBytes:report.coldFullPreparation.resources.transferBytes,
    encodedBytes:report.coldFullPreparation.resources.encodedBytes,
    heapBefore:report.coldFullPreparation.heapBefore,
    heapAfter:report.coldFullPreparation.heapAfter,
    rendererGeometries:report.coldFullPreparation.rendererGeometries,
    rendererTextures:report.coldFullPreparation.rendererTextures,
    frameTiming:report.coldFullPreparation.frameTiming
  }));
  await coldBrowser.close();
  coldBrowser=null;

  lifecycleBrowser=await chromium.launch({headless:true});
  report.startLifecycle=await coldStartAndWarmRestarts(lifecycleBrowser);
  report.finishedAt=new Date().toISOString();
  report.summary={
    productionCrowdCount:report.coldFullPreparation.initialCrowdCount,
    fullPreparationCompleted:report.coldFullPreparation.completed,
    fullPreparationMs:report.coldFullPreparation.wallMs,
    fullLoadedCount:report.coldFullPreparation.loadedCount,
    fullModelSourceCount:report.coldFullPreparation.modelSourceCount,
    fullGlbRequests:report.coldFullPreparation.network.requestCount,
    fullGlbTransferBytes:report.coldFullPreparation.resources.transferBytes,
    coldStartBlockingMs:report.startLifecycle.cold.blockingMs,
    coldLoadedAtCountdown:report.startLifecycle.cold.loadedAtCountdown,
    warmRestartBlockingMs:report.startLifecycle.warmRestarts.map(item=>item.blockingMs),
    warmRestartNewGlbRequests:report.startLifecycle.warmRestarts.map(item=>item.newGlbRequests)
  };

  console.log(JSON.stringify(report.summary,null,2));
  if(OUTPUT){
    await mkdir(path.dirname(OUTPUT),{recursive:true});
    await writeFile(OUTPUT,JSON.stringify(report,null,2)+'\n');
  }

  if(report.coldFullPreparation.initialCrowdCount!==PRODUCTION_COUNT)process.exitCode=1;
  if(STRICT_FULL&&!report.coldFullPreparation.completed)process.exitCode=1;
  if(STRICT_FULL&&report.coldFullPreparation.loadedCount!==PRODUCTION_COUNT)process.exitCode=1;
  if(report.coldFullPreparation.modelSourceCount!==PRODUCTION_COUNT)process.exitCode=1;
  if(report.coldFullPreparation.network.failedCount>0)process.exitCode=1;
  if(!report.startLifecycle.cold.progressivePaused)process.exitCode=1;
  if(report.startLifecycle.warmRestarts.some(item=>!item.releasedBeforeRestart||item.newFailedGlbRequests>0||!item.progressivePaused))process.exitCode=1;
}finally{
  if(coldBrowser)await coldBrowser.close().catch(()=>{});
  if(lifecycleBrowser)await lifecycleBrowser.close().catch(()=>{});
}
