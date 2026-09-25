import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium,firefox,webkit} from '@playwright/test';

const base=process.env.BASE_URL||'http://127.0.0.1:4173';
const browserName=String(process.env.AAA_BROWSER||'chromium').toLowerCase();
const browserType={chromium,firefox,webkit}[browserName]||chromium;
const soakSeconds=Math.max(5,Number(process.env.AAA_SOAK_SECONDS||20));
const artifactDir=resolve(process.cwd(),process.env.AAA_ARTIFACT_DIR||'artifacts/qa',browserName);
await mkdir(artifactDir,{recursive:true});
const report={schemaVersion:1,browser:browserName,base,soakSeconds,status:'PASS',quality:{},screenshots:[],avatarMatrix:[],samples:[],restart:[],qualitySwitch:[],notTestableInCi:[],errors:[]};
const builtinAvatars=JSON.parse(await readFile(resolve(process.cwd(),'public/avatars.json'),'utf8'));
const browserErrors=[];
const launchOptions={headless:true};
if(browserName==='chromium')launchOptions.args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'];
const browser=await browserType.launch(launchOptions);
// Keep software-rendered CI screenshots bounded. Runtime quality contracts are
// asserted from diagnostics/settings; visual checkpoints do not need 5.2MP
// 2x-DPR readbacks to catch black screens, missing world/rider/equipment, etc.
const context=await browser.newContext({viewport:{width:1100,height:700},deviceScaleFactor:1});
await context.addInitScript(()=>localStorage.setItem('chimpions-ski-tutorial-seen-v2','1'));

function diagnostics(page){return page.evaluate(()=>window.chimpionsSki?.()||null);}
async function readyPage(query=''){
  const page=await context.newPage();
  page.setDefaultTimeout(60000);
  page.on('pageerror',e=>browserErrors.push('PAGEERROR '+String(e?.stack||e)));
  page.on('console',m=>{if(m.type()==='error')browserErrors.push('CONSOLE '+m.text());});
  await page.goto(base+'/'+query,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.chimpionsSki?.().ready===true,null,{timeout:60000});
  return page;
}
async function shot(page,label){
  const file=resolve(artifactDir,label+'.png');
  const buffer=await page.screenshot({path:file,fullPage:false,timeout:60000});
  assert(buffer.length>4000,`${label} screenshot is suspiciously small (${buffer.length} bytes)`);
  const canvas=page.locator('canvas').first();
  if(await canvas.count()){
    const box=await canvas.boundingBox();assert(box&&box.width>100&&box.height>100,`${label} WebGL canvas has invalid bounds`);
  }
  report.screenshots.push({label,file,bytes:buffer.length});
}
async function dismissTutorial(page){
  const tutorial=page.locator('.session-tutorial:not([hidden])');
  if(await tutorial.isVisible().catch(()=>false)){await page.keyboard.press('Enter');await tutorial.waitFor({state:'hidden',timeout:5000}).catch(()=>{});}
}
async function startRun(page,ride='ski'){
  const start=page.getByRole('button',{name:/start game/i});await start.waitFor({state:'visible',timeout:10000});await start.evaluate(el=>el.click());
  const selector=page.locator('#chimpion-selector');await selector.waitFor({state:'visible',timeout:10000});
  const card=selector.locator('.chimpion-card:not(.is-upload-avatar):not([aria-disabled="true"])').first();await card.waitFor({state:'visible',timeout:10000});await card.evaluate(el=>el.click());
  const rideButton=selector.locator(`.ride-mode-card[data-ride-mode="${ride}"]`);await rideButton.waitFor({state:'visible',timeout:10000});await rideButton.evaluate(el=>el.click());
  await selector.waitFor({state:'hidden',timeout:60000});
  await page.waitForFunction(()=>{
    const tutorial=document.querySelector('.session-tutorial:not([hidden])');
    const mode=window.chimpionsSki?.().mode;
    return !!tutorial||mode==='countdown'||mode==='playing';
  },null,{timeout:15000});
  await dismissTutorial(page);
  await page.waitForFunction(()=>window.chimpionsSki?.().mode==='playing',null,{timeout:30000});
}
async function ensurePlaying(page){
  let mode=(await diagnostics(page))?.mode;
  if(mode==='playing')return;
  if(mode==='paused'){
    const resume=page.locator('#resume-game');if(await resume.isVisible().catch(()=>false))await resume.evaluate(el=>el.click());
  }else if(mode==='crashed'){
    await page.keyboard.press('Enter');
    await page.locator('#result-overlay').waitFor({state:'visible',timeout:5000}).catch(()=>{});
    const restart=page.locator('#restart-result');if(await restart.isVisible().catch(()=>false))await restart.evaluate(el=>el.click());
  }else if(mode==='results'){
    const restart=page.locator('#restart-result');if(await restart.isVisible().catch(()=>false))await restart.evaluate(el=>el.click());
  }
  await dismissTutorial(page);
  await page.waitForFunction(()=>['playing','countdown'].includes(window.chimpionsSki?.().mode),null,{timeout:10000}).catch(()=>{});
  await page.waitForFunction(()=>window.chimpionsSki?.().mode==='playing',null,{timeout:60000});
}
function resourceRange(samples,key){const values=samples.map(s=>Number(s[key])).filter(Number.isFinite);return values.length?Math.max(...values)-Math.min(...values):0;}
function snapshotWithMemory(page){return page.evaluate(()=>{const d=window.chimpionsSki?.()||{};const memory=performance.memory?{usedJSHeapSize:performance.memory.usedJSHeapSize,totalJSHeapSize:performance.memory.totalJSHeapSize}:null;return {...d,memory,domNodes:document.getElementsByTagName('*').length};});}
function assertRuntimeHealth(s,label){
  assert(s&&s.ready,`${label}: runtime not ready`);assert((s.rendererCalls||0)>0,`${label}: renderer has no draw calls`);assert((s.rendererTriangles||0)>0,`${label}: renderer has no triangles`);
  assert.equal(s.courseBatchOverflow,0,`${label}: course batch overflow can create invisible collidable hazards`);
  if((s.courseLegacyDrawCallsEstimate||0)>0)assert((s.courseDrawCallsEstimate||0)<=s.courseLegacyDrawCallsEstimate,`${label}: batching costs more draw calls than legacy estimate`);
}
async function probeBuiltinAvatar(entry,ride){
  const page=await readyPage(`?test=1&seed=qa-avatar-${entry.id}-${ride}&quality=low`);
  try{
    await page.getByRole('button',{name:/start game/i}).evaluate(el=>el.click());
    const selector=page.locator('#chimpion-selector');
    await selector.waitFor({state:'visible',timeout:10000});
    const card=selector.locator(`.chimpion-card[data-avatar-id="${entry.id}"]`);
    await card.waitFor({state:'visible',timeout:10000});
    await card.evaluate(el=>el.click());
    const rideButton=selector.locator(`.ride-mode-card[data-ride-mode="${ride}"]`);
    await rideButton.waitFor({state:'visible',timeout:10000});
    await rideButton.evaluate(el=>el.click());
    await selector.waitFor({state:'hidden',timeout:60000});
    const expectedEquipment=ride==='snowboard'?'snowboard':'skis';
    const expectedPose=ride==='snowboard'?'snowboard-side-stance':'ski-a-pose';
    await page.waitForFunction(
      ({equipment,pose})=>{
        const d=window.chimpionsSki?.();
        return !!(d?.ready&&d.riderAttached&&!d.skierFallback&&d.rigReady&&d.equipmentType===equipment&&d.poseMode===pose);
      },
      {equipment:expectedEquipment,pose:expectedPose},
      {timeout:60000}
    );
    const selectedName=(await page.locator('#selected-avatar-name').textContent())?.trim();
    assert.equal(selectedName,entry.name,`${entry.name} ${ride}: selected-avatar presentation drifted`);
    await page.waitForTimeout(120);
    const d=await snapshotWithMemory(page);
    assert.equal(d.equipmentType,expectedEquipment,`${entry.name} ${ride}: wrong equipment`);
    assert.equal(d.poseMode,expectedPose,`${entry.name} ${ride}: animation/pose mode did not initialize`);
    assert.equal(d.skierFallback,false,`${entry.name} ${ride}: unexpectedly fell back to procedural rider`);
    assert.equal(d.rigReady,true,`${entry.name} ${ride}: gameplay rig was not ready`);
    report.avatarMatrix.push({name:entry.name,id:entry.id,ride,equipmentType:d.equipmentType,poseMode:d.poseMode,rigReady:d.rigReady,rendererGeometries:d.rendererGeometries,rendererTextures:d.rendererTextures});
  }finally{
    await page.close();
  }
}

try{
  for(const profile of ['auto','max','high','medium','low']){
    const page=await readyPage(`?test=1&seed=qa-quality-${profile}&quality=${profile}`);
    const d=await diagnostics(page);report.quality[profile]=d;
    if(profile!=='auto'){assert.equal(d.qualityMode,profile);assert.equal(d.activeQualityProfile,profile);}
    await shot(page,'start-'+profile);await page.close();
  }
  assert(report.quality.max.qualitySettings.dprCap>report.quality.high.qualitySettings.dprCap,'MAX must expose more DPR headroom than HIGH');
  assert(report.quality.low.qualitySettings.dprCap<report.quality.high.qualitySettings.dprCap,'LOW must be cheaper than HIGH');
  assert(report.quality.low.rendererPixelRatio<report.quality.max.rendererPixelRatio,'LOW effective renderer DPR must be below MAX at the CI device scale factor');

  for(const entry of builtinAvatars){
    await probeBuiltinAvatar(entry,'ski');
    await probeBuiltinAvatar(entry,'snowboard');
  }
  assert.equal(report.avatarMatrix.length,builtinAvatars.length*2,'all built-in Chimpions must load in both ride modes');

  const page=await readyPage('?test=1&seed=qa-runtime-fixed&quality=high');
  await startRun(page,'ski');
  let d=await snapshotWithMemory(page);assert.equal(d.rideMode,'ski');assert.equal(Math.round(d.baseSpeed*3.6),150);assert.equal(Math.round(d.maxSpeed*3.6),300);assertRuntimeHealth(d,'ski start');
  await shot(page,'ski-neutral');
  await page.keyboard.down('a');await page.waitForTimeout(650);await page.keyboard.up('a');await shot(page,'ski-left-carve');
  await page.keyboard.down('d');await page.waitForTimeout(650);await page.keyboard.up('d');await shot(page,'ski-right-carve');
  await page.keyboard.down('Space');await page.waitForTimeout(80);await page.keyboard.up('Space');await page.waitForTimeout(180);await shot(page,'manual-jump');

  for(const viewport of [{width:1920,height:1080,label:'desktop-wide'},{width:1024,height:640,label:'desktop-small'},{width:430,height:932,label:'mobile-portrait'},{width:932,height:430,label:'mobile-landscape'}]){
    await page.setViewportSize({width:viewport.width,height:viewport.height});
    const hud=page.locator('.hud');const box=await hud.boundingBox();assert(box&&box.x>=-1&&box.y>=-1&&box.x+box.width<=viewport.width+1&&box.y+box.height<=viewport.height+1,`${viewport.label}: HUD clipped outside viewport`);
  }
  await page.setViewportSize({width:1100,height:700});

  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.waitForFunction(()=>window.chimpionsSki?.().mode==='paused',null,{timeout:5000});
  const pauseCard=page.locator('#pause-overlay .pause-card');assert(await pauseCard.isVisible(),'blur did not pause gameplay');
  await page.locator('#resume-game').evaluate(el=>el.click());await page.waitForFunction(()=>window.chimpionsSki?.().mode==='playing');

  const soakStart=Date.now();
  while(Date.now()-soakStart<soakSeconds*1000){
    await ensurePlaying(page);await page.waitForTimeout(1000);const sample=await snapshotWithMemory(page);if(sample.mode==='playing'){assertRuntimeHealth(sample,'soak');report.samples.push(sample);}
  }
  assert(report.samples.length>=Math.max(3,Math.min(soakSeconds-1,8)),'insufficient soak samples');
  assert(resourceRange(report.samples,'rendererGeometries')<=16,'renderer geometries grew excessively during soak');
  assert(resourceRange(report.samples,'rendererTextures')<=16,'renderer textures grew excessively during soak');

  for(let i=0;i<4;i++){
    await ensurePlaying(page);await page.keyboard.press('Escape');await page.locator('#pause-overlay').waitFor({state:'visible',timeout:5000});
    await page.locator('#restart-pause').evaluate(el=>el.click());await page.waitForFunction(()=>window.chimpionsSki?.().mode==='playing',null,{timeout:60000});
    const snap=await snapshotWithMemory(page);assert(snap.distance<160,`restart ${i}: distance was not reset`);assertRuntimeHealth(snap,`restart ${i}`);report.restart.push(snap);
  }
  assert(resourceRange(report.restart,'rendererGeometries')<=12,'restart soak leaked geometries');
  assert(resourceRange(report.restart,'rendererTextures')<=12,'restart soak leaked textures');

  await page.keyboard.press('Escape');await page.locator('#pause-overlay').waitFor({state:'visible',timeout:5000});await page.locator('#settings-pause').evaluate(el=>el.click());
  const qualityButton=page.locator('#quality-profile');await qualityButton.waitFor({state:'visible',timeout:5000});
  for(let i=0;i<20;i++){await qualityButton.evaluate(el=>el.click());await page.waitForTimeout(80);report.qualitySwitch.push(await snapshotWithMemory(page));}
  assert(resourceRange(report.qualitySwitch,'rendererGeometries')<=24,'quality switching leaked geometries');
  assert(resourceRange(report.qualitySwitch,'rendererTextures')<=24,'quality switching leaked textures');
  await page.locator('#settings-close').evaluate(el=>el.click());
  await page.close();

  const snowboardPage=await readyPage('?test=1&seed=qa-snowboard-fixed&quality=high');
  await startRun(snowboardPage,'snowboard');
  let snowboardDiag=await snapshotWithMemory(snowboardPage);
  assert.equal(snowboardDiag.rideMode,'snowboard');
  assert.equal(snowboardDiag.equipmentType,'snowboard');
  assert.equal(snowboardDiag.poseMode,'snowboard-side-stance');
  assertRuntimeHealth(snowboardDiag,'snowboard start');
  await shot(snowboardPage,'snowboard-neutral');
  await snowboardPage.keyboard.down('a');await snowboardPage.waitForTimeout(650);await snowboardPage.keyboard.up('a');await shot(snowboardPage,'snowboard-left-carve');
  await snowboardPage.keyboard.down('d');await snowboardPage.waitForTimeout(650);await snowboardPage.keyboard.up('d');await shot(snowboardPage,'snowboard-right-carve');
  await snowboardPage.close();

  report.notTestableInCi.push(
    'True Gamepad API/controller hardware behavior: browser automation cannot validate physical controller timing/haptics reliably.',
    'True tab visibility transitions: synthetic document.hidden is not equivalent to an OS/browser tab lifecycle.',
    'Forced WebGL context loss/restoration: no production test hook exists; dispatching a synthetic event would not validate driver/context recovery.',
    'Deterministic DAY/GOLDEN HOUR/NIGHT/RAIN/STORM browser screenshots: production runtime exposes no QA weather override hook; weather state is covered by deterministic Node soak instead.',
    'Deterministic ramp-jump/360/backflip screenshot timing: no production QA state-forcing hook exists; functional trick invariants remain covered by deterministic checks.'
  );
  report.browserErrors=browserErrors;
  assert.equal(browserErrors.length,0,'browser console/page errors: '+browserErrors.join('\n'));
  
}catch(error){report.status='FAIL';report.errors.push({message:String(error?.message||error),stack:error?.stack||null});process.exitCode=1;}
finally{
  await browser.close();report.completedAt=new Date().toISOString();
  await writeFile(resolve(artifactDir,'aaa-browser-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({check:'aaa-browser-regression',status:report.status,browser:browserName,soakSeconds,screenshots:report.screenshots.length,samples:report.samples.length,restarts:report.restart.length,qualitySwitches:report.qualitySwitch.length,avatarLoads:report.avatarMatrix.length,notTestableInCi:report.notTestableInCi,errors:report.errors},null,2));
}
