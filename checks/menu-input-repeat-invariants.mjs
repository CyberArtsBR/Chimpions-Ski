import assert from 'node:assert/strict';
import {createMenuInputRepeat,MENU_INPUT_DEFAULTS} from '../src/menuInputRepeat.js';

function state({x=0,y=0,dpad={},confirm=false,cancel=false,menu=false,connected=true}={}){
  return {
    connected,
    axis:x,
    axisY:y,
    dpad:{left:false,right:false,up:false,down:false,...dpad},
    edges:{pressed:{confirm,cancel,menu}}
  };
}

const actions=[];
const input=createMenuInputRepeat({
  adapter:{
    move:direction=>actions.push(['move',direction]),
    confirm:()=>actions.push(['confirm']),
    cancel:()=>actions.push(['cancel']),
    menu:()=>actions.push(['menu'])
  }
});

input.update(state(),0);
assert.equal(input.getState().armed,true,'neutral state did not arm menu navigation');

input.update(state({y:.50}),10);
assert.equal(actions.length,0,'sub-threshold analog input triggered a move');

input.update(state({y:.70}),20);
assert.deepEqual(actions.at(-1),['move','down'],'threshold crossing did not move immediately');
assert.equal(actions.length,1);

input.update(state({y:.70}),20+MENU_INPUT_DEFAULTS.initialRepeatDelayMs-1);
assert.equal(actions.length,1,'held axis repeated before initial delay');

input.update(state({y:.70}),20+MENU_INPUT_DEFAULTS.initialRepeatDelayMs);
assert.equal(actions.length,2,'held axis did not repeat after initial delay');
assert.deepEqual(actions.at(-1),['move','down']);

input.update(state({y:.70}),1000);
assert.equal(actions.length,3,'one update emitted more than one catch-up repeat and could skip menu entries');

input.update(state(),1010);
assert.equal(input.getState().heldDirection,null,'neutral reset did not clear held direction');

input.update(state({y:-.72}),1020);
assert.deepEqual(actions.at(-1),['move','up'],'opposite direction did not trigger after neutral reset');

input.update(state(),1030);
input.update(state({dpad:{down:true},y:1}),1040);
assert.deepEqual(actions.at(-1),['move','down'],'D-pad down did not use semantic navigation');

input.update(state({dpad:{down:true},y:1}),1040+MENU_INPUT_DEFAULTS.initialRepeatDelayMs);
assert.deepEqual(actions.at(-1),['move','down'],'held D-pad repeat failed');

input.update(state(),1400);
input.update(state({confirm:true}),1410);
input.update(state({cancel:true}),1420);
input.update(state({menu:true}),1430);
assert(actions.some(action=>action[0]==='confirm'),'confirm action missing');
assert(actions.some(action=>action[0]==='cancel'),'cancel action missing');
assert(actions.some(action=>action[0]==='menu'),'menu/pause action missing');

input.update(state({connected:false}),1500);
assert.equal(input.getState().armed,false,'disconnect did not disarm navigation');

console.log(JSON.stringify({
  check:'menu-input-repeat-invariants',
  threshold:MENU_INPUT_DEFAULTS.enterThreshold,
  neutral:MENU_INPUT_DEFAULTS.neutralThreshold,
  initialRepeatDelayMs:MENU_INPUT_DEFAULTS.initialRepeatDelayMs,
  repeatIntervalMs:MENU_INPUT_DEFAULTS.repeatIntervalMs,
  cases:['threshold-crossing','held-repeat','single-repeat-per-poll','neutral-reset','opposite-direction','dpad','confirm','cancel','menu','disconnect']
}));
