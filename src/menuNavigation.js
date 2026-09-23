export const MENU_ACTION=Object.freeze({
  UP:'move-up',
  DOWN:'move-down',
  LEFT:'move-left',
  RIGHT:'move-right',
  CONFIRM:'confirm',
  CANCEL:'cancel',
  MENU:'menu'
});

export function menuActionFromKeyboardEvent(event,{allowWASD=true,allowSpace=true}={}){
  const code=String(event?.code||'');
  if(code==='ArrowUp'||(allowWASD&&code==='KeyW'))return MENU_ACTION.UP;
  if(code==='ArrowDown'||(allowWASD&&code==='KeyS'))return MENU_ACTION.DOWN;
  if(code==='ArrowLeft'||(allowWASD&&code==='KeyA'))return MENU_ACTION.LEFT;
  if(code==='ArrowRight'||(allowWASD&&code==='KeyD'))return MENU_ACTION.RIGHT;
  if(code==='Enter'||code==='NumpadEnter'||(allowSpace&&code==='Space'))return MENU_ACTION.CONFIRM;
  if(code==='Escape')return MENU_ACTION.CANCEL;
  return null;
}

export function nextMenuIndex(currentIndex,count,delta,{wrap=true}={}){
  const size=Math.max(0,Math.floor(Number(count)||0));
  if(!size)return -1;
  const step=Math.sign(Number(delta)||0);
  if(!step)return Math.max(0,Math.min(size-1,Number(currentIndex)||0));
  const current=Number.isInteger(currentIndex)&&currentIndex>=0&&currentIndex<size?currentIndex:(step>0?-1:0);
  const next=current+step;
  if(wrap)return (next%size+size)%size;
  return Math.max(0,Math.min(size-1,next));
}

function isUsable(element){
  return !!element&&element.isConnected!==false&&!element.disabled&&!element.hidden;
}

export function createMenuFocusController({
  documentRef=globalThis.document,
  getRoot=()=>null,
  getItems=()=>[],
  wrap=true,
  onMove=()=>{},
  onConfirm=()=>{},
  onCancel=()=>{},
  onMenu=()=>{}
}={}){
  let selected=null;
  const restoreStack=[];

  function list(root=getRoot?.()){
    return Array.from(getItems?.(root)||[]).filter(isUsable);
  }
  function mark(element){
    if(selected===element)return true;
    selected?.classList?.remove('is-menu-selected');
    selected?.removeAttribute?.('data-menu-selected');
    selected=isUsable(element)?element:null;
    if(selected){
      selected.classList?.add('is-menu-selected');
      selected.setAttribute?.('data-menu-selected','true');
    }
    return !!selected;
  }
  function focus(element,{preventScroll=true}={}){
    if(!isUsable(element))return false;
    mark(element);
    try{element.focus?.({preventScroll});}catch{element.focus?.();}
    return true;
  }
  function clear(root=null){
    if(selected&&root?.contains&&!root.contains(selected))return false;
    selected?.classList?.remove('is-menu-selected');
    selected?.removeAttribute?.('data-menu-selected');
    selected=null;
    return true;
  }
  function reset(){
    clear();
    restoreStack.length=0;
    return true;
  }
  function safeDefault(items,preferred){
    if(isUsable(preferred)&&items.includes(preferred))return preferred;
    return items.find(item=>item.dataset?.menuDefault==='true')||items[0]||null;
  }
  function open({root=getRoot?.(),defaultElement=null,restoreFrom=documentRef?.activeElement}={}){
    restoreStack.push(isUsable(restoreFrom)?restoreFrom:null);
    const items=list(root);
    return focus(safeDefault(items,defaultElement));
  }
  function close({root=getRoot?.(),restore=true}={}){
    clear(root);
    const target=restoreStack.length?restoreStack.pop():null;
    if(restore&&isUsable(target)){
      try{target.focus?.({preventScroll:true});}catch{target.focus?.();}
      return target;
    }
    return null;
  }
  function syncFromFocus(element){
    const root=getRoot?.();
    if(root?.contains&&!root.contains(element))return false;
    return mark(element);
  }
  function handle(action,{root=getRoot?.()}={}){
    if(action===MENU_ACTION.CANCEL){onCancel(action);return true;}
    if(action===MENU_ACTION.MENU){onMenu(action);return true;}
    const items=list(root);
    if(!items.length)return false;
    const current=items.indexOf(documentRef?.activeElement);
    if(action===MENU_ACTION.CONFIRM){
      const target=current>=0?items[current]:safeDefault(items,selected);
      if(!target)return false;
      focus(target);
      onConfirm(target);
      target.click?.();
      return true;
    }
    const delta=(action===MENU_ACTION.UP||action===MENU_ACTION.LEFT)?-1:
      (action===MENU_ACTION.DOWN||action===MENU_ACTION.RIGHT)?1:0;
    if(!delta)return false;
    const next=nextMenuIndex(current,items.length,delta,{wrap});
    if(next<0)return false;
    focus(items[next]);
    onMove(items[next],action);
    return true;
  }

  return {open,close,clear,reset,focus,handle,syncFromFocus,getSelected:()=>selected};
}
