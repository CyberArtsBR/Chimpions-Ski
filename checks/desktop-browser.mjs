import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';

const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const BASELINE_SHA='9f6707d113e46e03d94510792110ecaf875288f1';
const BASELINE_URL='https://chimpions-ski.onrender.com';
const perf=state=>({
  calls:state?.rendererCalls??0,
  triangles:state?.rendererTriangles??0,
  geometries:state?.rendererGeometries??0,
  textures:state?.rendererTextures??0
});
const deterministicRandom=()=>{let x=0x5eed1234;Math.random=()=>((x=(Math.imul(x,1664525)+1013904223)>>>0)/4294967296);};

async function collectBaselinePerf(){
  const baselinePage=await browser.newPage({viewport:{width:1440,height:900}});
  await baselinePage.addInitScript(deterministicRandom);
  try{
    let live='';
    for(let attempt=0;attempt<18&&!live;attempt++){
      try{
        const response=await baselinePage.request.get(BASELINE_URL+'/version.json?envperf='+Date.now());
        if(response.ok())live=(await response.json()).commit||'';
      }catch{}
      if(!live)await baselinePage.waitForTimeout(5000);
    }
    assert.equal(live,BASELINE_SHA,'Production baseline is not the requested exact main SHA');
    await baselinePage.goto(BASELINE_URL+'/?test=1&envperf=baseline',{waitUntil:'domcontentloaded',timeout:45000});
    await baselinePage.waitForFunction(()=>window.chimpionsSki?.().ready,{timeout:45000});
    await baselinePage.waitForTimeout(180);
    const menu=perf(await baselinePage.evaluate(()=>window.chimpionsSki()));
    const baselineStart=baselinePage.getByRole('button',{name:'Start Game'});
    await baselineStart.waitFor({state:'visible'});
    await baselineStart.click();
    await baselinePage.waitForFunction(()=>window.chimpionsSki?.().mode==='playing',{timeout:10000});
    await baselinePage.waitForTimeout(1000);
    const playing=perf(await baselinePage.evaluate(()=>window.chimpionsSki()));
    return {menu,playing};
  }finally{
    await baselinePage.close();
  }
}

await page.addInitScript(deterministicRandom);

try{
  const baselinePerf=await collectBaselinePerf();
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
  assert.equal(artMetrics.naturalWidth,1672,'Start artwork width changed unexpectedly');
  assert.equal(artMetrics.naturalHeight,941,'Start artwork height changed unexpectedly');
  assert(Math.abs(artMetrics.rect.width/artMetrics.rect.height-1672/941)<.01,'Start artwork was stretched');

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
    assert(Math.abs(layout.stageRatio-1672/941)<.01,viewport.label+' stage ratio changed');
    assert(Math.abs(layout.artRatio-1672/941)<.01,viewport.label+' artwork stretched');
    assert.equal(layout.playInside,true,viewport.label+' Start hit area escaped artwork');
    assert.equal(layout.backInside,true,viewport.label+' Back hit area escaped artwork');
  }
  await page.setViewportSize({width:1440,height:900});

  const before=await page.evaluate(()=>window.chimpionsSki?.());
  await page.waitForTimeout(180);
  const still=await page.evaluate(()=>window.chimpionsSki?.());
  assert.equal(still?.distance??0,before?.distance??0,'Gameplay advanced behind start artwork');
  assert.equal(still?.travel??0,before?.travel??0,'World travel advanced behind start artwork');

  await page.waitForFunction(()=>window.chimpionsSki?.().ready,{timeout:30000});
  const state=await page.evaluate(()=>window.chimpionsSki());
  assert(state.catalogSize>180);
  assert.equal(state.mode,'menu');
  assert.equal(state.skierFallback,false,'Desktop build must load a real Chimpion GLB');
  assert.equal(state.rigReady,true,'Loaded Chimpion must expose the ski rig controller');
  assert.equal(await start.isEnabled(),true,'Start Game should enable after artwork and Chimpion are ready');

  await start.evaluate(button=>{button.click();button.click();});
  await page.waitForFunction(()=>document.querySelector('.start-screen')?.hidden===true,{timeout:5000});
  await page.waitForFunction(()=>window.chimpionsSki?.().mode==='playing',{timeout:10000});
  assert.equal(await page.locator('.start-screen').isVisible(),false);
  assert.equal(await page.locator('.hud').isVisible(),true,'HUD did not return after starting');

  const playing=await page.evaluate(()=>window.chimpionsSki());
  assert.equal(Math.round(playing.speed*3.6),160,'Run must begin at 160 km/h');
  assert(playing.courseLookaheadTarget>280,'Course streaming must remain beyond camera far plane');
  assert(playing.courseAhead>280,'Generated course must remain ahead of the visible camera range');

  await page.waitForTimeout(1000);
  const localPlaying=perf(await page.evaluate(()=>window.chimpionsSki()));
  const localMenu=perf(state);
  const delta=(before,after)=>({
    calls:after.calls-before.calls,
    triangles:after.triangles-before.triangles,
    geometries:after.geometries-before.geometries,
    textures:after.textures-before.textures
  });
  console.log('ENV_RENDER_PERF '+JSON.stringify({
    baselineSha:BASELINE_SHA,
    baseline:baselinePerf,
    branch:{menu:localMenu,playing:localPlaying},
    delta:{
      menu:delta(baselinePerf.menu,localMenu),
      playing:delta(baselinePerf.playing,localPlaying)
    }
  }));

  console.log('PASS desktop browser integrated start screen / gameplay');
}finally{
  await browser.close();
}
