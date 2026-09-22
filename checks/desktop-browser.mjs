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

  const startGame=page.getByRole('button',{name:'Start Game'});
  const back=page.getByRole('link',{name:'Back to the Game selection'});
  assert.equal(await startGame.isVisible(),true,'Artwork start screen must expose Start Game');
  assert.equal(await startGame.isEnabled(),true,'Start Game must enable when the avatar is ready');
  assert.equal(await back.isVisible(),true,'Artwork start screen must expose Back to the Game selection');
  assert.equal(
    await back.getAttribute('href'),
    'https://chimp-jump.onrender.com/',
    'Back-to-selection link target regressed'
  );

  // The legacy menu is intentionally hidden until the artwork screen is dismissed.
  assert.equal(
    await page.getByRole('button',{name:'START SKIING'}).isVisible(),
    false,
    'Legacy START SKIING button must not be visible over the artwork start screen'
  );

  await startGame.click();
  await page.waitForFunction(()=>window.chimpionsSki?.().mode==='playing',{timeout:15000});
  const playing=await page.evaluate(()=>window.chimpionsSki());
  assert.equal(Math.round(playing.speed*3.6),160,'Run must begin at 160 km/h');
  assert(playing.courseLookaheadTarget>280,'Course streaming must remain beyond camera far plane');

  console.log('PASS desktop browser artwork start screen');
}finally{
  await browser.close();
}
