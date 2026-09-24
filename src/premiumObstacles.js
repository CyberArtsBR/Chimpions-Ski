import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {makeBarkTexture} from './alpineArt.js';
import {OBSTACLE_TUNING} from './obstacleTuning.js';

const hash=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
const bark=makeBarkTexture(256);
const wood=new THREE.MeshStandardMaterial({color:0x936d49,map:bark,bumpMap:bark,bumpScale:.045,roughness:.94,vertexColors:true});
const foliage=new THREE.MeshPhysicalMaterial({color:0xffffff,vertexColors:true,roughness:.86,sheen:.22,sheenColor:new THREE.Color(0x517b56),sheenRoughness:.9,side:THREE.DoubleSide});
const stone=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.96,flatShading:true});

function paint(geometry,fn){
  const p=geometry.attributes.position,colors=[];
  for(let i=0;i<p.count;i++)colors.push(...fn(p.getX(i),p.getY(i),p.getZ(i),i));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  return geometry;
}
function merge(parts){
  const mixed=parts.some(part=>!part.index)&&parts.some(part=>part.index);
  const compatible=mixed?parts.map(part=>part.index?part.toNonIndexed():part):parts;
  const result=mergeGeometries(compatible,false);
  if(mixed)for(let i=0;i<parts.length;i++)if(compatible[i]!==parts[i])compatible[i].dispose();
  for(const part of parts)part.dispose();
  result.computeBoundingBox();result.computeBoundingSphere();
  return result;
}
function branchBetween(a,b,r1,r2,seed){
  const delta=b.clone().sub(a);
  const g=new THREE.CylinderGeometry(r2,r1,delta.length(),9,3);
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const y=p.getY(i),angle=Math.atan2(p.getZ(i),p.getX(i));
    const k=1+.08*Math.sin(angle*5+y*7+seed);
    p.setX(i,p.getX(i)*k);p.setZ(i,p.getZ(i)*k);
  }
  paint(g,(x,y,z)=>{const v=.67+.25*hash(Math.round(y*15)+seed);return [v,v*.91,v*.81];});
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));
  g.translate(...a.clone().add(b).multiplyScalar(.5).toArray());
  g.computeVertexNormals();return g;
}

// Folded, serrated boughs and individual needle sprays, merged into one crown.
// Four authored silhouettes share materials; no per-obstacle geometry allocation.
function makeFir(variant){
  const seed=19+variant*41,woodParts=[],leaves=[];
  const height=[3.64,3.68,3.58,3.70][variant];
  const width=[.83,1.03,.92,1.08][variant];
  woodParts.push(branchBetween(new THREE.Vector3(0,-.035,0),new THREE.Vector3(.035,3.40,-.015),.19,.026,seed));
  for(let i=0;i<5;i++){
    const a=i*Math.PI*2/5;
    woodParts.push(branchBetween(new THREE.Vector3(Math.cos(a)*.31,.005,Math.sin(a)*.31),new THREE.Vector3(0,.28,0),.045,.075,seed+i));
  }
  const positions=[],colors=[],uvs=[];
  const triangle=(a,b,c,tone)=>{
    for(const v of [a,b,c]){positions.push(...v);colors.push(...tone);uvs.push(v[0],v[2]);}
  };
  for(let tier=0;tier<10;tier++){
    const y=.72+tier*.278;
    const radius=width*Math.pow(1-tier/11, .83);
    const branches=tier>7?6:9;
    for(let j=0;j<branches;j++){
      const angle=j*Math.PI*2/branches+tier*2.399+variant*.7;
      const reach=radius*(.79+hash(seed+tier*19+j)*.21);
      const dx=Math.cos(angle),dz=Math.sin(angle),px=-dz,pz=dx;
      const origin=[.025*Math.sin(tier+variant),y,.018*Math.cos(tier)];
      const tip=[dx*reach,y-.17*reach,dz*reach];
      woodParts.push(branchBetween(new THREE.Vector3(...origin),new THREE.Vector3(...tip),.024*(1-tier*.06),.006,seed+j));
      for(let k=0;k<7;k++){
        const t=.14+k*.12;
        const cx=dx*reach*t,cy=y-.19*reach*t,cz=dz*reach*t;
        const spread=reach*(1-t)*(.36+hash(seed+j+k)*.09);
        const tipT=Math.min(1.07,t+.28);
        const mid=[dx*reach*tipT,cy+.065,dz*reach*tipT];
        const back=[cx-dx*.09,cy+.045,cz-dz*.09];
        const green=.13+hash(seed+tier*13+j*7+k)*.11;
        const tone=[green*.30,green,green*.65];
        triangle(back,[cx+px*spread,cy-.08,cz+pz*spread],mid,tone);
        triangle(back,mid,[cx-px*spread,cy-.08,cz-pz*spread],tone.map(v=>v*.8));
        // Pointed needle clusters create real silhouette detail, without alpha cards.
        for(const sign of [-1,1]){
          for(let n=0;n<3;n++){
            const f=(n+1)/4;
            const nx=cx+px*spread*f*sign,nz=cz+pz*spread*f*sign;
            const ny=cy-.06*f;
            const length=.10+(1-t)*.10;
            triangle([nx-dx*.018,ny,nz-dz*.018],
              [nx+dx*length+px*.045*sign,ny+.07,nz+dz*length+pz*.045*sign],
              [nx+dx*.027,ny+.018,nz+dz*.027],tone.map(v=>v*1.2));
          }
        }
      }
    }
  }
  const crown=new THREE.BufferGeometry();
  crown.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  crown.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  crown.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  crown.computeVertexNormals();leaves.push(crown);
  const spike=new THREE.ConeGeometry(.105,.59,9,3);spike.translate(.025,height-.295,-.01);
  paint(spike,()=>[.052,.235,.128]);leaves.push(spike);
  const group=new THREE.Group();
  for(const [geometry,material] of [[merge(woodParts),wood],[merge(leaves),foliage]]){
    const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
  }
  group.userData.visualPrototype='premium-bare-fir-'+variant;
  return group;
}

function makeRock(variant){
  const sides=13,rings=6,positions=[],colors=[],uvs=[],indices=[];
  const seed=variant*31+7;
  const radius=[.69,.72,.67,.70][variant];
  for(let r=0;r<rings;r++){
    const t=r/(rings-1);
    const envelope=[.80,1,.94,.76,.47,.13][r];
    for(let s=0;s<=sides;s++){
      const a=(s%sides)*Math.PI*2/sides;
      const shape=1+.105*Math.sin(a*3+seed)+.065*Math.cos(a*5+seed);
      const x=Math.cos(a)*radius*envelope*shape+.09*t;
      const z=Math.sin(a)*radius*.85*envelope*shape-.05*t;
      const y=-.035+t*.795+(r>0&&r<rings-1?Math.sin(a*3+seed)*.045:0);
      positions.push(x,y,z);uvs.push(s/sides,t);
      const grain=hash(s%sides+r*37+seed),v=.31+t*.12+grain*.09;
      colors.push(v*.77,v*.9,v);
      if(r<rings-1&&s<sides){const a0=r*(sides+1)+s,b=a0+sides+1;indices.push(a0,b,a0+1,a0+1,b,b+1);}
    }
  }
  const top=positions.length/3;
  positions.push(.09,.76,-.05);colors.push(.35,.40,.45);uvs.push(.5,1);
  for(let j=0;j<sides;j++){const a=(rings-1)*(sides+1)+j;indices.push(a,top,a+1);}
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);
  g.computeVertexNormals();g.computeBoundingSphere();
  const mesh=new THREE.Mesh(g,stone);mesh.castShadow=mesh.receiveShadow=true;
  return mesh;
}

function makeEndTexture(){
  const size=256,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const nx=(x-size*.48)/(size*.5),ny=(y-size*.52)/(size*.5);
    const a=Math.atan2(ny,nx),r=Math.hypot(nx,ny);
    const growth=Math.sin(r*104+Math.sin(a*5)*.8+Math.sin(r*29)*1.1);
    const rings=Math.pow(Math.max(0,growth),8);
    const crack=Math.pow(Math.max(0,Math.cos(a*7+r*.35)),100)*Math.max(0,r-.32);
    const shade=1-rings*.24-crack*.75+(hash(x+y*size)-.5)*.06;
    const i=(y*size+x)*4;
    data[i]=210*shade;data[i+1]=163*shade;data[i+2]=104*shade;data[i+3]=255;
  }
  const t=new THREE.DataTexture(data,size,size);t.colorSpace=THREE.SRGBColorSpace;
  t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.needsUpdate=true;
  return t;
}
const endTexture=makeEndTexture();
const endMaterial=new THREE.MeshStandardMaterial({map:endTexture,bumpMap:endTexture,bumpScale:.012,roughness:.89});
function makeLog(wide){
  const tuning=wide?OBSTACLE_TUNING.wideLog:OBSTACLE_TUNING.log;
  const radius=wide?.35:.28,parts=[];
  const body=new THREE.CylinderGeometry(radius*.83,radius,tuning.length,32,14,true);
  const p=body.attributes.position;
  for(let i=0;i<p.count;i++){
    const y=p.getY(i),a=Math.atan2(p.getZ(i),p.getX(i));
    const ridge=1+.045*Math.sin(a*13+y*.8)+.018*Math.sin(a*23-y*1.9);
    p.setX(i,p.getX(i)*ridge);p.setZ(i,p.getZ(i)*ridge);
  }
  paint(body,(x,y,z)=>{const a=Math.atan2(z,x),v=.7+.23*(.5+.5*Math.sin(a*9+y*.6));return [v,v*.91,v*.79];});
  body.rotateZ(Math.PI/2);body.translate(0,radius,0);body.computeVertexNormals();parts.push(body);
  // Knotted branch stubs stay beneath the unchanged clearance envelope.
  for(let i=0;i<(wide?3:2);i++){
    const x=(i-.5*(wide?2:1))*tuning.length*.27;
    parts.push(branchBetween(new THREE.Vector3(x,radius,.10),new THREE.Vector3(x+.08,radius*1.5,.23),.06,.032,i+41));
  }
  const group=new THREE.Group();
  const mesh=new THREE.Mesh(merge(parts),wood);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
  const caps=[];
  for(const sign of [-1,1]){
    const g=new THREE.CircleGeometry(radius*(sign<0?.825:.995),32);
    g.rotateY(sign*Math.PI/2);g.translate(sign*(tuning.length*.5+.002),radius,0);caps.push(g);
  }
  const ends=new THREE.Mesh(merge(caps),endMaterial);ends.castShadow=ends.receiveShadow=true;group.add(ends);
  return group;
}

let library;
export function getPremiumObstacleLibrary(){
  return library??={trees:Array.from({length:4},(_,i)=>makeFir(i)),rocks:Array.from({length:4},(_,i)=>makeRock(i)),log:makeLog(false),wideLog:makeLog(true)};
}

export function applyPremiumObstacle(root,kind){
  const assets=getPremiumObstacleLibrary();
  const variants=kind==='tree'?assets.trees:kind==='rock'?assets.rocks:null;
  const source=variants?.[0]??assets[kind];
  if(!source)return false;
  const old=new Set();root.traverse(node=>{if(node.isMesh)old.add(node.geometry);});
  root.clear();
  if(root.isMesh){root.geometry=source.geometry;root.material=source.material;root.scale.set(1,1,1);root.rotation.set(0,0,0);root.position.y=0;root.castShadow=root.receiveShadow=true;}
  else for(const child of source.children)root.add(child.clone());
  for(const geometry of old)geometry.dispose();
  if(variants)root.userData.visualVariants=variants;
  root.userData.visualPrototype='premium-bare-'+kind;
  return true;
}
