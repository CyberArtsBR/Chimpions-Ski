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
export function makeBarkTexture(size=64){
  const data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=(y*size+x)*4;
    const longGrain=Math.sin(y*.62+Math.sin(x*.31)*1.2)*.5+.5;
    const fine=Math.sin(y*1.84+x*.11)*.5+.5;
    const knot=Math.exp(-Math.pow((x-18)/8,2)-Math.pow((y-37)/11,2));
    const noise=hash(x*17.3+y*31.7);
    const v=THREE.MathUtils.clamp(110+longGrain*48+fine*18+noise*18-knot*42,58,198);
    data[i]=v;data[i+1]=v;data[i+2]=v;data[i+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.repeat.set(2.4,5.8);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;
  return texture;
}
