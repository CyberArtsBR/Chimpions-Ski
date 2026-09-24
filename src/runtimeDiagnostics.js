function cloneDiagnosticValue(value){
  if(Array.isArray(value))return Object.freeze(value.slice());
  if(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype){
    return Object.freeze({...value});
  }
  return value;
}

function snapshotSharedState(state){
  const snapshot={};
  for(const [key,value] of Object.entries(state))snapshot[key]=cloneDiagnosticValue(value);
  return snapshot;
}

export function createRuntimeDiagnostics({
  state,
  gameFlow,
  runSession,
  bananaPower,
  collisionRuntime,
  riderController
}={}){
  if(!state)throw new Error('createRuntimeDiagnostics requires shared state');

  return function getRuntimeDiagnostics(){
    return Object.freeze({
      ...snapshotSharedState(state),
      ...collisionRuntime?.getDiagnostics?.(),
      ...gameFlow?.snapshot?.(),
      ...bananaPower?.snapshot?.(),
      ...riderController?.snapshot?.(),
      runSession:runSession?.snapshot?.()||null
    });
  };
}
