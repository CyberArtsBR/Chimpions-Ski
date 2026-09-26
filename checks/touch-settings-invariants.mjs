import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGameplayInput} from '../src/gameplayInput.js';
import {TRICK_TYPE} from '../src/trickSystem.js';

function eventTarget(){
  const listeners=new Map();
  return {
    hidden:false,
    addEventListener(type,fn){
      const list=listeners.get(type)||[];
      list.push(fn);listeners.set(type,list);
    },
    emit(type,event={}){
      for(const fn of listeners.get(type)||[])fn(event);
    }
  };
}
const windowRef=eventTarget();
const documentRef=eventTarget();
const input=createGameplayInput({windowRef,documentRef});
const neutralPad={
  axis:0,axisY:0,jump:false,dpad:{up:false,down:false},
  edges:{pressed:{jump:false,menu:false}}
};

windowRef.emit('keydown',{code:'Space',repeat:false,target:{closest:()=>null},preventDefault(){}});
let action=input.read(neutralPad);
assert.equal(action.jumpPressed,true,'keyboard jump press was not semantic');
assert.equal(action.jumpHeld,true,'keyboard jump hold was not semantic');
action=input.read(neutralPad);
assert.equal(action.jumpPressed,false,'held keyboard jump repeated its edge');
windowRef.emit('keyup',{code:'Space'});
assert.equal(input.read(neutralPad).jumpHeld,false,'keyboard jump release stayed stuck');

input.setTouchSteer(.72);
assert(Math.abs(input.read(neutralPad).steer-.72)<1e-9,'touch analog steer was not preserved');
input.setTouchTrick(TRICK_TYPE.BACKFLIP,true);
action=input.read(neutralPad);
assert.equal(action.jumpPressed,true,'touch trick did not request a jump/trick edge');
assert.equal(action.trickIntent,TRICK_TYPE.BACKFLIP,'touch backflip semantic intent was lost');
input.setTouchTrick(TRICK_TYPE.BACKFLIP,false);
input.setTouchTuck(true);
action=input.read(neutralPad);
assert.equal(action.styleHeld,true,'touch TUCK does not expose airborne style-hold semantics');
input.setTouchTuck(false);
action=input.read({...neutralPad,tuck:true});
assert.equal(action.styleHeld,true,'controller LT/tuck does not expose airborne style-hold semantics');
input.resetTransient();
assert.equal(input.read(neutralPad).steer,0,'reset left touch steering stuck');

input.requestPause();
assert.equal(input.read(neutralPad).pausePressed,true,'touch pause semantic edge is missing');
assert.equal(input.read(neutralPad).pausePressed,false,'pause edge repeated after consumption');

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/ui.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
const touch=readFileSync(new URL('../src/touchControls.js',import.meta.url),'utf8');
const prefs=readFileSync(new URL('../src/userPreferences.js',import.meta.url),'utf8');
const haptics=readFileSync(new URL('../src/haptics.js',import.meta.url),'utf8');

assert(main.includes('createGameplayInput()'),'main does not consume the semantic gameplay input layer');
assert(main.includes('createTouchControls({'),'touch controls are not wired into gameplay');
assert(main.includes('actions.steer')&&main.includes('actions.jumpPressed'),'main bypasses semantic steer/jump actions');
assert(touch.includes('pointercancel'),'touch controls do not clear cancelled pointers');
assert(touch.includes('setPointerCapture'),'touch controls do not own active pointers');
assert(touch.includes('TUCK / STYLE'),'touch UI does not communicate the airborne style hold');
assert(css.includes('env(safe-area-inset-left)')&&css.includes('env(safe-area-inset-bottom)'),'touch controls ignore mobile safe areas');
assert(css.includes('orientation:portrait'),'portrait orientation recommendation is missing');
assert(ui.includes("settings.id='settings-overlay'")||ui.includes('id="settings-overlay"'),'coherent settings dialog is missing');
assert(ui.includes('MUSIC VOLUME')&&ui.includes('SFX VOLUME'),'real audio volume settings are missing');
assert(ui.includes('CAMERA MOTION')&&ui.includes('HAPTICS'),'camera motion / haptics settings are missing');
assert(main.includes('saveAvatarPreference')&&main.includes('saveRideModePreference'),'avatar/ride preferences are not persisted');
assert(main.includes('saveQualityPreference')&&main.includes('saveCameraMotionPreference'),'quality/camera preferences are not persisted');
assert(prefs.includes("['auto','high','max','medium','low']"),'quality preference contract is incomplete');
assert(haptics.includes('if(!hapticsEnabled)return false'),'disabled haptics still reach actuator playback');
assert(css.includes('html[data-camera-motion="reduced"]'),'explicit Reduced Motion does not suppress UI animation');
assert(ui.includes("byId('result-max-speed')")&&ui.includes("byId('result-combo')"),'results screen lacks integrated run stats');

console.log(JSON.stringify({
  check:'touch-settings-invariants',
  semanticInput:'pass',
  pointerLifecycle:'pass',
  settings:'pass',
  persistence:'pass',
  reducedMotion:'pass',
  results:'pass'
}));
