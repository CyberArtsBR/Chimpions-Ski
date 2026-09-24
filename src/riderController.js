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

  function dispose(){
    replace(null,{disposePrevious:true});
  }

  return {
    replace,
    setRideMode,
    dispose,
    get rider(){return rider;}
  };
}
