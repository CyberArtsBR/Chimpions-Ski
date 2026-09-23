import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';

const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const responsiveViewports=[
  {width:1920,height:1080,label:'16:9'},
  {width:1440,height:900,label:'16:10'},
  {width:1200,height:900,label:'4:3'},
  {width:1920,height:800,label:'ultrawide'},
  {width:1024,height:640,label:'small laptop'}
];

async function assertElementWithinViewport(locator,label){
  const box=await locator.evaluate(element=>{
    const rect=element.getBoundingClientRect();
    return {
      left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,
      width:rect.width,height:rect.height,
      viewportWidth:innerWidth,viewportHeight:innerHeight
    };
  });
  assert(box.width>0&&box.height>0,label+' has no layout box');
  assert(box.left>=-1&&box.top>=-1,label+' starts outside viewport');
  assert(box.right<=box.viewportWidth+1,label+' clips past viewport width');
  assert(box.bottom<=box.viewportHeight+1,label+' clips past viewport height');
}

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
  },{timeout:30000});

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

  for(const viewport of responsiveViewports){
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

  assert.equal(await page.evaluate(()=>document.activeElement?.id),'chimpion-search','Selector did not focus search on open');
  for(const viewport of responsiveViewports){
    await page.setViewportSize({width:viewport.width,height:viewport.height});
    await assertElementWithinViewport(selector,viewport.label+' avatar selector');
    await assertElementWithinViewport(selector.locator('#chimpion-search'),viewport.label+' avatar search');
    await assertElementWithinViewport(selector.locator('.selector-help'),viewport.label+' selector help');
  }
  await page.setViewportSize({width:1440,height:900});

  // Reuse the already-loaded boot rider so selector QA is deterministic and network-light.
  await selector.locator('#chimpion-search').fill('The Drownsy');
  await page.waitForFunction(()=>document.querySelectorAll('.chimpion-card').length>0);
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(()=>document.activeElement?.classList?.contains('chimpion-card'));
  assert.equal(await page.locator('.chimpion-card.is-menu-selected').count(),1,'Keyboard focus did not share the selector visual state');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('.chimpion-card.is-menu-selected').count(),1,'Horizontal selector navigation lost visible state');
  // Keep CI focused on UI flow rather than arbitrary heavy GLB download cost.
  const selectedChimpion=selector.locator('.chimpion-card.is-selected').first();
  const runChimpion=(await selectedChimpion.count())?selectedChimpion:selector.locator('.chimpion-card:not([aria-disabled="true"])').first();
  await runChimpion.focus();
  await page.keyboard.press('Enter');

  const skiChoice=selector.locator('.ride-mode-card[data-ride-mode="ski"]');
  await skiChoice.waitFor({state:'visible',timeout:5000});
  await page.waitForFunction(()=>document.activeElement?.classList?.contains('ride-mode-card'));
  for(const viewport of responsiveViewports){
    await page.setViewportSize({width:viewport.width,height:viewport.height});
    await assertElementWithinViewport(selector,viewport.label+' ride selector');
    await assertElementWithinViewport(skiChoice,viewport.label+' ski choice');
    await assertElementWithinViewport(selector.locator('.ride-mode-back'),viewport.label+' ride back');
  }
  await page.setViewportSize({width:1440,height:900});

  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.activeElement?.classList?.contains('chimpion-card'));
  assert.equal(await selector.locator('#ride-mode-step').isHidden(),true,'Escape/B-style cancel did not return ride selection to avatars');
  await page.keyboard.press('Enter');
  await skiChoice.waitFor({state:'visible',timeout:5000});
  await page.waitForFunction(()=>document.activeElement?.classList?.contains('ride-mode-card'));
  await skiChoice.evaluate(button=>button.click());

  await page.waitForFunction(()=>!document.querySelector('#chimpion-selector')?.open,null,{timeout:15000});
  await page.waitForFunction(()=>window.chimpionsSki?.().mode==='playing',null,{timeout:20000});
  assert.equal(await page.locator('.start-screen').isVisible(),false);
  assert.equal(await page.locator('.hud').isVisible(),true,'HUD did not return after selected rider started');

  const playing=await page.evaluate(()=>window.chimpionsSki());
  assert.equal(Math.round(playing.speed*3.6),160,'Run must begin at 160 km/h');
  assert(playing.courseLookaheadTarget>280,'Course streaming must remain beyond camera far plane');
  assert(playing.courseAhead>280,'Generated course must remain ahead of the visible camera range');

  const hud=page.locator('.hud');
  for(const viewport of responsiveViewports){
    await page.setViewportSize({width:viewport.width,height:viewport.height});
    await assertElementWithinViewport(hud,viewport.label+' HUD');
  }
  await page.setViewportSize({width:1440,height:900});

  await page.keyboard.press('Escape');
  const pauseOverlay=page.locator('#pause-overlay');
  await pauseOverlay.waitFor({state:'visible',timeout:5000});
  await page.waitForFunction(()=>document.activeElement?.id==='resume-game');
  assert.equal(await page.locator('#resume-game.is-menu-selected').count(),1,'Pause default focus is not visibly selected');

  for(const viewport of responsiveViewports){
    await page.setViewportSize({width:viewport.width,height:viewport.height});
    await assertElementWithinViewport(pauseOverlay.locator('.pause-card'),viewport.label+' pause card');
    await assertElementWithinViewport(page.locator('#resume-game'),viewport.label+' pause focus');
  }
  await page.setViewportSize({width:1440,height:900});

  await page.emulateMedia({reducedMotion:'reduce'});
  const reducedMotion=await pauseOverlay.evaluate(element=>{
    const card=element.querySelector('.presentation-card');
    const button=element.querySelector('button');
    return {
      overlayAnimation:getComputedStyle(element).animationName,
      cardAnimation:getComputedStyle(card).animationName,
      buttonTransition:getComputedStyle(button).transitionDuration
    };
  });
  assert.equal(reducedMotion.overlayAnimation,'none','Reduced motion did not disable overlay animation');
  assert.equal(reducedMotion.cardAnimation,'none','Reduced motion did not disable card animation');
  assert(reducedMotion.buttonTransition.split(',').every(value=>parseFloat(value)===0),'Reduced motion did not disable button transitions');
  await page.emulateMedia({reducedMotion:'no-preference'});

  // Synthetic visibility is used only for layout QA; gameplay state remains paused.
  const resultsOverlay=page.locator('#result-overlay');
  await page.evaluate(()=>{
    document.querySelector('#pause-overlay').hidden=true;
    document.querySelector('#result-overlay').hidden=false;
    document.querySelector('#restart-result').focus();
  });
  for(const viewport of responsiveViewports){
    await page.setViewportSize({width:viewport.width,height:viewport.height});
    await assertElementWithinViewport(resultsOverlay.locator('.result-card'),viewport.label+' result card');
    await assertElementWithinViewport(page.locator('#restart-result'),viewport.label+' result focus');
  }
  assert.equal(await page.locator('#result-score').isVisible(),true,'Result score is not visible');
  await page.evaluate(()=>{
    document.querySelector('#result-overlay').hidden=true;
    document.querySelector('#pause-overlay').hidden=false;
    document.querySelector('#resume-game').focus();
  });
  await page.setViewportSize({width:1440,height:900});

  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'restart-pause','Arrow navigation missed restart');
  await page.keyboard.press('KeyS');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'toggle-sfx','WASD navigation missed SFX');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'give-up-pause','Keyboard navigation missed leave action');
  await page.keyboard.press('Enter');

  const leaveConfirm=page.locator('#leave-confirm-overlay');
  await leaveConfirm.waitFor({state:'visible',timeout:5000});
  assert.equal(await page.getByText('Do you really want to leave the game?').isVisible(),true,'Leave confirmation copy missing');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'leave-confirm-no','Leave confirmation did not default to NO');
  assert.equal(await page.locator('#leave-confirm-no.is-menu-selected').count(),1,'NO default is not visibly selected');

  await page.keyboard.press('Escape');
  await leaveConfirm.waitFor({state:'hidden',timeout:5000});
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'give-up-pause','Cancel did not restore focus to leave action');

  await page.keyboard.press('Enter');
  await leaveConfirm.waitFor({state:'visible',timeout:5000});
  await page.keyboard.press('Enter');
  await leaveConfirm.waitFor({state:'hidden',timeout:5000});
  assert.equal(await pauseOverlay.isVisible(),true,'Confirming default NO did not return to pause menu');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'give-up-pause','NO did not restore pause focus');

  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>window.chimpionsSki?.().mode==='playing',null,{timeout:5000});

  console.log('PASS desktop browser UI focus / responsive overlays / reduced motion / leave confirmation');
}finally{
  await browser.close();
}
