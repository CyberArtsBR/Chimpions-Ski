// Standard mapping supports Xbox/PlayStation; generic pads fall back to the two main axes.
export function readPad(pads){
 const connected=Array.from(pads).filter(p=>p?.connected);
 const active=connected.find(p=>Math.abs(p.axes?.[0]||0)>.2||Math.abs(p.axes?.[1]||0)>.2||p.buttons?.some(b=>b.pressed))||connected[0];
 if(!active)return {axis:0,axisY:0,buttons:[]};
 const buttons=active.buttons.map(b=>b.pressed);
 const rawX=Math.max(-1,Math.min(1,active.axes?.[0]||0));
 const rawY=Math.max(-1,Math.min(1,active.axes?.[1]||0));
 const axis=Number(buttons[15])-Number(buttons[14])||(Math.abs(rawX)>.2?Math.sign(rawX)*(Math.abs(rawX)-.2)/.8:0);
 const axisY=Number(buttons[13])-Number(buttons[12])||(Math.abs(rawY)>.2?Math.sign(rawY)*(Math.abs(rawY)-.2)/.8:0);
 // Static UI confirmation is handled by runtimeEnhancements so A activates the
 // currently focused control instead of a hard-coded start/retry action.
 const mode=document.body?.dataset?.mode||'';
 const uiDialog=document.querySelector('#collection-dialog[open],#results-dialog[open],#record-book[open]');
 if(uiDialog||mode==='menu'||mode==='paused')buttons[0]=false;
 return {axis,axisY,buttons};
}
