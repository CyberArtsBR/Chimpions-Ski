import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from '@playwright/test';
const base=process.env.BASE_URL||'http://127.0.0.1:4173';
const avatars=JSON.parse(await fs.readFile('public/avatars.json','utf8'));
assert.equal(avatars.length,10);
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1280,height:800}});
const results=[];
try{
 for(const entry of avatars){
  for(const mode of ['ski','snowboard']){
   const page=await context.newPage(),errors=[],failed=[];
   page.on('pageerror',e=>errors.push(String(e?.stack||e)));
   page.on('requestfailed',r=>{if(/\.glb(?:[?#]|$)/i.test(r.url()))failed.push(r.url()+': '+(r.failure()?.errorText||'failed'));});
   await page.goto(base+'/?test=1',{waitUntil:'domcontentloaded',timeout:60000});
   await page.waitForFunction(()=>window.chimpionsSki?.().ready===true,null,{timeout:60000});
   await page.getByRole('button',{name:'START GAME'}).evaluate(el=>el.click());
   const selector=page.locator('#chimpion-selector');await selector.waitFor({state:'visible',timeout:10000});
   const card=selector.locator('.chimpion-card:not(.is-upload-avatar)').filter({hasText:entry.name}).first();assert.equal(await card.count(),1,entry.name+' card missing');await card.evaluate(el=>el.click());
   const ride=selector.locator(`[data-ride-mode="${mode}"]`);await ride.waitFor({state:'visible',timeout:5000});await ride.evaluate(el=>el.click());
   await page.waitForFunction(({name,mode})=>{const d=window.chimpionsSki?.();return d?.selectedAvatar===name&&d?.rideMode===mode&&d?.riderRigReady===true;},{name:entry.name,mode},{timeout:60000});
   const diag=await page.evaluate(()=>window.chimpionsSki());
   assert.equal(diag.riderEquipmentType,mode==='ski'?'skis':'snowboard',entry.name+' equipment mismatch');
   assert.equal(diag.riderFirstPersonBody,true,entry.name+' first-person visual root missing');
   assert.equal(errors.length,0,entry.name+' runtime errors: '+errors.join('\n'));assert.equal(failed.length,0,entry.name+' failed GLB requests: '+failed.join('\n'));
   results.push({name:entry.name,mode,rigReady:diag.riderRigReady,equipment:diag.riderEquipmentType,firstPerson:diag.riderFirstPersonBody});await page.close();
  }
 }

 const localPage=await context.newPage(),localErrors=[],localFailed=[];
 localPage.on('pageerror',e=>localErrors.push(String(e?.stack||e)));
 localPage.on('requestfailed',r=>{if(/\.glb(?:[?#]|$)/i.test(r.url()))localFailed.push(r.url()+': '+(r.failure()?.errorText||'failed'));});
 await localPage.goto(base+'/?test=1',{waitUntil:'domcontentloaded',timeout:60000});
 await localPage.waitForFunction(()=>window.chimpionsSki?.().ready===true,null,{timeout:60000});
 await localPage.getByRole('button',{name:'START GAME'}).evaluate(el=>el.click());
 const localSelector=localPage.locator('#chimpion-selector');await localSelector.waitFor({state:'visible',timeout:10000});
 await localSelector.locator('#local-glb-upload').setInputFiles(path.resolve('public/model/characters/The Heretic.glb'));
 const localRide=localSelector.locator('[data-ride-mode="ski"]');await localRide.waitFor({state:'visible',timeout:60000});await localRide.evaluate(el=>el.click());
 await localPage.waitForFunction(()=>{const d=window.chimpionsSki?.();return d?.selectedAvatarLocal===true&&d?.riderRigReady===true&&d?.rideMode==='ski';},null,{timeout:60000});
 const localDiag=await localPage.evaluate(()=>window.chimpionsSki());
 assert.equal(localDiag.selectedAvatarLocal,true,'local GLB selection was not preserved');
 assert.equal(localDiag.riderRigReady,true,'local GLB rig was not accepted');
 assert.equal(localDiag.riderEquipmentType,'skis','local GLB ski equipment mismatch');
 assert.equal(localErrors.length,0,'local GLB runtime errors: '+localErrors.join('\n'));
 assert.equal(localFailed.length,0,'local GLB failed requests: '+localFailed.join('\n'));
 results.push({name:'Local GLB / The Heretic',mode:'ski',local:true,rigReady:localDiag.riderRigReady,equipment:localDiag.riderEquipmentType});
 await localPage.close();

 console.log(JSON.stringify({check:'avatar-asset-browser',cases:results.length,results}));
}finally{await context.close();await browser.close();}
