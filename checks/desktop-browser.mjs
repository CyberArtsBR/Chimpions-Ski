import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';

const browser=await chromium.launch({
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
});
const page=await browser.newPage({viewport:{width:1440,height:900}});

try{
  await page.goto('http://127.0.0.1:4173/?test=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.chimpionsSki?.().ready,{timeout:30000});

  const state=await page.evaluate(()=>window.chimpionsSki());
  assert(state.catalogSize>180);
  assert.equal(state.mode,'menu');
  assert.equal(state.skierFallback,false,'Desktop build must load a real Chimpion GLB');
  assert.equal(state.rigReady,true,'Loaded Chimpion must expose the ski rig controller');

  const start=page.getByRole('button',{name:'Start Game'});
  const back=page.getByRole('link',{name:'Back to the Game selection'});
  assert.equal(await start.isVisible(),true,'Artwork start-screen Start Game control must be visible');
  assert.equal(await start.isEnabled(),true,'Start Game must enable after the skier is ready');
  assert.equal(await back.isVisible(),true,'Back to Game selection control must be visible');
  assert.equal(
    await back.getAttribute('href'),
    'https://chimp-jump.onrender.com/',
    'Game selection link changed unexpectedly'
  );

  const artReady=await page.locator('.start-screen-art').evaluate(img=>img.complete&&img.naturalWidth>0);
  assert.equal(artReady,true,'Start-screen artwork failed to load');

  // Legacy menu remains underneath for avatar/pause flows, but must not leak through the artwork screen.
  assert.equal(await page.getByRole('button',{name:'START SKIING'}).isVisible(),false);

  await start.click();
  await page.waitForFunction(()=>window.chimpionsSki?.().mode==='playing',{timeout:12000});

  const running=await page.evaluate(()=>window.chimpionsSki());
  assert(running.speed>=44.4,'Run did not begin at the new ~160 km/h baseline');
  assert(running.courseAhead>280,'Course streaming did not stay ahead of the camera far plane');
  assert(running.courseLookaheadTarget>280,'Adaptive lookahead target is too short');

  console.log('PASS desktop browser');
}finally{
  await browser.close();
}
