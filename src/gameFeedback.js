import {calculateCrashFeedback,calculateLandingFeedback,createEdgeContactGate} from './gameFeelFeedback.js';

export function createGameFeedback({audio,ui}){
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
    return remember('landing',feedback);
  }

  function onCrash(crash={}){
    const feedback=calculateCrashFeedback(crash);
    audio.play('crash',feedback.audioGain,feedback.rateScale);
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

  function getSemanticEvent(){return semanticEvent?{...semanticEvent}:null;}

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

  return {reset,onManualTakeoff,onRampTakeoff,onLanding,onCrash,onEdgeContact,getSemanticEvent,update};
}
