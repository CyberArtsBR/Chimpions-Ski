export function createGameFeedback({audio,ui}){
  let previousAir=false;
  let rampSuppress=0;
  let wasPlaying=false;

  function reset(){
    previousAir=false;
    rampSuppress=0;
    wasPlaying=false;
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
    previousAir=!!state.air;
    wasPlaying=playing;
  }

  return {reset,onRampTakeoff,onLanding,onCrash,update};
}
