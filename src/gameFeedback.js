export function createGameFeedback({audio,ui}){
  let previousAir=false;
  let rampSuppress=0;
  let wasPlaying=false;
  let speedTier=0;

  function reset(){
    previousAir=false;
    rampSuppress=0;
    wasPlaying=false;
    speedTier=0;
  }

  function onRampTakeoff(){
    rampSuppress=.28;
    audio.play('ramp',.72);
    ui?.showJumpFeedback?.('RAMP');
  }

  function onLanding(landing={}){
    if(!landing.landed)return;
    const quality=landing.quality||'clean';
    if(quality==='hard')audio.play('hardLand',.78);
    else if(quality==='rough')audio.play('hardLand',.62);
    else audio.play('land',.50);
    ui?.showLandingFeedback?.(quality);
  }

  function onCrash(){
    audio.play('crash',.88);
  }

  function update(state,dt){
    rampSuppress=Math.max(0,rampSuppress-dt);
    const playing=state.mode==='playing';
    if(playing&&wasPlaying&&!previousAir&&state.air&&rampSuppress<=0){
      audio.play('jump',.66);
      ui?.showJumpFeedback?.('JUMP');
    }
    if(playing){
      const nextTier=Math.floor((state.time||0)/30);
      if(nextTier>speedTier&&nextTier>0){
        speedTier=nextTier;
        audio.play('speedUp',.40);
        ui?.showSpeedUp?.();
      }else if(nextTier>speedTier){
        speedTier=nextTier;
      }
    }
    previousAir=!!state.air;
    wasPlaying=playing;
  }

  return {reset,onRampTakeoff,onLanding,onCrash,update};
}
