import * as THREE from 'three';

const FIXED=[
  {
    name:'sunny',
    zenith:0x4fa5d6,high:0x8bc9e6,horizon:0xe6f6fc,fog:0xd9edf7,
    hemiSky:0xeaf9ff,hemiGround:0x6d879a,hemiIntensity:1.36,
    sun:0xffedc6,sunIntensity:3.15,rim:0xb8e5fb,rimIntensity:.50,
    snow:0xf3f9fd,bank:0xf9fdff,shadowSnow:0xd6e8f2,
    mountain:0x789aa9,snowCap:0xf0f8fb
  },
  {
    name:'golden-sunset',
    zenith:0x5e83bd,high:0xd28d75,horizon:0xffd4a1,fog:0xd9b8aa,
    hemiSky:0xffd8bd,hemiGround:0x68718f,hemiIntensity:1.28,
    sun:0xffb45e,sunIntensity:3.00,rim:0xffd0a8,rimIntensity:.46,
    snow:0xf7eee9,bank:0xfff4ea,shadowSnow:0xc9d6e2,
    mountain:0x796f82,snowCap:0xf5dfd3
  },
  {
    name:'blue-evening',
    zenith:0x284f86,high:0x4f79a4,horizon:0x91aec4,fog:0x829bb0,
    hemiSky:0x93bce0,hemiGround:0x43546f,hemiIntensity:1.05,
    sun:0xc3d7eb,sunIntensity:2.05,rim:0x85bbdd,rimIntensity:.54,
    snow:0xddeaf3,bank:0xe8f2f8,shadowSnow:0xaebfd0,
    mountain:0x4c6178,snowCap:0xd7e6ef
  },
  {
    name:'deep-blue-night',
    zenith:0x0a2142,high:0x17385d,horizon:0x365879,fog:0x304c69,
    hemiSky:0x5b83aa,hemiGround:0x23344e,hemiIntensity:.83,
    sun:0x9ab9d6,sunIntensity:1.42,rim:0x66a6d5,rimIntensity:.67,
    snow:0xb9d0e1,bank:0xc8dbe8,shadowSnow:0x829aae,
    mountain:0x30475e,snowCap:0xabc3d5
  },
  {
    name:'blue-gray-dawn',
    zenith:0x526d86,high:0x8395a5,horizon:0xbac3c9,fog:0xaebbc4,
    hemiSky:0xc0d3df,hemiGround:0x596979,hemiIntensity:1.12,
    sun:0xe6d5c5,sunIntensity:2.25,rim:0xb7d3e1,rimIntensity:.48,
    snow:0xe6edf1,bank:0xf0f4f6,shadowSnow:0xb8c7d0,
    mountain:0x697a87,snowCap:0xdce5e9
  }
];

const LATER=[
  {
    name:'pink-alpine-sunrise',
    zenith:0x6978ac,high:0xd48faa,horizon:0xffc7b7,fog:0xcdb3bd,
    hemiSky:0xf2c4cf,hemiGround:0x646782,hemiIntensity:1.22,
    sun:0xffc18e,sunIntensity:2.72,rim:0xe9b2d3,rimIntensity:.52,
    snow:0xf1eaf1,bank:0xf9f0f4,shadowSnow:0xc2c5d5,
    mountain:0x756b89,snowCap:0xead8e4
  },
  {
    name:'violet-dusk',
    zenith:0x342b67,high:0x675184,horizon:0xa27d9b,fog:0x806f87,
    hemiSky:0xa892c3,hemiGround:0x3f4058,hemiIntensity:.96,
    sun:0xe0b9c8,sunIntensity:1.92,rim:0x9e91d0,rimIntensity:.60,
    snow:0xd9d7e6,bank:0xe6e2ed,shadowSnow:0xa7a8c0,
    mountain:0x514d6c,snowCap:0xd1cedf
  },
  {
    name:'icy-cyan-morning',
    zenith:0x3f9eb8,high:0x8bd2da,horizon:0xe3fbf8,fog:0xcce6e7,
    hemiSky:0xdcfbff,hemiGround:0x63858d,hemiIntensity:1.34,
    sun:0xfff1d8,sunIntensity:2.90,rim:0xa8e9ef,rimIntensity:.50,
    snow:0xf0fbfb,bank:0xf8ffff,shadowSnow:0xc9e2e3,
    mountain:0x67959e,snowCap:0xe7f8f7
  },
  {
    name:'golden-afternoon',
    zenith:0x5793c0,high:0xa9c9d7,horizon:0xf0dec2,fog:0xd9d4c9,
    hemiSky:0xf3e5d2,hemiGround:0x70808b,hemiIntensity:1.30,
    sun:0xffcf7d,sunIntensity:3.05,rim:0xcce2e9,rimIntensity:.43,
    snow:0xf7f3ea,bank:0xfffaf0,shadowSnow:0xcbd5d8,
    mountain:0x778b94,snowCap:0xeee9df
  },
  {
    name:'stormy-blue-gray',
    zenith:0x42566a,high:0x687c8d,horizon:0xa6b2ba,fog:0x929fa8,
    hemiSky:0xaebfc9,hemiGround:0x4a5864,hemiIntensity:1.00,
    sun:0xd5e0e5,sunIntensity:1.85,rim:0x8fb1c4,rimIntensity:.44,
    snow:0xdfe8ec,bank:0xe9f0f3,shadowSnow:0xaebbc3,
    mountain:0x596a75,snowCap:0xd3dde1
  },
  {
    name:'purple-night',
    zenith:0x19183e,high:0x35305e,horizon:0x5b5579,fog:0x504d6a,
    hemiSky:0x7773a2,hemiGround:0x302f49,hemiIntensity:.86,
    sun:0xb8b8dc,sunIntensity:1.48,rim:0x7f87c5,rimIntensity:.66,
    snow:0xc7c9df,bank:0xd3d4e6,shadowSnow:0x9194ad,
    mountain:0x403e5b,snowCap:0xbec0d5
  },
  {
    name:'pale-winter-morning',
    zenith:0x718fa6,high:0xacc5d0,horizon:0xe8eeef,fog:0xd4dfe2,
    hemiSky:0xeaf5f6,hemiGround:0x73828b,hemiIntensity:1.27,
    sun:0xfff2db,sunIntensity:2.65,rim:0xc6e2e8,rimIntensity:.46,
    snow:0xf3f7f7,bank:0xfbfcfc,shadowSnow:0xcbd6da,
    mountain:0x81939d,snowCap:0xe8edef
  }
];

const colorKeys=['zenith','high','horizon','fog','hemiSky','hemiGround','sun','rim','snow','bank','shadowSnow','mountain','snowCap'];
const scalarKeys=['hemiIntensity','sunIntensity','rimIntensity'];
const tmpA=new THREE.Color();
const tmpB=new THREE.Color();
const tmpMountain=new THREE.Color();
const tmpSnowCap=new THREE.Color();

function smoothstep(t){
  t=THREE.MathUtils.clamp(t,0,1);
  return t*t*(3-2*t);
}

function laterIndex(segment){
  let x=(segment*1664525+1013904223)>>>0;
  x=(x^(x>>>16))>>>0;
  return x%LATER.length;
}

function paletteForSegment(segment){
  if(segment<FIXED.length)return FIXED[Math.max(0,segment)];
  let index=laterIndex(segment);
  if(segment>FIXED.length&&index===laterIndex(segment-1))index=(index+1)%LATER.length;
  return LATER[index];
}

function setColor(target,a,b,t){
  tmpA.setHex(a);
  tmpB.setHex(b);
  target.copy(tmpA).lerp(tmpB,t);
}

export function createDayCycle({
  scene,sky,fog,hemisphere,sun,rim,snowMaterials,atmosphere
}){
  const atmosphereMaterials=[];
  atmosphere?.traverse?.(object=>{
    const material=object.material;
    if(!material?.color)return;
    material.userData.baseDayColor??=material.color.clone();
    atmosphereMaterials.push(material);
  });

  const transitionSeconds=8;

  function apply(runTime=0){
    const t=Math.max(0,runTime);
    let from,to,blend=0;

    if(t<30){
      from=to=FIXED[0];
    }else{
      const segment=Math.floor(t/30);
      const segmentTime=t-segment*30;
      from=paletteForSegment(segment-1);
      to=paletteForSegment(segment);
      blend=smoothstep(segmentTime/transitionSeconds);
    }

    setColor(sky.material.uniforms.zenith.value,from.zenith,to.zenith,blend);
    setColor(sky.material.uniforms.high.value,from.high,to.high,blend);
    setColor(sky.material.uniforms.horizon.value,from.horizon,to.horizon,blend);
    if(sky.material.uniforms.sunColor)setColor(sky.material.uniforms.sunColor.value,from.sun,to.sun,blend);

    setColor(scene.background,from.fog,to.fog,blend);
    setColor(fog.color,from.fog,to.fog,blend);
    setColor(hemisphere.color,from.hemiSky,to.hemiSky,blend);
    setColor(hemisphere.groundColor,from.hemiGround,to.hemiGround,blend);
    setColor(sun.color,from.sun,to.sun,blend);
    setColor(rim.color,from.rim,to.rim,blend);

    for(const key of scalarKeys){
      const value=THREE.MathUtils.lerp(from[key],to[key],blend);
      if(key==='hemiIntensity')hemisphere.intensity=value;
      else if(key==='sunIntensity')sun.intensity=value;
      else if(key==='rimIntensity')rim.intensity=value;
    }

    setColor(snowMaterials.terrain.color,from.snow,to.snow,blend);
    setColor(snowMaterials.bank.color,from.bank,to.bank,blend);
    setColor(snowMaterials.shadowBank.color,from.shadowSnow,to.shadowSnow,blend);

    const mountainColor=tmpMountain.setHex(from.mountain).lerp(tmpB.setHex(to.mountain),blend);
    const snowCapColor=tmpSnowCap.setHex(from.snowCap).lerp(tmpA.setHex(to.snowCap),blend);
    for(const material of atmosphereMaterials){
      const base=material.userData.baseDayColor;
      if(!base)continue;
      const role=material.userData.atmosphereRole||'mountain';
      if(role==='snowcap'){
        material.color.copy(snowCapColor).lerp(base,.22);
      }else{
        material.color.copy(mountainColor).lerp(base,.36);
      }
    }
  }

  apply(0);
  return {apply};
}
