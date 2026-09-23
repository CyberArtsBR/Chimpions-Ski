import * as THREE from 'three';

function hash(seed){
  const x=Math.sin(seed*12.9898+78.233)*43758.5453;
  return x-Math.floor(x);
}
export function makeSerratedFirGeometry(radius=1,height=1,segments=12,seed=1){
  const geometry=new THREE.ConeGeometry(radius,height,segments,3,false);
  const position=geometry.attributes.position;
  const half=Math.max(.001,height*.5);
  for(let i=0;i<position.count;i++){
    const x=position.getX(i),y=position.getY(i),z=position.getZ(i);
    if(Math.hypot(x,z)<1e-5)continue;
    const angle=Math.atan2(z,x);
    const vertical=THREE.MathUtils.clamp((y+half)/height,0,1);
    const serration=1+
      Math.sin(angle*3+seed)*(.075-.025*vertical)+
      Math.sin(angle*5+seed*1.73)*(.045-.015*vertical)+
      (hash(i+seed*11)-.5)*.035;
    position.setX(i,x*serration);position.setZ(i,z*serration);
  }
  position.needsUpdate=true;geometry.computeVertexNormals();
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return geometry;
}
export function makeBarkTexture(size=256){
  const data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size*Math.PI*2,v=y/size*Math.PI*2;
    const warp=Math.sin(v*2+Math.sin(u*3))*.27+Math.sin(v*5)*.09;
    const furrow=Math.pow(.5+.5*Math.sin(u*18+warp),9);
    const fine=Math.sin(u*49+warp*2+Math.sin(v*7)*.25);
    const plates=Math.sin(v*11+Math.sin(u*9)*2);
    const knot=Math.pow(.5+.5*Math.cos(u*3+Math.sin(v)*2),16)*Math.pow(.5+.5*Math.cos(v*2),12);
    const tone=THREE.MathUtils.clamp(184-furrow*91+fine*11+plates*9-knot*38+(hash(x+y*size)-.5)*12,65,220);
    const i=(y*size+x)*4;data[i]=tone;data[i+1]=tone;data[i+2]=tone;data[i+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(2,3);
  texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=true;
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
  texture.anisotropy=8;texture.needsUpdate=true;return texture;
}
