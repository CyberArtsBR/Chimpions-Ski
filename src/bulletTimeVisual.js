import './bulletTimeVisual.css';

export function createBulletTimeVisual({app}){
  const overlay=document.createElement('div');
  overlay.className='bullet-time-visual';overlay.hidden=true;
  overlay.setAttribute('aria-hidden','true');
  overlay.innerHTML='<div class="bullet-time-frame"></div><div class="bullet-time-clock"><span>BULLET TIME</span><strong>3.0s</strong><i><b></b></i></div>';
  app.append(overlay);
  const clock=overlay.querySelector('strong'),bar=overlay.querySelector('b');
  function update(state,reducedMotion){
    const remaining=Math.max(0,state.specialActiveTime||0);
    const visible=remaining>0&&(state.mode==='playing'||state.mode==='paused');
    overlay.hidden=!visible;
    if(!visible)return;
    const elapsed=3-remaining;
    const envelope=Math.min(1,elapsed/.12,remaining/.28);
    overlay.style.setProperty('--power-alpha',String(.25+.75*Math.max(0,envelope)));
    overlay.classList.toggle('reduced-motion',!!reducedMotion);
    overlay.classList.toggle('power-enter',elapsed<.3);
    overlay.classList.toggle('power-ending',remaining<.65);
    clock.textContent=`${remaining.toFixed(1)}s`;
    bar.style.transform=`scaleX(${Math.min(1,remaining/3)})`;
  }
  return {update};
}
