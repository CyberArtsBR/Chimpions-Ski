import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';

const base=process.env.BASE_URL||'http://127.0.0.1:4173';
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const runtimeErrors=[];
const badResponses=[];
page.on('pageerror',error=>runtimeErrors.push(String(error?.stack||error)));
page.on('response',response=>{if(response.status()>=400)badResponses.push(response.status()+' '+response.url());});

try{
  await page.goto(base+'/?crowdBenchmark=1',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.chimpionsSki?.().ready,null,{timeout:60000});
  await page.getByRole('button',{name:'START GAME'}).click();

  const selector=page.locator('#chimpion-selector');
  await selector.waitFor({state:'visible',timeout:10000});
  const selected=selector.locator('.chimpion-card.is-selected:not([aria-disabled="true"])').first();
  const fallback=selector.locator('.chimpion-card:not([aria-disabled="true"])').first();
  const rider=(await selected.count())?selected:fallback;
  await rider.waitFor({state:'visible',timeout:10000});
  await rider.evaluate(button=>button.click());

  const ski=selector.locator('.ride-mode-card[data-ride-mode="ski"]');
  await ski.waitFor({state:'visible',timeout:10000});
  await ski.evaluate(button=>button.click());
  await page.waitForFunction(()=>window.chimpionsSki?.().mode==='playing',null,{timeout:30000});

  const before=await page.evaluate(()=>window.chimpionsSki());
  assert(before.startCrowdCount>4,'Production smoke unexpectedly used reduced CI crowd mode');
  assert(before.startCrowdStartReady,'Production crowd did not reach start-ready state');
  assert(before.courseAhead>280,'Course streaming did not cover the visible camera horizon');
  assert.equal(await page.locator('.hud').isVisible(),true,'HUD is not visible in gameplay');

  await page.waitForTimeout(1800);
  const moved=await page.evaluate(()=>window.chimpionsSki());
  assert(moved.distance>before.distance,'Player distance did not advance');
  assert(moved.travel>before.travel,'World travel did not advance');

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

  const critical404=badResponses.filter(line=>line.startsWith('404 '));
  assert.equal(runtimeErrors.length,0,'Runtime errors: '+runtimeErrors.join('\n'));
  assert.equal(critical404.length,0,'Required resource 404s: '+critical404.join('\n'));
  console.log(JSON.stringify({check:'production-smoke',quality:before.qualityProfile,crowd:before.startCrowdCount,restartedDistance:restarted.distance}));
}finally{
  await browser.close();
}
