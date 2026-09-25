const GAME_SELECTION_URL='https://chimp-jump.onrender.com/';

export function createStartScreen({audio,onStart,assetUrl='/start/chimpions-ski-start.jpg'}={}){
  const root=document.createElement('section');
  root.className='start-screen is-loading';
  root.setAttribute('aria-label','Chimpions Ski start screen');
  root.innerHTML=`
    <div class="start-screen-stage">
      <img class="start-screen-art" src="${assetUrl}" alt="Chimpions Ski snowy mountain start screen" width="1920" height="1080" decoding="async" fetchpriority="high" draggable="false" />
      <button class="start-screen-hit start-screen-play" type="button" aria-label="Start Game" disabled>
        <span class="sr-only">Start Game</span>
      </button>
      <a class="start-screen-hit start-screen-back" href="${GAME_SELECTION_URL}" aria-label="Back to the Game selection">
        <span class="sr-only">Back to the Game selection</span>
      </a>
      <div class="start-screen-status" aria-live="polite">Loading start screen…</div>
    </div>
  `;
  document.body.append(root);
  document.body.classList.add('start-screen-active');
  document.getElementById('ski-boot-cover')?.remove();

  const art=root.querySelector('.start-screen-art');
  const play=root.querySelector('.start-screen-play');
  const back=root.querySelector('.start-screen-back');
  const status=root.querySelector('.start-screen-status');
  let chimpionReady=false;
  let artReady=art.complete&&art.naturalWidth>0;
  let artFailed=false;
  let closing=false;
  let previousButtons=[];
  let axisLatch=0;

  function refreshReady(){
    const ready=chimpionReady&&(artReady||artFailed);
    root.classList.toggle('is-art-failed',artFailed);
    play.disabled=!ready;
    root.classList.toggle('is-loading',!ready);
    if(artFailed)status.textContent=chimpionReady?'ENTER / A · START':'Loading Chimpions Ski…';
    else if(!artReady)status.textContent='Loading start screen…';
    else if(!chimpionReady)status.textContent='Loading Chimpion…';
    else status.textContent='ENTER / A · START';
    if(ready&&root.isConnected&&!root.hidden&&document.activeElement===document.body){
      requestAnimationFrame(()=>{if(!play.disabled&&!root.hidden)play.focus();});
    }
    return ready;
  }

  art.addEventListener('load',()=>{
    artReady=true;
    artFailed=false;
    root.classList.add('is-art-ready');
    refreshReady();
  },{once:true});
  art.addEventListener('error',()=>{
    artReady=false;
    artFailed=true;
    refreshReady();
  },{once:true});
  if(artReady)root.classList.add('is-art-ready');

  function setReady(value){
    chimpionReady=!!value;
    refreshReady();
  }

  function start(){
    if(play.disabled||closing||root.hidden)return;
    closing=true;
    audio?.unlock?.();
    root.classList.add('is-leaving');
    setTimeout(()=>{
      const started=onStart?.();
      if(started===false){
        closing=false;
        root.classList.remove('is-leaving');
        refreshReady();
        return;
      }
      root.hidden=true;
      document.body.classList.remove('start-screen-active');
      previousButtons=[];
      axisLatch=0;
    },300);
  }

  play.addEventListener('click',start);
  back.addEventListener('click',()=>audio?.play?.('button',.18));

  function focusMove(direction){
    const targets=[play,back].filter(element=>!element.matches(':disabled'));
    if(!targets.length)return;
    const current=targets.indexOf(document.activeElement);
    const next=current<0?(direction>0?0:targets.length-1):(current+direction+targets.length)%targets.length;
    targets[next].focus();
    audio?.play?.('menu',.12);
  }

  function updateController(pad={}){
    const buttons=pad.buttons||[];
    if(root.hidden||closing){
      previousButtons=buttons.slice();
      return;
    }
    const pressed=index=>!!buttons[index]&&!previousButtons[index];
    const axisY=pad.axisY||0;
    if(Math.abs(axisY)<.35)axisLatch=0;
    if(Math.abs(axisY)>.62&&!axisLatch){
      axisLatch=Math.sign(axisY);
      focusMove(Math.sign(axisY));
    }
    if(pressed(9)){
      start();
      previousButtons=buttons.slice();
      return;
    }
    if(pressed(0)){
      const active=document.activeElement===back?back:play;
      active.click();
      previousButtons=buttons.slice();
      return;
    }
    previousButtons=buttons.slice();
  }

  refreshReady();

  return {
    setReady,
    updateController,
    start,
    get isActive(){return !root.hidden;},
    get isReady(){return !play.disabled;},
    gameSelectionUrl:GAME_SELECTION_URL
  };
}
