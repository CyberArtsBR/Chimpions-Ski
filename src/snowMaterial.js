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
  const size=256;
  const albedoData=new Uint8Array(size*size*4);
  const microData=new Uint8Array(size*size*4);
  const normalData=new Uint8Array(size*size*4);
  const roughnessData=new Uint8Array(size*size*4);
  const heightField=new Float32Array(size*size);

  for(let y=0;y<size;y++){
    for(let x=0;x<size;x++){
      const i=(y*size+x)*4;
      const broad=
        Math.sin(x*.095+y*.024)*.58+
        Math.sin(x*.028-y*.073+1.9)*.32+
        Math.sin((x+y)*.019+4.2)*.22;
      const wind=
        Math.sin(x*.18+y*.036+Math.sin(y*.04)*1.3)*.72+
        Math.sin(x*.36+y*.058+2.4)*.28;
      const drift=Math.sin(y*.041+Math.sin(x*.024)*1.7);
      const ripples=Math.sin(x*.52+y*.082+Math.sin(y*.021)*2.2)*.20;
      const crust=Math.sin(x*.016-y*.021+1.1)*.28+Math.sin((x-y)*.031)*.18;
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
    7.2,
    10.8,
    true
  );
  const micro=configureTexture(
    new THREE.DataTexture(microData,size,size,THREE.RGBAFormat),
    renderer,
    8.4,
    12.2
  );
  const normal=configureTexture(
    new THREE.DataTexture(normalData,size,size,THREE.RGBAFormat),
    renderer,
    9.2,
    13.4
  );
  const roughness=configureTexture(
    new THREE.DataTexture(roughnessData,size,size,THREE.RGBAFormat),
    renderer,
    6.7,
    10.1
  );
  return {albedo,micro,normal,roughness};
}

export function createSnowMaterials(renderer){
  const textures=makeSnowTextures(renderer);
  const terrain=new THREE.MeshPhysicalMaterial({
    color:0xf2f9fd,
    map:textures.albedo,
    roughness:.70,
    roughnessMap:textures.roughness,
    metalness:0,
    normalMap:textures.normal,
    normalScale:new THREE.Vector2(.50,.76),
    bumpMap:textures.micro,
    bumpScale:.033,
    clearcoat:.18,
    clearcoatRoughness:.52,
    sheen:.30,
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

  return {
    terrain,
    bank,
    shadowBank,
    texture:textures.albedo,
    textures
  };
}
