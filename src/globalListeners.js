export function createGlobalListenerScope(){
  const removers=[];
  let disposed=false;

  function on(target,type,handler,options){
    if(disposed||!target?.addEventListener)return handler;
    target.addEventListener(type,handler,options);
    removers.push(()=>target.removeEventListener(type,handler,options));
    return handler;
  }

  function dispose(){
    if(disposed)return;
    disposed=true;
    for(let i=removers.length-1;i>=0;i--)removers[i]();
    removers.length=0;
  }

  return {
    on,
    dispose,
    get disposed(){return disposed;}
  };
}
