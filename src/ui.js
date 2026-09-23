import {SKI_TUNING} from './gameplayTuning.js';
import {MENU_ACTION,createMenuFocusController,menuActionFromKeyboardEvent} from './menuNavigation.js';
import {CONTROL_COPY} from './controlCopy.js';

function byId(id){return document.getElementById(id);}
function isVisible(element){return !!element&&!element.hidden&&element.getClientRects().length>0;}
function buttonList(root){
  if(!root)return [];
  return Array.from(root.querySelectorAll('button:not([disabled]),[role="button"][tabindex]:not([aria-disabled="true"])')).filter(isVisible);
}

export function createGameUI({audio,haptics,onStart,onPause,onResume,onRestart,onChoose,onGiveUp}){
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
  hudMeta.innerHTML=`<span class="hud-best-readout" id="hud-best-readout">BEST 0 m</span><span class="hud-jump-hint" id="hud-jump-hint">${CONTROL_COPY.jump} · JUMP</span><span class="hud-run-state" id="hud-run-state">READY</span>`;
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
  runLoading.innerHTML='<section class="presentation-card run-loading-card" role="status" aria-live="polite"><small class="eyebrow">START CREW</small><h2>PREPARING THE START LINE…</h2><p>Loading 50 unique Chimpions</p></section>';
  document.body.append(runLoading);

  const pause=document.createElement('div');
  pause.id='pause-overlay';
  pause.className='presentation-overlay';
  pause.hidden=true;
  pause.innerHTML=`<section class="presentation-card pause-card" role="dialog" aria-modal="true" aria-labelledby="pause-title"><small class="eyebrow">MOUNTAIN PAUSED</small><h2 id="pause-title">PAUSE</h2><div class="control-legend"><span><b>${CONTROL_COPY.carve}</b> Carve</span><span><b>${CONTROL_COPY.jump}</b> Jump</span><span><b>${CONTROL_COPY.pause}</b> Pause</span></div><div class="presentation-actions vertical"><button class="primary" id="resume-game" data-menu-default="true">RESUME</button><button class="secondary" id="restart-pause">RESTART RUN</button><button class="toggle-button" id="toggle-sfx" aria-pressed="true">SFX · ON</button><button class="toggle-button" id="toggle-music" aria-pressed="true">MUSIC · ON</button><button class="toggle-button" id="quality-profile" hidden>QUALITY · HIGH</button><button class="leave-game-button" id="give-up-pause">GIVE UP AND LEAVE TO GAME SELECTION</button></div><p class="controller-hint">${CONTROL_COPY.confirm} · Select &nbsp; · &nbsp; ${CONTROL_COPY.cancel} · Back</p></section>`;
  document.body.append(pause);

  const results=document.createElement('div');
  results.id='result-overlay';
  results.className='presentation-overlay';
  results.hidden=true;
  results.innerHTML=`<section class="presentation-card result-card" role="dialog" aria-modal="true" aria-labelledby="result-title"><small class="eyebrow" id="result-eyebrow">RUN COMPLETE</small><h2 id="result-title">WIPEOUT</h2><div class="result-grid"><div><small>DISTANCE</small><strong id="result-distance">0 m</strong></div><div><small>SCORE</small><strong id="result-score">0</strong></div><div><small>BANANAS</small><strong id="result-bananas">0</strong></div><div><small>BEST</small><strong id="result-best">0 m</strong></div></div><div class="new-best-banner" id="new-best-banner" hidden>NEW BEST!</div><div class="presentation-actions"><button class="primary" id="restart-result" data-menu-default="true">SKI AGAIN</button><button class="secondary" id="choose-result">CHANGE CHIMPION</button></div><div class="presentation-actions vertical leave-actions"><button class="leave-game-button" id="give-up-result">GIVE UP AND LEAVE TO GAME SELECTION</button></div><p class="controller-hint">${CONTROL_COPY.confirm} · Select &nbsp; · &nbsp; ${CONTROL_COPY.cancel} · Back</p></section>`;
  document.body.append(results);

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
  const sfxButton=byId('toggle-sfx');
  const musicButton=byId('toggle-music');
  const qualityButton=byId('quality-profile');
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
  let legacyAxisLatchX=0;
  let legacyAxisLatchY=0;
  let qualityMode='high';
  let qualityOptions=[];
  let qualityCallback=null;

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
    runLoading.hidden=true;
    leaveConfirm.hidden=true;
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
  function showResults({distance=0,score=0,bananas=0,best=0,newBest=false,crashType=''}={},delay=620){
    clearTimeout(resultTimer);
    resultTimer=setTimeout(()=>{
      leaveConfirm.hidden=true;
      byId('result-distance').textContent=Math.floor(distance)+' m';
      byId('result-score').textContent=Math.max(0,Math.floor(Number(score)||0)).toLocaleString();
      byId('result-bananas').textContent=String(bananas);
      byId('result-best').textContent=Math.floor(best)+' m';
      const banner=byId('new-best-banner');
      banner.hidden=!newBest;
      const eyebrow=byId('result-eyebrow');
      eyebrow.textContent=crashType?String(crashType).replace(/[-_]/g,' ').toUpperCase():'RUN COMPLETE';
      results.hidden=false;
      pause.hidden=true;
      setTimeout(()=>menuFocus.open({root:results,defaultElement:restartResult}),0);
    },delay);
  }
  function showMenu(){
    clearTimeout(resultTimer);
    resultTimer=0;
    cancelCountdown();
    menuFocus.reset();
    leaveConfirm.hidden=true;
    results.hidden=true;
    pause.hidden=true;
    overlay.hidden=false;
    overlay.classList.remove('is-leaving');
    setMode('menu');
    setTimeout(()=>{
      if(!document.querySelector('.selector-dialog[open]'))menuFocus.open({root:overlay,defaultElement:startButton});
    },0);
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
    if(quality==='clean'){
      landingCallout.hidden=true;
      return;
    }
    landingCallout.textContent=quality==='hard'?'HARD LANDING':'ROUGH LANDING';
    landingCallout.className='landing-callout is-hard';
    landingCallout.hidden=false;
    landingTimer=setTimeout(()=>{landingCallout.hidden=true;},850);
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
  function configureQuality({mode='high',options=['high','reduced'],onChange=null}={}){
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

  function activeRoot(){
    if(!leaveConfirm.hidden)return leaveConfirm;
    if(!pause.hidden)return pause;
    if(!results.hidden)return results;
    if(overlay&&!overlay.hidden)return overlay;
    return null;
  }
  function cancelActiveMenu(){
    if(!leaveConfirm.hidden){hideLeaveConfirm();return true;}
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
    if(action===MENU_ACTION.MENU)return toggleMenuFromAction();
    return menuFocus.handle(action);
  }
  // Compatibility adapter only: consumes the normalized readPad() snapshot.
  // It never selects an active device and never polls controller hardware itself.
  function updateController(pad,selector){
    if(!pad)return false;
    if(document.body.classList.contains('start-screen-active')){
      legacyAxisLatchX=legacyAxisLatchY=0;
      return false;
    }
    const pressed=pad.edges?.pressed||{};
    if(pressed.menu&&handleMenuAction(MENU_ACTION.MENU,selector))return true;
    if(pressed.cancel&&handleMenuAction(MENU_ACTION.CANCEL,selector))return true;
    if(pressed.confirm&&handleMenuAction(MENU_ACTION.CONFIRM,selector))return true;
    const x=Number(pad.axis)||0;
    const y=Number(pad.axisY)||0;
    if(Math.abs(x)<.35)legacyAxisLatchX=0;
    if(Math.abs(y)<.35)legacyAxisLatchY=0;
    if(Math.abs(y)>.62&&!legacyAxisLatchY){
      legacyAxisLatchY=Math.sign(y);
      return handleMenuAction(y<0?MENU_ACTION.UP:MENU_ACTION.DOWN,selector);
    }
    if(Math.abs(x)>.62&&!legacyAxisLatchX){
      legacyAxisLatchX=Math.sign(x);
      return handleMenuAction(x<0?MENU_ACTION.LEFT:MENU_ACTION.RIGHT,selector);
    }
    return false;
  }

  for(const root of [overlay,pause,results,leaveConfirm].filter(Boolean)){
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
  qualityButton?.addEventListener('click',cycleQuality);
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

  return {setMode,setAvatar,setAvatarLoading,showRunLoading,hideRunLoading,prepareRun,startCountdown,cancelCountdown,showPause,hidePause,showResults,showMenu,updateHud,handleMenuAction,updateController,configureQuality,syncAudioButtons,showLandingFeedback,showJumpFeedback,showTrickHint,showSpeedUp};
}
