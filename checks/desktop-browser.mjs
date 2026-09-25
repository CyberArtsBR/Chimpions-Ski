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
const browserWarnings=[];
const failedRequests=[];
page.on('pageerror',error=>{
  const message='PAGEERROR '+(error?.stack||error?.message||String(error));
  browserErrors.push(message);
  console.error(message);
});
page.on('console',message=>{
  const type=message.type();
  if(type==='error'){
    const line='BROWSER_ERROR '+message.text();
    browserErrors.push(line);
    console.error(line);
  }else if(type==='warning'){
    const line='BROWSER_WARNING '+message.text();
    browserWarnings.push(line);
    console.warn(line);
  }
});
page.on('requestfailed',request=>{
  const failure=request.failure();
  const line='REQUEST_FAILED '+request.method()+' '+request.url()+' '+(failure?.errorText||'unknown');
  failedRequests.push(line);
  console.error(line);
});

try{
  await page.goto('http://127.0.0.1:4173/?test=1&quality=low',{waitUntil:'domcontentloaded'});

  const start=page.getByRole('button',{name:'Start Game'});
  const back=page.getByRole('link',{name:'Back to the Game selection'});
  const art=page.locator('.start-screen-art');

  await start.waitFor({state:'visible'});
  await back.waitFor({state:'visible'});
  await page.waitForFunction(()=>{
    const image=document.querySelector('.start-screen-art');
    return image?.complete&&image.naturalWidth>0&&image.naturalHeight>0;
  },null,{timeout:30000,polling:100});

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

  await page.waitForFunction(()=>window.chimpionsSki?.().ready,null,{timeout:30000,polling:100});
  const state=await page.evaluate(()=>window.chimpionsSki());
  assert.equal(state.qualityProfile,'low','Functional browser smoke must run the explicit LOW graphics profile');
  assert.equal(state.catalogSize,10,'Desktop build must expose exactly 10 built-in Chimpions');
  assert.equal(state.mode,'menu');
  assert.equal(state.skierFallback,true,'Desktop boot must stay procedural until the player selects a GLB');
  assert.equal(state.rigReady,false,'Fresh boot must not parse a Chimpion rig');
  assert.equal(await start.isEnabled(),true,'Start Game should enable after artwork and Chimpion are ready');

  // The start hit-area is intentionally transparent artwork UI. Invoke its
  // real DOM click handler so headless pointer hit-testing cannot make release
  // QA flaky, then synchronize on the functional result: the selector opening.
  await start.evaluate(button=>button.click());
  const selector=page.locator('#chimpion-selector');
  await selector.waitFor({state:'visible',timeout:10000});
  assert.equal(
    await page.locator('.start-screen').evaluate(node=>node.classList.contains('is-leaving')),
    true,
    'Start screen did not enter its exit transition after opening selector'
  );
  assert.equal((await page.evaluate(()=>window.chimpionsSki())).mode,'menu','START GAME must not begin a random run before selection');

  assert.equal(await page.evaluate(()=>document.activeElement?.id),'chimpion-search','Selector did not focus search on open');
  for(const viewport of responsiveViewports){
    await page.setViewportSize({width:viewport.width,height:viewport.height});
    await assertElementWithinViewport(selector,viewport.label+' avatar selector');
    await assertElementWithinViewport(selector.locator('#chimpion-search'),viewport.label+' avatar search');
    await assertElementWithinViewport(selector.locator('.selector-help'),viewport.label+' selector help');
  }
  await page.setViewportSize({width:1440,height:900});

  // The boot rider is approved metadata only; choosing it here performs the
  // first rider GLB request needed for this run.
  const bootRiderName=await page.evaluate(()=>window.chimpionsSki?.().selectedAvatar||'');
  assert(bootRiderName,'Boot rider name was not exposed in runtime diagnostics');
  const search=selector.locator('#chimpion-search');
  await search.fill(bootRiderName);
  const runChimpion=selector.locator('.chimpion-card:not([aria-disabled="true"])').filter({hasText:bootRiderName}).first();
  await runChimpion.waitFor({state:'visible',timeout:10000});
  await runChimpion.focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('.chimpion-card.is-menu-selected').count(),1,'Horizontal selector navigation lost visible state');
  await runChimpion.focus();
  assert.equal(await page.locator('.chimpion-card.is-menu-selected').count(),1,'Keyboard focus did not share the selector visual state');
  await page.keyboard.press('Enter');

  const skiChoice=selector.locator('.ride-mode-card[data-ride-mode="ski"]');
  await skiChoice.waitFor({state:'visible',timeout:5000});
  await page.waitForFunction(()=>document.activeElement?.classList?.contains('ride-mode-card'),null,{timeout:10000,polling:100});
  await assertElementWithinViewport(selector,'ride selector');
  await assertElementWithinViewport(skiChoice,'ski choice');
  await assertElementWithinViewport(selector.locator('.ride-mode-back'),'ride back');

  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.activeElement?.classList?.contains('chimpion-card'),null,{timeout:10000,polling:100});
  assert.equal(await selector.locator('#ride-mode-step').isHidden(),true,'Escape/B-style cancel did not return ride selection to avatars');
  await page.keyboard.press('Enter');
  await skiChoice.waitFor({state:'visible',timeout:5000});
  await page.waitForFunction(()=>document.activeElement?.classList?.contains('ride-mode-card'),null,{timeout:10000,polling:100});
  // Focus/navigation semantics were already verified above. Trigger the actual
  // button handler through DOM click so headless SwiftShader does not make this
  // release smoke depend on pointer hit-testing or transition stability.
  await skiChoice.evaluate(button=>button.click());

  try{
    await page.waitForFunction(()=>!document.querySelector('#chimpion-selector')?.open,null,{timeout:60000,polling:100});
  }catch(error){
    const selectorDiagnostics=await page.evaluate(()=>({
      runtime:window.chimpionsSki?.()||null,
      selectorOpen:!!document.querySelector('#chimpion-selector')?.open,
      selectorBusy:document.querySelector('#chimpion-selector')?.getAttribute('aria-busy'),
      selectorStatus:document.querySelector('#selector-status')?.textContent||'',
      selectorStatusHidden:document.querySelector('#selector-status')?.hidden??null,
      resourceEntries:performance.getEntriesByType('resource')
        .filter(entry=>/\.glb(?:$|\?)/i.test(entry.name))
        .map(entry=>({
          name:entry.name,
          duration:entry.duration,
          transferSize:entry.transferSize,
          encodedBodySize:entry.encodedBodySize,
          decodedBodySize:entry.decodedBodySize
        }))
    }));
    console.error('SELECTOR_TIMEOUT_DIAGNOSTICS '+JSON.stringify({
      selectorDiagnostics,
      browserWarnings,
      failedRequests
    }));
    throw error;
  }
  await page.waitForFunction(()=>(
    !!document.querySelector('.session-tutorial:not([hidden])')||
    ['countdown','playing'].includes(window.chimpionsSki?.().mode)
  ),null,{timeout:10000,polling:100});
  if(await page.evaluate(()=>!!document.querySelector('.session-tutorial:not([hidden])'))){
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      ()=>!document.querySelector('.session-tutorial:not([hidden])'),
      null,
      {timeout:5000,polling:100}
    );
  }
  try{
    await page.waitForFunction(()=>window.chimpionsSki?.().mode==='playing',null,{timeout:15000,polling:100});
  }catch(error){
    const launchDiagnostics=await page.evaluate(()=>({
      runtime:window.chimpionsSki?.()||null,
      tutorialVisible:!!document.querySelector('.session-tutorial:not([hidden])'),
      countdownHidden:document.querySelector('#run-countdown')?.hidden??null,
      countdownText:document.querySelector('#countdown-number')?.textContent||'',
      startScreenHidden:document.querySelector('.start-screen')?.hidden??null,
      startScreenClasses:document.querySelector('.start-screen')?.className||'',
      runLoadingHidden:document.querySelector('#run-loading-overlay')?.hidden??null,
      visibilityState:document.visibilityState,
      now:performance.now()
    }));
    console.error('PLAYING_TIMEOUT_DIAGNOSTICS '+JSON.stringify(launchDiagnostics));
    throw error;
  }
  assert.equal(await page.locator('.start-screen').isVisible(),false);
  assert.equal(await page.locator('.hud').isVisible(),true,'HUD did not return after selected rider started');

  const playing=await page.evaluate(()=>window.chimpionsSki());
  assert.equal(Math.round(playing.speed*3.6),150,'Run must begin at 150 km/h');
  assert(playing.courseLookaheadTarget>280,'Course streaming must remain beyond camera far plane');
  assert(playing.courseAhead>280,'Generated course must remain ahead of the visible camera range');
  assert.equal(playing.courseBatchOverflow,0,'Visible batched hazards overflowed rendering capacity');
  assert.equal(playing.visibleUnrepresentedHazards,0,'A visible collidable hazard has no rendered representation');

  const hud=page.locator('.hud');
  for(const viewport of responsiveViewports){
    await page.setViewportSize({width:viewport.width,height:viewport.height});
    await assertElementWithinViewport(hud,viewport.label+' HUD');
  }
  await page.setViewportSize({width:1440,height:900});

  await page.keyboard.press('Escape');
  const pauseOverlay=page.locator('#pause-overlay');
  await pauseOverlay.waitFor({state:'visible',timeout:5000});
  await page.waitForFunction(()=>document.activeElement?.id==='resume-game',null,{timeout:10000,polling:100});
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
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'settings-pause','WASD navigation missed Settings');
  // Keyboard focus semantics are verified above. Invoke the real button handler
  // directly so headless key dispatch timing cannot make dialog opening flaky.
  await page.locator('#settings-pause').evaluate(button=>button.click());

  const settingsOverlay=page.locator('#settings-overlay');
  await settingsOverlay.waitFor({state:'visible',timeout:5000});
  await page.waitForFunction(()=>document.activeElement?.id==='settings-close',null,{timeout:10000,polling:100});
  assert.equal(await page.locator('#settings-close.is-menu-selected').count(),1,'Settings default focus is not visibly selected');

  for(const viewport of responsiveViewports){
    await page.setViewportSize({width:viewport.width,height:viewport.height});
    await assertElementWithinViewport(settingsOverlay.locator('.settings-card'),viewport.label+' settings card');
  }
  await page.setViewportSize({width:1440,height:900});

  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'toggle-music','Settings navigation did not wrap to Music');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'music-volume','Settings navigation missed music volume');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'toggle-sfx','Settings navigation missed SFX');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'sfx-volume','Settings navigation missed SFX volume');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'quality-profile','Settings navigation missed quality profile');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'camera-view','Settings navigation missed camera view');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'camera-motion','Settings navigation missed camera motion');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'toggle-haptics','Settings navigation missed haptics');

  const cameraMotionButton=page.locator('#camera-motion');
  await cameraMotionButton.evaluate(button=>button.click()); // AUTO -> FULL
  await cameraMotionButton.evaluate(button=>button.click()); // FULL -> REDUCED
  await page.waitForFunction(()=>document.documentElement.dataset.cameraMotion==='reduced',null,{timeout:10000,polling:100});
  const explicitReduced=await settingsOverlay.locator('.settings-card').evaluate(element=>({
    animation:getComputedStyle(element).animationName,
    transition:getComputedStyle(element).transitionDuration
  }));
  assert.equal(explicitReduced.animation,'none','Explicit Reduced camera motion did not disable settings animation');
  assert(explicitReduced.transition.split(',').every(value=>parseFloat(value)===0),'Explicit Reduced camera motion did not disable transitions');
  await cameraMotionButton.evaluate(button=>button.click()); // REDUCED -> AUTO

  const hapticsButton=page.locator('#toggle-haptics');
  await hapticsButton.evaluate(button=>button.click());
  assert.equal((await page.evaluate(()=>window.chimpionsSki())).hapticsEnabled,false,'Haptics setting did not disable runtime haptics');
  await hapticsButton.evaluate(button=>button.click());
  assert.equal((await page.evaluate(()=>window.chimpionsSki())).hapticsEnabled,true,'Haptics setting did not restore runtime haptics');

  await page.locator('#settings-close').evaluate(button=>button.click());
  await settingsOverlay.waitFor({state:'hidden',timeout:5000});
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'settings-pause','Closing Settings did not restore pause focus');

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
  await page.waitForFunction(()=>window.chimpionsSki?.().mode==='playing',null,{timeout:5000,polling:100});

  // Release the active desktop WebGL page before creating a second mobile
  // renderer. Running both Three.js scenes concurrently under SwiftShader can
  // starve navigation on CI even though the preview server is healthy.
  await page.close();

  // Pointer lifecycle smoke in a coarse-pointer mobile context. This validates
  // the semantic input bridge and cancellation behavior without relying on
  // SwiftShader's flaky low-level touchscreen acknowledgement in CI.
  const touchContext=await browser.newContext({
    viewport:{width:896,height:414},
    hasTouch:true,
    isMobile:true
  });
  const touchPage=await touchContext.newPage();
  try{
    await touchPage.goto('http://127.0.0.1:4173/?test=1&quality=low',{waitUntil:'domcontentloaded'});
    await touchPage.waitForFunction(()=>window.chimpionsSki?.().ready===true,null,{timeout:30000,polling:100});
    assert.equal(
      (await touchPage.evaluate(()=>window.chimpionsSki())).qualityProfile,
      'low',
      'Touch smoke must run the explicit LOW graphics profile'
    );
    await touchPage.getByRole('button',{name:'Start Game'}).evaluate(button=>button.click());
    const touchSelector=touchPage.locator('#chimpion-selector');
    await touchSelector.waitFor({state:'visible',timeout:10000});
    const touchRiderName=await touchPage.evaluate(()=>window.chimpionsSki?.().selectedAvatar||'');
    const touchSearch=touchSelector.locator('#chimpion-search');
    await touchSearch.fill(touchRiderName);
    const touchRider=touchSelector.locator('.chimpion-card:not([aria-disabled="true"])').filter({hasText:touchRiderName}).first();
    await touchRider.waitFor({state:'visible',timeout:10000});
    await touchRider.evaluate(button=>button.click());
    const touchSkiChoice=touchSelector.locator('.ride-mode-card[data-ride-mode="ski"]');
    await touchSkiChoice.waitFor({state:'visible',timeout:5000});
    await touchSkiChoice.evaluate(button=>button.click());
    await touchPage.waitForFunction(()=>(
      !!document.querySelector('.session-tutorial:not([hidden])')||
      ['countdown','playing'].includes(window.chimpionsSki?.().mode)
    ),null,{timeout:10000,polling:100});
    if(await touchPage.evaluate(()=>!!document.querySelector('.session-tutorial:not([hidden])'))){
      await touchPage.keyboard.press('Enter');
      await touchPage.waitForFunction(
        ()=>!document.querySelector('.session-tutorial:not([hidden])'),
        null,
        {timeout:5000,polling:100}
      );
    }
    await touchPage.waitForFunction(()=>window.chimpionsSki?.().mode==='playing',null,{timeout:15000,polling:100});

    const touchRoot=touchPage.locator('#touch-controls');
    assert.equal(await touchRoot.isVisible(),true,'Touch controls are not visible in coarse-pointer gameplay');

    const steerZone=touchPage.locator('#touch-steer-zone');
    const steerBox=await steerZone.boundingBox();
    assert(steerBox,'Touch steer zone has no layout box');
    const steerDown={
      pointerId:41,pointerType:'touch',isPrimary:true,buttons:1,
      clientX:steerBox.x+steerBox.width*.78,
      clientY:steerBox.y+steerBox.height*.50
    };
    await steerZone.dispatchEvent('pointerdown',steerDown);
    await steerZone.dispatchEvent('pointermove',{...steerDown,clientX:steerBox.x+steerBox.width*.88});
    await touchPage.waitForFunction(()=>Math.abs(window.chimpionsSki?.().inputState?.touchSteer||0)>.25,null,{timeout:10000,polling:100});
    await steerZone.dispatchEvent('pointercancel',{...steerDown,buttons:0});
    await touchPage.waitForFunction(()=>Math.abs(window.chimpionsSki?.().inputState?.touchSteer||0)<.001,null,{timeout:10000,polling:100});

    const jumpButton=touchPage.locator('#touch-jump');
    assert.equal(await jumpButton.isVisible(),true,'Touch Jump button is not visible during mobile gameplay');
    // Jump pointer lifecycle is covered deterministically by touch-settings-invariants.
    // Keep browser QA focused on layout, steer, cancellation and pause behavior.

    await touchPage.setViewportSize({width:414,height:896});
    assert.equal(await touchPage.locator('.touch-orientation-hint').isVisible(),true,'Portrait gameplay does not present the landscape recommendation');
    await touchPage.setViewportSize({width:896,height:414});

    await touchPage.locator('#touch-pause').dispatchEvent('pointerdown',{pointerId:43,pointerType:'touch',isPrimary:true,buttons:1});
    await touchPage.waitForFunction(()=>window.chimpionsSki?.().mode==='paused',null,{timeout:5000,polling:100});
    const pausedTouch=await touchPage.evaluate(()=>window.chimpionsSki());
    assert(Math.abs(pausedTouch.inputState.touchSteer)<.001,'Pause left touch steering stuck');
    assert.equal(pausedTouch.inputState.touchJump,false,'Pause left touch jump stuck');
  }finally{
    await touchContext.close();
  }

  console.log('PASS desktop browser UI focus / Settings / responsive overlays / reduced motion / leave confirmation / touch pointer gameplay');
}finally{
  await browser.close();
}
