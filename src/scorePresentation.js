function eventToken(clearEvent){
  if(clearEvent==null||clearEvent===false)return null;
  if(typeof clearEvent!=='object')return clearEvent;
  return clearEvent.id??clearEvent.sequence??clearEvent.seq??clearEvent.timestamp??clearEvent.time??clearEvent;
}

export function createScorePresentation({hud=document.querySelector('.hud')}={}){
  const scoreStat=document.createElement('div');
  scoreStat.className='stat is-score';
  scoreStat.setAttribute('aria-label','Score');
  scoreStat.innerHTML='<small>SCORE</small><strong>0</strong>';
  hud?.append(scoreStat);
  const scoreValue=scoreStat.querySelector('strong');

  const popLayer=document.createElement('div');
  popLayer.className='score-pop-layer';
  popLayer.setAttribute('aria-live','polite');
  document.body.append(popLayer);

  let previousEvent=null;

  function showClear(points,combo){
    const safePoints=Math.max(0,Math.round(Number(points)||0));
    if(!safePoints)return;
    const safeCombo=Math.max(0,Math.floor(Number(combo)||0));
    const pop=document.createElement('div');
    pop.className='score-pop';
    pop.innerHTML=`<strong>+${safePoints}</strong>${safeCombo>1?`<span>COMBO x${safeCombo}</span>`:''}`;
    popLayer.append(pop);
    pop.addEventListener('animationend',()=>pop.remove(),{once:true});
    setTimeout(()=>pop.remove(),1250);
  }

  function update({score=0,combo=0,lastClearPoints=0,clearEvent=null}={}){
    const total=Math.max(0,Math.round(Number(score)||0));
    if(scoreValue)scoreValue.textContent=total.toLocaleString('en-US');

    const token=eventToken(clearEvent);
    if(token!==null&&token!==previousEvent){
      previousEvent=token;
      const points=typeof clearEvent==='object'
        ?(clearEvent.points??clearEvent.value??lastClearPoints)
        :lastClearPoints;
      const eventCombo=typeof clearEvent==='object'
        ?(clearEvent.combo??clearEvent.multiplier??combo)
        :combo;
      showClear(points,eventCombo);
    }
  }

  function reset(currentEvent=null){
    previousEvent=eventToken(currentEvent);
    if(scoreValue)scoreValue.textContent='0';
    popLayer.replaceChildren();
  }

  return {update,reset,showClear};
}
