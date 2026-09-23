import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

const TARGET=process.env.CHIMPIONS_SKI_BENCHMARK_URL||'http://127.0.0.1:4173/';
const OUTPUT=process.env.CHIMPIONS_SKI_CROWD_BENCHMARK_JSON||'';
const TIMEOUT=Number(process.env.CHIMPIONS_SKI_CROWD_TIMEOUT_MS)||60000;
const FULL_TIMEOUT=Number(process.env.CHIMPIONS_SKI_CROWD_FULL_TIMEOUT_MS)||120000;
const RESTARTS=Math.max(1,Number(process.env.CHIMPIONS_SKI_CROWD_RESTARTS)||3);
const PRODUCTION_COUNT=50;

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
  const framePromise=sampleFrames(page,1600);
  const started=performance.now();
  await page.locator('[data-ride-mode="ski"]').click();
  const countdown=await waitDiag(page,d=>d.mode==='countdown'||d.mode==='playing',10000);
  return {blockingMs:performance.now()-started,countdown,frameTiming:await framePromise};
}

async function observeUntilRelease(page,timeout=12000){
  const started=Date.now();
  let maxLoaded=0;
  let maxSources=0;
  let last=null;
  while(Date.now()-started<timeout){
    last=await diagnostics(page);
    maxLoaded=Math.max(maxLoaded,Number(last?.startCrowdLoadedCount)||0);
    maxSources=Math.max(maxSources,Number(last?.startCrowdModelSources)||0);
    if(last?.mode==='playing'&&last?.startCrowdReleased===true){
      return {released:true,maxLoaded,maxSources,last};
    }
    await sleep(40);
  }
  return {released:false,maxLoaded,maxSources,last};
}

async function restartAfterRelease(page){
  const released=await waitDiag(page,d=>d.mode==='playing'&&d.startCrowdReleased===true,10000);
  if(!released?.startCrowdReleased)throw new Error('Crowd did not release before warm restart probe');
  await page.keyboard.press('Escape');
  await page.locator('#pause-overlay:not([hidden])').waitFor({state:'visible',timeout:3000});
  const framePromise=sampleFrames(page,1400);
  const started=performance.now();
  await page.locator('#restart-pause').click();
  const countdown=await waitDiag(page,d=>(d.mode==='countdown'||d.mode==='playing')&&d.startCrowdReleased===false,10000);
  return {blockingMs:performance.now()-started,countdown,frameTiming:await framePromise};
}

async function coldFullPreparation(browser){
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await context.newPage();
  const network=attachGlbNetworkTracker(page);
  try{
    const ready=await boot(page);
    const heapBefore=await heapBytes(page);
    const started=performance.now();
    await openSelector(page);
    const framePromise=sampleFrames(page,2000);
    const full=await waitDiag(page,d=>Number(d.startCrowdLoadedCount)>=PRODUCTION_COUNT,FULL_TIMEOUT);
    const wallMs=performance.now()-started;
    const resources=await glbResourceSummary(page);
    const networkStats=network.snapshot();
    return {
      completed:Number(full?.startCrowdLoadedCount)>=PRODUCTION_COUNT,
      wallMs,
      initialCrowdCount:Number(ready.startCrowdCount),
      loadedCount:Number(full?.startCrowdLoadedCount)||0,
      modelSourceCount:Number(full?.startCrowdModelSources)||0,
      posedCount:Number(full?.startCrowdPosedCount)||0,
      frameTiming:await framePromise,
      heapBefore,
      heapAfter:await heapBytes(page),
      rendererGeometries:Number(full?.rendererGeometries)||null,
      rendererTextures:Number(full?.rendererTextures)||null,
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
    const firstRun=await observeUntilRelease(page);

    const warmRestarts=[];
    for(let index=0;index<RESTARTS;index++){
      const beforeResources=await glbResourceSummary(page);
      const beforeNetwork=network.snapshot();
      const beforeHeap=await heapBytes(page);
      const restarted=await restartAfterRelease(page);
      const afterResources=await glbResourceSummary(page);
      const afterNetwork=network.snapshot();
      const lifecycle=await observeUntilRelease(page);
      warmRestarts.push({
        iteration:index+1,
        blockingMs:restarted.blockingMs,
        loadedAtCountdown:Number(restarted.countdown?.startCrowdLoadedCount)||0,
        modelSourcesAtCountdown:Number(restarted.countdown?.startCrowdModelSources)||0,
        frameTiming:restarted.frameTiming,
        maxLoadedBeforeRelease:lifecycle.maxLoaded,
        maxSourcesBeforeRelease:lifecycle.maxSources,
        released:lifecycle.released,
        heapBefore:beforeHeap,
        heapAfterCountdown:await heapBytes(page),
        newGlbResourceEntries:afterResources.entries-beforeResources.entries,
        newGlbRequests:afterNetwork.requestCount-beforeNetwork.requestCount,
        newFailedGlbRequests:afterNetwork.failedCount-beforeNetwork.failedCount,
        rendererGeometries:Number(restarted.countdown?.rendererGeometries)||null,
        rendererTextures:Number(restarted.countdown?.rendererTextures)||null
      });
    }

    return {
      initialCrowdCount:Number(ready.startCrowdCount),
      cold:{
        blockingMs:cold.blockingMs,
        loadedAtCountdown:Number(cold.countdown?.startCrowdLoadedCount)||0,
        modelSourcesAtCountdown:Number(cold.countdown?.startCrowdModelSources)||0,
        frameTiming:cold.frameTiming,
        maxLoadedBeforeRelease:firstRun.maxLoaded,
        maxSourcesBeforeRelease:firstRun.maxSources,
        released:firstRun.released,
        glbResourceEntriesAtCountdown:atCountdownResources.entries-beforeStartResources.entries,
        glbRequestsAtCountdown:atCountdownNetwork.requestCount-beforeStartNetwork.requestCount
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
    'Runtime parsed-template cache hit/parse counters are not exposed through window.chimpionsSki; the benchmark infers duplicate-download behavior from Playwright request events and Resource Timing.',
    'performance.memory is Chromium-specific and may be null depending on launch/runtime settings.',
    'Resource Timing transferSize may be zero for memory/disk-cache responses; encodedBodySize is reported separately.',
    'Renderer memory counters are aggregate game totals, not crowd-exclusive GPU allocations.'
  ]
};

let browser;
try{
  browser=await chromium.launch({headless:true});
  report.coldFullPreparation=await coldFullPreparation(browser);
  report.startLifecycle=await coldStartAndWarmRestarts(browser);
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
  if(!report.coldFullPreparation.completed)process.exitCode=1;
  if(report.coldFullPreparation.loadedCount!==PRODUCTION_COUNT)process.exitCode=1;
  if(report.coldFullPreparation.modelSourceCount!==PRODUCTION_COUNT)process.exitCode=1;
  if(report.coldFullPreparation.network.failedCount>0)process.exitCode=1;
  if(!report.startLifecycle.cold.released)process.exitCode=1;
  if(report.startLifecycle.warmRestarts.some(item=>!item.released||item.newFailedGlbRequests>0))process.exitCode=1;
}finally{
  if(browser)await browser.close().catch(()=>{});
}
