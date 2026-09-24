import {SKI_TUNING} from './gameplayTuning.js';
import {MENU_ACTION,createMenuFocusController,menuActionFromKeyboardEvent} from './menuNavigation.js';
import {CONTROL_COPY} from './controlCopy.js';
import {createMenuInputRepeat} from './menuInputRepeat.js';

function byId(id){return document.getElementById(id);}
function isVisible(element){return !!element&&!element.hidden&&element.getClientRects().length>0;}
function buttonList(root){
  if(!root)return [];
  return Array.from(root.querySelectorAll('button:not([disabled]),[role="button"][tabindex]:not([aria-disabled="true"])')).filter(isVisible);
}

export function createGameUI({audio,haptics,onStart,onPause,onResume,onRestart,onChoose,onGiveUp,onShowTutorial}){
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
  hudMeta.innerHTML=`<span class="hud-best-readout" id="hud-best-readout">BEST 0 m</span><span class="hud-jump-hint" id="hud-jump-hint">${CONTROL_COPY.jump} · JUMP</span><span class="hud-camera-hint">${CONTROL_COPY.camera} · CAMERA</span><span class="hud-run-state" id="hud-run-state">READY</span>`;
  hud?.append(hudMeta);
  const hudBestReadout=byId('hud-best-readout');
  const hudJumpHint=byId('hud-jump-hint');
  const hudRunState=byId('hud-run-state');

  const bananaPower=document.createElement('section');
  bananaPower.className='banana-power';
  bananaPower.setAttribute('aria-label','Banana Power meter');
  bananaPower.innerHTML=`
    <div class="banana-power-head"><span>🍌 BANANA POWER</span><strong id="banana-power-count">0 / 10</strong></div>
    <div class="banana-power-track" aria-hidden="true"><span id="banana-power-fill"></span></div>
    <div class="banana-power-ready" id="banana-power-ready" hidden>
      <strong>BANANA POWER READY</strong>
      <span>PRESS <kbd class="keycap-q">Q</kbd> OR <b class="gamepad-x-icon" aria-label="controller X button">X</b></span>
    </div>
    <div class="banana-power-active" id="banana-power-active" hidden>BULLET TIME</div>
  `;
  document.body.append(bananaPower);
  const bananaPowerCount=byId('banana-power-count');
  const bananaPowerFill=byId('banana-power-fill');
  const bananaPowerReady=byId('banana-power-ready');
  const bananaPowerActive=byId('banana-power-active');

  const cameraCallout=document.createElement('div');
  cameraCallout.className='camera-mode-callout';
  cameraCallout.hidden=true;
  document.body.append(cameraCallout);
  let cameraCalloutTimer=0;

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

  const trickHint=document.createElement('aside');
  trickHint.id='trick-discovery-hint';
  trickHint.className='trick-discovery-hint';
  trickHint.hidden=true;
  trickHint.setAttribute('role','status');
  trickHint.setAttribute('aria-live','polite');
  trickHint.innerHTML=`<small>TRICKS</small><strong>${CONTROL_COPY.trick360}</strong><strong>${CONTROL_COPY.trickBackflip}</strong><span>${CONTROL_COPY.controllerTrick}</span>`;
  document.body.append(trickHint);
  let trickHintTimer=0;
  let trickHintShown=false;

  const countdown=document.createElement('div');
  countdown.id='run-countdown';
  countdown.className='run-countdown';
  countdown.hidden=true;
  countdown.setAttribute('aria-live','assertive');
  countdown.innerHTML='<div class="countdown-avatar"><span id="countdown-avatar-image">🐵</span><strong id="countdown-avatar-name">Chimpion</strong></div><div class="countdown-number" id="countdown-number">3</div><div class="countdown-control">GET READY · SPACE / A · JUMP AFTER GO</div>';
  document.body.append(countdown);

  const runLoading=document.createElement('div');
  runLoading.id='run-loading-overlay';
  runLoading.className='presentation-overlay run-loading-overlay';
  runLoading.hidden=true;
  runLoading.innerHTML='<section class="presentation-card run-loading-card" role="status" aria-live="polite"><small class="eyebrow">RIDER READY</small><h2>PREPARING THE RUN…</h2><p>Finalizing rider and course</p></section>';
  document.body.append(runLoading);

  const pause=document.createElement('div');
  pause.id='pause-overlay';
  pause.className='presentation-overlay';
  pause.hidden=true;
  pause.innerHTML=`<section class="presentation-card pause-card" role="dialog" aria-modal="true" aria-labelledby="pause-title"><small class="eyebrow">MOUNTAIN PAUSED</small><h2 id="pause-title">PAUSE</h2><div class="control-legend"><span><b>${CONTROL_COPY.carve}</b> Carve</span><span><b>${CONTROL_COPY.jump}</b> Jump</span><span><b>${CONTROL_COPY.pause}</b> Pause</span></div><div class="presentation-actions vertical"><button class="primary" id="resume-game" data-menu-default="true">RESUME</button><button class="secondary" id="restart-pause">RESTART RUN</button><button class="secondary" id="settings-pause">SETTINGS</button><button class="leave-game-button" id="give-up-pause">GIVE UP AND LEAVE TO GAME SELECTION</button></div><p class="controller-hint">${CONTROL_COPY.confirm} · Select &nbsp; · &nbsp; ${CONTROL_COPY.cancel} · Back</p></section>`;
  document.body.append(pause);

  const results=document.createElement('div');
  results.id='result-overlay';
  results.className='presentation-overlay';
  results.hidden=true;
  results.innerHTML=`<section class="presentation-card result-card" role="dialog" aria-modal="true" aria-labelledby="result-title"><small class="eyebrow" id="result-eyebrow">RUN COMPLETE</small><h2 id="result-title">WIPEOUT</h2><div class="result-grid"><div><small>DISTANCE</small><strong id="result-distance">0 m</strong></div><div><small>SCORE</small><strong id="result-score">0</strong></div><div><small>BANANAS</small><strong id="result-bananas">0</strong></div><div><small>TIME</small><strong id="result-time">0:00</strong></div><div><small>MAX SPEED</small><strong id="result-max-speed">0 km/h</strong></div><div><small>BEST COMBO</small><strong id="result-combo">0</strong></div><div><small>RIDE</small><strong id="result-ride">SKI</strong></div><div><small>BEST DIST.</small><strong id="result-best">0 m</strong></div><div><small>NEAR MISSES</small><strong id="result-near-misses">0</strong></div><div><small>TRICKS LANDED</small><strong id="result-tricks-landed">0</strong></div><div><small>TRICKS FAILED</small><strong id="result-tricks-failed">0</strong></div><div><small>CLEAN LANDINGS</small><strong id="result-clean-landings">0</strong></div><div><small>STRONG LANDINGS</small><strong id="result-strong-landings">0</strong></div><div><small>POWER USES</small><strong id="result-power-uses">0</strong></div><div><small>BEST TRICK</small><strong id="result-best-trick">0</strong></div></div><div class="new-best-banner" id="new-best-banner" hidden>NEW BEST!</div><div class="presentation-actions"><button class="primary" id="restart-result" data-menu-default="true">RIDE AGAIN</button><button class="secondary" id="choose-result">CHANGE CHIMPION</button></div><div class="presentation-actions vertical leave-actions"><button class="leave-game-button" id="give-up-result">GIVE UP AND LEAVE TO GAME SELECTION</button></div><p class="controller-hint">${CONTROL_COPY.confirm} · Select &nbsp; · &nbsp; ${CONTROL_COPY.cancel} · Back</p></section>`;
  document.body.append(results);

  const settings=document.createElement('div');
  settings.id='settings-overlay';
  settings.className='presentation-overlay settings-overlay';
  settings.hidden=true;
  settings.innerHTML=`<section class="presentation-card settings-card" role="dialog" aria-modal="true" aria-labelledby="settings-title"><small class="eyebrow">PREFERENCES</small><h2 id="settings-title">SETTINGS</h2><div class="presentation-actions vertical settings-actions"><button class="toggle-button" id="toggle-music" aria-pressed="true">MUSIC · ON</button><button class="toggle-button" id="music-volume">MUSIC VOLUME · 70%</button><button class="toggle-button" id="toggle-sfx" aria-pressed="true">SFX · ON</button><button class="toggle-button" id="sfx-volume">SFX VOLUME · 80%</button><button class="toggle-button" id="quality-profile">QUALITY · AUTO</button><button class="toggle-button" id="camera-view">CAMERA VIEW · CHASE</button><button class="toggle-button" id="camera-motion">CAMERA MOTION · FULL</button><button class="toggle-button" id="toggle-haptics" aria-pressed="true">HAPTICS · ON</button><button class="secondary" id="how-to-play">HOW TO PLAY</button><button class="primary" id="settings-close" data-menu-default="true">DONE</button></div><p class="controller-hint">Settings are saved on this device · ${CONTROL_COPY.cancel} · Back</p></section>`;
  document.body.append(settings);

  const settingsMenuButton=document.createElement('button');
  settingsMenuButton.type='button';
  settingsMenuButton.id='settings-menu';
  settingsMenuButton.className='secondary';
  settingsMenuButton.textContent='SETTINGS';
  settingsMenuButton.setAttribute('aria-label','Open settings');
  overlay?.querySelector('.menu-actions')?.prepend(settingsMenuButton);

  const leaveConfirm=document.createElement('div');
  leaveConfirm.id='leave-confirm-overlay';
  leaveConfirm.className='presentation-overlay leave-confirm-overlay';
  leaveConfirm.hidden=true;
  leaveConfirm.innerHTML='<section class="presentation-card leave-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="leave-confirm-title"><small class="eyebrow">LEAVE RUN</small><h2 id="leave-confirm-title">Do you really want to leave the game?</h2><div class="presentation-actions"><button class="secondary" id="leave-confirm-no" data-menu-default="true">NO</button><button class="leave-confirm-yes" id="leave-confirm-yes">YES</button></div><p class="controller-hint">NO is selected by default · ESC / B cancels</p></section>';
  document.body.append(leaveConfirm);

  const resumeButton=byId('resume-game');
  const restartPause=byId('restart-pause');
  const restartResult=byId('restart-result');
  const chooseResult=byId('choose-result');
  const settingsPauseButton=byId('settings-pause');
  const settingsCloseButton=byId('settings-close');
  const sfxButton=byId('toggle-sfx');
  const musicButton=byId('toggle-music');
  const sfxVolumeButton=byId('sfx-volume');
  const musicVolumeButton=byId('music-volume');
  const qualityButton=byId('quality-profile');
  const cameraViewButton=byId('camera-view');
  const cameraMotionButton=byId('camera-motion');
  const hapticsButton=byId('toggle-haptics');
  const howToPlayButton=byId('how-to-play');
  const giveUpPause=byId('give-up-pause');
  const giveUpResult=byId('give-up-result');
  const leaveNo=byId('leave-confirm-no');
  const leaveYes=byId('leave-confirm-yes');

  let mode='menu';
  let countdownToken=0;
  let resultTimer=0;
  let previousBananas=0;
  let previousSpeedBucket=0;
  let bestDistance=0;
  let bestCelebrated=false;
  let activeControllerSelector=null;
  let qualityMode='auto';
  let qualityOptions=[];
  let qualityCallback=null;
  let cameraViewMode='chase';
  let cameraViewCallback=null;
  let cameraMotionMode='auto';
  let cameraMotionCallback=null;
  let hapticsCallback=null;
  let settingsOrigin=null;

  const menuFocus=createMenuFocusController({
    getRoot:()=>activeRoot(),
    getItems:buttonList,
    onMove:()=>{audio.play('menu',.18);haptics?.menuMove?.();},
    onConfirm:()=>haptics?.menuConfirm?.(),
    onCancel:()=>cancelActiveMenu(),
    onMenu:()=>toggleMenuFromAction()
  });

  function showLeaveConfirm(origin=null){
    leaveConfirm.hidden=false;
    menuFocus.open({root:leaveConfirm,defaultElement:leaveNo,restoreFrom:origin||document.activeElement});
  }
  function hideLeaveConfirm(){
    if(leaveConfirm.hidden)return;
    leaveConfirm.hidden=true;
    menuFocus.close({root:leaveConfirm,restore:true});
  }
  function confirmLeave(){
    leaveConfirm.hidden=true;
    menuFocus.close({root:leaveConfirm,restore:false});
    onGiveUp?.();
  }

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
    const audioSettings=audio.getSettings();
    if(sfxButton){
      sfxButton.textContent='SFX · '+(audioSettings.sfxEnabled?'ON':'OFF');
      sfxButton.setAttribute('aria-pressed',String(audioSettings.sfxEnabled));
    }
    if(musicButton){
      musicButton.textContent='MUSIC · '+(audioSettings.musicEnabled?'ON':'OFF');
      musicButton.setAttribute('aria-pressed',String(audioSettings.musicEnabled));
    }
    if(sfxVolumeButton)sfxVolumeButton.textContent='SFX VOLUME · '+Math.round((audioSettings.sfx??1)*100)+'%';
    if(musicVolumeButton)musicVolumeButton.textContent='MUSIC VOLUME · '+Math.round((audioSettings.music??1)*100)+'%';
  }
  function cycleVolume(kind){
    const audioSettings=audio.getSettings();
    const current=kind==='music'?audioSettings.music:audioSettings.sfx;
    const next=Math.round((((Number(current)||0)+.25)%1.25)*100)/100;
    if(kind==='music')audio.setMusicVolume(next);
    else audio.setSfxVolume(next);
    syncAudioButtons();
  }
  function syncSettingsButtons(){
    syncAudioButtons();
    if(cameraViewButton){
      const labels={chase:'CHASE',fixed:'FIXED VIEW', 'high-far':'HIGH + FAR','first-person':'FIRST PERSON'};
      cameraViewButton.textContent='CAMERA VIEW · '+(labels[cameraViewMode]||cameraViewMode.toUpperCase());
      cameraViewButton.setAttribute('aria-label','Camera view '+(labels[cameraViewMode]||cameraViewMode));
    }
    if(cameraMotionButton){
      cameraMotionButton.textContent='CAMERA MOTION · '+cameraMotionMode.toUpperCase();
      cameraMotionButton.setAttribute('aria-label','Camera motion '+cameraMotionMode);
    }
    if(hapticsButton){
      const enabled=haptics?.isEnabled?.()!==false;
      hapticsButton.textContent='HAPTICS · '+(enabled?'ON':'OFF');
      hapticsButton.setAttribute('aria-pressed',String(enabled));
    }
  }
  function showSettings(origin=null){
    if(!settings.hidden)return true;
    settingsOrigin=origin||document.activeElement;
    settings.hidden=false;
    syncSettingsButtons();
    menuFocus.open({root:settings,defaultElement:settingsCloseButton,restoreFrom:settingsOrigin});
    return true;
  }
  function hideSettings(){
    if(settings.hidden)return false;
    settings.hidden=true;
    menuFocus.close({root:settings,restore:true});
    settingsOrigin=null;
    return true;
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
    runLoading.hidden=true;
    leaveConfirm.hidden=true;
    settings.hidden=true;
    results.hidden=true;
    pause.hidden=true;
    menuFocus.reset();
    overlay.classList.add('is-leaving');
    setTimeout(()=>{if(mode==='countdown')overlay.hidden=true;},220);
    distanceStat?.classList.remove('is-best');
    setMode('countdown');
    updateHud({distance:0,bananas:0,speed,best:bestDistance});
  }
  function startCountdown({entry,onGo,durationMs=2700}={}){
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
    const step=durationMs/3;
    const frames=[
      ['3',0,'countTick'],
      ['2',step,'countTick'],
      ['1',step*2,'countTickStrong'],
      ['GO!',durationMs,'go']
    ];
    countdown.hidden=false;
    countdown.classList.remove('is-launching');
    countdown.classList.add('is-active');
    for(const [label,delay,sound] of frames){
      setTimeout(()=>{
        if(token!==countdownToken)return;
        const isGo=label==='GO!';
        number.textContent=label;
        number.classList.toggle('is-go',isGo);
        number.classList.remove('tick');
        void number.offsetWidth;
        number.classList.add('tick');
        if(isGo){
          const playedGoCue=audio.playGoCue?.();
          if(playedGoCue===undefined)audio.play(sound,.68);
        }else audio.play(sound,label==='1'?.36:.27);
        if(isGo){
          countdown.classList.add('is-launching');
          setMode('playing');
          onGo?.();
          setTimeout(()=>{
            if(token!==countdownToken)return;
            countdown.classList.remove('is-active','is-launching');
            countdown.hidden=true;
          },520);
        }
      },delay);
    }
  }
  function cancelCountdown(){
    countdownToken++;
    countdown.hidden=true;
    countdown.classList.remove('is-active','is-launching');
  }
  function showRunLoading(){
    menuFocus.reset();
    runLoading.hidden=false;
  }
  function hideRunLoading(){
    runLoading.hidden=true;
  }

  function showPause(){
    cancelCountdown();
    leaveConfirm.hidden=true;
    pause.hidden=false;
    results.hidden=true;
    setMode('paused');
    syncAudioButtons();
    setTimeout(()=>menuFocus.open({root:pause,defaultElement:resumeButton}),0);
  }
  function hidePause(){
    menuFocus.close({root:pause,restore:false});
    pause.hidden=true;
    setMode('playing');
  }
  function showResults({distance=0,score=0,bananas=0,best=0,newBest=false,crashType='',time=0,maxSpeedKmh=0,bestCombo=0,rideMode='ski',nearMisses=0,tricksLanded=0,tricksFailed=0,cleanLandings=0,strongLandings=0,bananaPowerUses=0,largestTrickScore=0}={},delay=620){
    clearTimeout(resultTimer);
    resultTimer=setTimeout(()=>{
      leaveConfirm.hidden=true;
      byId('result-distance').textContent=Math.floor(distance)+' m';
      byId('result-score').textContent=Math.max(0,Math.floor(Number(score)||0)).toLocaleString();
      byId('result-bananas').textContent=String(bananas);
      const totalSeconds=Math.max(0,Math.floor(Number(time)||0));
      byId('result-time').textContent=Math.floor(totalSeconds/60)+':'+String(totalSeconds%60).padStart(2,'0');
      byId('result-max-speed').textContent=Math.max(0,Math.round(Number(maxSpeedKmh)||0))+' km/h';
      byId('result-combo').textContent=String(Math.max(0,Math.floor(Number(bestCombo)||0)));
      byId('result-ride').textContent=String(rideMode||'ski').toUpperCase();
      byId('result-best').textContent=Math.floor(best)+' m';
      byId('result-near-misses').textContent=String(Math.max(0,Math.floor(Number(nearMisses)||0)));
      byId('result-tricks-landed').textContent=String(Math.max(0,Math.floor(Number(tricksLanded)||0)));
      byId('result-tricks-failed').textContent=String(Math.max(0,Math.floor(Number(tricksFailed)||0)));
      byId('result-clean-landings').textContent=String(Math.max(0,Math.floor(Number(cleanLandings)||0)));
      byId('result-strong-landings').textContent=String(Math.max(0,Math.floor(Number(strongLandings)||0)));
      byId('result-power-uses').textContent=String(Math.max(0,Math.floor(Number(bananaPowerUses)||0)));
      byId('result-best-trick').textContent=Math.max(0,Math.floor(Number(largestTrickScore)||0)).toLocaleString();
      const banner=byId('new-best-banner');
      banner.hidden=!newBest;
      const eyebrow=byId('result-eyebrow');
      eyebrow.textContent=crashType?String(crashType).replace(/[-_]/g,' ').toUpperCase():'RUN COMPLETE';
      results.hidden=false;
      pause.hidden=true;
      if(newBest){
        audio.playNewBest?.();
        haptics?.newBest?.();
      }
      setTimeout(()=>menuFocus.open({root:results,defaultElement:restartResult}),0);
    },delay);
  }
  function showMenu(){
    clearTimeout(resultTimer);
    resultTimer=0;
    cancelCountdown();
    menuFocus.reset();
    leaveConfirm.hidden=true;
    settings.hidden=true;
    results.hidden=true;
    pause.hidden=true;
    overlay.hidden=false;
    overlay.classList.remove('is-leaving');
    setMode('menu');
    if(!document.querySelector('.selector-dialog[open]'))menuFocus.open({root:overlay,defaultElement:startButton});
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
    const powerProgress=Math.max(0,Math.min(10,Math.floor(Number(values.bananaPowerProgress)||0)));
    const specialReady=!!values.specialReady;
    const specialActiveTime=Math.max(0,Number(values.specialActiveTime)||0);
    if(bananaPowerCount)bananaPowerCount.textContent=(specialReady?'10':powerProgress)+' / 10';
    if(bananaPowerFill)bananaPowerFill.style.width=((specialReady?10:powerProgress)*10)+'%';
    if(bananaPowerReady)bananaPowerReady.hidden=!specialReady;
    if(bananaPowerActive){
      bananaPowerActive.hidden=specialActiveTime<=0;
      if(specialActiveTime>0)bananaPowerActive.textContent='BULLET TIME · '+specialActiveTime.toFixed(1)+'s';
    }
    bananaPower.classList.toggle('is-ready',specialReady);
    bananaPower.classList.toggle('is-active',specialActiveTime>0);
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
  function showLandingFeedback(quality='clean',intensity=0){
    clearTimeout(landingTimer);
    const amount=Math.max(0,Math.min(1,Number(intensity)||0));
    if(quality==='clean'&&amount<.34){
      landingCallout.hidden=true;
      return;
    }
    landingCallout.textContent=quality==='hard'?'HARD LANDING':quality==='clean'?'CLEAN LANDING':'ROUGH LANDING';
    landingCallout.className=quality==='hard'?'landing-callout is-hard':'landing-callout';
    landingCallout.hidden=false;
    landingTimer=setTimeout(()=>{landingCallout.hidden=true;},quality==='clean'?620:850);
  }
  function showSpeedUp(){
    clearTimeout(speedUpTimer);
    speedUpCallout.hidden=false;
    speedUpCallout.classList.remove('pulse');
    void speedUpCallout.offsetWidth;
    speedUpCallout.classList.add('pulse');
    speedUpTimer=setTimeout(()=>{speedUpCallout.hidden=true;speedUpCallout.classList.remove('pulse');},900);
  }
  function showCameraMode(cameraMode='chase'){
    const labels={chase:'CHASE',fixed:'FIXED VIEW','high-far':'HIGH + FAR','first-person':'FIRST PERSON'};
    clearTimeout(cameraCalloutTimer);
    cameraCallout.textContent=(labels[cameraMode]||String(cameraMode).toUpperCase())+' · E / Y';
    cameraCallout.hidden=false;
    cameraCallout.classList.remove('pulse');
    void cameraCallout.offsetWidth;
    cameraCallout.classList.add('pulse');
    cameraCalloutTimer=setTimeout(()=>{cameraCallout.hidden=true;cameraCallout.classList.remove('pulse');},1300);
  }
  function showBananaPowerReady(){
    bananaPower.classList.remove('power-burst');
    void bananaPower.offsetWidth;
    bananaPower.classList.add('power-burst');
    setTimeout(()=>bananaPower.classList.remove('power-burst'),520);
  }
  function showBananaPowerActivated(){
    bananaPower.classList.remove('power-burst');
    void bananaPower.offsetWidth;
    bananaPower.classList.add('power-burst');
    setTimeout(()=>bananaPower.classList.remove('power-burst'),720);
  }
  function showJumpFeedback(source='JUMP'){
    if(hudJumpHint){
      hudJumpHint.textContent=source==='RAMP'?'RAMP LAUNCH':'JUMP';
      hudJumpHint.classList.remove('jump-pulse');
      void hudJumpHint.offsetWidth;
      hudJumpHint.classList.add('jump-pulse');
      setTimeout(()=>{hudJumpHint.textContent=CONTROL_COPY.jump+' · JUMP';hudJumpHint.classList.remove('jump-pulse');},520);
    }
  }
  function showTrickHint(){
    if(trickHintShown)return false;
    trickHintShown=true;
    clearTimeout(trickHintTimer);
    trickHint.hidden=false;
    trickHintTimer=setTimeout(()=>{trickHint.hidden=true;},4200);
    return true;
  }
  function configureQuality({mode='auto',options=['auto','high','medium','low'],onChange=null}={}){
    qualityOptions=Array.from(new Set((options||[]).map(value=>String(value).toLowerCase()).filter(Boolean)));
    qualityMode=String(mode||qualityOptions[0]||'high').toLowerCase();
    if(qualityOptions.length&&!qualityOptions.includes(qualityMode))qualityOptions.unshift(qualityMode);
    qualityCallback=typeof onChange==='function'?onChange:null;
    if(qualityButton){
      qualityButton.hidden=!(qualityCallback&&qualityOptions.length>1);
      qualityButton.textContent='QUALITY · '+qualityMode.toUpperCase();
      qualityButton.setAttribute('aria-label','Quality profile '+qualityMode);
    }
  }
  function cycleQuality(){
    if(!qualityCallback||qualityOptions.length<2)return false;
    const current=Math.max(0,qualityOptions.indexOf(qualityMode));
    qualityMode=qualityOptions[(current+1)%qualityOptions.length];
    qualityButton.textContent='QUALITY · '+qualityMode.toUpperCase();
    qualityButton.setAttribute('aria-label','Quality profile '+qualityMode);
    qualityCallback(qualityMode);
    return true;
  }
  function configureSettings({cameraView='chase',onCameraViewChange=null,cameraMotion='full',onCameraMotionChange=null,onHapticsChange=null}={}){
    cameraViewMode=['chase','fixed','high-far','first-person'].includes(String(cameraView).toLowerCase())
      ?String(cameraView).toLowerCase()
      :'chase';
    cameraViewCallback=typeof onCameraViewChange==='function'?onCameraViewChange:null;
    cameraMotionMode=['full','fixed','reduced'].includes(String(cameraMotion).toLowerCase())
      ?String(cameraMotion).toLowerCase()
      :'full';
    cameraMotionCallback=typeof onCameraMotionChange==='function'?onCameraMotionChange:null;
    hapticsCallback=typeof onHapticsChange==='function'?onHapticsChange:null;
    syncSettingsButtons();
  }
  function setCameraViewMode(mode='chase'){
    cameraViewMode=['chase','fixed','high-far','first-person'].includes(String(mode).toLowerCase())
      ?String(mode).toLowerCase()
      :'chase';
    syncSettingsButtons();
    return cameraViewMode;
  }
  function cycleCameraView(){
    const options=['chase','fixed','high-far','first-person'];
    cameraViewMode=options[(Math.max(0,options.indexOf(cameraViewMode))+1)%options.length];
    syncSettingsButtons();
    cameraViewCallback?.(cameraViewMode);
    return true;
  }
  function setCameraMotionMode(mode='full'){
    cameraMotionMode=['full','fixed','reduced'].includes(String(mode).toLowerCase())
      ?String(mode).toLowerCase()
      :'full';
    syncSettingsButtons();
    return cameraMotionMode;
  }
  function cycleCameraMotion(){
    const options=['full','fixed','reduced'];
    cameraMotionMode=options[(Math.max(0,options.indexOf(cameraMotionMode))+1)%options.length];
    syncSettingsButtons();
    cameraMotionCallback?.(cameraMotionMode);
    return true;
  }
  function showCameraMotion(mode='full'){
    const labels={full:'FULL',fixed:'FIXED',reduced:'REDUCED'};
    clearTimeout(cameraCalloutTimer);
    cameraCallout.textContent='CAMERA MOTION: '+(labels[mode]||String(mode).toUpperCase())+' · R / B';
    cameraCallout.hidden=false;
    cameraCallout.classList.remove('pulse');
    void cameraCallout.offsetWidth;
    cameraCallout.classList.add('pulse');
    cameraCalloutTimer=setTimeout(()=>{cameraCallout.hidden=true;cameraCallout.classList.remove('pulse');},1300);
  }

  function activeRoot(){
    if(!settings.hidden)return settings;
    if(!leaveConfirm.hidden)return leaveConfirm;
    if(!pause.hidden)return pause;
    if(!results.hidden)return results;
    if(overlay&&!overlay.hidden)return overlay;
    return null;
  }
  function cancelActiveMenu(){
    if(!settings.hidden){hideSettings();return true;}
    if(!leaveConfirm.hidden){hideLeaveConfirm();return true;}
    if(!results.hidden){showLeaveConfirm(giveUpResult);return true;}
    if(mode==='paused'){onResume?.();return true;}
    if(mode==='playing'){onPause?.();return true;}
    return false;
  }
  function toggleMenuFromAction(){
    if(mode==='playing'){onPause?.();return true;}
    if(mode==='paused'){onResume?.();return true;}
    if(mode==='menu'){onStart?.();return true;}
    if(mode==='crashed'&&!results.hidden){onRestart?.();return true;}
    return false;
  }
  function handleMenuAction(action,selector=null){
    if(!action||document.body.classList.contains('start-screen-active'))return false;
    if(selector?.dialog?.open)return !!selector.handleMenuAction?.(action);
    if(mode==='countdown')return false;
    if(action===MENU_ACTION.MENU){
      if(!settings.hidden)return hideSettings();
      return toggleMenuFromAction();
    }
    return menuFocus.handle(action);
  }
  // Controller owns device selection + repeat timing; UI owns semantic focus/navigation.
  const directionAction={up:MENU_ACTION.UP,down:MENU_ACTION.DOWN,left:MENU_ACTION.LEFT,right:MENU_ACTION.RIGHT};
  const menuInput=createMenuInputRepeat({
    adapter:{
      move(direction){const action=directionAction[direction];if(action)handleMenuAction(action,activeControllerSelector);},
      confirm(){handleMenuAction(MENU_ACTION.CONFIRM,activeControllerSelector);},
      cancel(){handleMenuAction(MENU_ACTION.CANCEL,activeControllerSelector);},
      menu(){handleMenuAction(MENU_ACTION.MENU,activeControllerSelector);}
    }
  });
  function updateController(pad={},selector=null){
    activeControllerSelector=selector;
    if(document.body.classList.contains('start-screen-active')||mode==='countdown'||!pad?.connected){
      menuInput.reset();
      return false;
    }
    if(mode==='playing'){
      const handled=!!pad?.edges?.pressed?.menu&&handleMenuAction(MENU_ACTION.MENU,selector);
      menuInput.reset();
      return handled;
    }
    if(!selector?.dialog?.open&&!activeRoot()){
      menuInput.reset();
      return false;
    }
    const events=menuInput.update(pad);
    return events.length>0;
  }

  for(const root of [overlay,pause,results,settings,leaveConfirm].filter(Boolean)){
    root.addEventListener('focusin',event=>{
      const button=event.target.closest?.('button:not([disabled])');
      if(button&&root.contains(button))menuFocus.syncFromFocus(button);
    });
  }

  startButton?.addEventListener('click',()=>onStart?.());
  chooseButton?.addEventListener('click',()=>onChoose?.());
  resumeButton?.addEventListener('click',()=>onResume?.());
  restartPause?.addEventListener('click',()=>onRestart?.());
  restartResult?.addEventListener('click',()=>onRestart?.());
  chooseResult?.addEventListener('click',()=>onChoose?.());
  settingsMenuButton?.addEventListener('click',()=>showSettings(settingsMenuButton));
  settingsPauseButton?.addEventListener('click',()=>showSettings(settingsPauseButton));
  settingsCloseButton?.addEventListener('click',hideSettings);
  giveUpPause?.addEventListener('click',()=>showLeaveConfirm(giveUpPause));
  giveUpResult?.addEventListener('click',()=>showLeaveConfirm(giveUpResult));
  leaveNo?.addEventListener('click',hideLeaveConfirm);
  leaveYes?.addEventListener('click',confirmLeave);
  sfxButton?.addEventListener('click',()=>{
    const next=!audio.getSettings().sfxEnabled;
    audio.setSfxEnabled(next);syncAudioButtons();
  });
  musicButton?.addEventListener('click',()=>{
    const next=!audio.getSettings().musicEnabled;
    audio.setMusicEnabled(next);syncAudioButtons();
  });
  sfxVolumeButton?.addEventListener('click',()=>cycleVolume('sfx'));
  musicVolumeButton?.addEventListener('click',()=>cycleVolume('music'));
  qualityButton?.addEventListener('click',cycleQuality);
  cameraViewButton?.addEventListener('click',cycleCameraView);
  cameraMotionButton?.addEventListener('click',cycleCameraMotion);
  hapticsButton?.addEventListener('click',()=>{
    const next=!(haptics?.isEnabled?.()!==false);
    haptics?.setEnabled?.(next);
    syncSettingsButtons();
    hapticsCallback?.(next);
  });
  howToPlayButton?.addEventListener('click',()=>{
    hideSettings();
    onShowTutorial?.();
  });
  document.addEventListener('click',event=>{
    if(document.body.classList.contains('start-screen-active'))return;
    if(event.target.closest('button'))audio.play('button',.24);
  },true);
  document.addEventListener('keydown',event=>{
    if(event.repeat||document.body.classList.contains('start-screen-active'))return;
    if(document.querySelector('.selector-dialog[open]'))return;
    if(event.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
    const action=menuActionFromKeyboardEvent(event);
    if(!action)return;
    if(mode==='playing'&&action!==MENU_ACTION.CANCEL)return;
    if(handleMenuAction(action)){
      event.preventDefault();
      event.stopPropagation();
    }
  });

  syncAudioButtons();
  setMode('menu');

  return {setMode,setAvatar,setAvatarLoading,showRunLoading,hideRunLoading,prepareRun,startCountdown,cancelCountdown,showPause,hidePause,showResults,showMenu,showSettings,hideSettings,updateHud,handleMenuAction,updateController,configureQuality,configureSettings,syncAudioButtons,showLandingFeedback,showJumpFeedback,showTrickHint,showSpeedUp,showCameraMode,showCameraMotion,showBananaPowerReady,showBananaPowerActivated,setCameraViewMode,setCameraMotionMode};
}
