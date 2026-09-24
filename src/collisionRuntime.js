export function createCollisionRuntime({
  broadphase,
  telemetry=null,
  queryHalfZ=3.5,
  scratch=[]
}={}){
  if(!broadphase)throw new Error('createCollisionRuntime requires a broadphase');
  let activeRamp=null;

  function add(item,localZ){
    broadphase.add(item,localZ);
  }

  function remove(item){
    if(item===activeRamp)clearRamp();
    else if(item?.userData)item.userData.activated=false;
    broadphase.remove(item);
  }

  function query(localPlayerZ){
    const started=performance.now();
    const candidates=broadphase.query(localPlayerZ,queryHalfZ,scratch);
    telemetry?.record?.('collisionBroadphase',performance.now()-started);
    telemetry?.increment?.('collisionCandidates',candidates.length);
    return candidates;
  }

  function engageRamp(item){
    if(!item)return null;
    if(activeRamp&&activeRamp!==item)activeRamp.userData.activated=false;
    activeRamp=item;
    item.userData.activated=true;
    return activeRamp;
  }

  function clearRamp(item=null){
    if(item&&activeRamp!==item){
      if(item?.userData)item.userData.activated=false;
      return false;
    }
    if(activeRamp?.userData)activeRamp.userData.activated=false;
    activeRamp=null;
    return true;
  }

  function reset(){
    clearRamp();
    broadphase.clear();
    scratch.length=0;
  }

  function getDiagnostics(){
    return {
      ...broadphase.getDiagnostics(),
      activeRamp:!!activeRamp,
      activeRampState:activeRamp?(activeRamp.userData.consumed?'consumed':'engaged'):'none'
    };
  }

  return {
    add,
    remove,
    query,
    engageRamp,
    clearRamp,
    reset,
    getDiagnostics,
    get activeRamp(){return activeRamp;}
  };
}
