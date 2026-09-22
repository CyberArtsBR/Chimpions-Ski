function primitive(value){
  return value==null?'':String(value);
}

function eventToken(clearEvent,total,lastClearPoints,combo){
  if(clearEvent==null||clearEvent===false)return null;
  if(typeof clearEvent!=='object'){
    return `primitive:${primitive(clearEvent)}|score:${total}|points:${lastClearPoints}|combo:${combo}`;
  }
  const explicit=clearEvent.id??clearEvent.sequence??clearEvent.seq??clearEvent.timestamp??clearEvent.time;
  if(explicit!=null)return `event:${primitive(explicit)}`;
  return [
    'snapshot',
    primitive(total),
    primitive(clearEvent.points??clearEvent.value??lastClearPoints),
    primitive(clearEvent.combo??clearEvent.multiplier??combo),
    primitive(clearEvent.chain??clearEvent.comboCount??clearEvent.streak??'')
  ].join(':');
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
  let presentationChain=0;
  let comboActsAsMultiplier=false;

  function chainLabel(clearEvent,combo){
    const data=typeof clearEvent==='object'&&clearEvent?clearEvent:{};
    const explicitChain=Number(data.chain??data.comboCount??data.streak??data.chainCount);
    if(Number.isFinite(explicitChain)&&explicitChain>=1){
      presentationChain=Math.max(1,Math.round(explicitChain));
      return presentationChain;
    }

    const explicitMultiplier=Number(data.multiplier);
    const rawCombo=Number(data.combo??combo);
    if(Number.isFinite(explicitMultiplier)){
      comboActsAsMultiplier=true;
      presentationChain=explicitMultiplier>1?Math.max(2,presentationChain+1):1;
      return presentationChain;
    }
    if(Number.isFinite(rawCombo)&&rawCombo%1!==0)comboActsAsMultiplier=true;

    if(comboActsAsMultiplier&&Number.isFinite(rawCombo)){
      presentationChain=rawCombo>1?Math.max(2,presentationChain+1):1;
      return presentationChain;
    }
    if(Number.isFinite(rawCombo)&&rawCombo>=1){
      presentationChain=Math.max(1,Math.round(rawCombo));
      return presentationChain;
    }

    presentationChain=Math.max(1,presentationChain+1);
    return presentationChain;
  }

  function showClear(points,chain){
    const safePoints=Math.max(0,Math.round(Number(points)||0));
    if(!safePoints)return;
    const safeChain=Math.max(1,Math.round(Number(chain)||1));
    while(popLayer.children.length>=4)popLayer.firstElementChild?.remove();
    const pop=document.createElement('div');
    pop.className='score-pop';
    pop.innerHTML=`<strong>+${safePoints}</strong>${safeChain>1?`<span>COMBO x${safeChain}</span>`:''}`;
    popLayer.append(pop);
    pop.addEventListener('animationend',()=>pop.remove(),{once:true});
    setTimeout(()=>pop.remove(),1250);
  }

  function update({score=0,combo=0,lastClearPoints=0,clearEvent=null}={}){
    const total=Math.max(0,Math.round(Number(score)||0));
    if(scoreValue)scoreValue.textContent=total.toLocaleString('en-US');

    const token=eventToken(clearEvent,total,lastClearPoints,combo);
    if(token!==null&&token!==previousEvent){
      previousEvent=token;
      const points=typeof clearEvent==='object'&&clearEvent
        ?(clearEvent.points??clearEvent.value??lastClearPoints)
        :lastClearPoints;
      showClear(points,chainLabel(clearEvent,combo));
    }
  }

  function reset({score=0,combo=0,lastClearPoints=0,clearEvent=null}={}){
    const total=Math.max(0,Math.round(Number(score)||0));
    previousEvent=eventToken(clearEvent,total,lastClearPoints,combo);
    presentationChain=0;
    comboActsAsMultiplier=false;
    if(scoreValue)scoreValue.textContent='0';
    popLayer.replaceChildren();
  }

  return {update,reset,showClear};
}
