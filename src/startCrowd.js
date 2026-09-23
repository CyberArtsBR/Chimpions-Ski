import * as THREE from 'three';

export const START_CROWD_COUNT=0;
export const DEFAULT_CROWD_QUALITY=Object.freeze({
  maxSpectators:0,
  startReadyCount:0,
  loadConcurrency:0,
  startWaitMs:0,
  assetTimeoutMs:0
});

export function normalizeCrowdQuality(){
  return {...DEFAULT_CROWD_QUALITY};
}

// Deliberately lightweight compatibility hook. The real-Chimpion spectator crowd
// is disabled so the start line performs zero spectator GLB fetches/parses.
export function createStartCrowd({world}={}){
  const root=new THREE.Group();
  root.name='start-crowd-disabled';
  root.visible=false;
  world?.add?.(root);
  let released=false;

  const noWork=async()=>0;
  return {
    root,
    setSpectators:noWork,
    prepareFull:noWork,
    ensureLoaded:noWork,
    setQuality:()=>({...DEFAULT_CROWD_QUALITY}),
    reset(){released=false;root.visible=false;return 0;},
    update(){root.visible=false;},
    release(){released=true;root.visible=false;return true;},
    disposeCache(){},
    get count(){return 0;},
    get loadedCount(){return 0;},
    get placeholderCount(){return 0;},
    get posedCount(){return 0;},
    get failedCount(){return 0;},
    get modelSourceCount(){return 0;},
    get startReady(){return true;},
    get fullReady(){return true;},
    get cacheStats(){return {records:0,ready:0,loading:0,failed:0,bytes:0};},
    get progressivePaused(){return true;},
    get quality(){return {...DEFAULT_CROWD_QUALITY};},
    get visible(){return false;},
    get released(){return released;}
  };
}
