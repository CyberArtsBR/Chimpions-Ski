import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import path from 'node:path';

const base=process.env.BASE_URL||'http://127.0.0.1:4173';
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});

function trackHttpGlbs(page){
  const urls=[];
  page.on('request',request=>{
    const url=request.url();
    if(/^https?:/i.test(url)&&/\.glb(?:[?#]|$)/i.test(url))urls.push(url);
  });
  return urls;
}
async function boot(context){
  const page=await context.newPage({viewport:{width:1440,height:900}});
  const runtimeErrors=[],badResponses=[];
  const glbs=trackHttpGlbs(page);
  page.on('pageerror',error=>runtimeErrors.push(String(error?.stack||error)));
  page.on('response',response=>{if(response.status()>=400)badResponses.push(response.status()+' '+response.url());});
  await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.chimpionsSki?.().ready===true,null,{timeout:60000});
  return {page,runtimeErrors,badResponses,glbs};
}

try{
  const builtInContext=await browser.newContext();
  const built=await boot(builtInContext);
  const {page}=built;
  const fresh=await page.evaluate(()=>window.chimpionsSki());
  assert.equal(fresh.catalogSize,10,'Fresh runtime must expose exactly 10 built-in avatars');
  assert.equal(fresh.startCrowdCount,0,'Real Chimpion crowd must be disabled');
  assert.equal(fresh.startCrowdModelSources,0,'Crowd must own zero character GLB sources');
  assert.equal(built.glbs.length,0,'Fresh initial load must not request any character GLB');

  await page.getByRole('button',{name:'START GAME'}).click();
  const selector=page.locator('#chimpion-selector');
  await selector.waitFor({state:'visible',timeout:10000});
  assert.equal(await selector.locator('.chimpion-card:not(.is-upload-avatar)').count(),10,'Selector must render exactly 10 built-in cards');
  assert.equal(await selector.locator('.chimpion-card.is-upload-avatar').count(),1,'Selector must expose exactly one local GLB upload action');

  await selector.locator('.chimpion-card:not(.is-upload-avatar)').first().click();
  await selector.locator('.ride-mode-card[data-ride-mode="ski"]').click();
  await page.waitForFunction(()=>window.chimpionsSki?.().mode==='playing',null,{timeout:30000});
  const ski=await page.evaluate(()=>window.chimpionsSki());
  assert.equal(ski.rideMode,'ski');
  assert.equal(Math.round(ski.baseSpeed*3.6),160,'SKI base speed must be 160 km/h');
  assert.equal(Math.round(ski.maxSpeed*3.6),300,'SKI max speed must be 300 km/h');
  assert.equal(ski.startCrowdCount,0);
  assert.equal(ski.startCrowdModelSources,0);
  assert.equal(new Set(built.glbs).size,1,'Normal gameplay should request only the selected built-in GLB');

  await page.keyboard.press('Escape');
  await page.locator('#pause-overlay').waitFor({state:'visible',timeout:5000});
  await page.getByRole('button',{name:'RESUME',exact:true}).click();
  await page.waitForFunction(()=>window.chimpionsSki?.().mode==='playing',null,{timeout:5000});
  await page.keyboard.press('Escape');
  await page.locator('#pause-overlay').waitFor({state:'visible',timeout:5000});
  await page.getByRole('button',{name:'RESTART',exact:true}).click();
  await page.waitForFunction(()=>window.chimpionsSki?.().mode==='playing',null,{timeout:20000});
  const restarted=await page.evaluate(()=>window.chimpionsSki());
  assert(restarted.distance<120,'Restart did not reset run distance');
  assert.equal(new Set(built.glbs).size,1,'Restart must reuse the selected rider without downloading additional GLBs');

  assert.equal(built.runtimeErrors.length,0,'Runtime errors: '+built.runtimeErrors.join('\n'));
  assert.equal(built.badResponses.filter(line=>line.startsWith('404 ')).length,0,'Required resource 404s: '+built.badResponses.join('\n'));
  await builtInContext.close();

  const localContext=await browser.newContext();
  const local=await boot(localContext);
  const custom=local.page;
  assert.equal(local.glbs.length,0,'Custom-upload fresh boot must not request a GLB');
  await custom.getByRole('button',{name:'START GAME'}).click();
  const customSelector=custom.locator('#chimpion-selector');
  await customSelector.waitFor({state:'visible',timeout:10000});

  const input=customSelector.locator('#local-glb-upload');
  await input.setInputFiles({name:'invalid.glb',mimeType:'model/gltf-binary',buffer:Buffer.from('invalid glb')});
  await customSelector.locator('.selector-status.is-error').waitFor({state:'visible',timeout:5000});
  assert.match(await customSelector.locator('.selector-status').textContent(),/GLB|incomplete|invalid/i,'Invalid local GLB should fail understandably');
  assert.equal(local.glbs.length,0,'Invalid local GLB must create zero remote GLB requests');

  await input.setInputFiles(path.resolve('public/model/characters/The Heretic.glb'));
  await customSelector.locator('#ride-mode-step:not([hidden])').waitFor({state:'visible',timeout:20000});
  assert.equal(local.glbs.length,0,'Valid local GLB parsing must stay local-only');
  await customSelector.locator('.ride-mode-card[data-ride-mode="snowboard"]').click();
  await custom.waitForFunction(()=>window.chimpionsSki?.().mode==='playing',null,{timeout:30000});
  const snowboard=await custom.evaluate(()=>window.chimpionsSki());
  assert.equal(snowboard.rideMode,'snowboard');
  assert.equal(Math.round(snowboard.baseSpeed*3.6),180,'SNOWBOARD base speed must be 180 km/h');
  assert.equal(Math.round(snowboard.maxSpeed*3.6),300,'SNOWBOARD max speed must be 300 km/h');
  assert.equal(snowboard.selectedAvatarLocal,true,'Uploaded rider must be marked local-only');
  assert.equal(local.glbs.length,0,'Custom gameplay must create zero server GLB traffic');
  assert.equal(snowboard.startCrowdCount,0);
  assert.equal(local.runtimeErrors.length,0,'Custom runtime errors: '+local.runtimeErrors.join('\n'));
  await localContext.close();

  console.log(JSON.stringify({
    check:'production-smoke',
    builtInRoster:10,
    freshBootGlbRequests:0,
    crowdGlbRequests:0,
    builtInGameplayUniqueGlbs:1,
    customGlbRemoteRequests:0,
    ski:true,
    snowboard:true,
    invalidCustomFailsSafely:true
  }));
}finally{
  await browser.close();
}
