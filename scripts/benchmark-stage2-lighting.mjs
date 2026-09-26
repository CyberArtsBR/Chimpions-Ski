import {writeFile} from 'node:fs/promises';
import process from 'node:process';
import {
  CONFIG,
  attachFrameProbe,
  benchmarkTargetUrl,
  importPlaywright,
  runtimeSnapshot,
  waitUntilReady
} from './benchmark/core.mjs';
import {benchmarkGameplay} from './benchmark/gameplay.mjs';

const screenshotPath=process.env.SCREENSHOT_PATH||'';
const label=process.env.BENCH_LABEL||CONFIG.qualityProfile||'stage2';

async function main(){
  const playwright=await importPlaywright();
  if(!playwright)return;
  const {chromium}=playwright;
  const results={
    schemaVersion:1,
    benchmark:'stage2-lighting-focused',
    generatedAt:new Date().toISOString(),
    label,
    target:{
      baseUrl:CONFIG.baseUrl,
      benchmarkUrl:benchmarkTargetUrl(),
      mode:CONFIG.targetMode,
      qualityProfile:CONFIG.qualityProfile||'runtime-default',
      viewport:[CONFIG.viewportWidth,CONFIG.viewportHeight]
    },
    config:CONFIG,
    before:null,
    gameplay:null,
    after:null,
    screenshot:screenshotPath||null,
    fatal:null
  };
  let browser=null;
  try{
    const softwareGl=process.env.BENCH_SOFTWARE_GL==='1';
    browser=await chromium.launch({
      headless:CONFIG.headless,
      args:softwareGl?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]
    });
    const context=await browser.newContext({viewport:{width:CONFIG.viewportWidth,height:CONFIG.viewportHeight}});
    const page=await context.newPage();
    await attachFrameProbe(page);
    await page.goto(benchmarkTargetUrl(),{waitUntil:'domcontentloaded',timeout:CONFIG.readyTimeoutMs});
    await waitUntilReady(page);
    results.before=await runtimeSnapshot(page,'stage2-before-gameplay');
    results.gameplay=await benchmarkGameplay(page,CONFIG.gameplaySeconds,{label:'stage2-lighting-gameplay'});
    results.after=await runtimeSnapshot(page,'stage2-after-gameplay');
    if(screenshotPath){
      await page.screenshot({path:screenshotPath,fullPage:false});
    }
    if(results.gameplay?.status!=='PASS'){
      results.fatal={message:`Gameplay benchmark did not reach PASS: ${results.gameplay?.reason||results.gameplay?.status||'unknown'}`};
      process.exitCode=1;
    }
  }catch(error){
    results.fatal={message:String(error?.message||error),stack:error?.stack||null};
    process.exitCode=1;
  }finally{
    if(browser)await browser.close();
    results.completedAt=new Date().toISOString();
    if(CONFIG.writeResults)await writeFile(CONFIG.resultsPath,JSON.stringify(results,null,2)+'\n','utf8');
    console.log(JSON.stringify({
      status:results.fatal?'FAIL':'PASS',
      label,
      profile:results.target.qualityProfile,
      gameplay:results.gameplay?.status||null,
      ready:results.before?.diagnostics?.ready??null,
      renderCpuAverageMs:results.after?.diagnostics?.renderCpuAverageMs??null,
      renderCpuP95Ms:results.after?.diagnostics?.renderCpuP95Ms??null,
      gpuFrameAverageMs:results.after?.diagnostics?.gpuFrameAverageMs??null,
      gpuFrameP95Ms:results.after?.diagnostics?.gpuFrameP95Ms??null,
      shadowUpdates:results.after?.diagnostics?.shadowUpdates??null,
      shadowUpdateSkips:results.after?.diagnostics?.shadowUpdateSkips??null,
      fatal:results.fatal?.message||null
    },null,2));
  }
}

await main();
