import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

const TARGET=process.env.CHIMPIONS_SKI_BENCHMARK_URL||'http://127.0.0.1:4173/';
const OUTPUT=process.env.CHIMPIONS_SKI_CROWD_BENCHMARK_JSON||'';
const TIMEOUT=Number(process.env.CHIMPIONS_SKI_CROWD_TIMEOUT_MS)||60000;
const RESTARTS=Math.max(1,Number(process.env.CHIMPIONS_SKI_CROWD_RESTARTS)||3);

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function diagnostics(page){
  return page.evaluate(()=>window.chimpionsSki?.()||null);
}

async function waitDiag(page,predicate,timeout=TIMEOUT){
  const started=Date.now();
  while(Date.now()-started<timeout){
    const value=await diagnostics(page);
    if(value&&predicate(value))return value;
    await sleep(40);
  }
  return diagnostics(page);
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
          p95Ms:sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))]||0,
          maxMs:Math.max(0,...samples)
        });
      }else requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }),durationMs);
}

async function chooseCurrentAvatarAndSki(page){
  await page.locator('#chimpion-selector[open]').waitFor({state:'visible',timeout:10000});
  const selected=page.locator('.chimpion-card.is-selected').first();
  const card=(await selected.count())?selected:page.locator('.chimpion-card').first();
  await card.click();
  await page.locator('#ride-mode-step:not([hidden])').waitFor({state:'visible',timeout:5000});
  const started=performance.now();
  await page.locator('[data-ride-mode="ski"]').click();
  const countdown=await waitDiag(page,d=>d.mode==='countdown',10000);
  return {blockingMs:performance.now()-started,countdown};
}

async function restartAfterRelease(page){
  const released=await waitDiag(page,d=>d.mode==='playing'&&d.startCrowdReleased===true,10000);
  if(!released?.startCrowdReleased)throw new Error(Crowd did not release before warm restart probe');
  await page.keyboard.press('Escape');
  await page.locator('#pause-overlay:not([hidden]))').waitFor({state:'visible',timeout:3000});
  const started=performance.now();
  await page.locator('#restart-pause').click();
  const countdown=await waitDiag(page,d=>d.mode==='countdown'&&d.startCrowdReleased===false,10000);
  return {blockingMs:performance.now()-started,countdown};
}

const report={
  target:TARGET,
  startedAt:new Date().toISOString(),
  productionCrowdCount:null,
  cold:{},
  warmRestarts:[],
  network:{},
  limitations:[
    'Runtime parsed-template cache hit/parse counters are not exposed through window.chimpionsSki; add the documented optional diagnostics hook to capture them directly.',
    'performance.memory is Chromium-specific and may be null depending on launch/runtime settings.',
    'Resource Timing transferSize may be zero for memory/disk-cache responses; encodedBodySize is reported separately.'
  ]
};

let browser;
try{
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext();
  const page=await context.newPage();
  await page.goto(TARGET,{waitUntil:'domcontentloaded',timeout:TIMEOUT});
  const ready=await waitDiag(page,d=>d.ready===true&&Number(d.catalogSize)>0,20000);
  if(!ready?.ready)throw new Error('Game did not become ready');
  if(Number(ready.startCrowdCount)!==50)throw new Error(`Expected production crowd count 50, got ${ready.startCrowdCount}`);
  report.productionCrowdCount=Number(ready.startCrowdCount);
  report.cold.before={
    diagnostics:ready,
    heapBytes:await heapBytes(page),
    resources:await glbResourceSummary(page)
  };

  const startClick=performance.now();
  await page.locator('.start-screen-play').click();
  const selection=await chooseCurrentAvatarAndSki(page);
  report.cold.startBlockingMs=selection.blockingMs;
  report.cold.fromStartButtonToCountdownMs=performance.now()-startClick;
  report.cold.countdown=selection.countdown;
  report.cold.frameTiming=await sampleFrames(page,1000);

  const critical=await waitDiag(page,d=>Number(d.startCrowdLoadedCount)>=10||d.mode==='playing',10000);
  report.cold.criticalLoadedCount=Number(critical?.startCrowdLoadedCount||0);
  report.cold.criticalReadyObserved=report.cold.criticalLoadedCount>=10;

  const firstRelease=await waitDiag(page,d=>d.mode==='playing'&&d.startCrowdReleased===true,12000);
  report.cold.atRelease={
    diagnostics:firstRelease,
    heapBytes:await heapBytes(page),
    resources:await glbResourceSummary(page)
  };

  for(let index=0;index<RESTARTS;index++){
    const beforeResources=await glbResourceSummary(page);
    const beforeHeap=await heapBytes(page);
    const restarted=await restartAfterRelease(page);
    const afterCountdownResources=await glbResourceSummary(page);
    const afterCountdownHeap=await heapBytes(page);
    const playing=await waitDiag(page,d=>d.mode==='playing',7000);
    await waitDiag(page,d=>d.mode==='playing'&&d.startCrowdReleased===true,10000);
    report.warmRestarts.push({
      iteration:index+1,
      blockingMs:restarted.blockingMs,
      loadedAtCountdown:Number(restarted.countdown?.startCrowdLoadedCount||0),
      rendererGeometries:Number(restarted.countdown?.rendererGeometries||0),
      rendererTextures:Number(restarted.countdown?.rendererTextures||0),
      heapBefore:beforeHeap,
      heapAfterCountdown:afterCountdownHeap,
      newGlbResourceEntries:afterCountdownResources.entries-beforeResources.entries,
      newUniqueGlbUrls:afterCountdownResources.uniqueUrls-beforeResources.uniqueUrls,
      playingRendererGeometries:Number(playing?.rendererGeometries||0),
      playingRendererTextures:Number(playing?.rendererTextures||0)
    });
  }

  report.network=await glbResourceSummary(page);
  report.finishedAt=new Date().toISOString();
  report.summary={
    productionCrowdCount:report.productionCrowdCount,
    coldStartBlockingMs:report.cold.startBlockingMs,
    coldLoadedBeforeRelease:Number(report.cold.atRelease?.diagnostics?.startCrowdLoadedCount||0),
    glbResourceEntries:report.network.entries,
    uniqueGlbUrls:report.network.uniqueUrls,
    duplicateGlbEntries:report.network.duplicateEntries,
    warmRestartBlockingMs:report.warmRestarts.map(item=>item.blockingMs)
  };

  console.log(JSON.stringify(report.summary,null,2));
  if(OUTPUT){
    await mkdir(path.dirname(OUTPUT),{recursive:true});
    await writeFile(OUTPUT,JSON.stringify(report,null,2)+'\n');
  }
}finally{
  if(browser)await browser.close();
}
