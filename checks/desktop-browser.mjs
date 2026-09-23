import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';

const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const browserErrors=[];
page.on('pageerror',error=>{
  const message='PAGEERROR '+(error?.stack||error?.message||String(error));
  browserErrors.push(message);
  console.error(message);
});
page.on('console',message=>{
  if(message.type()!=='error')return;
  const line='BROWSER_ERROR '+message.text();
  browserErrors.push(line);
  console.error(line);
});

try{
  await page.goto('http://127.0.0.1:4173/?test=1',{waitUntil:'domcontentloaded'});

  const start=page.getByRole('button',{name:'Start Game'});
  const back=page.getByRole('link',{name:'Back to the Game selection'});
  const art=page.locator('.start-screen-art');

  await start.waitFor({state:'visible'});
  await back.waitFor({state:'visible'});
  await page.waitForFunction(()=>{
    const image=document.querySelector('.start-screen-art');
    return image?.complete&&image.naturalWidth>0&&image.naturalHeight>0;
  },null,{timeout:30000});

  const artMetrics=await art.evaluate(image=>({
    naturalWidth:image.naturalWidth,
    naturalHeight:image.naturalHeight,
    rect:image.getBoundingClientRect().toJSON()
  }));
  assert.equal(artMetrics.naturalWidth,1920,'Start artwork width changed unexpectedly');
  assert.equal(artMetrics.naturalHeight,1080,'Start artwork height changed unexpectedly');
  assert(Math.abs(artMetrics.rect.width/artMetrics.rect.height-16/9)<.01,'Start artwork was stretched');

  assert.equal(await back.getAttribute('href'),'https://chimp-jump.onrender.com/');
  assert.equal(await page.locator('.hud').isVisible(),false,'HUD leaked through initial artwork');
  assert.equal(await page.locator('#overlay').isVisible(),false,'Legacy overlay leaked through initial artwork');
  assert.equal(await page.getByRole('button',{name:'CHOOSE CHIMPION'}).isVisible(),false,'Legacy CHOOSE CHIMPION leaked through artwork');
  assert.equal(await page.getByRole('button',{name:'START SKIING'}).isVisible(),false,'Legacy START SKIING leaked through artwork');
  assert.equal(await page.locator('#run-countdown').isVisible(),false,'Countdown leaked through initial artwork');
  assert.equal(await page.locator('.score-pop-layer').isVisible(),false,'Score popup layer leaked through initial artwork');

  for(const viewport of [
    {width:1440,height:900,label:'16:10'},
    {width:1200,height:900,label:'4:3'},
    {width:1920,height:800,label:'ultrawide'}
  ]){
    await page.setViewportSize({width:viewport.width,height:viewport.height});
    const layout=await page.evaluate(()=>{
      const stage=document.querySelector('.start-screen-stage').getBoundingClientRect();
      const art=document.querySelector('.start-screen-art').getBoundingClientRect();
      const play=document.querySelector('.start-screen-play').getBoundingClientRect();
      const back=document.querySelector('.start-screen-back').getBoundingClientRect();
      const inside=(rect)=>rect.left>=stage.left-1&&rect.right<=stage.right+1&&rect.top>=stage.top-1&&rect.bottom<=stage.bottom+1;
      return {stageRatio:stage.width/stage.height,artRatio:art.width/art.height,playInside:inside(play),backInside:inside(back)};
    });
    assert(Math.abs(layout.stageRatio-16/9)<.01,viewport.label+' stage ratio changed');
    assert(Math.abs(layout.artRatio-16/9)<.01,viewport.label+' artwork stretched');
    assert.equal(layout.playInside,true,viewport.label+' Start hit area escaped artwork');
    assert.equal(layout.backInside,true,viewport.label+' Back hit area escaped artwork');
  }
  await page.setViewportSize({width:1440,height:900});

  const before=await page.evaluate(()=>window.chimpionsSki?.());
  await page.waitForTimeout(180);
  const still=await page.evaluate(()=>window.chimpionsSki?.());
  assert.equal(still?.distance??0,before?.distance??0,'Gameplay advanced behind start artwork');
  assert.equal(still?.travel??0,before?.travel??0,'World travel advanced behind start artwork');

  await page.waitForFunction(()=>window.chimpionsSki?.().ready,null,{timeout:30000});
  const state=await page.evaluate(()=>window.chimpionsSki());
  assert(state.catalogSize>180);
  assert.equal(state.mode,'menu');
  assert.equal(state.skierFallback,false,'Desktop build must load a real Chimpion GLB');
  assert.equal(state.rigReady,true,'Loaded Chimpion must expose the ski rig controller');
  assert.equal(await start.isEnabled(),true,'Start Game should enable after artwork and Chimpion are ready');

  await start.evaluate(button=>{button.click();button.click();});
  await page.waitForFunction(()=>document.querySelector('.start-screen')?.hidden===true,null,{timeout:5000});
  const selector=page.locator('#chimpion-selector');
  await selector.waitFor({state:'visible',timeout:5000});
  assert.equal((await page.evaluate(()=>window.chimpionsSki())).mode,'menu','START GAME must not begin a random run before selection');

  // Keep this smoke focused on selector/run flow. Reuse the lightweight rider
  // already selected during boot instead of turning CI into an arbitrary GLB
  // download benchmark for whichever catalog entry happens to render first.
  const selectedChimpion=selector.locator('.chimpion-card.is-selected').first();
  const firstChimpion=(await selectedChimpion.count())?selectedChimpion:selector.locator('.chimpion-card').first();
  await firstChimpion.waitFor({state:'visible',timeout:5000});
  await firstChimpion.evaluate(button=>button.click());
  const skiChoice=selector.locator('.ride-mode-card[data-ride-mode="ski"]');
  await skiChoice.waitFor({state:'visible',timeout:5000});
  await skiChoice.evaluate(button=>button.click());

  await page.waitForFunction(()=>!document.querySelector('#chimpion-selector')?.open,null,{timeout:5000});
  await page.waitForFunction(()=>window.chimpionsSki?.().mode==='playing',null,{timeout:12000});
  assert.equal(await page.locator('.start-screen').isVisible(),false);
  assert.equal(await page.locator('.hud').isVisible(),true,'HUD did not return after selected rider started');

  const playing=await page.evaluate(()=>window.chimpionsSki());
  assert.equal(Math.round(playing.speed*3.6),160,'Run must begin at 160 km/h');
  assert(playing.courseLookaheadTarget>280,'Course streaming must remain beyond camera far plane');
  assert(playing.courseAhead>280,'Generated course must remain ahead of the visible camera range');

  await page.keyboard.press('Escape');
  const pauseOverlay=page.locator('#pause-overlay');
  await pauseOverlay.waitFor({state:'visible',timeout:5000});
  const giveUp=page.getByRole('button',{name:'GIVE UP AND LEAVE TO GAME SELECTION'});
  await giveUp.first().click();
  const leaveConfirm=page.locator('#leave-confirm-overlay');
  await leaveConfirm.waitFor({state:'visible',timeout:5000});
  assert.equal(await page.getByText('Do you really want to leave the game?').isVisible(),true,'Leave confirmation copy missing');
  await page.getByRole('button',{name:'NO',exact:true}).click();
  await leaveConfirm.waitFor({state:'hidden',timeout:5000});
  assert.equal(await pauseOverlay.isVisible(),true,'NO did not return to pause menu');
  await page.getByRole('button',{name:'RESUME',exact:true}).click();
  await page.waitForFunction(()=>window.chimpionsSki?.().mode==='playing',null,{timeout:5000});

  console.log('PASS desktop browser integrated start screen / gameplay / leave confirmation');
}finally{
  await browser.close();
}
