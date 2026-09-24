export function createBananaPowerSystem({
  state,
  goal=10,
  duration=3,
  bulletTimeScale=.35,
  canActivate=()=>true,
  onReady=null,
  onActivated=null,
  onDeactivated=null
}={}){
  if(!state)throw new Error('createBananaPowerSystem requires shared state');

  function reset(){
    state.bananaPowerProgress=0;
    state.specialReady=false;
    state.specialActiveTime=0;
    onDeactivated?.();
  }

  function collect(){
    if(state.specialReady)return false;
    state.bananaPowerProgress=Math.min(goal,(Number(state.bananaPowerProgress)||0)+1);
    if(state.bananaPowerProgress<goal)return false;
    state.bananaPowerProgress=goal;
    state.specialReady=true;
    onReady?.();
    return true;
  }

  function activate(){
    if(!canActivate()||!state.specialReady)return false;
    state.specialReady=false;
    state.bananaPowerProgress=0;
    state.specialActiveTime=duration;
    onActivated?.();
    return true;
  }

  function deactivate(){
    if((Number(state.specialActiveTime)||0)<=0)return false;
    state.specialActiveTime=0;
    onDeactivated?.();
    return true;
  }

  function step(realDt){
    if(state.specialActiveTime<=0)return false;
    state.specialActiveTime=Math.max(0,state.specialActiveTime-Math.max(0,Number(realDt)||0));
    if(state.specialActiveTime===0)onDeactivated?.();
    return state.specialActiveTime>0;
  }

  function snapshot(){
    return {
      bananaPowerProgress:state.bananaPowerProgress,
      bananaPowerGoal:goal,
      specialReady:!!state.specialReady,
      specialActiveTime:state.specialActiveTime,
      specialActive:state.specialActiveTime>0,
      bulletTimeScale
    };
  }

  return {
    collect,
    activate,
    deactivate,
    reset,
    step,
    snapshot,
    get active(){return state.specialActiveTime>0;},
    get simulationScale(){return state.specialActiveTime>0?bulletTimeScale:1;}
  };
}
