import {writeFile} from 'node:fs/promises';
import {CONFIG,attachFrameProbe,benchmarkTargetUrl,createNetworkTracker,frameMark,frameSummarySince,importPlaywright,pending,runtimeSnapshot,waitUntilReady} from './benchmark/core.mjs';
import {benchmarkRepeatedSelector,benchmarkSearch,closeSelector,openSelector,selectorDomMetrics} from './benchmark/selector.mjs';
import {benchmarkGameplay,benchmarkRestarts,benchmarkRideMode,benchmarkTricks,heapDelta,modeComparison} from './benchmark/gameplay.mjs';

async function main(){
  const playwright=await importPlaywright();
  if(!playwright)return;
  const {chromium}=playwright;
  const results={
    schemaVersion:1,
    generatedAt:new Date().toISOString(),
    target:{baseUrl:CONFIG.baseUrl,benchmarkUrl:benchmarkTargetUrl(),mode:CONFIG.targetMode,qualityProfile:CONFIG.qualityProfile||'runtime-default'},
    config:CONFIG,
    phases:{},
    memory:{snapshots:{}},
    selector:{},
    network:null,
    futureComparisons:{},
    warnings:[]
  };
  let browser=null;
  let tracker=null;
  const portraitUrls=new Set();

  try{
    browser=await chromium.launch({headless:CONFIG.headless});
    const context=await browser.newContext({viewport:{width:CONFIG.viewportWidth,height:CONFIG.viewportHeight}});
    const page=await context.newPage();
    await attachFrameProbe(page);
    tracker=await createNetworkTracker(context,page);

    const navigationWall=Date.now();
    await page.goto(benchmarkTargetUrl(),{waitUntil:'domcontentloaded',timeout:CONFIG.readyTimeoutMs});
    await waitUntilReady(page);
    const initialFrames=await frameSummarySince(page,0);
    const nav=await page.evaluate(()=>{
      const entry=performance.getEntriesByType('navigation')[0];
      return entry?{
        type:entry.type,
        duration:entry.duration,
        domContentLoadedEventEnd:entry.domContentLoadedEventEnd,
        loadEventEnd:entry.loadEventEnd,
        responseStart:entry.responseStart,
        transferSize:entry.transferSize,
        encodedBodySize:entry.encodedBodySize,
        decodedBodySize:entry.decodedBodySize
      }:null;
    });
    results.phases.A_initialPageLoad={status:'PASS',wallToReadyMs:Date.now()-navigationWall,navigation:nav,frames:initialFrames};
    results.memory.snapshots.startup=await runtimeSnapshot(page,'startup');

    const idleMark=await frameMark(page);
    if(CONFIG.idleSeconds>0)await page.waitForTimeout(CONFIG.idleSeconds*1000);
    results.phases.B_startScreenIdle={status:'PASS',seconds:CONFIG.idleSeconds,frames:await frameSummarySince(page,idleMark),snapshot:await runtimeSnapshot(page,'start-screen-idle')};

    const selectorOpen=await openSelector(page);
    results.phases.C_characterSelectorOpening=selectorOpen;
    if(selectorOpen.status==='PASS'){
      for(const url of selectorOpen.imageUrls||[])portraitUrls.add(url);
      results.selector.open={cards:selectorOpen.cards,images:selectorOpen.images,selectorDomNodes:selectorOpen.selectorDomNodes,openTimeMs:selectorOpen.openTimeMs};
      results.phases.D_avatarSearchFilter={status:'PASS',searches:await benchmarkSearch(page,CONFIG.searchTerms)};
      const selectorAfterSearch=await selectorDomMetrics(page);
      for(const url of selectorAfterSearch.imageUrls||[])portraitUrls.add(url);
      results.memory.snapshots.afterSelector=await runtimeSnapshot(page,'after-selector');
      results.selector.afterSearch=selectorAfterSearch;
      await closeSelector(page);
    }else{
      results.phases.D_avatarSearchFilter=pending('Selector did not open');
      results.memory.snapshots.afterSelector=await runtimeSnapshot(page,'after-selector-unavailable');
    }

    results.phases.H_repeatedSelectorOpenClose=await benchmarkRepeatedSelector(page,CONFIG.selectorIterations,portraitUrls);

    results.phases.E_gameplayFirst30Seconds=await benchmarkGameplay(page,CONFIG.gameplaySeconds,{label:'gameplay-first-window'});
    results.memory.snapshots.afterOneRun=await runtimeSnapshot(page,'after-one-run');

    results.phases.G_repeatedRestart=await benchmarkRestarts(page,CONFIG.restartIterations);
    results.memory.snapshots.afterRepeatedRestarts=await runtimeSnapshot(page,'after-repeated-restarts');

    if(CONFIG.longRunSeconds>0){
      const longBefore=await runtimeSnapshot(page,'long-run-before');
      results.phases.F_extendedGameplay=await benchmarkGameplay(page,CONFIG.longRunSeconds,{label:'extended-gameplay'});
      const longAfter=await runtimeSnapshot(page,'long-run-after');
      results.memory.snapshots.afterLongRun=longAfter;
      results.memory.longRunHeapDeltaBytes=heapDelta(longBefore,longAfter);
      results.memory.longRunDomDelta=(longAfter.domNodes??0)-(longBefore.domNodes??0);
    }else{
      results.phases.F_extendedGameplay=pending('LONG_RUN_SECONDS=0');
      results.memory.snapshots.afterLongRun=await runtimeSnapshot(page,'long-run-skipped');
      results.memory.longRunHeapDeltaBytes=null;
    }

    results.phases.I_skiMode=await benchmarkRideMode(page,'ski');
    results.phases.J_snowboardMode=await benchmarkRideMode(page,'snowboard');
    results.futureComparisons.skiVsSnowboard=modeComparison(results.phases.I_skiMode,results.phases.J_snowboardMode);

    results.phases.K_trickHeavy=await benchmarkTricks(page);
    if(results.phases.K_trickHeavy.status==='PASS'&&results.phases.E_gameplayFirst30Seconds.status==='PASS'){
      results.futureComparisons.trickVsBaseline={
        status:'PASS',
        baselineAverageFps:results.phases.E_gameplayFirst30Seconds.frames?.averageFps,
        trickAverageFps:results.phases.K_trickHeavy.frames?.averageFps,
        baselineP95FrameMs:results.phases.E_gameplayFirst30Seconds.frames?.p95FrameMs,
        trickP95FrameMs:results.phases.K_trickHeavy.frames?.p95FrameMs,
        domDelta:(results.phases.K_trickHeavy.after?.domNodes??0)-(results.phases.K_trickHeavy.before?.domNodes??0),
        heapDeltaBytes:heapDelta(results.phases.K_trickHeavy.before,results.phases.K_trickHeavy.after)
      };
    }else results.futureComparisons.trickVsBaseline=pending('Trick-heavy phase is not available on this runtime');

    results.memory.heapMetricsAvailable=!!results.memory.snapshots.startup?.memory;
    results.memory.note=results.memory.heapMetricsAvailable?'performance.memory captured where Chromium exposes it':'performance.memory unavailable; this is not considered a benchmark failure';

    results.network=tracker.summarize(portraitUrls);
    if(results.network.musicFullMp3.status==='FAIL')results.warnings.push('Forbidden chimp-jump.onrender.com/audio/music-full.mp3 runtime dependency detected.');
    for(const [phaseName,phase] of Object.entries(results.phases)){
      const course=phase?.course;
      if(!course)continue;
      for(const [metric,analysis] of Object.entries(course)){
        if(analysis?.suspiciousMonotonicGrowth)results.warnings.push(`${phaseName}: suspicious monotonic growth in ${metric}`);
      }
    }
  }catch(error){
    results.fatal={message:String(error?.message||error),stack:error?.stack||null};
    process.exitCode=1;
  }finally{
    if(tracker){
      if(!results.network)results.network=tracker.summarize(portraitUrls);
      await tracker.stop();
    }
    if(browser)await browser.close();
    results.completedAt=new Date().toISOString();
    if(CONFIG.writeResults)await writeFile(CONFIG.resultsPath,JSON.stringify(results,null,2)+'\n','utf8');
    console.log(JSON.stringify({
      status:results.fatal?'FAIL':'COMPLETE',
      baseUrl:CONFIG.baseUrl,
      targetMode:CONFIG.targetMode,
      resultsPath:CONFIG.writeResults?CONFIG.resultsPath:null,
      phases:Object.fromEntries(Object.entries(results.phases).map(([key,value])=>[key,value?.status||'UNKNOWN'])),
      warnings:results.warnings,
      fatal:results.fatal?.message||null
    },null,2));
  }
}

await main();
