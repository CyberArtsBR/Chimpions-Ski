import * as THREE from 'three';
export function softSprite(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
  const c=canvas.getContext('2d'),g=c.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.25,'rgba(255,255,255,.7)');g.addColorStop(1,'rgba(255,255,255,0)');
  c.fillStyle=g;c.fillRect(0,0,64,64);return new THREE.CanvasTexture(canvas);
}
export function createStaticEnvironment(renderer){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;
  const ctx=canvas.getContext('2d'),gradient=ctx.createLinearGradient(0,0,0,128);
  gradient.addColorStop(0,'#4a789f');gradient.addColorStop(.47,'#d9e9f4');gradient.addColorStop(.55,'#b6c9d6');gradient.addColorStop(1,'#607382');ctx.fillStyle=gradient;ctx.fillRect(0,0,256,128);
  const source=new THREE.CanvasTexture(canvas);source.colorSpace=THREE.SRGBColorSpace;source.mapping=THREE.EquirectangularReflectionMapping;
  const generator=new THREE.PMREMGenerator(renderer),environment=generator.fromEquirectangular(source);
  source.dispose();generator.dispose();
  return environment.texture;
}
