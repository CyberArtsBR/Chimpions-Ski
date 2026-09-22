import {SKI_TUNING} from './gameplayTuning.js';

function byId(id){return document.getElementById(id);}
function isVisible(element){return !!element&&!element.hidden&&element.getClientRects().length>0;}
function buttonList(root){
  if(!root)return [];
  return Array.from(root.querySelectorAll('button:not([disabled]),[role="button"][tabindex]:not([aria-disabled="true"])')).filter(isVisible);
}

export function createGameUI({audio,onStart,onPause,onResume,onRestart,onChoose}){
  const overlay=byId('overlay');
  const startButton=byId('start');
  const chooseButton=byId('choose');
  const distance=byId('distance');
  const bananas=byId('bananas');
  const speed=byId('speed');
  const hud=overlay?.previousElementSibling?.classList?.contains('hud')?overlay.previousElementSibling:document.querySelector('.hud');
  const distanceStat=distance?.closest('.stat');
  const bananaStat=bananas?.closest('.stat');
  const speedStat=speed?.closest('.stat');
  const bestFlag=document.createElement('div');
  bestFlag.className='hud-best';
  bestFlag.hidden=true;
  bestFlag.textContent='NEW BEST';
  hud?.append(bestFlag);

  const hudMeta=document.createElement('div');
  hudMeta.className='hud-meta';
  hudMeta.innerHTML='<span class="hud-best-readout" id="hud-best-readout">BEST 0 m</span><span class="hud-jump-hint" id="hud-jump-hint">SPACE / A · JUMP</span><span class="hud-run-state" id="hud-run-state">READY</span>';
  hud?.append(hudMeta);
  const hudBestReadout=byId('hud-best-readout');
  const hudJumpHint=byId('hud-jump-hint');
  const hudRunState=byId('hud-run-state');

  const landingCallout=document.createElement('div');
  landingCallout.className='landing-callout';
  landingCallout.hidden=true;
  hud?.append(landingCallout);
  let landingTimer=0;

  const speedUpCallout=document.createElement('div');
  speedUpCallout.className='speed-up-callout';
  speedUpCallout.hidden=true;
  speedUpCallout.textContent='SPEED UP';
  hud?.append(speedUpCallout);
  let speedUpTimer=0;

  const countdown=document.createElement('div');
  countdown.id='run-countdown';
  countdown.className='run-countdown';
  countdown.hidden=true;
  countdown.setAttribute('aria-live','assertive');
  countdown.innerHTML='<div class="countdown-avatar"><span id="countdown-avatar-image">🐵</span><strong id="countdown-avatar-name">Chimpion</strong></div><div class="countdown-number" id="countdown-number">3</div><div class="countdown-control">GET READY · SPACE / A · JUMP AFTER GO</div>';
  document.body.append(countdown);

  const pause=document.createElement('div');
  pause.id='pause-overlay';
  pause.className='presentation-overlay';
  pause.hidden=true;
  pause.innerHTML='<section class="presentation-card pause-card" role="dialog" aria-modal="true" aria-labelledby="pause-title"><small class="eyebrow">MOUNTAIN PAUSED</small><h2 id="pause-title">PAUSE</h2><div class="control-legend"><span><b>← → / LEFT STICK</b> Carve</span><span><b>SPACE / A · CROSS</b> Jump</span><span><b>ESC / START · MENU</b> Pause</span></div><div class="presentation-actions vertical"><button class="primary" id="resume-game">RESUME</button><button class="secondary" id="restart-pause">RESTART RUN</button><button class="toggle-button" id="toggle-sfx" aria-pressed="true">SFX · ON</button><button class="toggle-button" id="toggle-music" aria-pressed="true">MUSIC · ON</button></div><p class="controller-hint">Controller and keyboard ready</p></section>';
  document.body.append(pause);

  const results=document.createElement('div');
  results.id='result-overlay';
  results.className='presentation-overlay';
  results.hidden=true;
  results.innerHTML='<section class="presentation-card result-card" role="dialog" aria-modal="true" aria-labelledby="result-title"><small class="eyebrow" id="result-eyebrow">RUN COMPLETE</small><h2 id="result-title">WIPEOUT</h2><div class="result-grid"><div><small>DISTANCE</small><strong id="result-distance">0 m</strong></div><div><small>BANANAS</small><strong id="result-bananas">0</strong></div><div><small>BEST</small><strong id="result-best">0 m</strong></div></div><div class="new-best-banner" id="new-best-banner" hidden>NEW BEST!</div><div class="presentation-actions"><button class="primary" id="restart-result">SKI AGAIN</button><button class="secondary" id="choose-result">CHANGE CHIMPION</button></div><p class="controller-hint">ENTER / A · Restart &nbsp; · &nbsp; SPACE / A · Jump during run</p></section>';
  document.body.append(results);

  const resumeButton=byId('resume-game');
  const restartPause=byId('restart-pause');
  const restartResult=byId('restart-result');
  const chooseResult=byId('choose-result');
  const sfxButton=byId('toggle-sfx');
  const musicButton=byId('toggle-music');

  let mode='menu';
  let countdownToken=0;
  let resultTimer=0;
  let previousBananas=0;
  let previousSpeedBucket=0;
  let bestDistance=0;
  let bestCelebrated=false;
  let padButtons=[];
  let axisLatchX=0;
  let axisLatchY=0;

  function setMode(next){
    mode=next;
    document.body.dataset.mode=next;
    if(hudRunState)hudRunState.textContent=next==='playing'?'RUN':next==='paused'?'PAUSE':next==='crashed'?'DOWN':next==='countdown'?'READY':'MENU';
  }
  function setAvatar(entry){
    if(!entry)return;
    const name=byId('selected-avatar-name');
    const image=byId('selected-avatar-image');
    if(name)name.textContent=entry.name||'Chimpion';
    if(image){
      image.replaceChildren();
      if(entry.image){
        const img=document.createElement('img');
        img.src=entry.image;img.alt='';
        image.append(img);
      }else image.textContent='🐵';
    }
  }
  function setAvatarLoading(loading){
    if(startButton)startButton.disabled=!!loading;
    if(chooseButton)chooseButton.disabled=!!loading;
    if(restartPause)restartPause.disabled=!!loading;
    if(restartResult)restartResult.disabled=!!loading;
    if(chooseResult)chooseResult.disabled=!!loading;
    overlay?.classList.toggle('is-loading',!!loading);
    if(startButton)startButton.textContent=loading?'LOADING CHIMPION…':(mode==='menu'?'START SKIING':'SKI AGAIN');
  }
  function syncAudioButtons(){
    const settings=audio.getSettings();
    if(sfxButton){
      sfxButton.textContent='SFX · '+(settings.sfxEnabled?'ON':'OFF');
      sfxButton.setAttribute('aria-pressed',String(settings.sfxEnabled));
    }
    if(musicButton){
      musicButton.textContent='MUSIC · '+(settings.musicEnabled?'ON':'OFF');
      musicButton.setAttribute('aria-pressed',String(settings.musicEnabled));
    }
  }
  function pulse(element,className){
    if(!element)return;
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    setTimeout(()=>element.classList.remove(className),420);
  }
  function prepareRun({best=0,speed=SKI_TUNING.BASE_SPEED}={}){
    clearTimeout(resultTimer);
    resultTimer=0;
    countdownToken++;
    clearTimeout(landingTimer);
    clearTimeout(speedUpTimer);
    landingCallout.hidden=true;
    speedUpCallout.hidden=true;
    previousBananas=0;
    previousSpeedBucket=0;
    bestDistance=Math.max(0,Number(best)||0);
    bestCelebrated=false;
    bestFlag.hidden=true;
    results.hidden=true;
    pause.hidden=true;
    overlay.classList.add('is-leaving');
    setTimeout(()=>{if(mode==='countdown')overlay.hidden=true;},220);
    distanceStat?.classList.remove('is-best');
    setMode('countdown');
    updateHud({distance:0,bananas:0,speed,best:bestDistance});
  }
  function startCountdown({entry,onGo,durationMs=3200}={}){
    const token=++countdownToken;
    const image=byId('countdown-avatar-image');
    const name=byId('countdown-avatar-name');
    if(name)name.textContent=entry?.name||'Chimpion';
    if(image){
      image.replaceChildren();
      if(entry?.image){
        const img=document.createElement('img');img.src=entry.image;img.alt='';image.append(img);
      }else image.textContent='🐵';
    }
    const number=byId('countdown-number');
    const step=durationMs/4;
    const frames=[
      ['3',0,'countTick'],
      ['2',step,'countTick'],
      ['1',step*2,'countTickStrong'],
      ['0',step*3,'countTickStrong'],
      ['GO',durationMs,'go']
    ];
    countdown.hidden=false;
    countdown.classList.add('is-active');
    for(const [label,delay,sound] of frames){
      setTimeout(()=>{
        if(token!==countdownToken)return;
        number.textContent=label;
        number.classList.toggle('is-go',label==='GO');
        number.classList.remove('tick');
        void number.offsetWidth;
        number.classList.add('tick');
        audio.play(sound,label==='GO'?.58:label==='1'?.34:label==='0'?.38:.27);
        if(label==='GO'){
          countdown.classList.add('is-launching');
          setMode('playing');
          onGo?.();
          setTimeout(()=>{
            if(token!==countdownToken)return;
            countdown.classList.remove('is-active','is-launching');
            countdown.hidden=true;
          },260);
        }
      },delay);
    }
  }
  function cancelCountdown(){
    countdownToken++;
    countdown.hidden=true;
    countdown.classList.remove('is-active','is-launching');
  }
  function showPause(){
    cancelCountdown();
    pause.hidden=false;
    results.hidden=true;
    setMode('paused');
    syncAudioButtons();
    setTimeout(()=>resumeButton?.focus(),0);
  }
  function hidePause(){
    pause.hidden=true;
    setMode('playing');
  }
  function showResults({distance=0,bananas=0,best=0,newBest=false,crashType=''}={},delay=620){
    clearTimeout(resultTimer);
    resultTimer=setTimeout(()=>{
      byId('result-distance').textContent=Math.floor(distance)+' m';
      byId('result-bananas').textContent=String(bananas);
      byId('result-best').textContent=Math.floor(best)+' m';
      const banner=byId('new-best-banner');
      banner.hidden=!newBest;
      const eyebrow=byId('result-eyebrow');
      eyebrow.textContent=crashType?String(crashType).replace(/[-_]/g,' ').toUpperCase():'RUN COMPLETE';
      results.hidden=false;
      pause.hidden=true;
      setTimeout(()=>restartResult?.focus(),0);
    },delay);
  }
  function showMenu(){
    clearTimeout(resultTimer);
    resultTimer=0;
    cancelCountdown();
    results.hidden=true;
    pause.hidden=true;
    overlay.hidden=false;
    overlay.classList.remove('is-leaving');
    setMode('menu');
    setTimeout(()=>{if(!document.querySelector('.selector-dialog[open]'))startButton?.focus();},0);
  }
  function updateHud(values={}){
    const d=Math.max(0,Number(values.distance)||0);
    const b=Math.max(0,Number(values.bananas)||0);
    const kmh=Math.max(0,Math.round((Number(values.speed)||0)*3.6));
    const speedFeel=Math.max(.62,Math.min(1,.62+(kmh-140)/70*.38));
    if(distance)distance.textContent=Math.floor(d)+' m';
    if(bananas)bananas.textContent=String(b);
    if(speed)speed.textContent=kmh+' km/h';
    if(hudBestReadout)hudBestReadout.textContent='BEST '+Math.floor(Math.max(bestDistance,Number(values.best)||0))+' m';
    if(hudRunState&&mode==='playing')hudRunState.textContent=values.air?'AIR':'RUN';
    hud?.style.setProperty('--speed-intensity',String(speedFeel));
    hud?.classList.toggle('is-fast',speedFeel>.62);

    if(b>previousBananas)pulse(bananaStat,'stat-pop');
    previousBananas=b;

    const bucket=Math.floor(kmh/10);
    if(bucket>previousSpeedBucket&&previousSpeedBucket>0)pulse(speedStat,'stat-speed');
    previousSpeedBucket=bucket;

    const targetBest=Math.max(0,Number(values.best)||bestDistance);
    bestDistance=targetBest;
    if(!bestCelebrated&&bestDistance>0&&d>bestDistance){
      bestCelebrated=true;
      bestFlag.hidden=false;
      distanceStat?.classList.add('is-best');
      pulse(distanceStat,'stat-best-pop');
      setTimeout(()=>{if(bestFlag)bestFlag.hidden=true;},2200);
    }
  }
  function showLandingFeedback(quality='clean'){
    clearTimeout(landingTimer);
    const hard=quality==='hard'||quality==='rough';
    landingCallout.textContent=quality==='hard'?'HARD LANDING':quality==='rough'?'ROUGH LANDING':'CLEAN LANDING';
    landingCallout.className='landing-callout '+(hard?'is-hard':'is-clean');
    landingCallout.hidden=false;
    landingTimer=setTimeout(()=>{landingCallout.hidden=true;},hard?850:650);
  }
  function showSpeedUp(){
    clearTimeout(speedUpTimer);
    speedUpCallout.hidden=false;
    speedUpCallout.classList.remove('pulse');
    void speedUpCallout.offsetWidth;
    speedUpCallout.classList.add('pulse');
    speedUpTimer=setTimeout(()=>{speedUpCallout.hidden=true;speedUpCallout.classList.remove('pulse');},900);
  }
  function showJumpFeedback(source='JUMP'){
    if(hudJumpHint){
      hudJumpHint.textContent=source==='RAMP'?'RAMP LAUNCH':'JUMP';
      hudJumpHint.classList.remove('jump-pulse');
      void hudJumpHint.offsetWidth;
      hudJumpHint.classList.add('jump-pulse');
      setTimeout(()=>{hudJumpHint.textContent='SPACE / A · JUMP';hudJumpHint.classList.remove('jump-pulse');},520);
    }
  }
  function activeRoot(){
    if(!pause.hidden)return pause;
    if(!results.hidden)return results;
    if(overlay&&!overlay.hidden)return overlay;
    return null;
  }
  function focusMove(direction){
    const root=activeRoot();
    const buttons=buttonList(root);
    if(!buttons.length)return;
    const current=buttons.indexOf(document.activeElement);
    const index=current<0?(direction>0?0:buttons.length-1):(current+direction+buttons.length)%buttons.length;
    buttons[index].focus();
    audio.play('menu',.18);
  }
  function clickFocused(root){
    const buttons=buttonList(root);
    if(!buttons.length)return;
    const active=buttons.includes(document.activeElement)?document.activeElement:(root.querySelector('.primary:not([disabled])')||buttons[0]);
    active?.focus();
    active?.click();
  }
  function updateController(pad,selector){
    if(selector?.dialog?.open){
      selector.updateGamepad?.(pad);
      padButtons=pad.buttons?.slice?.()||[];
      axisLatchX=0;axisLatchY=0;
      return;
    }
    const buttons=pad.buttons||[];
    if(mode==='countdown'){
      padButtons=buttons.slice();
      axisLatchX=0;axisLatchY=0;
      return;
    }
    const pressed=index=>!!buttons[index]&&!padButtons[index];
    if(pressed(9)){
      if(mode==='playing')onPause?.();
      else if(mode==='paused')onResume?.();
      else if(mode==='menu')onStart?.();
      else if(mode==='crashed'&&!results.hidden)onRestart?.();
      padButtons=buttons.slice();
      return;
    }
    const root=activeRoot();
    if(root){
      if(pressed(0))clickFocused(root);
      if(pressed(1)&&mode==='paused')onResume?.();
      const x=pad.axis||0,y=pad.axisY||0;
      if(Math.abs(x)<.35)axisLatchX=0;
      if(Math.abs(y)<.35)axisLatchY=0;
      if(Math.abs(y)>.62&&!axisLatchY){axisLatchY=Math.sign(y);focusMove(Math.sign(y));}
      else if(Math.abs(x)>.62&&!axisLatchX){axisLatchX=Math.sign(x);focusMove(Math.sign(x));}
    }else{axisLatchX=0;axisLatchY=0;}
    padButtons=buttons.slice();
  }

  startButton?.addEventListener('click',()=>onStart?.());
  chooseButton?.addEventListener('click',()=>onChoose?.());
  resumeButton?.addEventListener('click',()=>onResume?.());
  restartPause?.addEventListener('click',()=>onRestart?.());
  restartResult?.addEventListener('click',()=>onRestart?.());
  chooseResult?.addEventListener('click',()=>onChoose?.());
  sfxButton?.addEventListener('click',()=>{
    const next=!audio.getSettings().sfxEnabled;
    audio.setSfxEnabled(next);syncAudioButtons();
  });
  musicButton?.addEventListener('click',()=>{
    const next=!audio.getSettings().musicEnabled;
    audio.setMusicEnabled(next);syncAudioButtons();
  });
  document.addEventListener('click',event=>{
    if(event.target.closest('button'))audio.play('button',.24);
  },true);
  document.addEventListener('keydown',event=>{
    if(event.repeat)return;
    if(document.querySelector('.selector-dialog[open]'))return;
    if(event.code==='Escape'){
      if(mode==='playing'){event.preventDefault();onPause?.();}
      else if(mode==='paused'){event.preventDefault();onResume?.();}
      return;
    }
    if(event.code==='Enter'&&!event.target.closest('button,input')){
      if(mode==='menu'){event.preventDefault();onStart?.();}
      else if(mode==='crashed'&&!results.hidden){event.preventDefault();onRestart?.();}
    }
  });

  syncAudioButtons();
  setMode('menu');

  return {setMode,setAvatar,setAvatarLoading,prepareRun,startCountdown,cancelCountdown,showPause,hidePause,showResults,showMenu,updateHud,updateController,syncAudioButtons,showLandingFeedback,showJumpFeedback,showSpeedUp};
}
