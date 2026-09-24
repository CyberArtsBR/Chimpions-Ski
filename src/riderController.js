export function createRiderController({visualRoot,disposeRider=null}={}){
  if(!visualRoot)throw new Error('createRiderController requires a visual root');
  let rider=null;

  function replace(next,{disposePrevious=true}={}){
    if(next===rider)return rider;
    const previous=rider;
    if(previous)visualRoot.remove(previous);
    rider=next||null;
    if(rider)visualRoot.add(rider);
    if(previous&&disposePrevious)disposeRider?.(previous);
    return rider;
  }

  function setRideMode(mode){
    rider?.userData?.setRideMode?.(mode);
  }

  function updatePose(frame){
    rider?.userData?.updateSkiPose?.(frame);
  }

  function snapshot(){
    return {
      riderAttached:!!rider,
      equipmentType:rider?.userData?.equipmentType||'unknown',
      poseMode:rider?.userData?.poseMode||'unknown',
      riderVisual:rider?.userData?.riderVisual?.name||'',
      skierFallback:!!rider?.userData?.fallback,
      rigReady:!!rider?.userData?.rigReady,
      localAvatarComplexity:rider?.userData?.localAvatarComplexity||null,
      modelForwardAxis:rider?.userData?.modelForwardAxis||'procedural'
    };
  }

  function dispose(){
    replace(null,{disposePrevious:true});
  }

  return {
    replace,
    setRideMode,
    updatePose,
    snapshot,
    dispose,
    get rider(){return rider;},
    get trackSpacing(){return rider?.userData?.skiTrackSpacing;},
    get trailContacts(){return rider?.userData?.trailContacts??rider?.userData?.skis;}
  };
}
