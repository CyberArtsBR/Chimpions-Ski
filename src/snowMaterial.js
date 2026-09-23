import * as THREE from 'three';

function hash2(x,y){
  const n=Math.sin(x*127.1+y*311.7)*43758.5453123;
  return n-Math.floor(n);
}

function configureTexture(texture,renderer,repeatX,repeatY,color=false){
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.repeat.set(repeatX,repeatY);
  texture.magFilter=THREE.LinearFilter;
  texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;
  texture.anisotropy=Math.min(12,renderer.capabilities.getMaxAnisotropy?.()||1);
  if(color)texture.colorSpace=THREE.SRGBColorSpace;
  texture.needsUpdate=true;
  return texture;
}

function makeSnowTextures(renderer){
  const size=512;
  const albedoData=new Uint8Array(size*size*4);
  const microData=new Uint8Array(size*size*4);
  const normalData=new Uint8Array(size*size*4);
  const roughnessData=new Uint8Array(size*size*4);
  const heightField=new Float32Array(size*size);

  for(let y=0;y<size;y++){
    for(let x=0;x<size;x++){
      const i=(y*size+x)*4;
      const u=x/size*Math.PI*2,v=y/size*Math.PI*2;
      // Integer periods make every generated channel seamless, including derivatives.
      const broad=Math.sin(u*2+v)*.58+Math.sin(u-v*3+1.9)*.32+Math.sin(u+v+4.2)*.22;
      const wind=Math.sin(u*7+v+Math.sin(v*2)*1.3)*.72+Math.sin(u*15+v*2+2.4)*.28;
      const drift=Math.sin(v*2+Math.sin(u)*1.7);
      const ripples=Math.sin(u*29+v*4+Math.sin(v)*2.2)*.20;
      const crust=Math.sin(u-v+1.1)*.28+Math.sin(u-v*2)*.18;
      const grain=(hash2(x,y)-.5);
      const sparkle=hash2(x*2.37+17,y*2.11+31)>.990?1:0;
      const icy=hash2(x*1.73+7,y*1.91+13)>.985?1:0;

      const tone=THREE.MathUtils.clamp(
        242+broad*4.4+wind*2.2+drift*1.4+ripples*1.3+crust*1.1+grain*1.4+sparkle*5.4+icy*2.2,
        226,
        255
      );
      const cool=THREE.MathUtils.clamp((wind+drift)*1.5+crust*.9,-3.2,3.6);
      albedoData[i]=THREE.MathUtils.clamp(tone-7-cool*.25,0,255);
      albedoData[i+1]=THREE.MathUtils.clamp(tone-1+cool*.20,0,255);
      albedoData[i+2]=THREE.MathUtils.clamp(tone+5+cool*.72,0,255);
      albedoData[i+3]=255;

      const micro=THREE.MathUtils.clamp(
        128+broad*18+wind*16+drift*9+ripples*12+crust*7+grain*7+sparkle*14+icy*8,
        72,
        190
      );
      microData[i]=micro;
      microData[i+1]=micro;
      microData[i+2]=micro;
      microData[i+3]=255;
      heightField[y*size+x]=micro/255;

      const rough=THREE.MathUtils.clamp(
        219-broad*10-wind*6-ripples*5-grain*5-sparkle*14-icy*9,
        176,
        241
      );
      roughnessData[i]=rough;
      roughnessData[i+1]=rough;
      roughnessData[i+2]=rough;
      roughnessData[i+3]=255;
    }
  }

  for(let y=0;y<size;y++){
    for(let x=0;x<size;x++){
      const xm=(x-1+size)%size,xp=(x+1)%size;
      const ym=(y-1+size)%size,yp=(y+1)%size;
      const dx=(heightField[y*size+xp]-heightField[y*size+xm])*2.2;
      const dy=(heightField[yp*size+x]-heightField[ym*size+x])*2.2;
      const inv=1/Math.sqrt(dx*dx+dy*dy+1);
      const nx=-dx*inv,ny=-dy*inv,nz=inv;
      const i=(y*size+x)*4;
      normalData[i]=(nx*.5+.5)*255;
      normalData[i+1]=(ny*.5+.5)*255;
      normalData[i+2]=(nz*.5+.5)*255;
      normalData[i+3]=255;
    }
  }

  const albedo=configureTexture(
    new THREE.DataTexture(albedoData,size,size,THREE.RGBAFormat),
    renderer,
    8,
    12,
    true
  );
  const micro=configureTexture(
    new THREE.DataTexture(microData,size,size,THREE.RGBAFormat),
    renderer,
    11,
    17
  );
  const normal=configureTexture(
    new THREE.DataTexture(normalData,size,size,THREE.RGBAFormat),
    renderer,
    13,
    19
  );
  const roughness=configureTexture(
    new THREE.DataTexture(roughnessData,size,size,THREE.RGBAFormat),
    renderer,
    7,
    11
  );
  return {albedo,micro,normal,roughness};
}

export function createSnowMaterials(renderer,{detailLevel=1}={}){
  const textures=makeSnowTextures(renderer);
  const terrain=new THREE.MeshPhysicalMaterial({
    color:0xf2f9fd,
    map:textures.albedo,
    roughness:.86,
    roughnessMap:textures.roughness,
    metalness:0,
    normalMap:textures.normal,
    normalScale:new THREE.Vector2(.50,.76),
    bumpMap:textures.micro,
    bumpScale:.033,
    clearcoat:.07,
    clearcoatRoughness:.52,
    sheen:.42,
    sheenColor:new THREE.Color(0xc9ecff),
    sheenRoughness:.66
  });

  const bank=new THREE.MeshPhysicalMaterial({
    color:0xf8fdff,
    roughness:.82,
    metalness:0,
    normalMap:textures.normal,
    normalScale:new THREE.Vector2(.28,.42),
    bumpMap:textures.micro,
    bumpScale:.019,
    clearcoat:.09,
    clearcoatRoughness:.66,
    sheen:.14,
    sheenColor:new THREE.Color(0xd9f3ff)
  });

  const shadowBank=new THREE.MeshStandardMaterial({
    color:0xd6e8f2,
    roughness:.96,
    metalness:0,
    bumpMap:textures.micro,
    bumpScale:.015
  });

  const snowTravel={value:0},snowDetail={value:detailLevel};
  terrain.onBeforeCompile=shader=>{
    shader.uniforms.snowTravel=snowTravel;shader.uniforms.snowDetail=snowDetail;
    shader.vertexShader='varying vec3 vSnowWorld;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
      vSnowWorld=(modelMatrix*vec4(transformed,1.0)).xyz;
    `);
    shader.fragmentShader=`
      varying vec3 vSnowWorld;
      uniform float snowTravel,snowDetail;
      float snowHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float snowNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(snowHash(i),snowHash(i+vec2(1,0)),f.x),mix(snowHash(i+vec2(0,1)),snowHash(i+vec2(1,1)),f.x),f.y);}
    `+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      vec2 snowP=vec2(vSnowWorld.x,vSnowWorld.z-snowTravel);
      float snowMacro=snowNoise(snowP*.055)*.67+snowNoise(snowP*.143+17.0)*.33;
      float snowPacked=1.0-smoothstep(7.0,13.0,abs(snowP.x));
      float snowMeso=snowNoise(snowP*vec2(.48,.16));
      float snowPhase=snowP.x*68.0+sin(snowP.y*.16)*.7+snowMeso*1.3;
      float snowAA=1.0-smoothstep(.7,3.0,fwidth(snowPhase));
      float grooming=sin(snowPhase)*snowAA*snowPacked*.012*snowDetail;
      vec3 snowCold=mix(vec3(.77,.88,.99),vec3(1.0),smoothstep(.15,.85,snowMacro));
      diffuseColor.rgb*=snowCold*(.97+snowMeso*.035+grooming);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      roughnessFactor=clamp(roughnessFactor+snowMeso*.13-snowPacked*.055,.57,.96);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      float crystalDistance=1.0-smoothstep(8.0,28.0,length(vViewPosition));
      vec2 crystalGrid=snowP*84.0;
      float crystalAA=1.0-smoothstep(.4,1.5,max(fwidth(crystalGrid.x),fwidth(crystalGrid.y)));
      float crystal=pow(max(0.0,snowHash(floor(crystalGrid))-.965)/.035,5.0);
      float glint=pow(max(0.0,dot(normal,normalize(vViewPosition))),18.0);
      outgoingLight+=vec3(.72,.85,1.0)*crystal*glint*crystalDistance*crystalAA*.18*snowDetail;
      #include <opaque_fragment>
    `);
  };
  terrain.customProgramCacheKey=()=> 'premium-alpine-snow-v1';

  let currentDetailLevel=1;
  function setDetailLevel(value=1){
    const numeric=Number(value);
    currentDetailLevel=THREE.MathUtils.clamp(Number.isFinite(numeric)?numeric:1,0,1);
    const t=currentDetailLevel;
    snowDetail.value=t;
    terrain.normalScale.set(.16+.34*t,.24+.52*t);
    terrain.bumpScale=.008+.025*t;
    terrain.clearcoat=.025+.045*t;
    terrain.clearcoatRoughness=.60-.08*t;
    bank.normalScale.set(.10+.18*t,.16+.26*t);
    bank.bumpScale=.005+.014*t;
    shadowBank.bumpScale=.004+.011*t;
    return currentDetailLevel;
  }
  setDetailLevel(detailLevel);

  return {
    terrain,
    bank,
    shadowBank,
    texture:textures.albedo,
    textures,
    setDetailLevel,
    setTravel:value=>{snowTravel.value=Number.isFinite(value)?value:0;},
    getDetailLevel:()=>currentDetailLevel
  };
}
