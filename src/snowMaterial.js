import * as THREE from 'three';

function hash2(x,y){
  const n=Math.sin(x*127.1+y*311.7)*43758.5453123;
  return n-Math.floor(n);
}

function makeSnowTexture(renderer){
  const size=64;
  const data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++){
    for(let x=0;x<size;x++){
      const i=(y*size+x)*4;
      const low=Math.sin(x*.21)+Math.sin(y*.17)+Math.sin((x+y)*.09);
      const grain=hash2(x,y)-.5;
      const sparkle=hash2(x*3.1+7,y*2.7+13)>.992?10:0;
      const tone=THREE.MathUtils.clamp(240+low*2.5+grain*4+sparkle,226,255);
      data[i]=tone-4;
      data[i+1]=tone;
      data[i+2]=Math.min(255,tone+5);
      data[i+3]=255;
    }
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.repeat.set(5.5,4.8);
  texture.magFilter=THREE.LinearFilter;
  texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;
  texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy?.()||1);
  texture.needsUpdate=true;
  return texture;
}

export function createSnowMaterials(renderer){
  const texture=makeSnowTexture(renderer);
  const terrain=new THREE.MeshPhysicalMaterial({
    color:0xf1f8fc,
    map:texture,
    roughness:.84,
    metalness:0,
    clearcoat:.055,
    clearcoatRoughness:.62
  });
  const bank=new THREE.MeshStandardMaterial({color:0xf8fcff,roughness:.95,metalness:0});
  const shadowBank=new THREE.MeshStandardMaterial({color:0xdbeaf2,roughness:1,metalness:0});
  return {terrain,bank,shadowBank,texture};
}
