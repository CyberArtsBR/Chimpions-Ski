export const GAME_FLOW=Object.freeze({
  START:'START',
  SELECT_RIDER:'SELECT_RIDER',
  TUTORIAL:'TUTORIAL',
  COUNTDOWN:'COUNTDOWN',
  PLAYING:'PLAYING',
  PAUSED:'PAUSED',
  CRASHED:'CRASHED',
  RESULTS:'RESULTS'
});

const LEGACY_MODE=Object.freeze({
  [GAME_FLOW.START]:'menu',
  [GAME_FLOW.SELECT_RIDER]:'menu',
  [GAME_FLOW.TUTORIAL]:'menu',
  [GAME_FLOW.COUNTDOWN]:'countdown',
  [GAME_FLOW.PLAYING]:'playing',
  [GAME_FLOW.PAUSED]:'paused',
  [GAME_FLOW.CRASHED]:'crashed',
  [GAME_FLOW.RESULTS]:'crashed'
});

const VALID_TRANSITIONS=Object.freeze({
  [GAME_FLOW.START]:new Set([GAME_FLOW.SELECT_RIDER,GAME_FLOW.TUTORIAL,GAME_FLOW.COUNTDOWN]),
  [GAME_FLOW.SELECT_RIDER]:new Set([GAME_FLOW.START,GAME_FLOW.TUTORIAL,GAME_FLOW.COUNTDOWN]),
  [GAME_FLOW.TUTORIAL]:new Set([GAME_FLOW.START,GAME_FLOW.COUNTDOWN]),
  [GAME_FLOW.COUNTDOWN]:new Set([GAME_FLOW.START,GAME_FLOW.SELECT_RIDER,GAME_FLOW.PLAYING]),
  [GAME_FLOW.PLAYING]:new Set([GAME_FLOW.PAUSED,GAME_FLOW.CRASHED,GAME_FLOW.START]),
  [GAME_FLOW.PAUSED]:new Set([GAME_FLOW.PLAYING,GAME_FLOW.START,GAME_FLOW.COUNTDOWN]),
  [GAME_FLOW.CRASHED]:new Set([GAME_FLOW.RESULTS,GAME_FLOW.START,GAME_FLOW.SELECT_RIDER,GAME_FLOW.COUNTDOWN]),
  [GAME_FLOW.RESULTS]:new Set([GAME_FLOW.START,GAME_FLOW.SELECT_RIDER,GAME_FLOW.COUNTDOWN])
});

export function createGameFlow({state,initial=GAME_FLOW.START,onTransition=null}={}){
  if(!state)throw new Error('createGameFlow requires shared state');
  let phase=initial;
  state.mode=LEGACY_MODE[phase]||state.mode||'menu';

  function canEnter(next){
    return next===phase||VALID_TRANSITIONS[phase]?.has(next)===true;
  }

  function enter(next,{force=false,reason=''}={}){
    if(!LEGACY_MODE[next])return false;
    if(next===phase)return true;
    if(!force&&!canEnter(next))return false;
    const previous=phase;
    phase=next;
    state.mode=LEGACY_MODE[next];
    onTransition?.({previous,next,reason,mode:state.mode});
    return true;
  }

  function snapshot(){
    return {
      phase,
      mode:state.mode,
      allowedTransitions:Array.from(VALID_TRANSITIONS[phase]||[])
    };
  }

  return {
    enter,
    canEnter,
    is:value=>phase===value,
    snapshot,
    get phase(){return phase;}
  };
}
