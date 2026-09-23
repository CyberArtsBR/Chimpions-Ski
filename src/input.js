import {SKI_TUNING} from './gameplayTuning.js';

// Browser "standard" mapping normalizes Xbox/PlayStation-style controllers to
// the same button indices. Generic USB pads commonly expose the same layout, so
// we keep one small fallback instead of a vendor-specific table.
const DEADZONE=Math.max(0,Math.min(.45,Number(SKI_TUNING.CONTROLLER_DEADZONE)||.14));
const DEADZONE_HYSTERESIS=.03;
const DEADZONE_ENTER=Math.min(.55,DEADZONE+DEADZONE_HYSTERESIS);
const SWITCH_AXIS_THRESHOLD=Math.max(.28,DEADZONE_ENTER+.08);
const BUTTON_PRESS_THRESHOLD=.5;
const STANDARD_BUTTON={confirm:0,cancel:1,menu:9,up:12,down:13,left:14,right:15};

let activeKey=null;
let activeAxisState=makeAxisPair();
let previousSemantic=emptySemantic();
let lastSnapshot=null;
const reconnectGuards=new Map();

function makeAxisState(){return {engaged:false,sign:0};}
function makeAxisPair(){return {x:makeAxisState(),y:makeAxisState()};}
function emptySemantic(){return {confirm:false,jump:false,cancel:false,menu:false};}
function clampAxis(value=0){return Math.max(-1,Math.min(1,Number(value)||0));}
function buttonPressed(button){
  if(typeof button==='boolean')return button;
  if(typeof button==='number')return button>=BUTTON_PRESS_THRESHOLD;
  return !!button&&(!!button.pressed||(Number(button.value)||0)>=BUTTON_PRESS_THRESHOLD);
}
function padKey(pad,slot){
  const index=Number.isInteger(pad?.index)?pad.index:slot;
  return `${index}:${String(pad?.id||'gamepad')}`;
}
function rawButtons(pad){return Array.from(pad?.buttons||[],buttonPressed);}
function rawAxes(pad){return [clampAxis(pad?.axes?.[0]),clampAxis(pad?.axes?.[1])];}
function resetAxisState(){activeAxisState=makeAxisPair();}

function filteredAxis(raw,state){
  const value=clampAxis(raw);
  const magnitude=Math.abs(value);
  const sign=Math.sign(value);

  if(!state.engaged){
    if(magnitude<=DEADZONE_ENTER)return 0;
    state.engaged=true;
    state.sign=sign;
  }else{
    if(magnitude<=DEADZONE){
      state.engaged=false;
      state.sign=0;
      return 0;
    }
    if(sign&&state.sign&&sign!==state.sign){
      if(magnitude<=DEADZONE_ENTER){
        state.engaged=false;
        state.sign=0;
        return 0;
      }
      state.sign=sign;
    }
  }

  const scaled=(magnitude-DEADZONE)/(1-DEADZONE);
  return sign*Math.max(0,Math.min(1,scaled));
}

function createReconnectGuard(snapshot){
  if(!snapshot)return null;
  const blockedButtons=new Set();
  snapshot.buttons.forEach((pressed,index)=>{if(pressed)blockedButtons.add(index);});
  return {
    blockedButtons,
    blockX:Math.abs(snapshot.axes[0])>DEADZONE,
    blockY:Math.abs(snapshot.axes[1])>DEADZONE
  };
}
function refreshGuard(entry){
  const guard=reconnectGuards.get(entry.key);
  if(!guard)return null;
  const buttons=rawButtons(entry.pad);
  for(const index of [...guard.blockedButtons]){
    if(!buttons[index])guard.blockedButtons.delete(index);
  }
  const axes=rawAxes(entry.pad);
  if(guard.blockX&&Math.abs(axes[0])<=DEADZONE)guard.blockX=false;
  if(guard.blockY&&Math.abs(axes[1])<=DEADZONE)guard.blockY=false;
  if(!guard.blockedButtons.size&&!guard.blockX&&!guard.blockY){
    reconnectGuards.delete(entry.key);
    return null;
  }
  return guard;
}
function effectiveRaw(entry){
  const buttons=rawButtons(entry.pad);
  const axes=rawAxes(entry.pad);
  const guard=reconnectGuards.get(entry.key);
  if(guard){
    for(const index of guard.blockedButtons)buttons[index]=false;
    if(guard.blockX)axes[0]=0;
    if(guard.blockY)axes[1]=0;
  }
  return {buttons,axes};
}
function hasMeaningfulActivity(entry){
  const {buttons,axes}=effectiveRaw(entry);
  return buttons.some(Boolean)||Math.abs(axes[0])>=SWITCH_AXIS_THRESHOLD||Math.abs(axes[1])>=SWITCH_AXIS_THRESHOLD;
}
function sortConnected(entries){
  return entries.sort((a,b)=>{
    const ai=Number.isInteger(a.pad.index)?a.pad.index:a.slot;
    const bi=Number.isInteger(b.pad.index)?b.pad.index:b.slot;
    return ai-bi||a.slot-b.slot;
  });
}
function edgeData(current){
  return {
    pressed:{
      confirm:current.confirm&&!previousSemantic.confirm,
      jump:current.jump&&!previousSemantic.jump,
      cancel:current.cancel&&!previousSemantic.cancel,
      menu:current.menu&&!previousSemantic.menu
    },
    released:{
      confirm:!current.confirm&&previousSemantic.confirm,
      jump:!current.jump&&previousSemantic.jump,
      cancel:!current.cancel&&previousSemantic.cancel,
      menu:!current.menu&&previousSemantic.menu
    }
  };
}
function disconnectedState(){
  const current=emptySemantic();
  const edges=edgeData(current);
  previousSemantic=current;
  return {
    connected:false,
    axis:0,
    axisY:0,
    buttons:[],
    confirm:false,
    jump:false,
    cancel:false,
    menu:false,
    edges,
    activeIndex:null,
    activeKey:null,
    activeGamepad:null,
    id:'',
    mapping:'',
    controllerChanged:false,
    dpad:{left:false,right:false,up:false,down:false}
  };
}

export function readPad(pads){
  const entries=sortConnected(Array.from(pads||[])
    .map((pad,slot)=>({pad,slot,key:padKey(pad,slot)}))
    .filter(entry=>entry.pad?.connected));

  let current=activeKey?entries.find(entry=>entry.key===activeKey):null;
  if(activeKey&&!current){
    const guard=createReconnectGuard(lastSnapshot?.key===activeKey?lastSnapshot:null);
    if(guard&&(guard.blockedButtons.size||guard.blockX||guard.blockY))reconnectGuards.set(activeKey,guard);
    activeKey=null;
    current=null;
    resetAxisState();
    lastSnapshot=null;
  }

  for(const entry of entries)refreshGuard(entry);
  if(!entries.length)return disconnectedState();

  let selected=current;
  if(!selected){
    selected=entries.find(hasMeaningfulActivity)||entries[0];
  }else if(!hasMeaningfulActivity(selected)){
    const takeover=entries.find(entry=>entry.key!==selected.key&&hasMeaningfulActivity(entry));
    if(takeover)selected=takeover;
  }

  const changed=selected.key!==activeKey;
  if(changed){
    activeKey=selected.key;
    resetAxisState();
    previousSemantic=emptySemantic();
  }

  const physicalButtons=rawButtons(selected.pad);
  const physicalAxes=rawAxes(selected.pad);
  const {buttons,axes}=effectiveRaw(selected);
  const analogX=filteredAxis(axes[0],activeAxisState.x);
  const analogY=filteredAxis(axes[1],activeAxisState.y);

  const left=!!buttons[STANDARD_BUTTON.left];
  const right=!!buttons[STANDARD_BUTTON.right];
  const up=!!buttons[STANDARD_BUTTON.up];
  const down=!!buttons[STANDARD_BUTTON.down];
  const dpadX=Number(right)-Number(left);
  const dpadY=Number(down)-Number(up);
  const horizontalDpad=left||right;
  const verticalDpad=up||down;

  const semantic={
    confirm:!!buttons[STANDARD_BUTTON.confirm],
    jump:!!buttons[STANDARD_BUTTON.confirm],
    cancel:!!buttons[STANDARD_BUTTON.cancel],
    menu:!!buttons[STANDARD_BUTTON.menu]
  };
  const edges=edgeData(semantic);
  previousSemantic=semantic;
  lastSnapshot={key:selected.key,buttons:physicalButtons,axes:physicalAxes};

  return {
    connected:true,
    axis:horizontalDpad?dpadX:analogX,
    axisY:verticalDpad?dpadY:analogY,
    buttons,
    ...semantic,
    edges,
    activeIndex:Number.isInteger(selected.pad.index)?selected.pad.index:selected.slot,
    activeKey:selected.key,
    activeGamepad:selected.pad,
    id:String(selected.pad.id||''),
    mapping:String(selected.pad.mapping||''),
    controllerChanged:changed,
    dpad:{left,right,up,down}
  };
}
