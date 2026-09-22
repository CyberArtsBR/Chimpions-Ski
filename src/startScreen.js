const GAME_SELECTION_URL='https://chimp-jump.onrender.com/';

export function createStartScreen({audio,onStart,assetUrl='/start/chimpions-ski-start.webp'}={}){
  const root=document.createElement('section');
  root.className='start-screen';
  root.setAttribute('aria-label','Chimpions Ski start screen');
  root.innerHTML=`
    <div class="start-screen-stage">
      <img class="start-screen-art" src="${assetUrl}" alt="Chimpions Ski snowy mountain start screen" draggable="false" />
      <button class="start-screen-hit start-screen-play" type="button" aria-label="Start Game" disabled>
        <span class="sr-only">Start Game</span>
      </button>
      <a class="start-screen-hit start-screen-back" href="${GAME_SELECTION_URL}" aria-label="Back to the Game selection">
        <span class="sr-only">Back to the Game selection</span>
      </a>
      <div class="start-screen-status" aria-live="polite">Loading Chimpion…</div>
    </div>
  `;
  document.body.append(root);
  document.body.classList.add('start-screen-active');

  const play=root.querySelector('.start-screen-play');
  const back=root.querySelector('.start-screen-back');
  const status=root.querySelector('.start-screen-status');
  let ready=false;
  let closing=false;
  let previousButtons=[];
  let axisLatch=0;

  function setReady(value){
    ready=!!value;
    play.disabled=!ready;
    root.classList.toggle('is-loading',!ready);
    status.textContent=ready?'ENTER / A · START':'Loading Chimpion…';
    if(ready&&root.isConnected&&!root.hidden&&document.activeElement===document.body){
      requestAnimationFrame(()=>play.focus());
    }
  }

  function start(){
    if(!ready||closing||root.hidden)return;
    closing=true;
    audio?.unlock?.();
    audio?.play?.('button',.22);
    root.classList.add('is-leaving');
    setTimeout(()=>{
      onStart?.();
      root.hidden=true;
      document.body.classList.remove('start-screen-active');
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
    if(root.hidden||closing)return;
    const buttons=pad.buttons||[];
    const pressed=index=>!!buttons[index]&&!previousButtons[index];
    const axisY=pad.axisY||0;
    if(Math.abs(axisY)<.35)axisLatch=0;
    if(Math.abs(axisY)>.62&&!axisLatch){
      axisLatch=Math.sign(axisY);
      focusMove(Math.sign(axisY));
    }
    if(pressed(0)){
      const active=document.activeElement===back?back:play;
      active.click();
    }
    if(pressed(9))start();
    previousButtons=buttons.slice();
  }

  return {
    setReady,
    updateController,
    start,
    get isActive(){return !root.hidden;},
    gameSelectionUrl:GAME_SELECTION_URL
  };
}
