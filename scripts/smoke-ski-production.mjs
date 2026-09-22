import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_BASE_URL='https://chimpions-ski.onrender.com/';
const GAME_SELECTION_URL='https://chimp-jump.onrender.com/';
const BASE_URL=new URL(process.env.BASE_URL||DEFAULT_BASE_URL).href;
const STRICT=/^(1|true|yes|on)$/i.test(process.env.STRICT||'');
const SMOKE_JSON=process.env.SMOKE_JSON||'';
const SMOKE_SCREENSHOT=process.env.SMOKE_SCREENSHOT||'';
const HEADLESS=!/^(0|false|no|off)$/i.test(process.env.HEADLESS||'1');
const UI_TIMEOUT=Number(process.env.SMOKE_UI_TIMEOUT_MS||15000);
const NAV_TIMEOUT=Number(process.env.SMOKE_NAV_TIMEOUT_MS||30000);
const targetOrigin=new URL(BASE_URL).origin;

const report={
  target:BASE_URL,
  strict:STRICT,
  startedAt:new Date().toISOString(),
  results:[],
  diagnostics:{},
  network:{
    httpFailures:[],notFound:[],requestFailures:[],consoleErrors:[],
    uncaughtExceptions:[],failedImageLoads:[],failedGlbLoads:[],
    failedAudioLoads:[],jsCssFailures:[],musicRequests:[],
    expectedHarmless:[],actionRequired:[]
  }
};
const counts={PASS:0,FAIL:0,PENDING:0,WARN:0};

function add(status,feature,detail='',data){
  counts[status]=(counts[status]||0)+1;
  const row={status,feature,detail};
  if(data!==undefined)row.data=data;
  report.results.push(row);
  console.log(status.padEnd(7)+' '+feature+(detail?' — '+detail:''));
  return row;
}
const pass=(f,d,x)=>add('PASS',f,d,x);
const fail=(f,d,x)=>add('FAIL',f,d,x);
const warn=(f,d,x)=>add('WARN',f,d,x);
function future(feature,present,okDetail,missingDetail,data){
  return present?pass(feature,okDetail,data):(STRICT?fail(feature,missingDetail||'Expected integrated feature is missing',data):add('PENDING',feature,missingDetail||'Not present on this build',data));
}
const finite=v=>Number.isFinite(Number(v));
const kmh=v=>finite(v)?Number(v)*3.6:NaN;
const near=(value,want,tolerance=6)=>finite(value)&&Math.abs(kmh(value)-want)<=tolerance;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const short=value=>String(value||'').replace(/\s+/g,' ').trim().slice(0,500);
const unique=(items,key=item=>JSON.stringify(item))=>{
  const seen=new Set();
  return items.filter(item=>{const k=key(item);if(seen.has(k))return false;seen.add(k);return true;});
};
const isImage=url=>/\.(png|jpe?g|webp|gif|svg|avif)(?:[?#]|$)/i.test(url);
const isGlb=url=>/\.(glb|gltf)(?:[?#]|$)/i.test(url);
const isAudio=url=>/\.(mp3|ogg|wav|m4a|aac)(?:[?#]|$)/i.test(url);
const isJsCss=url=>/\.(?:m?js|css)(?:[?#]|$)/i.test(url);

async function diag(page){
  return page.evaluate(()=>{
    try{return typeof window.chimpionsSki==='function'?window.chimpionsSki():null;}
    catch(error){return {__diagnosticError:String(error?.stack||error)};}
  });
}
async function waitDiag(page,predicate,timeout=UI_TIMEOUT){
  const end=Date.now()+timeout;
  let last=null;
  while(Date.now()<end){
    last=await diag(page);
    if(last&&predicate(last))return last;
    await sleep(80);
  }
  return last;
}
async function clickDom(page,selector){
  return page.evaluate(sel=>{
    const node=document.querySelector(sel);
    if(!node||node.disabled)return false;
    node.click();
    return true;
  },selector);
}
async function openSelector(page){
  if(await page.locator('#chimpion-selector[open]').count())return page.locator('#chimpion-selector[open]');
  if(!await clickDom(page,'#choose'))return null;
  try{
    await page.locator('#chimpion-selector[open]').waitFor({state:'visible',timeout:UI_TIMEOUT});
    return page.locator('#chimpion-selector[open]');
  }catch{return null;}
}
async function selectorClose(page){
  const close=page.locator('#chimpion-selector[open] .selector-close');
  if(await close.count())await close.click().catch(()=>{});
}
async function chooseRide(page,mode){
  const selector=await openSelector(page);
  if(!selector)return {available:false,selected:false,reason:'selector unavailable'};
  const search=selector.locator('#chimpion-search');
  if(await search.count())await search.fill('');
  const card=selector.locator('.chimpion-card').first();
  if(!await card.count())return {available:false,selected:false,reason:'no Chimpion card'};
  await card.click();
  const step=page.locator('#ride-mode-step:not([hidden])');
  try{await step.waitFor({state:'visible',timeout:4000});}
  catch{return {available:false,selected:false,reason:'two-step ride selector absent'};}
  const button=page.locator('[data-ride-mode="'+mode+'"]').first();
  if(!await button.count())return {available:true,selected:false,reason:'missing '+mode+' button'};
  await button.click();
  await page.locator('#chimpion-selector[open]').waitFor({state:'hidden',timeout:UI_TIMEOUT}).catch(()=>{});
  const ready=await waitDiag(page,d=>d.ready===true&&String(d.rideMode||'').toLowerCase()===mode,UI_TIMEOUT);
  return {available:true,selected:String(ready?.rideMode||'').toLowerCase()===mode,diag:ready};
}
async function startRun(page){
  const d=await diag(page);
  if(d?.mode==='playing')return d;
  if(!await clickDom(page,'#start'))return d;
  return waitDiag(page,x=>x.mode==='playing',12000);
}
async function restart(page){
  let d=await diag(page);
  if(d?.mode==='playing'){
    await page.keyboard.press('Escape');
    await page.locator('#pause-overlay').waitFor({state:'visible',timeout:2500}).catch(()=>{});
  }
  if((await diag(page))?.mode==='crashed'){
    await clickDom(page,'#restart-result');
  }else{
    await clickDom(page,'#restart-pause');
  }
  return waitDiag(page,x=>x.mode==='playing',12000);
}
async function pressChord(page,direction){
  await page.keyboard.down(direction);
  await page.keyboard.press('Space');
  await page.keyboard.up(direction);
}
async function waitTrick(page,type,timeout=1500){
  const wanted=String(type).toUpperCase();
  return waitDiag(page,d=>{
    const eventType=String(d?.trickEvent?.type||d?.trickType||'').toUpperCase();
    const state=String(d?.trickState||'').toUpperCase();
    return wanted==='360'?(eventType==='360'||state.includes('360')):(eventType.includes('BACKFLIP')||state.includes('BACKFLIP'));
  },timeout);
}

let browser;
try{
  browser=await chromium.launch({headless:HEADLESS});
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await context.newPage();
  page.setDefaultTimeout(UI_TIMEOUT);

  const consoleCounts=new Map();
  page.on('console',message=>{
    if(message.type()!=='error')return;
    const text=short(message.text());
    report.network.consoleErrors.push(text);
    consoleCounts.set(text,(consoleCounts.get(text)||0)+1);
  });
  page.on('pageerror',error=>report.network.uncaughtExceptions.push(short(error?.stack||error)));
  page.on('requestfailed',request=>{
    const row={url:request.url(),method:request.method(),error:request.failure()?.errorText||'request failed'};
    report.network.requestFailures.push(row);
    if(isImage(row.url))report.network.failedImageLoads.push(row);
    if(isGlb(row.url))report.network.failedGlbLoads.push(row);
    if(isAudio(row.url))report.network.failedAudioLoads.push(row);
    if(isJsCss(row.url))report.network.jsCssFailures.push(row);
  });
  page.on('request',request=>{
    if(isAudio(request.url())&&/music-full\.mp3/i.test(request.url()))report.network.musicRequests.push({url:request.url(),method:request.method()});
  });
  page.on('response',response=>{
    if(response.status()<400)return;
    const row={status:response.status(),url:response.url(),method:response.request().method()};
    report.network.httpFailures.push(row);
    if(response.status()===404)report.network.notFound.push(row);
    if(isImage(row.url))report.network.failedImageLoads.push(row);
    if(isGlb(row.url))report.network.failedGlbLoads.push(row);
    if(isAudio(row.url))report.network.failedAudioLoads.push(row);
    if(isJsCss(row.url))report.network.jsCssFailures.push(row);
  });

  let nav;
  try{nav=await page.goto(BASE_URL,{waitUntil:'domcontentloaded',timeout:NAV_TIMEOUT});}
  catch(error){fail('HTTP / DOCUMENT','Navigation failed: '+short(error?.message||error));throw error;}
  if(nav?.ok())pass('HTTP','Document returned '+nav.status());
  else fail('HTTP','Document status '+String(nav?.status?.()||'unknown'));
  const docOk=await page.evaluate(()=>document.readyState!=='loading'&&!!document.body);
  docOk?pass('DOCUMENT','DOM loaded'):fail('DOCUMENT','DOM did not load');

  const runtime=await page.waitForFunction(()=>typeof window.chimpionsSki==='function',{timeout:UI_TIMEOUT}).then(()=>true).catch(()=>false);
  runtime?pass('WEBGL APP','Runtime diagnostic hook initialized'):fail('WEBGL APP','window.chimpionsSki() did not initialize');
  const webgl=await page.evaluate(()=>{
    const canvas=document.querySelector('canvas');
    if(!canvas)return {canvas:false,webgl:false,lost:null};
    const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
    return {canvas:true,webgl:!!gl,lost:gl?.isContextLost?.()??null};
  }).catch(()=>({canvas:false,webgl:false,lost:null}));
  webgl.canvas&&webgl.webgl&&!webgl.lost?pass('WEBGL','Canvas/context healthy',webgl):fail('WEBGL','No healthy WebGL context',webgl);

  const startScreen=page.locator('.start-screen');
  const startArt=page.locator('.start-screen-art');
  const startButton=page.getByRole('button',{name:'Start Game'});
  const back=page.getByRole('link',{name:'Back to the Game selection'});
  const startVisible=await startScreen.isVisible().catch(()=>false);
  const art=await startArt.evaluate(img=>({complete:img.complete,width:img.naturalWidth,height:img.naturalHeight,src:img.currentSrc||img.src})).catch(()=>null);
  startVisible&&art?.complete&&art.width>0?pass('START SCREEN','Artwork start screen visible',art):fail('START SCREEN','Artwork missing or broken',art);
  await startButton.count()?pass('START GAME','Start Game exists'):fail('START GAME','Start Game missing');
  const backHref=await back.getAttribute('href').catch(()=>null);
  backHref&&new URL(backHref,BASE_URL).href===GAME_SELECTION_URL?pass('BACK LINK','Target remains '+GAME_SELECTION_URL):fail('BACK LINK','Wrong target: '+String(backHref));
  const legacyExposed=await page.evaluate(()=>{
    if(!document.body.classList.contains('start-screen-active'))return false;
    const button=document.querySelector('#start');
    if(!button)return false;
    const r=button.getBoundingClientRect();
    if(!r.width||!r.height)return false;
    const top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    return !!top&&(top===button||button.contains(top));
  }).catch(()=>false);
  !legacyExposed?pass('LEGACY START','START SKIING is not exposed over artwork'):fail('LEGACY START','Legacy START SKIING is exposed over artwork');

  let ready=await waitDiag(page,d=>d.ready===true&&Number(d.catalogSize)>0,UI_TIMEOUT);
  report.diagnostics.ready=ready;
  Number(ready?.catalogSize)>180?pass('AVATAR CATALOG','Catalog size '+ready.catalogSize):fail('AVATAR CATALOG','Expected >180 entries',ready?.catalogSize);
  ready?.selectedAvatar&&ready.selectedAvatar!=='Fallback skier'&&!ready?.skierFallback?pass('AVATAR MODEL','Real Chimpion loaded: '+ready.selectedAvatar):fail('AVATAR MODEL','Fallback used unexpectedly',ready);
  if(Object.prototype.hasOwnProperty.call(ready||{},'rigReady')){
    ready.rigReady?pass('AVATAR RIG','rigReady=true'):warn('AVATAR RIG','rigReady=false; verify this model supports the production rig');
  }else warn('AVATAR RIG','rigReady not exposed');

  if(await startButton.count()){
    try{
      await startButton.waitFor({state:'visible',timeout:UI_TIMEOUT});
      await page.waitForFunction(()=>{const b=document.querySelector('.start-screen-play');return b&&!b.disabled;},null,{timeout:UI_TIMEOUT});
      await startButton.click();
      await page.waitForFunction(()=>!document.body.classList.contains('start-screen-active'),null,{timeout:5000});
      pass('START ACTION','Start Game entered runtime');
    }catch(error){fail('START ACTION','Could not leave start screen: '+short(error?.message||error));}
  }
  let playing=await waitDiag(page,d=>d.mode==='playing',12000);
  playing?.mode==='playing'?pass('RUN START','Gameplay reached playing state'):fail('RUN START','Gameplay did not reach playing state',playing);

  let selector=await openSelector(page);
  if(selector){
    const cards=selector.locator('.chimpion-card');
    const rendered=await cards.count();
    if(rendered>0&&(!finite(ready?.catalogSize)||rendered<Number(ready.catalogSize)))pass('SELECTOR RENDERING','Rendered '+rendered+' cards instead of full catalog');
    else if(rendered>0)warn('SELECTOR RENDERING','All '+rendered+' cards appear rendered');
    else fail('SELECTOR RENDERING','No cards rendered');

    const search=selector.locator('#chimpion-search');
    if(await search.count()){
      const before=await cards.count();
      await search.fill('__smoke_no_match_9f7__');
      await sleep(120);
      const after=await cards.count();
      await search.fill('');
      await sleep(120);
      const restored=await cards.count();
      after===0&&restored>0?pass('SELECTOR SEARCH','Search changes/restores results',{before,after,restored}):fail('SELECTOR SEARCH','Search did not alter results',{before,after,restored});
    }else fail('SELECTOR SEARCH','Search input missing');
    const fallbacks=await selector.locator('.portrait-fallback').count();
    fallbacks<=2?pass('SELECTOR IMAGES','No broken-image flood ('+fallbacks+' fallbacks)'):warn('SELECTOR IMAGES',fallbacks+' portrait fallbacks visible');
    await selectorClose(page);
    selector=await openSelector(page);
    selector?pass('SELECTOR REOPEN','Selector closes and reopens'):fail('SELECTOR REOPEN','Selector did not reopen');
  }else fail('SELECTOR','Could not open Chimpion selector');

  let rideSelection=false;
  if(selector){
    const search=selector.locator('#chimpion-search');
    if(await search.count())await search.fill('');
    const card=selector.locator('.chimpion-card').first();
    if(await card.count()){
      await card.click();
      rideSelection=await page.locator('#ride-mode-step:not([hidden])').isVisible().catch(()=>false);
    }
  }
  future('RIDE SELECTION',rideSelection,'Chimpion selection transitions to SKI / SNOWBOARD','Two-step ride selection not present on this build');
  if(rideSelection){
    const ski=page.locator('[data-ride-mode="ski"]');
    const snowboard=page.locator('[data-ride-mode="snowboard"]');
    await ski.count()&&await snowboard.count()?pass('RIDE OPTIONS','SKI and SNOWBOARD choices exist'):fail('RIDE OPTIONS','Expected both ride choices');
    const backRide=page.locator('.ride-mode-back');
    if(await backRide.count())await backRide.click();
    await selectorClose(page);
  }else{
    await waitDiag(page,d=>d.ready===true,UI_TIMEOUT);
    await selectorClose(page);
  }

  if(rideSelection){
    const skiChoice=await chooseRide(page,'ski');
    if(skiChoice.selected){
      const skiRun=await startRun(page);
      String(skiRun?.rideMode||'').toLowerCase()==='ski'&&near(skiRun?.speed,160)?pass('SKI MODE','rideMode=ski; start '+Math.round(kmh(skiRun.speed))+' km/h',skiRun):fail('SKI MODE','Wrong ski mode/start profile',skiRun);
      finite(skiRun?.maxSpeed)&&Math.abs(kmh(skiRun.maxSpeed)-210)<=6?pass('SKI MAX PROFILE','Max profile ~210 km/h'):warn('SKI MAX PROFILE','Max profile unavailable/unexpected',skiRun?.maxSpeed);
    }else fail('SKI MODE','Could not select SKI',skiChoice);

    const boardChoice=await chooseRide(page,'snowboard');
    if(boardChoice.selected){
      const boardRun=await startRun(page);
      const boardMode=String(boardRun?.rideMode||'').toLowerCase()==='snowboard';
      boardMode&&near(boardRun?.speed,180)?pass('SNOWBOARD MODE','rideMode=snowboard; start '+Math.round(kmh(boardRun.speed))+' km/h',boardRun):fail('SNOWBOARD MODE','Wrong snowboard mode/start profile',boardRun);
      if(finite(boardRun?.maxSpeed)){
        Math.abs(kmh(boardRun.maxSpeed)-230)<=6&&Math.abs(kmh(boardRun.maxSpeed)-210)>8?pass('SNOWBOARD MAX PROFILE','Max profile ~230 km/h and differs from ski max'):fail('SNOWBOARD MAX PROFILE','Snowboard max is not ~230 km/h',kmh(boardRun.maxSpeed));
      }else warn('SNOWBOARD MAX PROFILE','maxSpeed not exposed');
    }else fail('SNOWBOARD MODE','Could not select SNOWBOARD',boardChoice);
  }else{
    const baseline=await startRun(page);
    if(near(baseline?.speed,160))pass('BASELINE SKI SPEED','Current baseline starts ~160 km/h');
    else warn('BASELINE SKI SPEED','Could not confirm 160 km/h baseline',baseline?.speed);
    future('SKI MODE',false,'','Integrated rideMode=ski diagnostics not present');
    future('SNOWBOARD MODE',false,'','Snowboard mode not present');
  }

  playing=await waitDiag(page,d=>d.mode==='playing',4000);
  const trickPresent=!!playing&&('trickState' in playing||'trickEvent' in playing||'trickType' in playing);
  future('TRICK SYSTEM',trickPresent,'Trick diagnostics detected','Trick diagnostics not present');
  if(trickPresent){
    if(playing?.mode!=='playing')playing=await restart(page);
    await page.keyboard.press('Space');
    const airborne=await waitDiag(page,d=>d.air===true,1200);
    if(airborne?.air){
      const vyBefore=Number(airborne.vy);
      await page.keyboard.press('Space');
      await sleep(80);
      const afterSecond=await diag(page);
      const noBoost=finite(vyBefore)&&finite(afterSecond?.vy)&&Number(afterSecond.vy)<=vyBefore+0.25&&!afterSecond?.jumpBuffered;
      noBoost?pass('SECOND SPACE','No unexpected airborne vertical boost/buffer',{before:vyBefore,after:afterSecond?.vy}):fail('SECOND SPACE','Second jump appears to boost/buffer',{before:vyBefore,after:afterSecond});
    }else warn('SECOND SPACE','Could not enter airborne state for second-press probe');

    await restart(page);
    await pressChord(page,'ArrowDown');
    const spin=await waitTrick(page,'360');
    spin?pass('DOWN + SPACE','Observed 360 intent/event'):fail('DOWN + SPACE','360 intent/event not observed');

    await restart(page);
    await pressChord(page,'ArrowUp');
    const flip=await waitTrick(page,'BACKFLIP');
    flip?pass('UP + SPACE','Observed BACKFLIP intent/event'):fail('UP + SPACE','BACKFLIP intent/event not observed');
  }else{
    future('DOWN + SPACE',false,'','360 input awaits integrated trick build');
    future('UP + SPACE',false,'','BACKFLIP input awaits integrated trick build');
    future('SECOND SPACE',false,'','Airborne second-press guard awaits integrated trick build');
  }

  const bodyText=await page.locator('body').innerText().catch(()=>'');
  !/\bCLEAN LANDING\b/i.test(bodyText)?pass('SCORE PRESENTATION','Legacy CLEAN LANDING text absent'):fail('SCORE PRESENTATION','CLEAN LANDING is exposed');
  const futureLabels=['360','BACKFLIP','TRICK FAILED','AIR TIME'].filter(label=>bodyText.toUpperCase().includes(label));
  if(futureLabels.length)pass('TRICK PRESENTATION','Observed: '+futureLabels.join(', '));
  else if(trickPresent)warn('TRICK PRESENTATION','No trick label visible on sampled path; not a failure');

  await sleep(350);
  report.network.musicRequests=unique(report.network.musicRequests,x=>x.url);
  const externalMusic=report.network.musicRequests.filter(x=>/https:\/\/chimp-jump\.onrender\.com\/audio\/music-full\.mp3/i.test(x.url));
  if(externalMusic.length)fail('AUDIO ORIGIN','External Chimp Jump music dependency requested',externalMusic);
  else pass('AUDIO ORIGIN','No external Chimp Jump music runtime dependency');
  const localMusic=report.network.musicRequests.filter(x=>{try{const u=new URL(x.url);return u.origin===targetOrigin&&/\/audio\/music-full\.mp3(?:[?#]|$)/i.test(u.href);}catch{return false;}});
  localMusic.length?pass('LOCAL MUSIC','music-full.mp3 requested from game origin',localMusic):warn('LOCAL MUSIC','No music-full.mp3 request observed; verify browser audio policy/user gesture');
  report.network.failedAudioLoads.length?fail('AUDIO NETWORK','Failed audio requests detected',report.network.failedAudioLoads):pass('AUDIO NETWORK','No failed audio requests');
  report.network.musicRequests.length<=2?pass('MP3 REQUEST RATE','No repeated MP3 request flood',report.network.musicRequests):fail('MP3 REQUEST RATE','Repeated music request flood',report.network.musicRequests);

  let course=await diag(page);
  report.diagnostics.course=course;
  if(finite(course?.courseAhead)&&finite(course?.courseLookaheadTarget)){
    const ratio=Number(course.courseAhead)/Math.max(1,Number(course.courseLookaheadTarget));
    if(ratio>=0.75)pass('COURSE STREAMING','Frontier ahead '+Math.round(course.courseAhead)+'m / target '+Math.round(course.courseLookaheadTarget)+'m',{ratio});
    else fail('COURSE STREAMING','Generated frontier is too close to camera/player',{courseAhead:course.courseAhead,target:course.courseLookaheadTarget,ratio});
    if(ratio<0.9)warn('COURSE LOOKAHEAD','Frontier has reduced margin',{ratio});
  }else warn('COURSE STREAMING','courseAhead/courseLookaheadTarget not exposed');
  finite(course?.activeCourseObjects)&&Number(course.activeCourseObjects)>0?pass('COURSE CONTENT','Active course objects '+course.activeCourseObjects):fail('COURSE CONTENT','Course appears empty',course?.activeCourseObjects);

  const renderFields=['activeCourseObjects','pooledObjects','courseDrawCallsEstimate','courseLegacyDrawCallsEstimate','courseBatchDrawCalls','batchedCourseInstances'];
  const exposed=renderFields.filter(key=>finite(course?.[key]));
  const broken=exposed.filter(key=>Number(course[key])<0||!Number.isFinite(Number(course[key])));
  if(exposed.length&&!broken.length)pass('COURSE RENDERING','Rendering diagnostics sane',Object.fromEntries(exposed.map(k=>[k,course[k]])));
  else if(broken.length)fail('COURSE RENDERING','Broken rendering diagnostics: '+broken.join(', '));
  else warn('COURSE RENDERING','Course rendering diagnostics unavailable');
  if(course?.courseBatchOverflow===true)fail('COURSE BATCHING','courseBatchOverflow=true');
  else if(Object.prototype.hasOwnProperty.call(course||{},'courseBatchOverflow'))pass('COURSE BATCHING','No batch overflow');

  const horizonKeys=['centralHorizonClear','horizonClear','mountainCorridorClear','environmentCorridorClear'];
  const horizonKey=horizonKeys.find(key=>Object.prototype.hasOwnProperty.call(course||{},key));
  if(horizonKey){
    course[horizonKey]===true?pass('ENVIRONMENT HORIZON',horizonKey+'=true'):fail('ENVIRONMENT HORIZON',horizonKey+'='+String(course[horizonKey]));
  }else warn('ENVIRONMENT HORIZON','No corridor diagnostic exposed; use screenshot/manual center-horizon check');

  if(SMOKE_SCREENSHOT){
    await fs.mkdir(path.dirname(SMOKE_SCREENSHOT),{recursive:true});
    await page.screenshot({path:SMOKE_SCREENSHOT,fullPage:true});
    pass('SCREENSHOT','Saved '+SMOKE_SCREENSHOT);
  }

  const restarted=await restart(page);
  if(restarted?.mode==='playing'){
    const cleanRamp=!restarted.activeRamp;
    const cleanScore=!finite(restarted.score)||Number(restarted.score)===0;
    const cleanTrick=!restarted.trickEvent&&!restarted.trickType&&(!restarted.trickState||String(restarted.trickState).toUpperCase()==='NONE');
    cleanRamp&&cleanScore&&cleanTrick?pass('RESTART','Run restarts responsive with temporary state cleared',restarted):fail('RESTART','Stale state after restart',{activeRamp:restarted.activeRamp,score:restarted.score,trickEvent:restarted.trickEvent,trickType:restarted.trickType,trickState:restarted.trickState});
  }else fail('RESTART','Could not return to playing state',restarted);

  report.network.httpFailures=unique(report.network.httpFailures,x=>x.status+' '+x.url);
  report.network.notFound=unique(report.network.notFound,x=>x.url);
  report.network.requestFailures=unique(report.network.requestFailures,x=>x.url+' '+x.error);
  report.network.failedImageLoads=unique(report.network.failedImageLoads,x=>x.url);
  report.network.failedGlbLoads=unique(report.network.failedGlbLoads,x=>x.url);
  report.network.failedAudioLoads=unique(report.network.failedAudioLoads,x=>x.url);
  report.network.jsCssFailures=unique(report.network.jsCssFailures,x=>x.url);
  report.network.uncaughtExceptions=unique(report.network.uncaughtExceptions);

  const repeated=[...consoleCounts.entries()].filter(([,count])=>count>=3).map(([message,count])=>({message,count}));
  report.network.uncaughtExceptions.length?fail('UNCAUGHT EXCEPTIONS',report.network.uncaughtExceptions.length+' fatal page errors',report.network.uncaughtExceptions):pass('UNCAUGHT EXCEPTIONS','None');
  repeated.length?fail('REPEATED CONSOLE ERRORS','Repeated console errors detected',repeated):pass('REPEATED CONSOLE ERRORS','No repeated error flood');
  if(report.network.consoleErrors.length&&!repeated.length)warn('CONSOLE ERRORS',report.network.consoleErrors.length+' non-repeating console error(s)',report.network.consoleErrors);
  report.network.jsCssFailures.length?fail('JS / CSS NETWORK','Failed JS/CSS loads',report.network.jsCssFailures):pass('JS / CSS NETWORK','No failed JS/CSS loads');
  report.network.failedGlbLoads.length?fail('GLB NETWORK','Failed GLB loads',report.network.failedGlbLoads):pass('GLB NETWORK','No failed GLB loads');
  report.network.failedImageLoads.length>2?fail('IMAGE NETWORK','Broken image flood',report.network.failedImageLoads):report.network.failedImageLoads.length?warn('IMAGE NETWORK',report.network.failedImageLoads.length+' failed image load(s)',report.network.failedImageLoads):pass('IMAGE NETWORK','No failed image loads');
  const assetFailures=report.network.httpFailures.filter(x=>isJsCss(x.url)||isGlb(x.url)||isAudio(x.url));
  const otherHttp=report.network.httpFailures.filter(x=>!assetFailures.includes(x));
  otherHttp.length?fail('HTTP FAILURES','Unexpected HTTP >=400 responses',otherHttp):pass('HTTP FAILURES','No unexpected HTTP >=400 responses');

  report.network.expectedHarmless=[
    ...report.results.filter(x=>x.status==='PENDING').map(x=>x.feature+': '+x.detail),
    ...report.results.filter(x=>x.status==='WARN').map(x=>x.feature+': '+x.detail)
  ];
  report.network.actionRequired=report.results.filter(x=>x.status==='FAIL').map(x=>x.feature+': '+x.detail);

  console.log('\nNETWORK ERROR SUMMARY');
  console.log('HTTP failures: '+report.network.httpFailures.length);
  console.log('404s: '+report.network.notFound.length);
  console.log('JS console errors: '+report.network.consoleErrors.length);
  console.log('Uncaught exceptions: '+report.network.uncaughtExceptions.length);
  console.log('Failed image loads: '+report.network.failedImageLoads.length);
  console.log('Failed GLB loads: '+report.network.failedGlbLoads.length);
  console.log('Failed audio loads: '+report.network.failedAudioLoads.length);
  console.log('EXPECTED / harmless: '+report.network.expectedHarmless.length);
  for(const item of report.network.expectedHarmless)console.log('  - '+item);
  console.log('ACTION REQUIRED: '+report.network.actionRequired.length);
  for(const item of report.network.actionRequired)console.log('  - '+item);
}catch(error){
  fail('HARNESS','Smoke runner aborted: '+short(error?.stack||error));
  report.network.actionRequired.push('HARNESS: '+short(error?.message||error));
}finally{
  report.finishedAt=new Date().toISOString();
  report.summary={...counts};
  if(SMOKE_JSON){
    await fs.mkdir(path.dirname(SMOKE_JSON),{recursive:true}).catch(()=>{});
    await fs.writeFile(SMOKE_JSON,JSON.stringify(report,null,2)+'\n','utf8').catch(error=>console.error('Could not write SMOKE_JSON:',error));
  }
  if(browser)await browser.close().catch(()=>{});
  console.log('\nRESULTS '+JSON.stringify(report.summary));
  if(counts.FAIL>0)process.exitCode=1;
}
