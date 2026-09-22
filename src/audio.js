const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const AudioContextClass=globalThis.AudioContext||globalThis.webkitAudioContext;

export function createSkiAudio(){
  let context=null;
  let graph=null;
  let pendingState={mode:'menu',speed:12,carve:0,air:false,intensity:0};
  const buffers=new Map();

  const settings={
    master:readNumber('chimpions-ski-master',.82),
    sfx:readNumber('chimpions-ski-sfx',.78),
    music:readNumber('chimpions-ski-music',.36),
    sfxEnabled:readBool('chimpions-ski-sfx-enabled',true),
    musicEnabled:readBool('chimpions-ski-music-enabled',true)
  };

  function readNumber(key,fallback){
    try{
      const raw=localStorage.getItem(key);
      if(raw===null)return fallback;
      const value=Number(raw);
      return Number.isFinite(value)?clamp(value):fallback;
    }catch{return fallback;}
  }
  function readBool(key,fallback){
    try{
      const value=localStorage.getItem(key);
      return value===null?fallback:value!=='0';
    }catch{return fallback;}
  }
  function write(key,value){
    try{localStorage.setItem(key,String(value));}catch{}
  }
  function noiseBuffer(duration=2,seed=92821){
    const length=Math.ceil(context.sampleRate*duration);
    const buffer=context.createBuffer(1,length,context.sampleRate);
    const data=buffer.getChannelData(0);
    let n=seed>>>0,last=0;
    for(let i=0;i<length;i++){
      n=(Math.imul(n,1664525)+1013904223)>>>0;
      const white=n/4294967296*2-1;
      last=last*.68+white*.32;
      data[i]=last*.78+white*.22;
    }
    return buffer;
  }
  function eventBuffer(type){
    if(buffers.has(type))return buffers.get(type);
    const duration={banana:.28,ramp:.34,land:.30,crash:.72,menu:.09,button:.075,go:.32}[type]||.18;
    const length=Math.ceil(context.sampleRate*duration);
    const buffer=context.createBuffer(1,length,context.sampleRate);
    const data=buffer.getChannelData(0);
    let phase=0,phase2=0,seed=311+(type.length*971),smoothNoise=0;
    for(let i=0;i<length;i++){
      const t=i/context.sampleRate;
      const u=t/duration;
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const white=seed/4294967296*2-1;
      smoothNoise=smoothNoise*.62+white*.38;
      let hz=220,tone=0,noise=0,env=Math.pow(1-u,2.2)*Math.min(1,t/.006);
      if(type==='banana'){
        hz=u<.45?660:990;
        phase+=Math.PI*2*hz/context.sampleRate;
        phase2+=Math.PI*2*(hz*1.5)/context.sampleRate;
        tone=Math.sin(phase)*.72+Math.sin(phase2)*.20;
        env=Math.pow(1-u,1.8)*Math.min(1,t/.008);
      }else if(type==='ramp'){
        hz=190+590*u;
        phase+=Math.PI*2*hz/context.sampleRate;
        tone=Math.sin(phase)*.48;
        noise=smoothNoise*.40;
        env=Math.pow(1-u,1.5)*Math.min(1,t/.008);
      }else if(type==='land'){
        hz=92-28*u;
        phase+=Math.PI*2*hz/context.sampleRate;
        tone=Math.sin(phase)*.75;
        noise=smoothNoise*.72;
        env=Math.pow(1-u,3.0)*Math.min(1,t/.003);
      }else if(type==='crash'){
        hz=82-26*u;
        phase+=Math.PI*2*hz/context.sampleRate;
        tone=Math.sin(phase)*.42;
        noise=smoothNoise*1.18;
        env=Math.pow(1-u,1.25)*Math.min(1,t/.003);
      }else if(type==='go'){
        hz=540+520*u;
        phase+=Math.PI*2*hz/context.sampleRate;
        phase2+=Math.PI*2*(hz*2)/context.sampleRate;
        tone=Math.sin(phase)*.72+Math.sin(phase2)*.12;
        env=Math.pow(1-u,1.45)*Math.min(1,t/.006);
      }else{
        hz=type==='button'?620+130*u:470+90*u;
        phase+=Math.PI*2*hz/context.sampleRate;
        tone=Math.sin(phase);
        env=Math.pow(1-u,3.5)*Math.min(1,t/.002);
      }
      data[i]=(tone+noise)*env*(type==='crash'?.34:type==='land'?.30:.22);
    }
    buffers.set(type,buffer);
    return buffer;
  }
  function musicBuffer(){
    if(buffers.has('music-bed'))return buffers.get('music-bed');
    const duration=12;
    const length=Math.ceil(context.sampleRate*duration);
    const buffer=context.createBuffer(2,length,context.sampleRate);
    const left=buffer.getChannelData(0),right=buffer.getChannelData(1);
    const chords=[
      [110,138.59,164.81],
      [98,123.47,146.83],
      [87.31,110,130.81],
      [98,123.47,164.81]
    ];
    let seed=83177;
    for(let i=0;i<length;i++){
      const t=i/context.sampleRate;
      const segment=Math.min(3,Math.floor(t/3));
      const local=(t-segment*3)/3;
      const chord=chords[segment];
      const phrase=Math.pow(Math.sin(Math.PI*local),.55);
      let l=0,r=0;
      for(let n=0;n<chord.length;n++){
        const hz=chord[n];
        const drift=Math.sin(t*.21+n*1.7)*.12;
        const phase=Math.PI*2*(hz*t+drift);
        const overtone=Math.sin(phase*2.003)*.16;
        const voice=Math.sin(phase)+overtone;
        const pan=(n-1)*.23;
        l+=voice*(.38-pan*.22);
        r+=voice*(.38+pan*.22);
      }
      const beat=t%1.5;
      const pluck=Math.exp(-beat*7.2)*Math.sin(Math.PI*2*(220*(1+segment*.055))*t)*.11;
      seed=(Math.imul(seed,1103515245)+12345)>>>0;
      const shimmer=(seed/4294967296*2-1)*.008;
      left[i]=(l*.105*phrase)+pluck+shimmer;
      right[i]=(r*.105*phrase)+pluck*.82-shimmer;
    }
    buffers.set('music-bed',buffer);
    return buffer;
  }
  function makeLoop(buffer){
    const source=context.createBufferSource();
    source.buffer=buffer;
    source.loop=true;
    return source;
  }
  function setTarget(param,value,time=.08){
    if(!context)return;
    param.setTargetAtTime(value,context.currentTime,time);
  }
  function ensureGraph(){
    if(graph||!context)return graph;
    const master=context.createGain();
    const sfxBus=context.createGain();
    const musicBus=context.createGain();
    const continuousBus=context.createGain();
    const eventBus=context.createGain();
    sfxBus.connect(master);
    musicBus.connect(master);
    continuousBus.connect(sfxBus);
    eventBus.connect(sfxBus);
    master.connect(context.destination);

    const contactSource=makeLoop(noiseBuffer(2.4,19531));
    const contactFilter=context.createBiquadFilter();
    const contactGain=context.createGain();
    contactFilter.type='bandpass';
    contactFilter.Q.value=.55;
    contactSource.connect(contactFilter);
    contactFilter.connect(contactGain);
    contactGain.connect(continuousBus);

    const carveSource=makeLoop(noiseBuffer(2.1,72317));
    const carveFilter=context.createBiquadFilter();
    const carveGain=context.createGain();
    carveFilter.type='bandpass';
    carveFilter.Q.value=.9;
    carveSource.connect(carveFilter);
    carveFilter.connect(carveGain);
    carveGain.connect(continuousBus);

    const windSource=makeLoop(noiseBuffer(2.7,44963));
    const windFilter=context.createBiquadFilter();
    const windGain=context.createGain();
    windFilter.type='bandpass';
    windFilter.Q.value=.38;
    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(continuousBus);

    const musicSource=makeLoop(musicBuffer());
    const musicFilter=context.createBiquadFilter();
    const musicGain=context.createGain();
    musicFilter.type='lowpass';
    musicFilter.frequency.value=1750;
    musicSource.connect(musicFilter);
    musicFilter.connect(musicGain);
    musicGain.connect(musicBus);

    master.gain.value=settings.master;
    sfxBus.gain.value=settings.sfxEnabled?settings.sfx:0;
    musicBus.gain.value=settings.musicEnabled?settings.music:0;
    contactGain.gain.value=0;
    carveGain.gain.value=0;
    windGain.gain.value=0;
    musicGain.gain.value=0;

    contactSource.start();
    carveSource.start();
    windSource.start();
    musicSource.start();

    graph={master,sfxBus,musicBus,continuousBus,eventBus,contactFilter,contactGain,carveFilter,carveGain,windFilter,windGain,musicFilter,musicGain};
    applyState(pendingState,true);
    return graph;
  }
  function unlock(){
    try{
      if(!AudioContextClass)return;
      context??=new AudioContextClass();
      ensureGraph();
      if(context.state==='suspended')context.resume().catch(()=>{});
    }catch{}
  }
  function applyState(state,instant=false){
    pendingState={...pendingState,...state};
    if(!graph||!context)return;
    const speed01=clamp(((pendingState.speed||12)-12)/19);
    const carve=clamp(Math.abs(pendingState.carve||0));
    const air=!!pendingState.air;
    const mode=pendingState.mode||'menu';
    const running=mode==='playing';
    const countdown=mode==='countdown';
    const response=instant?.01:.09;

    const contact=(running?(0.026+speed01*.075+carve*.045):0)*(air?.06:1);
    const edge=(running?carve*(.018+speed01*.085):0)*(air?.04:1);
    const wind=running?(0.018+speed01*.105+(air?.045:0)):countdown?.012:0;
    const musicBase=running?.13:countdown?.07:mode==='paused'?.025:mode==='crashed'?.018:.035;
    const intensity=clamp(pendingState.intensity??speed01);

    setTarget(graph.contactGain.gain,contact,response);
    setTarget(graph.carveGain.gain,edge,response);
    setTarget(graph.windGain.gain,wind,response);
    setTarget(graph.contactFilter.frequency,620+speed01*650+carve*320,.12);
    setTarget(graph.carveFilter.frequency,1120+carve*1150+speed01*460,.10);
    setTarget(graph.windFilter.frequency,720+speed01*2100+(air?360:0),.16);
    setTarget(graph.musicFilter.frequency,1250+intensity*1100,.28);
    setTarget(graph.musicGain.gain,musicBase*(.86+intensity*.14),.35);
  }
  function update(state){applyState(state,false);}
  function play(type,gain=1){
    unlock();
    if(!context||!graph||!settings.sfxEnabled)return;
    const source=context.createBufferSource();
    const amp=context.createGain();
    source.buffer=eventBuffer(type);
    const variation=type==='crash'?.045:type==='banana'?.06:.035;
    source.playbackRate.value=1+(Math.random()*2-1)*variation;
    amp.gain.value=Math.max(0,gain);
    source.connect(amp);
    amp.connect(graph.eventBus);
    source.start();
  }
  function refreshBuses(){
    if(!graph)return;
    setTarget(graph.master.gain,settings.master,.04);
    setTarget(graph.sfxBus.gain,settings.sfxEnabled?settings.sfx:0,.04);
    setTarget(graph.musicBus.gain,settings.musicEnabled?settings.music:0,.08);
  }
  function setMasterVolume(value){
    settings.master=clamp(Number(value)||0);write('chimpions-ski-master',settings.master);refreshBuses();
  }
  function setSfxVolume(value){
    settings.sfx=clamp(Number(value)||0);write('chimpions-ski-sfx',settings.sfx);refreshBuses();
  }
  function setMusicVolume(value){
    settings.music=clamp(Number(value)||0);write('chimpions-ski-music',settings.music);refreshBuses();
  }
  function setSfxEnabled(value){
    settings.sfxEnabled=!!value;write('chimpions-ski-sfx-enabled',settings.sfxEnabled?1:0);refreshBuses();
  }
  function setMusicEnabled(value){
    settings.musicEnabled=!!value;write('chimpions-ski-music-enabled',settings.musicEnabled?1:0);refreshBuses();
  }
  function getSettings(){return {...settings};}

  document.addEventListener('pointerdown',unlock,{once:true,capture:true});
  document.addEventListener('keydown',unlock,{once:true,capture:true});

  return {play,unlock,update,getSettings,setMasterVolume,setSfxVolume,setMusicVolume,setSfxEnabled,setMusicEnabled};
}
