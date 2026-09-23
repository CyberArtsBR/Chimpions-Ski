import {parseArgs,getRoot,read,result,finish,STATUS} from './integration-check-utils.mjs';

const args=parseArgs(),root=getRoot(args);
const input=read(root,'src/input.js'),main=read(root,'src/main.js');
const selector=read(root,'src/avatar-system.js')+read(root,'src/rideMode.js');
const trickInput=read(root,'src/trickInput.js');
const trick=trickInput+read(root,'src/trickSystem.js')+main;
const trickPresent=/backflip|\b360\b|trickType|trickState/i.test(trick);
const ridePresent=/snowboard|ride.?mode/i.test(selector+main);
const results=[];
results.push(result('A/Cross remains semantic Jump in gameplay input',
 /confirm:!!buttons\[STANDARD_BUTTON\.confirm\]/.test(input)&&/jump:!!buttons\[STANDARD_BUTTON\.confirm\]/.test(input)?STATUS.PASS:STATUS.FAIL,
 'button 0 must remain confirm+jump by context'));
results.push(result('D-pad / stick expose vertical intent for UP/DOWN tricks',
 /axisY/.test(input)&&/dpad:\{left,right,up,down\}/.test(input)?STATUS.PASS:STATUS.FAIL,'axisY + D-pad up/down'));
results.push(result('gamepad edges prevent held-A repeats',
 /edges/.test(input)&&/pressed/.test(input)?STATUS.PASS:STATUS.FAIL,'edge-triggered semantic input'));

for(const n of ['UP + Jump maps to 360 intent','DOWN/BACK + Jump maps to backflip intent','second airborne A maps to 360 without double-jump']){
 if(!trickPresent)results.push(result(n,STATUS.PENDING,'trick feature not merged yet'));
 else {
  const ok=n.startsWith('UP')?/const up=keyUp\|\|padUp[\s\S]{0,220}return up\?TRICK_TYPE\.SPIN_360:TRICK_TYPE\.BACKFLIP/.test(trickInput):
    n.startsWith('DOWN')?/keyDown=.*ArrowDown.*KeyS[\s\S]{0,320}return up\?TRICK_TYPE\.SPIN_360:TRICK_TYPE\.BACKFLIP/.test(trickInput):
    /readAirborneTrickIntent[\s\S]{0,320}\|\|TRICK_TYPE\.SPIN_360/.test(trickInput);
  results.push(result(n,ok?STATUS.PASS:STATUS.FAIL,'static intent contract'));
 }
}
for(const n of ['Selector A = select and B = back by context','selector input cannot leak into gameplay trick start','held A confirming ride mode cannot start run with jump/trick']){
 if(!ridePresent)results.push(result(n,STATUS.PENDING,'ride selector step not merged yet'));
 else {
  const combined=selector+main;
  const ok=n.startsWith('Selector')?/(button.?0|confirm)[\s\S]{0,400}(select|choose)/i.test(combined)&&/(button.?1|cancel)[\s\S]{0,400}(back|close|avatar)/i.test(combined):
    n.startsWith('selector input')?/(selector|dialog)[\s\S]{0,700}(open|active)[\s\S]{0,700}(return|block|suppress)/i.test(combined):
    /(padArmed|neutral|release|edges\.released|suppress|input.?lock)/i.test(combined);
  results.push(result(n,ok?STATUS.PASS:STATUS.FAIL,'context-gated selector/gameplay input'));
 }
}
finish('input-collision-invariants',results,{json:!!args.json,extra:{root,trickPresent,ridePresent}});
