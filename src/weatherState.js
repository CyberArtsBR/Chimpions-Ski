import * as THREE from 'three';
export const WEATHER_MODES=Object.freeze(['auto','day','sunset','night','snow','rain','storm']);
const presets={
  day:{top:0x438cc3,horizon:0xd8eafa,fog:0xd4e4ee,sun:0xffebc7,ambient:0xc2def2,snow:0xf4f9ff,key:2.65,fill:1.05,cloud:.26,night:0,rain:0,snowfall:.23,wind:.22,wet:0,fogDensity:.0065,exposure:1.05},
  sunset:{top:0x455989,horizon:0xf6b98a,fog:0xceb8ba,sun:0xffac68,ambient:0xbabddf,snow:0xfff1e9,key:2.15,fill:.85,cloud:.32,night:.08,rain:0,snowfall:.12,wind:.16,wet:0,fogDensity:.0068,exposure:1.03},
  night:{top:0x071229,horizon:0x344866,fog:0x253850,sun:0xaecff7,ambient:0x7594c3,snow:0xbad2ee,key:1.3,fill:.8,cloud:.18,night:1,rain:0,snowfall:.3,wind:.25,wet:.05,fogDensity:.0068,exposure:1.13},
  snow:{top:0x607689,horizon:0xbccbd8,fog:0xaabbc9,sun:0xd8e7f1,ambient:0xa3bfd6,snow:0xe1effb,key:1.45,fill:1.05,cloud:.88,night:.15,rain:0,snowfall:1,wind:1,wet:.04,fogDensity:.0105,exposure:1.04},
  rain:{top:0x0a1730,horizon:0x405674,fog:0x344a64,sun:0xaac8ed,ambient:0x779ac5,snow:0xc3d5e7,key:1.25,fill:.82,cloud:.82,night:.94,rain:.78,snowfall:0,wind:.7,wet:.9,fogDensity:.0085,exposure:1.12},
  storm:{top:0x0c1428,horizon:0x455064,fog:0x3b4a60,sun:0xb8c9e9,ambient:0x839cc0,snow:0xc2cfdf,key:.95,fill:.88,cloud:1,night:.94,rain:1,snowfall:.04,wind:1.4,wet:1,fogDensity:.0105,exposure:1.12}
};
const colors=['top','horizon','fog','sun','ambient','snow'];
const sequence=['day','sunset','night','rain','storm','snow','day'];
export function weatherName(value){return WEATHER_MODES.includes(value)?value:'auto';}
export function createWeatherState(mode='auto',reducedFlashes=false){
  mode=weatherName(mode);
  const values={},targets={};
  for(const [key,value] of Object.entries(presets.day)){
    values[key]=colors.includes(key)?new THREE.Color(value):value;
    targets[key]=colors.includes(key)?new THREE.Color(value):value;
  }
  let elapsed=0,nextStrike=11,flashAge=10,thunderWait=-1,serial=0;
  values.flash=0;values.strike=false;values.thunder=false;values.mode=mode;values.preset='day';
  function setMode(next){mode=weatherName(next);values.mode=mode;elapsed=0;flashAge=10;nextStrike=8;thunderWait=-1;values.flash=0;}
  function update(dt){
    dt=Number.isFinite(dt)?Math.max(0,Math.min(dt,.1)):0;elapsed+=dt;
    const preset=mode==='auto'?sequence[Math.floor(elapsed/65)%sequence.length]:mode;
    values.preset=preset;values.strike=false;values.thunder=false;
    const target=presets[preset],blend=1-Math.exp(-dt*.65);
    for(const key of Object.keys(target)){
      if(colors.includes(key)){targets[key].setHex(target[key]);values[key].lerp(targets[key],blend);}
      else values[key]+=(target[key]-values[key])*blend;
    }
    flashAge+=dt;
    if(preset==='storm'&&values.rain>.65){
      nextStrike-=dt;
      if(nextStrike<=0){flashAge=0;values.strike=true;serial++;values.strikeSerial=serial;nextStrike=10+(Math.sin(serial*9.17)*.5+.5)*9;thunderWait=1.5+(serial%3)*.65;}
    }else {nextStrike=Math.max(nextStrike,6);flashAge=10;thunderWait=-1;}
    const pulse=Math.exp(-flashAge*11)*.8+Math.exp(-Math.pow((flashAge-.18)/.045,2))*.3;
    values.flash=flashAge<.7?pulse*(reducedFlashes?.045:1):0;
    if(thunderWait>=0){thunderWait-=dt;if(thunderWait<0)values.thunder=true;}
    values.reducedFlashes=reducedFlashes;return values;
  }
  return {values,update,setMode,setReducedFlashes(value){reducedFlashes=!!value;if(reducedFlashes)values.flash=0;}};
}
