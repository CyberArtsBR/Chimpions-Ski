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
      const grain=(hash2(x,y)-.5);
      const sparkle=hash2(x*2.37+17,y*2.11+31)>.992?1:0;

      const tone=THREE.MathUtils.clamp(
        243+broad*4.0+wind*2.0+drift*1.2+grain*1.3+sparkle*5.0,
        228,
        255
      );
      albedoData[i]=THREE.MathUtils.clamp(tone-6,0,255);
      albedoData[i+1]=THREE.MathUtils.clamp(tone-1,0,255);
      albedoData[i+2]=THREE.MathUtils.clamp(tone+4,0,255);
      albedoData[i+3]=255;

      const micro=THREE.MathUtils.clamp(
        128+broad*18+wind*15+drift*9+grain*6+sparkle*13,
        76,
        184
      );
      microData[i]=micro;
      microData[i+1]=micro;
      microData[i+2]=micro;
      microData[i+3]=255;
      heightField[y*size+x]=micro/255;

      const rough=THREE.MathUtils.clamp(
        222-broad*9-wind*5-grain*5-sparkle*12,
        184,
        242
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
    color:0xf3f9fd,
    map:textures.albedo,
    roughness:.75,
    roughnessMap:textures.roughness,
    metalness:0,
    normalMap:textures.normal,
    normalScale:new THREE.Vector2(.42,.66),
    bumpMap:textures.micro,
    bumpScale:.027,
    clearcoat:.14,
    clearcoatRoughness:.58,
    sheen:.18,
    sheenColor:new THREE.Color(0xcfefff),
    sheenRoughness:.74
  });

  const bank=new THREE.MeshPhysicalMaterial({
    color:0xf9fdff,
    roughness:.86,
    metalness:0,
    normalMap:textures.normal,
    normalScale:new THREE.Vector2(.22,.34),
    bumpMap:textures.micro,
    bumpScale:.015,
    clearcoat:.055,
    clearcoatRoughness:.72
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
