// Standard mapping supports Xbox/PlayStation pads and generic gamepads.
const DEADZONE=.20;
function axisValue(value=0){
  const raw=Math.max(-1,Math.min(1,Number(value)||0));
  const magnitude=Math.abs(raw);
  if(magnitude<=DEADZONE)return 0;
  return Math.sign(raw)*(magnitude-DEADZONE)/(1-DEADZONE);
}

export function readPad(pads){
  const connected=Array.from(pads||[]).filter(p=>p?.connected);
  const active=connected.find(p=>Math.abs(p.axes?.[0]||0)>DEADZONE||Math.abs(p.axes?.[1]||0)>DEADZONE||p.buttons?.some(b=>b.pressed))||connected[0];
  if(!active)return {connected:false,axis:0,axisY:0,buttons:[],confirm:false,jump:false,cancel:false,menu:false};
  const buttons=active.buttons.map(button=>!!button.pressed);
  const rawX=axisValue(active.axes?.[0]||0);
  const rawY=axisValue(active.axes?.[1]||0);
  const dpadX=Number(buttons[15])-Number(buttons[14]);
  const dpadY=Number(buttons[13])-Number(buttons[12]);
  return {
    connected:true,
    axis:dpadX||rawX,
    axisY:dpadY||rawY,
    buttons,
    confirm:!!buttons[0],
    jump:!!buttons[0],
    cancel:!!buttons[1],
    menu:!!buttons[9]
  };
}
