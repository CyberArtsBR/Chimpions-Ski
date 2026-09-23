import assert from 'node:assert/strict';
import {readPad} from '../src/input.js';

function buttons(pressed=[]){
  return Array.from({length:16},(_,index)=>({pressed:pressed.includes(index),value:pressed.includes(index)?1:0}));
}
function pad({index=0,id=`Pad ${index}`,mapping='standard',axes=[0,0],pressed=[],connected=true}={}){
  return {index,id,mapping,axes:[...axes],buttons:buttons(pressed),connected};
}
function nav(slots){return {getGamepads:()=>slots};}
function read(slots){return readPad(nav(slots).getGamepads());}
function clear(){read([]);}

// Neutral standard pad stays exactly neutral.
clear();
{
  const state=read([pad({index:0,id:'Neutral'})]);
  assert.equal(state.connected,true);
  assert.equal(state.axis,0);
  assert.equal(state.axisY,0);
  assert.equal(state.jump,false);
  assert.equal(state.cancel,false);
  assert.equal(state.menu,false);
}

// Drift and hysteresis: noise cannot engage steering, crossing the enter
// threshold ramps smoothly, and an engaged axis does not chatter at the edge.
clear();
{
  const p={index:1,id:'Hysteresis',mapping:'standard',axes:[.13,0],buttons:buttons(),connected:true};
  assert.equal(read([p]).axis,0,'sub-deadzone drift leaked through');
  p.axes[0]=.155;
  assert.equal(read([p]).axis,0,'hysteresis enter band should remain neutral');
  p.axes[0]=.18;
  const engaged=read([p]).axis;
  assert(engaged>0&&engaged<.06,'deadzone exit should ramp in smoothly');
  p.axes[0]=.15;
  assert(read([p]).axis>0,'engaged stick flickered off inside hysteresis band');
  p.axes[0]=.139;
  assert.equal(read([p]).axis,0,'stick failed to disengage at base deadzone');
  p.axes[0]=.15;
  assert.equal(read([p]).axis,0,'released stick re-engaged inside hysteresis band');
}

// Full range is preserved and direction reversal remains deterministic.
clear();
{
  const p={index:2,id:'Range',mapping:'standard',axes:[-1,0],buttons:buttons(),connected:true};
  assert.equal(read([p]).axis,-1);
  p.axes[0]=1;
  assert.equal(read([p]).axis,1);
}

// D-pad uses the browser standard 12/13/14/15 layout and explicit digital
// input owns its axis so it cannot fight an opposite analog stick.
clear();
{
  const p={index:3,id:'DPad',mapping:'standard',axes:[-1,1],buttons:buttons([15,12]),connected:true};
  let state=read([p]);
  assert.equal(state.axis,1,'D-pad right did not override opposite analog X');
  assert.equal(state.axisY,-1,'D-pad up did not override opposite analog Y');
  p.buttons=buttons([14,15]);
  state=read([p]);
  assert.equal(state.axis,0,'opposite horizontal D-pad buttons should cancel');
  p.buttons=buttons([13]);
  state=read([p]);
  assert.equal(state.axisY,1,'D-pad down mapping is wrong');
}

// Xbox/PlayStation standard mapping and a conservative generic fallback all
// expose A/Cross=0, B/Circle=1, Start/Menu=9 as semantic state.
for(const [index,id,mapping] of [
  [4,'Xbox Wireless Controller','standard'],
  [5,'DualSense Wireless Controller','standard'],
  [6,'Generic USB Gamepad','']
]){
  clear();
  let p=pad({index,id,mapping,pressed:[0]});
  let state=read([p]);
  assert.equal(state.confirm,true,`${id}: confirm mapping`);
  assert.equal(state.jump,true,`${id}: jump mapping`);
  assert.equal(state.edges.pressed.jump,true,`${id}: jump press edge`);
  state=read([p]);
  assert.equal(state.edges.pressed.jump,false,`${id}: held jump repeated edge`);
  p=pad({index,id,mapping,pressed:[1,9]});
  state=read([p]);
  assert.equal(state.cancel,true,`${id}: cancel mapping`);
  assert.equal(state.menu,true,`${id}: menu mapping`);
  assert.equal(state.edges.released.jump,true,`${id}: jump release edge`);
}

// Stale disconnected slots are ignored. A deliberately active controller is
// selected over an idle lower-index pad, and tiny movement cannot steal focus.
clear();
{
  const stale=pad({index:0,id:'Stale',pressed:[0],connected:false});
  const idle=pad({index:1,id:'Idle'});
  const active=pad({index:2,id:'Active',axes:[.8,0]});
  let state=read([stale,idle,active]);
  assert.equal(state.activeIndex,2,'active controller was not preferred');
  assert.equal(state.activeGamepad,active,'active controller device reference was not exposed');
  assert.equal(state.activeKey,'2:Active','active controller stable identity is wrong');
  const tiny=pad({index:1,id:'Idle',axes:[.2,0]});
  const activeNowIdle=pad({index:2,id:'Active'});
  state=read([stale,tiny,activeNowIdle]);
  assert.equal(state.activeIndex,2,'tiny stick noise stole active controller');
  const takeover=pad({index:1,id:'Idle',pressed:[1]});
  state=read([stale,takeover,activeNowIdle]);
  assert.equal(state.activeIndex,1,'intentional button activity did not take over');
}

// While the current controller is meaningfully active, another controller does
// not steal focus merely because it also has input.
clear();
{
  const first=pad({index:7,id:'Primary',axes:[.9,0]});
  const second=pad({index:8,id:'Secondary'});
  assert.equal(read([first,second]).activeIndex,7);
  second.buttons=buttons([9]);
  assert.equal(read([first,second]).activeIndex,7,'active controller focus flapped');
}

// Disconnect always clears output. Reconnecting the same physical slot while
// controls are still held quarantines those stale states until neutral/release,
// preventing stuck steering, Jump, or Pause.
clear();
{
  let p=pad({index:9,id:'Reconnect',axes:[.9,0],pressed:[0,9]});
  let state=read([p]);
  assert(state.axis>0&&state.jump&&state.menu);
  state=read([]);
  assert.equal(state.connected,false);
  assert.equal(state.activeGamepad,null,'disconnect retained a stale active gamepad reference');
  assert.equal(state.activeKey,null,'disconnect retained a stale active controller identity');
  assert.equal(state.axis,0);
  assert.equal(state.jump,false);
  assert.equal(state.menu,false);
  assert.equal(state.edges.released.jump,true,'disconnect did not expose jump release edge');
  assert.equal(state.edges.released.menu,true,'disconnect did not expose menu release edge');

  p=pad({index:9,id:'Reconnect',axes:[.9,0],pressed:[0,9]});
  state=read([p]);
  assert.equal(state.axis,0,'held reconnect axis leaked as stuck steering');
  assert.equal(state.jump,false,'held reconnect A leaked as stuck jump');
  assert.equal(state.menu,false,'held reconnect Start leaked as stuck pause');

  p=pad({index:9,id:'Reconnect',axes:[0,0],pressed:[]});
  state=read([p]);
  assert.equal(state.axis,0);
  p=pad({index:9,id:'Reconnect',axes:[.9,0],pressed:[0,9]});
  state=read([p]);
  assert(state.axis>0,'axis did not recover after neutral');
  assert.equal(state.jump,true,'A did not recover after release');
  assert.equal(state.menu,true,'Start did not recover after release');
}

// A different connected controller can immediately take over after the active
// one disconnects; its intentional input is not quarantined.
clear();
{
  const oldPad=pad({index:10,id:'Old',pressed:[0]});
  assert.equal(read([oldPad]).activeIndex,10);
  const replacement=pad({index:11,id:'Replacement',pressed:[0]});
  const state=read([replacement]);
  assert.equal(state.activeIndex,11);
  assert.equal(state.activeGamepad,replacement,'replacement device reference did not become authoritative');
  assert.equal(state.jump,true);
  assert.equal(state.edges.pressed.jump,true);
}

console.log(JSON.stringify({
  check:'input-invariants',
  cases:['neutral','drift','deadzone+hysteresis','full-range','dpad','A/B/Start','multiple controllers','disconnect/reconnect','replacement takeover']
}));
