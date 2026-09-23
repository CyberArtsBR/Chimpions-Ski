import {SKI_TUNING} from './gameplayTuning.js';
import {DEFAULT_RIDE_MODE,getRideAudioProfile,getRideSpeedFeel,normalizeRideMode} from './rideAudioProfile.js';
import {createTrickAudioState,getTrickFailProfile,getTrickStartProfile,getTrickSuccessProfile} from './trickAudio.js';

const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const AudioContextClass=globalThis.AudioContext||globalThis.webkitAudioContext;

export function createSkiAudio(){
  const JUMP_MUSIC_URL='/audio/music-full.mp3';
  let context=null;
  let graph=null;
  let jumpMusic=null;
  let jumpMusicReady=false;
  let jumpMusicFailed=false;
  let rideMode=DEFAULT_RIDE_MODE;
  let pendingState={mode:'menu',speed:SKI_TUNING.BASE_SPEED,carve:0,air:false,intensity:0,jumpSource:'',time:0};
  let lastClearEventId=0;
  let lastGoVoiceAt=-Infinity;
  const trickState=createTrickAudioState();
  const buffers=new Map();
  const eventLast=new Map();
  const eventCooldown={
    banana:.035,jump:.10,ramp:.12,land:.08,hardLand:.13,oil:.18,clear:.07,crash:.34,
    menu:.025,button:.025,countTick:.10,countTickStrong:.10,speedUp:.28,go:.14,
    trick360Start:.20,trick360Success:.12,trickBackflipStart:.24,trickBackflipSuccess:.14,trickFail:.20
  };

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
  function ensureJumpMusic(){
    if(jumpMusic||typeof Audio==='undefined')return jumpMusic;
    try{
      jumpMusic=new Audio(JUMP_MUSIC_URL);
      jumpMusic.loop=true;
      jumpMusic.preload='auto';
      jumpMusic.volume=0;
      jumpMusic.addEventListener('canplay',()=>{jumpMusicReady=true;jumpMusicFailed=false;applyState(pendingState,true);},{once:true});
      jumpMusic.addEventListener('error',()=>{jumpMusicFailed=true;jumpMusicReady=false;applyState(pendingState,true);});
    }catch{jumpMusicFailed=true;}
    return jumpMusic;
  }
  function syncJumpMusic(mode){
    const media=ensureJumpMusic();
    if(!media)return false;
    const playing=settings.musicEnabled&&jumpMusicReady&&!jumpMusicFailed;
    const level=mode==='playing'?.38:mode==='countdown'?.22:mode==='paused'?.08:mode==='crashed'?.07:.16;
    media.volume=playing?clamp(settings.master*settings.music*level):0;
    if(playing&&media.paused)media.play().catch(()=>{});
    if(!playing&&!media.paused)media.pause();
    return playing;
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
    const duration={
      banana:.28,jump:.25,ramp:.34,land:.30,hardLand:.38,oil:.42,clear:.16,crash:.72,
      menu:.09,button:.075,countTick:.11,countTickStrong:.14,speedUp:.26,go:.34,
      trick360Start:.32,trick360Success:.28,trickBackflipStart:.42,trickBackflipSuccess:.36,trickFail:.30
    }[type]||.18;
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
      }else if(type==='jump'){
        hz=245+390*u;
        phase+=Math.PI*2*hz/context.sampleRate;
        phase2+=Math.PI*2*(hz*1.48)/context.sampleRate;
        tone=Math.sin(phase)*.55+Math.sin(phase2)*.14;
        noise=smoothNoise*.22;
        env=Math.pow(1-u,2.0)*Math.min(1,t/.005);
      }else if(type==='ramp'){
        hz=190+590*u;
        phase+=Math.PI*2*hz/context.sampleRate;
        tone=Math.sin(phase)*.48;
        noise=smoothNoise*.40;
        env=Math.pow(1-u,1.5)*Math.min(1,t/.008);
      }else if(type==='land'){
        hz=105-34*u;
        phase+=Math.PI*2*hz/context.sampleRate;
        tone=Math.sin(phase)*.68;
        noise=smoothNoise*.58;
        env=Math.pow(1-u,3.2)*Math.min(1,t/.003);
      }else if(type==='hardLand'){
        hz=88-30*u;
        phase+=Math.PI*2*hz/context.sampleRate;
        phase2+=Math.PI*2*(hz*.52)/context.sampleRate;
        tone=Math.sin(phase)*.72+Math.sin(phase2)*.20;
        noise=smoothNoise*.92;
        env=Math.pow(1-u,2.45)*Math.min(1,t/.0025);
      }else if(type==='oil'){
        hz=240-150*u+Math.sin(u*Math.PI*7)*24;
        phase+=Math.PI*2*hz/context.sampleRate;
        tone=Math.sin(phase)*.18;
        noise=smoothNoise*(.72+.22*Math.sin(u*Math.PI*5));
        env=Math.pow(1-u,1.55)*Math.min(1,t/.003);
      }else if(type==='clear'){
        hz=610+190*u;
        phase+=Math.PI*2*hz/context.sampleRate;
        phase2+=Math.PI*2*(hz*1.5)/context.sampleRate;
        tone=Math.sin(phase)*.66+Math.sin(phase2)*.16;
        env=Math.pow(1-u,2.8)*Math.min(1,t/.0025);
      }else if(type==='crash'){
        hz=82-26*u;
        phase+=Math.PI*2*hz/context.sampleRate;
        tone=Math.sin(phase)*.42;
        noise=smoothNoise*1.18;
        env=Math.pow(1-u,1.25)*Math.min(1,t/.003);
      }else if(type==='trick360Start'){
        hz=230+470*u+Math.sin(u*Math.PI*4)*55;
        phase+=Math.PI*2*hz/context.sampleRate;
        tone=Math.sin(phase)*.18;
        noise=smoothNoise*(.62+.16*Math.sin(u*Math.PI*6));
        env=Math.pow(Math.sin(Math.PI*u),.62)*Math.min(1,t/.008);
      }else if(type==='trickBackflipStart'){
        hz=150+720*u;
        phase+=Math.PI*2*hz/context.sampleRate;
        phase2+=Math.PI*2*(hz*.52)/context.sampleRate;
        tone=Math.sin(phase)*.24+Math.sin(phase2)*.12;
        noise=smoothNoise*(.82-.18*u);
        env=Math.pow(Math.sin(Math.PI*u),.48)*Math.min(1,t/.006);
      }else if(type==='trick360Success'||type==='trickBackflipSuccess'){
        const backflip=type==='trickBackflipSuccess';
        hz=(backflip?430:520)+(backflip?520:360)*u;
        phase+=Math.PI*2*hz/context.sampleRate;
        phase2+=Math.PI*2*(hz*(backflip?1.52:1.5))/context.sampleRate;
        tone=Math.sin(phase)*.62+Math.sin(phase2)*(backflip?.24:.18);
        noise=smoothNoise*(backflip?.12:.06);
        env=Math.pow(1-u,backflip?1.65:2.05)*Math.min(1,t/.004);
      }else if(type==='trickFail'){
        hz=120-48*u;
        phase+=Math.PI*2*hz/context.sampleRate;
        phase2+=Math.PI*2*(hz*.54)/context.sampleRate;
        tone=Math.sin(phase)*.55+Math.sin(phase2)*.18;
        noise=smoothNoise*.70;
        env=Math.pow(1-u,2.25)*Math.min(1,t/.0025);
      }else if(type==='countTick'||type==='countTickStrong'){
        hz=type==='countTickStrong'?560:485;
        phase+=Math.PI*2*hz/context.sampleRate;
        phase2+=Math.PI*2*(hz*1.51)/context.sampleRate;
        tone=Math.sin(phase)*.72+Math.sin(phase2)*.10;
        env=Math.pow(1-u,type==='countTickStrong'?2.8:3.4)*Math.min(1,t/.002);
      }else if(type==='speedUp'){
        hz=360+420*u;
        phase+=Math.PI*2*hz/context.sampleRate;
        phase2+=Math.PI*2*(hz*1.5)/context.sampleRate;
        tone=Math.sin(phase)*.50+Math.sin(phase2)*.12;
        env=Math.pow(1-u,2.1)*Math.min(1,t/.004);
      }else if(type==='go'){
        hz=500+640*u;
        phase+=Math.PI*2*hz/context.sampleRate;
        phase2+=Math.PI*2*(hz*2)/context.sampleRate;
        // Square-wave harmonics make the launch stinger read like a compact 16-bit arcade cue.
        tone=Math.sign(Math.sin(phase))*.62+Math.sign(Math.sin(phase2))*.12;
        noise=smoothNoise*.045;
        env=Math.pow(1-u,1.42)*Math.min(1,t/.004);
      }else{
        hz=type==='button'?620+130*u:470+90*u;
        phase+=Math.PI*2*hz/context.sampleRate;
        tone=Math.sin(phase);
        env=Math.pow(1-u,3.5)*Math.min(1,t/.002);
      }
      const scale=type==='crash'?.34:type==='hardLand'?.31:type==='oil'?.25:type==='land'?.27:type==='clear'?.20:
        type==='jump'?.24:type==='trickBackflipStart'?.25:type==='trick360Start'?.20:
        type==='trickBackflipSuccess'?.25:type==='trick360Success'?.22:type==='trickFail'?.27:.22;
      data[i]=(tone+noise)*env*scale;
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
    const compressor=context.createDynamicsCompressor();
    compressor.threshold.value=-11;
    compressor.knee.value=12;
    compressor.ratio.value=3.2;
    compressor.attack.value=.004;
    compressor.release.value=.16;
    sfxBus.connect(master);
    musicBus.connect(master);
    continuousBus.connect(sfxBus);
    eventBus.connect(sfxBus);
    master.connect(compressor);
    compressor.connect(context.destination);

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

    const boardScrapeSource=makeLoop(noiseBuffer(2.3,66571));
    const boardScrapeFilter=context.createBiquadFilter();
    const boardScrapeGain=context.createGain();
    boardScrapeFilter.type='bandpass';
    boardScrapeFilter.Q.value=.48;
    boardScrapeSource.connect(boardScrapeFilter);
    boardScrapeFilter.connect(boardScrapeGain);
    boardScrapeGain.connect(continuousBus);

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
    boardScrapeGain.gain.value=0;
    windGain.gain.value=0;
    musicGain.gain.value=0;

    contactSource.start();
    carveSource.start();
    boardScrapeSource.start();
    windSource.start();
    musicSource.start();

    graph={
      master,sfxBus,musicBus,continuousBus,eventBus,compressor,
      contactFilter,contactGain,carveFilter,carveGain,boardScrapeFilter,boardScrapeGain,
      windFilter,windGain,musicFilter,musicGain
    };
    applyState(pendingState,true);
    return graph;
  }
  function unlock(){
    try{
      if(!AudioContextClass)return;
      context??=new AudioContextClass();
      ensureGraph();
      if(context.state==='suspended')context.resume().catch(()=>{});
      const media=ensureJumpMusic();
      if(media&&settings.musicEnabled)media.play().catch(()=>{});
    }catch{}
  }
  function applyState(state,instant=false){
    pendingState={...pendingState,...state};
    if(!graph||!context)return;
    const profile=getRideAudioProfile(rideMode);
    const speed01=getRideSpeedFeel(pendingState.speed,rideMode);
    const carve=clamp(Math.abs(pendingState.carve||0));
    const air=!!pendingState.air;
    const mode=pendingState.mode||'menu';
    const running=mode==='playing';
    const countdown=mode==='countdown';
    const response=instant?.01:.09;

    const rampAir=air&&pendingState.jumpSource==='ramp';
    const contact=air?0:(running?(0.024+speed01*.058+carve*.032)*profile.contactGain:0);
    const edge=air?0:(running?carve*(.014+speed01*.072)*profile.carveGain:0);
    const boardScrape=air?0:(running?carve*(.010+speed01*.038)*profile.snowboardScrapeGain:0);
    const airWind=air?(rampAir?.058:.038):0;
    const wind=(running?(0.014+speed01*.076+airWind):countdown?.006:0)*profile.windGain;
    const musicBase=running?.13:countdown?.07:mode==='paused'?.025:mode==='crashed'?.018:.035;
    const intensity=clamp(pendingState.intensity??speed01);
    const usingJumpMusic=syncJumpMusic(mode);

    setTarget(graph.contactGain.gain,contact,response);
    setTarget(graph.carveGain.gain,edge,response);
    setTarget(graph.boardScrapeGain.gain,boardScrape,response);
    setTarget(graph.windGain.gain,wind,response);
    setTarget(graph.contactFilter.frequency,(560+speed01*720+carve*300)*profile.contactFrequencyScale,.12);
    setTarget(graph.carveFilter.frequency,(980+carve*1280+speed01*520)*profile.carveFrequencyScale,.10);
    setTarget(graph.carveFilter.Q,profile.carveQ,.12);
    setTarget(graph.boardScrapeFilter.frequency,360+speed01*420+carve*260,.12);
    setTarget(graph.windFilter.frequency,620+speed01*1640+(air?(rampAir?460:300):0),.20);
    setTarget(graph.musicFilter.frequency,1250+intensity*1100,.28);
    // Keep the procedural bed as a graceful fallback if the bundled local Chimp Jump track cannot play.
    setTarget(graph.musicGain.gain,usingJumpMusic?0:musicBase*(.86+intensity*.14),.35);
  }
  function update(state){applyState(state,false);}
  function setRideMode(mode){
    const next=normalizeRideMode(mode);
    if(next===rideMode)return rideMode;
    rideMode=next;
    applyState(pendingState,false);
    return rideMode;
  }
  function getRideMode(){return rideMode;}

  function play(type,gain=1,rateScale=1,pan=0){
    unlock();
    if(!context||!graph||!settings.sfxEnabled)return false;
    const now=context.currentTime;
    const cooldown=eventCooldown[type]??.035;
    const last=eventLast.get(type)??-Infinity;
    if(now-last<cooldown)return false;
    eventLast.set(type,now);
    const source=context.createBufferSource();
    const amp=context.createGain();
    const canPan=Math.abs(pan)>.001&&typeof context.createStereoPanner==='function';
    const panner=canPan?context.createStereoPanner():null;
    source.buffer=eventBuffer(type);
    const variation=type==='crash'?.035:type==='banana'?.055:type==='jump'?.04:type==='clear'?.012:
      type.startsWith('trick')?.012:.03;
    source.playbackRate.value=clamp(rateScale,.72,1.65)*(1+(Math.random()*2-1)*variation);
    amp.gain.value=Math.min(1.08,Math.max(0,gain));
    source.connect(amp);
    if(panner){
      panner.pan.value=clamp(pan,-1,1);
      amp.connect(panner);
      panner.connect(graph.eventBus);
    }else{
      amp.connect(graph.eventBus);
    }
    source.onended=()=>{
      source.disconnect();
      amp.disconnect();
      panner?.disconnect();
      source.onended=null;
    };
    source.start();
    return true;
  }
  function playGoVoice(){
    if(!settings.sfxEnabled)return false;
    const synth=globalThis.speechSynthesis;
    const Utterance=globalThis.SpeechSynthesisUtterance;
    if(!synth||!Utterance)return false;
    const now=globalThis.performance?.now?.()??Date.now();
    if(now-lastGoVoiceAt<700)return false;
    lastGoVoiceAt=now;
    try{
      const utterance=new Utterance('GO!');
      utterance.lang='en-US';
      utterance.rate=1.42;
      utterance.pitch=.86;
      utterance.volume=clamp(settings.master*settings.sfx*.94);
      const voices=synth.getVoices?.()||[];
      utterance.voice=voices.find(voice=>/^en(?:-|_)?US/i.test(voice.lang)&&/(google|microsoft|samantha|daniel|alex|david)/i.test(voice.name))
        ||voices.find(voice=>/^en/i.test(voice.lang))
        ||null;
      synth.speak(utterance);
      return true;
    }catch{return false;}
  }
  function playGoCue(){
    // Fire both layers in the same task: intelligible announcer voice + retro launch stinger.
    const chip=play('go',.76,1.0);
    const voice=playGoVoice();
    return chip||voice;
  }
  function playClear(clearEvent){
    const id=Number(clearEvent?.id)||0;
    if(!id||id===lastClearEventId)return false;
    lastClearEventId=id;
    const chain=Math.max(1,Number(clearEvent?.combo)||1);
    const pitch=1+Math.min(5,chain-1)*.08;
    const gain=.22+Math.min(5,chain-1)*.018;
    play('clear',gain,pitch);
    return true;
  }
  function playTrickStart(type,eventId){
    const event=trickState.start(type,eventId);
    if(!event.play)return false;
    const cue=getTrickStartProfile(event.type,event.generation);
    return cue?play(cue.sound,cue.gain,cue.rate,cue.pan):false;
  }
  function playTrickSuccess(type,combo=1,eventId){
    const event=trickState.result(type,'success',eventId);
    if(!event.play)return false;
    const cue=getTrickSuccessProfile(event.type,combo);
    return cue?play(cue.sound,cue.gain,cue.rate,cue.pan):false;
  }
  function playTrickFail(type,eventId){
    const event=trickState.result(type,'fail',eventId);
    if(!event.play)return false;
    const cue=getTrickFailProfile(event.type);
    return cue?play(cue.sound,cue.gain,cue.rate,cue.pan):false;
  }
  function resetRun(){
    lastClearEventId=0;
    lastGoVoiceAt=-Infinity;
    trickState.reset();
    eventLast.clear();
  }
  function refreshBuses(){
    if(!graph)return;
    setTarget(graph.master.gain,settings.master,.04);
    setTarget(graph.sfxBus.gain,settings.sfxEnabled?settings.sfx:0,.04);
    setTarget(graph.musicBus.gain,settings.musicEnabled?settings.music:0,.08);
    syncJumpMusic(pendingState.mode||'menu');
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
    if(settings.musicEnabled)unlock();
  }
  function getSettings(){return {...settings};}

  document.addEventListener('pointerdown',unlock,{once:true,capture:true});
  document.addEventListener('keydown',unlock,{once:true,capture:true});

  return {
    play,playGoCue,playClear,playTrickStart,playTrickSuccess,playTrickFail,resetRun,unlock,update,
    setRideMode,getRideMode,getSettings,setMasterVolume,setSfxVolume,setMusicVolume,setSfxEnabled,setMusicEnabled
  };
}
