export function createGameFeedback({audio,ui}){
  let speedTier=0;

  function reset(){
    speedTier=0;
  }

  function onManualTakeoff(){
    audio.play('jump',.66);
    ui?.showJumpFeedback?.('JUMP');
  }

  function onRampTakeoff(){
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
    const playing=state.mode==='playing';
    if(playing){
      const nextTier=state.speedTier||0;
      if(nextTier>speedTier&&nextTier>0){
        speedTier=nextTier;
        audio.play('speedUp',.40);
        ui?.showSpeedUp?.();
      }else if(nextTier>speedTier){
        speedTier=nextTier;
      }
    }
  }

  return {reset,onManualTakeoff,onRampTakeoff,onLanding,onCrash,update};
}
