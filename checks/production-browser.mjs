import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {resolveProductionUrl} from '../scripts/production-url.mjs';

const base=resolveProductionUrl(process.env);
const expected=process.env.CHIMPIONS_SKI_EXPECTED_COMMIT||'';
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});

try{
  const deadline=Date.now()+10*60*1000;
  let live='';
  while(Date.now()<deadline){
    try{
      const response=await page.request.get(base+'/version.json?audit='+Date.now());
      if(response.ok()){
        const version=await response.json();
        live=version.commit||'';
        if(!expected||live===expected)break;
      }
    }catch{}
    await page.waitForTimeout(15000);
  }
  assert(live,'Production version manifest must be reachable');
  if(expected)assert.equal(live,expected);
  await page.goto(base+'/?test=1&revision='+live,{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(()=>window.chimpionsSki?.().ready,{timeout:45000});
  const state=await page.evaluate(()=>window.chimpionsSki());
  assert.equal(state.catalogSize,10);
  assert.equal(state.startCrowdCount,0);
  assert.equal(state.startCrowdModelSources,0);
  assert.equal(state.skierFallback,true);
  assert.equal(state.mode,'menu');
  assert.equal(Math.round(state.baseSpeed*3.6),150,'Default SKI base speed must be 150 km/h');
  assert.equal(Math.round(state.maxSpeed*3.6),300,'Default max speed must be 300 km/h');
  console.log('PASS production desktop browser:',live,base);
}finally{
  await browser.close();
}
