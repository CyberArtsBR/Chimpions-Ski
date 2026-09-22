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
  const size=128;
  const albedoData=new Uint8Array(size*size*4);
  const microData=new Uint8Array(size*size*4);
  const roughnessData=new Uint8Array(size*size*4);

  for(let y=0;y<size;y++){
    for(let x=0;x<size;x++){
      const i=(y*size+x)*4;
      const broad=
        Math.sin(x*.095+y*.024)*.58+
        Math.sin(x*.028-y*.073+1.9)*.32+
        Math.sin((x+y)*.019+4.2)*.22;
      const wind=Math.sin(x*.18+y*.036+Math.sin(y*.04)*1.3);
      const grain=(hash2(x,y)-.5);
      const sparkle=hash2(x*2.37+17,y*2.11+31)>.994?1:0;

      const tone=THREE.MathUtils.clamp(
        244+broad*3.1+wind*1.25+grain*1.7+sparkle*4.5,
        231,
        255
      );
      albedoData[i]=THREE.MathUtils.clamp(tone-6,0,255);
      albedoData[i+1]=THREE.MathUtils.clamp(tone-1,0,255);
      albedoData[i+2]=THREE.MathUtils.clamp(tone+4,0,255);
      albedoData[i+3]=255;

      const micro=THREE.MathUtils.clamp(
        128+broad*17+wind*11+grain*8+sparkle*15,
        82,
        176
      );
      microData[i]=micro;
      microData[i+1]=micro;
      microData[i+2]=micro;
      microData[i+3]=255;

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
  const roughness=configureTexture(
    new THREE.DataTexture(roughnessData,size,size,THREE.RGBAFormat),
    renderer,
    6.7,
    10.1
  );
  return {albedo,micro,roughness};
}

export function createSnowMaterials(renderer){
  const textures=makeSnowTextures(renderer);
  const terrain=new THREE.MeshPhysicalMaterial({
    color:0xf3f9fd,
    map:textures.albedo,
    roughness:.79,
    roughnessMap:textures.roughness,
    metalness:0,
    bumpMap:textures.micro,
    bumpScale:.038,
    clearcoat:.075,
    clearcoatRoughness:.68,
    sheen:.08,
    sheenColor:new THREE.Color(0xc6e9f8),
    sheenRoughness:.82
  });

  const bank=new THREE.MeshPhysicalMaterial({
    color:0xf9fdff,
    roughness:.90,
    metalness:0,
    bumpMap:textures.micro,
    bumpScale:.018,
    clearcoat:.035,
    clearcoatRoughness:.78
  });

  const shadowBank=new THREE.MeshStandardMaterial({
    color:0xd6e8f2,
    roughness:.98,
    metalness:0,
    bumpMap:textures.micro,
    bumpScale:.012
  });

  return {
    terrain,
    bank,
    shadowBank,
    texture:textures.albedo,
    textures
  };
}
