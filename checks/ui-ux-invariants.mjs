import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MENU_ACTION,createMenuFocusController,menuActionFromKeyboardEvent,nextMenuIndex} from '../src/menuNavigation.js';

assert.equal(menuActionFromKeyboardEvent({code:'ArrowUp'}),MENU_ACTION.UP);
assert.equal(menuActionFromKeyboardEvent({code:'KeyS'}),MENU_ACTION.DOWN);
assert.equal(menuActionFromKeyboardEvent({code:'Enter'}),MENU_ACTION.CONFIRM);
assert.equal(menuActionFromKeyboardEvent({code:'Space'}),MENU_ACTION.CONFIRM);
assert.equal(menuActionFromKeyboardEvent({code:'Escape'}),MENU_ACTION.CANCEL);
assert.equal(menuActionFromKeyboardEvent({code:'KeyW'},{allowWASD:false}),null);
assert.equal(nextMenuIndex(2,3,1),0);
assert.equal(nextMenuIndex(0,3,-1),2);
assert.equal(nextMenuIndex(0,3,-1,{wrap:false}),0);

function fakeClassList(){
  const values=new Set();
  return {add:(...v)=>v.forEach(x=>values.add(x)),remove:(...v)=>v.forEach(x=>values.delete(x)),contains:v=>values.has(v)};
}
const doc={activeElement:null};
function fakeButton(name){
  return {
    name,disabled:false,hidden:false,isConnected:true,dataset:{},classList:fakeClassList(),clicked:0,
    focus(){doc.activeElement=this;},
    click(){this.clicked++;}
  };
}
const previous=fakeButton('previous');
const no=fakeButton('no');
const yes=fakeButton('yes');
doc.activeElement=previous;
let moved=0,confirmed=0,cancelled=0;
const root={contains:item=>item===no||item===yes};
const focus=createMenuFocusController({
  documentRef:doc,getRoot:()=>root,getItems:()=>[no,yes],
  onMove:()=>moved++,onConfirm:()=>confirmed++,onCancel:()=>cancelled++
});
focus.open({root,defaultElement:no,restoreFrom:previous});
assert.equal(doc.activeElement,no,'safe default NO did not receive focus');
assert(no.classList.contains('is-menu-selected'),'safe default lacks selected visual state');
focus.handle(MENU_ACTION.RIGHT);
assert.equal(doc.activeElement,yes);
assert.equal(moved,1);
focus.handle(MENU_ACTION.CONFIRM);
assert.equal(yes.clicked,1);
assert.equal(confirmed,1);
focus.handle(MENU_ACTION.CANCEL);
assert.equal(cancelled,1);
focus.close({root,restore:true});
assert.equal(doc.activeElement,previous,'focus did not restore after closing dialog');

const ui=readFileSync(new URL('../src/ui.js',import.meta.url),'utf8');
const avatar=readFileSync(new URL('../src/avatar-system.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

assert(ui.includes('data-menu-default="true">NO'),'leave confirmation NO is not marked as the safe default');
assert(ui.includes("if(!results.hidden){showLeaveConfirm(giveUpResult);return true;}"),'results cancel/back does not route through safe leave confirmation');
assert(!/setMode\('menu'\);\s*setTimeout\(/.test(ui),'menu focus is deferred and can restore to a hidden prior overlay');
assert(ui.includes("byId('result-score')"),'results score payload is not rendered');
assert(main.includes('score:state.score'),'main does not pass the existing score into results');
assert(ui.includes('showTrickHint'),'contextual trick onboarding is missing');
assert(main.includes('ui.showTrickHint?.()'),'first manual jump does not trigger trick onboarding');
assert(avatar.includes('handleMenuAction(action)'),'avatar selector does not consume semantic menu actions');
assert(!avatar.includes('buttons[0]')&&!avatar.includes('buttons[1]'),'avatar selector decodes raw controller indices');
assert(ui.includes('configureQuality'),'quality selector integration interface is missing');
assert(css.includes('@media (prefers-reduced-motion:reduce)'),'reduced-motion UI path is missing');
assert(css.includes('@media (max-height:720px)'),'small-laptop responsive path is missing');
assert(css.includes('@media (min-aspect-ratio:21/9)'),'ultrawide responsive path is missing');
assert(css.includes('.result-grid{grid-template-columns:repeat(4'),'results responsive grid baseline is missing');
assert(css.includes('max-height:calc(100dvh - 32px)'),'major overlays lack viewport height containment');

console.log(JSON.stringify({
  check:'ui-ux-invariants',
  keyboardNavigation:'pass',
  safeDefaultNo:'pass',
  focusRestoration:'pass',
  resultPayload:'pass',
  pauseLeaveFlow:'pass',
  responsiveOverlays:'pass',
  reducedMotion:'pass',
  qualityInterface:'pass'
}));
