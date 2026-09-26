import {calculateCrashFeedback,calculateLandingFeedback,createEdgeContactGate} from './gameFeelFeedback.js';

export function createGameFeedback({audio,ui,haptics}){
  let speedTier=0;
  let semanticEvent=null;
  const edgeGate=createEdgeContactGate();

  function remember(type,feedback){
    semanticEvent=feedback?{type,...feedback}:null;
    return feedback;
  }

  function reset(){
    speedTier=0;
    semanticEvent=null;
    edgeGate.reset();
  }

  function onManualTakeoff(){
    audio.play('jump',.66);
    ui?.showJumpFeedback?.('JUMP');
  }

  function onRampTakeoff(){
    audio.play('ramp',.72);
    ui?.showJumpFeedback?.('RAMP');
  }

  function onLanding(landing={},context={}){
    if(!landing.landed)return null;
    const feedback=calculateLandingFeedback({...landing,...context});
    audio.play(feedback.sound,feedback.audioGain,feedback.rateScale);
    // Physical landing feedback stays in snow, audio and haptics instead of interrupting play with text.
    return remember('landing',feedback);
  }

  function onCrash(crash={}){
    const feedback=calculateCrashFeedback(crash);
    audio.play('crash',feedback.audioGain,feedback.rateScale);
    audio.play('deathCry',Math.min(.94,.58+(Number(feedback.intensity)||0)*.28),1);
    return remember('crash',feedback);
  }

  function onEdgeContact(edgeContactIntensity,timeSeconds=0){
    const feedback=edgeGate.request(edgeContactIntensity,timeSeconds);
    if(feedback.play){
      const handled=audio.playEdgeContact?.(feedback.intensity);
      if(handled===undefined)audio.play('edgeScrape',feedback.audioGain,feedback.rateScale);
      remember('edge',feedback);
    }
    return feedback;
  }

  function onNearMiss(event={}){
    const intensity=Math.max(0,Math.min(1,Number(event.intensity)||0));
    const handled=audio.playNearMiss?.(event);
    if(handled===undefined)audio.play('clear',.22+intensity*.18,.96+intensity*.14);
    haptics?.nearMiss?.(.55+intensity*.45);
    return remember('nearMiss',{intensity,kind:event.kind||'near-miss',label:event.label||'NEAR MISS'});
  }

  function getSemanticEvent(){return semanticEvent?{...semanticEvent}:null;}

  function update(state,dt){
    const playing=state.mode==='playing';
    if(playing){
      const nextTier=state.speedTier||0;
      if(nextTier>speedTier&&nextTier>0){
        speedTier=nextTier;
        audio.play('speedUp',.40);
        haptics?.speedTier?.(.72);
        ui?.showSpeedUp?.();
      }else if(nextTier>speedTier){
        speedTier=nextTier;
      }
    }
  }

  return {reset,onManualTakeoff,onRampTakeoff,onLanding,onCrash,onEdgeContact,onNearMiss,getSemanticEvent,update};
}
