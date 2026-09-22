export function createSkiAudio(){
  let context,master,muted=false;const buffers=new Map();let volume=.66;
  try{volume=Number(localStorage.getItem('chimpions-ski-sfx')??volume)}catch{}
  volume=Math.max(0,Math.min(1,Number.isFinite(volume)?volume:.66));
  function unlock(){try{context??=new AudioContext();if(!master){master=context.createGain();master.connect(context.destination)}master.gain.value=muted?0:volume;context.resume().catch(()=>{})}catch{}}
  function build(type){const duration={banana:.24,ramp:.34,land:.18,crash:.48,menu:.08}[type]||.15;const buffer=context.createBuffer(1,Math.ceil(context.sampleRate*duration),context.sampleRate),data=buffer.getChannelData(0);let seed=311,phase=0,noise=0;
    for(let i=0;i<data.length;i++){const t=i/context.sampleRate,u=t/duration;seed=(Math.imul(seed,1664525)+1013904223)>>>0;noise=noise*.72+(seed/4294967296*2-1)*.28;const hz=type==='banana'?(u<.45?720:1080):type==='ramp'?220+620*u:type==='land'?110:type==='crash'?75:type==='menu'?520:150+70*u;phase+=Math.PI*2*hz/context.sampleRate;const tone=Math.sin(phase)+(type==='crash'?noise*1.5:noise*.12);data[i]=tone*Math.pow(1-u,type==='crash'?1.2:2.2)*Math.min(1,t/.006)*(type==='crash'?.34:.22)}return buffer}
  function play(type,gain=1){unlock();if(!context||muted)return;if(!buffers.has(type))buffers.set(type,build(type));const source=context.createBufferSource(),g=context.createGain();source.buffer=buffers.get(type);g.gain.value=gain;source.connect(g);g.connect(master);source.start()}
  document.addEventListener('pointerdown',unlock,{once:true});document.addEventListener('keydown',unlock,{once:true});
  return {play,unlock,setMuted(v){muted=!!v;if(master)master.gain.value=muted?0:volume},setVolume(v){volume=Math.max(0,Math.min(1,Number(v)||0));if(master)master.gain.value=muted?0:volume;try{localStorage.setItem('chimpions-ski-sfx',volume)}catch{}}};
}
