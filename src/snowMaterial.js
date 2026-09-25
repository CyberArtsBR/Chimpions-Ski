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
      const broad=Math.sin(u*2+v)*.62+Math.sin(u-v*3+1.9)*.36+Math.sin(u+v+4.2)*.25;
      const wind=Math.sin(u*7+v+Math.sin(v*2)*1.3)*.78+Math.sin(u*15+v*2+2.4)*.31;
      const drift=Math.sin(v*2+Math.sin(u)*1.7);
      const ripples=Math.sin(u*29+v*4+Math.sin(v)*2.2)*.25;
      const crust=Math.sin(u-v+1.1)*.31+Math.sin(u-v*2)*.21;
      const grain=(hash2(x,y)-.5)*.38;
      const sparkle=hash2(x*2.37+17,y*2.11+31)>.996?1:0;

      const tone=THREE.MathUtils.clamp(
        249+broad*2.6+wind*1.3+drift*1.1+ripples*.8+crust*.6+grain*.9+sparkle*2,
        236,
        255
      );
      const cool=THREE.MathUtils.clamp((wind+drift)*.72+crust*.38,-1.25,1.45);
      // Powder stays visually neutral-white; temperature variation is deliberately subtle.
      albedoData[i]=THREE.MathUtils.clamp(tone-.35-cool*.05,0,255);
      albedoData[i+1]=THREE.MathUtils.clamp(tone+cool*.015,0,255);
      albedoData[i+2]=THREE.MathUtils.clamp(tone+.35+cool*.06,0,255);
      albedoData[i+3]=255;

      const micro=THREE.MathUtils.clamp(
        128+broad*21+wind*16+drift*11+ripples*12+crust*6+grain*7,
        62,
        202
      );
      microData[i]=micro;
      microData[i+1]=micro;
      microData[i+2]=micro;
      microData[i+3]=255;
      heightField[y*size+x]=micro/255;

      const rough=THREE.MathUtils.clamp(
        242-broad*4-wind*3-ripples*2-grain*2,
        226,
        253
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
      const dx=(heightField[y*size+xp]-heightField[y*size+xm])*1.8;
      const dy=(heightField[yp*size+x]-heightField[ym*size+x])*1.8;
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
    color:0xffffff,
    map:textures.albedo,
    roughness:.98,
    roughnessMap:textures.roughness,
    metalness:0,
    normalMap:textures.normal,
    normalScale:new THREE.Vector2(.28,.38),
    bumpMap:textures.micro,
    bumpScale:.020,
    clearcoat:0,
    clearcoatRoughness:1,
    sheen:.12,
    sheenColor:new THREE.Color(0xffffff),
    sheenRoughness:.70,
    ior:1.31
  });

  const bank=new THREE.MeshPhysicalMaterial({
    color:0xffffff,
    map:textures.albedo,
    roughness:.97,
    roughnessMap:textures.roughness,
    metalness:0,
    normalMap:textures.normal,
    normalScale:new THREE.Vector2(.22,.30),
    bumpMap:textures.micro,
    bumpScale:.016,
    clearcoat:0,
    clearcoatRoughness:1,
    sheen:.10,
    sheenColor:new THREE.Color(0xffffff),
    sheenRoughness:.58,
    ior:1.31
  });

  const shadowBank=new THREE.MeshStandardMaterial({
    color:0xf6f6f5,
    roughness:.92,
    metalness:0,
    bumpMap:textures.micro,
    bumpScale:.019
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
      float snowLarge=snowNoise(snowP*.022+vec2(4.0,-9.0));
      float snowMacro=snowNoise(snowP*.055)*.56+snowNoise(snowP*.143+17.0)*.28+snowLarge*.16;
      float snowPacked=1.0-smoothstep(6.4,13.4,abs(snowP.x));
      float snowMeso=snowNoise(snowP*vec2(.48,.16));
      float snowFine=snowNoise(snowP*vec2(1.65,.72)+vec2(-13.0,7.0));
      float snowLoose=1.0-snowPacked;
      float compressed=smoothstep(.60,.83,snowNoise(snowP*vec2(.22,.055)+vec2(9.0,-14.0)))*snowPacked;
      float snowPhase=snowP.x*68.0+sin(snowP.y*.16)*.7+snowMeso*1.3;
      float snowAA=1.0-smoothstep(.7,3.0,fwidth(snowPhase));
      float grooming=sin(snowPhase)*snowAA*snowPacked*.016*snowDetail;
      float trough=smoothstep(.58,.82,1.0-snowMeso)*(.45+.55*snowLarge);
      float snowShade=.945+snowMacro*.018+snowMeso*.050+snowLarge*.035+snowFine*.014+grooming-compressed*.018-trough*.015;
      diffuseColor.rgb*=vec3(snowShade);
      diffuseColor.rgb+=vec3((.006+.008*snowFine)*snowDetail);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      float driftPhase=snowP.x*2.3+snowP.y*.32+sin(snowP.y*.17)*1.1;
      float driftFade=(1.0-smoothstep(18.0,92.0,length(vViewPosition)))*snowDetail;
      vec2 driftSlope=cos(driftPhase)*vec2(2.3,.32+cos(snowP.y*.17)*.187)*.052;
      driftSlope+=cos(snowP.x*.63-snowP.y*.27)*vec2(.63,-.27)*.08;
      driftSlope+=cos(snowP.x*4.2+snowP.y*.74)*vec2(4.2,.74)*.005;
      driftSlope.x+=cos(snowPhase)*snowPacked*snowAA*.042;
      normal=normalize(normal+mat3(viewMatrix)*vec3(-driftSlope.x,0.0,-driftSlope.y)*driftFade*(.68+.42*snowLoose));
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      roughnessFactor=clamp(roughnessFactor+snowMeso*.055+snowLoose*.018-compressed*.012,.84,1.0);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      float crystalDistance=1.0-smoothstep(7.0,34.0,length(vViewPosition));
      vec2 crystalGrid=snowP*82.0;
      float crystalAA=1.0-smoothstep(.38,1.65,max(fwidth(crystalGrid.x),fwidth(crystalGrid.y)));
      float crystal=pow(max(0.0,snowHash(floor(crystalGrid))-.993)/.007,4.0);
      outgoingLight+=vec3(.92,.96,1.0)*crystal*.035*crystalDistance*crystalAA*snowDetail;
      #include <opaque_fragment>
    `);
  };
  terrain.customProgramCacheKey=()=> 'premium-alpine-snow-v8-powder';

  let currentDetailLevel=1;
  function setDetailLevel(value=1){
    const numeric=Number(value);
    currentDetailLevel=THREE.MathUtils.clamp(Number.isFinite(numeric)?numeric:1,0,1);
    const t=currentDetailLevel;
    snowDetail.value=t;
    terrain.normalScale.set(.14+.14*t,.19+.19*t);
    terrain.bumpScale=.010+.010*t;
    terrain.clearcoat=0;
    terrain.sheen=.08+.04*t;
    bank.normalScale.set(.12+.10*t,.16+.14*t);
    bank.bumpScale=.008+.008*t;
    bank.clearcoat=0;
    shadowBank.bumpScale=.006+.016*t;
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
