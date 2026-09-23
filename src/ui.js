import {SKI_TUNING} from './gameplayTuning.js';
import {createMenuInputRepeat} from './menuInputRepeat.js';

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
  pause.innerHTML='<section class="presentation-card pause-card" role="dialog" aria-modal="true" aria-labelledby="pause-title"><small class="eyebrow">MOUNTAIN PAUSED</small><h2 id="pause-title">PAUSE</h2><div class="control-legend"><span><b>← → / LEFT STICK</b> Carve</span><span><b>SPACE / A · CROSS</b> Jump</span><span><b>ESC / START · MENU</b> Pause</span></div><div class="presentation-actions vertical"><button class="primary" id="resume-game">RESUME</button><button class="secondary" id="restart-pause">RESTART RUN</button><button class="toggle-button" id="toggle-sfx" aria-pressed="true">SFX · ON</button><button class="toggle-button" id="toggle-music" aria-pressed="true">MUSIC · ON</button><button class="leave-game-button" id="give-up-pause">GIVE UP AND LEAVE TO GAME SELECTION</button></div><p class="controller-hint">Controller and keyboard ready</p></section>';
  document.body.append(pause);

  const results=document.createElement('div');
  results.id='result-overlay';
  results.className='presentation-overlay';
  results.hidden=true;
  results.innerHTML='<section class="presentation-card result-card" role="dialog" aria-modal="true" aria-labelledby="result-title"><small class="eyebrow" id="result-eyebrow">RUN COMPLETE</small><h2 id="result-title">WIPEOUT</h2><div class="result-grid"><div><small>DISTANCE</small><strong id="result-distance">0 m</strong></div><div><small>BANANAS</small><strong id="result-bananas">0</strong></div><div><small>BEST</small><strong id="result-best">0 m</strong></div></div><div class="new-best-banner" id="new-best-banner" hidden>NEW BEST!</div><div class="presentation-actions"><button class="primary" id="restart-result">SKI AGAIN</button><button class="secondary" id="choose-result">CHANGE CHIMPION</button></div><div class="presentation-actions vertical leave-actions"><button class="leave-game-button" id="give-up-result">GIVE UP AND LEAVE TO GAME SELECTION</button></div><p class="controller-hint">ENTER / A · Restart &nbsp; · &nbsp; SPACE / A · Jump during run</p></section>';
  document.body.append(results);

  const leaveConfirm=document.createElement('div');
  leaveConfirm.id='leave-confirm-overlay';
  leaveConfirm.className='presentation-overlay leave-confirm-overlay';
  leaveConfirm.hidden=true;
  leaveConfirm.innerHTML='<section class="presentation-card leave-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="leave-confirm-title"><small class="eyebrow">LEAVE RUN</small><h2 id="leave-confirm-title">Do you really want to leave the game?</h2><div class="presentation-actions"><button class="secondary" id="leave-confirm-no">NO</button><button class="leave-confirm-yes" id="leave-confirm-yes">YES</button></div></section>';
  document.body.append(leaveConfirm);

  const resumeButton=byId('resume-game');
  const restartPause=byId('restart-pause');
  const restartResult=byId('restart-result');
  const chooseResult=byId('choose-result');
  const sfxButton=byId('toggle-sfx');
  const musicButton=byId('toggle-music');
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
  let controllerSelected=null;
  let leaveReturnFocus=null;

  function setControllerSelection(element){
    const next=element?.matches?.('button:not([disabled])')?element:null;
    if(controllerSelected===next)return;
    controllerSelected?.classList.remove('is-controller-selected');
    controllerSelected?.removeAttribute('data-controller-selected');
    controllerSelected=next;
    if(controllerSelected){
      controllerSelected.classList.add('is-controller-selected');
      controllerSelected.setAttribute('data-controller-selected','true');
    }
  }
  function clearControllerSelection(root=null){
    if(!controllerSelected)return;
    if(root&&!root.contains(controllerSelected))return;
    controllerSelected.classList.remove('is-controller-selected');
    controllerSelected.removeAttribute('data-controller-selected');
    controllerSelected=null;
  }

  function showLeaveConfirm(origin=null){
    leaveReturnFocus=origin||document.activeElement;
    leaveConfirm.hidden=false;
    setTimeout(()=>{
      leaveNo?.focus();
      setControllerSelection(leaveNo);
    },0);
  }
  function hideLeaveConfirm(){
    if(leaveConfirm.hidden)return;
    clearControllerSelection(leaveConfirm);
    leaveConfirm.hidden=true;
    const target=leaveReturnFocus;
    leaveReturnFocus=null;
    setTimeout(()=>{
      if(target?.isConnected&&!target.disabled){
        target.focus();
        setControllerSelection(target);
      }
    },0);
  }
  function confirmLeave(){
    clearControllerSelection(leaveConfirm);
    leaveConfirm.hidden=true;
    leaveReturnFocus=null;
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
    clearControllerSelection();
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
    setTimeout(()=>{
      resumeButton?.focus();
      setControllerSelection(resumeButton);
    },0);
  }
  function hidePause(){
    clearControllerSelection(pause);
    pause.hidden=true;
    setMode('playing');
  }
  function showResults({distance=0,bananas=0,best=0,newBest=false,crashType=''}={},delay=620){
    clearTimeout(resultTimer);
    resultTimer=setTimeout(()=>{
      leaveConfirm.hidden=true;
      byId('result-distance').textContent=Math.floor(distance)+' m';
      byId('result-bananas').textContent=String(bananas);
      byId('result-best').textContent=Math.floor(best)+' m';
      const banner=byId('new-best-banner');
      banner.hidden=!newBest;
      const eyebrow=byId('result-eyebrow');
      eyebrow.textContent=crashType?String(crashType).replace(/[-_]/g,' ').toUpperCase():'RUN COMPLETE';
      results.hidden=false;
      pause.hidden=true;
      setTimeout(()=>{
        restartResult?.focus();
        setControllerSelection(restartResult);
      },0);
    },delay);
  }
  function showMenu(){
    clearTimeout(resultTimer);
    resultTimer=0;
    cancelCountdown();
    clearControllerSelection();
    leaveConfirm.hidden=true;
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
      setTimeout(()=>{hudJumpHint.textContent='SPACE / A · JUMP';hudJumpHint.classList.remove('jump-pulse');},520);
    }
  }
  function activeRoot(){
    if(!leaveConfirm.hidden)return leaveConfirm;
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
    setControllerSelection(buttons[index]);
    audio.play('menu',.18);
    haptics?.menuMove?.();
  }
  function clickFocused(root){
    const buttons=buttonList(root);
    if(!buttons.length)return;
    const active=buttons.includes(document.activeElement)?document.activeElement:(root.querySelector('.primary:not([disabled])')||buttons[0]);
    active?.focus();
    setControllerSelection(active);
    haptics?.menuConfirm?.();
    active?.click();
  }
  const menuInput=createMenuInputRepeat({
    adapter:{
      move(direction){
        const root=activeRoot();
        if(!root)return;
        focusMove(direction==='down'||direction==='right'?1:-1);
      },
      confirm(){
        const root=activeRoot();
        if(root)clickFocused(root);
      },
      cancel(){
        if(!leaveConfirm.hidden)hideLeaveConfirm();
        else if(mode==='paused')onResume?.();
      },
      menu(){
        if(mode==='playing')onPause?.();
        else if(mode==='paused')onResume?.();
        else if(mode==='menu')onStart?.();
        else if(mode==='crashed'&&!results.hidden)onRestart?.();
      }
    }
  });
  function updateController(pad={},selector){
    if(document.body.classList.contains('start-screen-active')){
      menuInput.reset();
      return;
    }
    if(selector?.dialog?.open){
      menuInput.reset();
      selector.updateGamepad?.(pad);
      return;
    }
    if(mode==='countdown'){
      menuInput.reset();
      return;
    }
    if(!pad?.connected){
      menuInput.reset();
      return;
    }
    menuInput.update(pad);
  }

  for(const root of [pause,results,leaveConfirm]){
    root.addEventListener('focusin',event=>{
      const button=event.target.closest?.('button:not([disabled])');
      if(button&&root.contains(button))setControllerSelection(button);
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
  document.addEventListener('click',event=>{
    if(document.body.classList.contains('start-screen-active'))return;
    if(event.target.closest('button'))audio.play('button',.24);
  },true);
  document.addEventListener('keydown',event=>{
    if(event.repeat)return;
    if(document.body.classList.contains('start-screen-active'))return;
    if(document.querySelector('.selector-dialog[open]'))return;
    if(event.code==='Escape'){
      if(!leaveConfirm.hidden){
        event.preventDefault();
        hideLeaveConfirm();
      }else if(mode==='playing'){event.preventDefault();onPause?.();}
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

  return {setMode,setAvatar,setAvatarLoading,showRunLoading,hideRunLoading,prepareRun,startCountdown,cancelCountdown,showPause,hidePause,showResults,showMenu,updateHud,updateController,syncAudioButtons,showLandingFeedback,showJumpFeedback,showSpeedUp};
}
