import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {makeSerratedFirGeometry} from './alpineArt.js';
import {COURSE_FLAG_X} from './environmentCorridor.js';

const hash=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
const dummy=new THREE.Object3D();
const forestTint=new THREE.Color(),forestNear=new THREE.Color(0xf0f7f7),forestFar=new THREE.Color(0xb9d3e0);
function mountainGeometry(seed){
  const nx=64,nz=28,p=[],uv=[],indices=[],colors=[];
  for(let z=0;z<=nz;z++)for(let x=0;x<=nx;x++){
    const u=x/nx,v=z/nz,xx=u*2-1,zz=v*2-1;
    const taper=Math.pow(Math.max(0,1-xx*xx),1.1)*Math.pow(Math.max(0,1-zz*zz),.85);
    const asym=.075*Math.sin((xx+.18)*4.7+seed*.31)+.045*Math.sin((xx-.24)*9.1-seed*.17);
    const shoulder=.070*Math.max(0,Math.sin((xx+zz*.22)*7.4+seed*.43));
    const spine=.60+.20*Math.sin(xx*5.7+seed)+.13*Math.sin(xx*13.3+seed*.7)+asym+shoulder;
    const brokenRidge=Math.pow(Math.abs(Math.sin(xx*17.0+zz*3.2+seed*.81)),10)*.070;
    const striation=Math.abs(Math.sin(xx*29+zz*8+seed))*.074+Math.abs(Math.sin(xx*61-zz*17))*.026+brokenRidge;
    const spur=.045*Math.sin(zz*13.0-xx*4.0+seed*.55)*(1.0-Math.abs(xx));
    const h=taper*Math.max(.05,spine-striation+Math.sin(zz*9+xx*6)*.095+spur);
    p.push(xx*.5,h,zz*.5);uv.push(u,v);
    if(x<nx&&z<nz){const a=z*(nx+1)+x,b=a+nx+1;indices.push(a,b,a+1,a+1,b,b+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  const normal=g.attributes.normal;
  const stone=new THREE.Color(0x4b6377),snow=new THREE.Color(0xf0f9fc),c=new THREE.Color();
  for(let i=0;i<p.length/3;i++){
    const x=p[i*3],h=p[i*3+1],z=p[i*3+2];
    const snowLine=.30+.09*Math.sin(x*37+seed)+.06*Math.sin(z*29+x*13);
    const slopeSnow=THREE.MathUtils.smoothstep(normal.getY(i),.18,.74);
    const coverage=THREE.MathUtils.smoothstep(h,snowLine,snowLine+.15)*slopeSnow;
    const crevice=Math.pow(Math.abs(Math.sin(x*47+z*16+seed)),12)*.22;
    const strata=.5+.5*Math.sin(h*94+z*31+x*9+seed*.7);
    const cliff=1-THREE.MathUtils.smoothstep(Math.abs(normal.getY(i)),.10,.48);
    const rockShade=.82+strata*.11-cliff*.10;
    c.copy(stone).multiplyScalar(rockShade).lerp(snow,coverage*(1-crevice));
    c.multiplyScalar(.73+.18*Math.max(0,normal.getY(i))+.09*Math.max(0,-normal.getX(i)));
    colors.push(c.r,c.g,c.b);
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return g;
}
function forestGeometry(){
  const parts=[];
  for(let i=0;i<5;i++){
    const r=.95-i*.16,g=makeSerratedFirGeometry(r,1.35-i*.10,18,12+i*7);
    g.translate(.025*Math.sin(i),.95+i*.56,0);parts.push(g);
  }
  const merged=mergeGeometries(parts);for(const p of parts)p.dispose();
  const position=merged.getAttribute('position'),normal=merged.getAttribute('normal');
  const green=new THREE.Color(0x284a51),snow=new THREE.Color(0xe5f2f8),color=new THREE.Color(),colors=[];
  for(let i=0;i<position.count;i++){
    const y=position.getY(i),up=Math.max(0,normal.getY(i));
    const load=THREE.MathUtils.clamp(THREE.MathUtils.smoothstep(up,.10,.52)*(.48+.30*hash(i+317))+
      THREE.MathUtils.smoothstep(y,2.7,4.0)*.20,0,.92);
    color.copy(green).lerp(snow,load);colors.push(color.r,color.g,color.b);
  }
  merged.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  return merged;
}
export function createAlpineLandscape({world,atmosphere,terrainHeight}){
  const geometries=[11,37,79].map(mountainGeometry);
  const bands=[],entries=[];
  for(let layer=0;layer<3;layer++){
    const material=new THREE.MeshStandardMaterial({color:[0xc7dce9,0xa4bfd0,0x8ca9bd][layer],vertexColors:true,roughness:1});
    material.userData.atmosphereRole='mountain';
    const mesh=new THREE.InstancedMesh(geometries[layer],material,8);
    mesh.castShadow=mesh.receiveShadow=false;mesh.frustumCulled=true;mesh.name='premium-alpine-band-'+layer;atmosphere.add(mesh);bands.push(mesh);
    for(let i=0;i<8;i++){
      const side=i%2?-1:1,rank=Math.floor(i/2),seed=layer*31+i*17;
      const width=45+hash(seed+1)*28,depth=38+hash(seed+2)*28;
      // Bounds use the entire massif width, never just its peak.
      const x=side*(COURSE_FLAG_X+18+(2-layer)*18+width*.5+hash(seed+4)*12);
      entries.push({layer,index:i,x,z:-52-rank*61-layer*15,width,depth,height:27+hash(seed+7)*25,side});
    }
  }
  const forestMaterial=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:1});
  const forestGeo=forestGeometry();
  const forestCapacity=280;
  const forestChunkCount=6;
  const forestChunks=Array.from({length:forestChunkCount},(_,index)=>{
    const mesh=new THREE.InstancedMesh(forestGeo,forestMaterial,forestCapacity);
    mesh.castShadow=false;
    mesh.receiveShadow=false;
    mesh.frustumCulled=true;
    mesh.count=0;
    mesh.name='premium-distant-forest-chunk-'+index;
    world.add(mesh);
    return mesh;
  });
  const forestChunkCounts=new Uint16Array(forestChunkCount);
  const forestEntries=Array.from({length:forestCapacity},(_,i)=>{
    const cluster=Math.floor(i/7),within=i%7,side=cluster%2?-1:1;
    const clearingBias=hash(cluster+401)>.80?10:0;
    const clusterX=COURSE_FLAG_X+22+hash(cluster+19)*58+clearingBias;
    const clusterZ=-58-hash(cluster+23)*232;
    return {
      x:side*(clusterX+(hash(i+117)-.5)*(8+within*.55)),
      z:clusterZ+(hash(i+223)-.5)*15,
      s:.72+hash(i+45)*2.22,
      width:.72+hash(i+145)*.42,
      ry:hash(i+77)*Math.PI*2,
      leanX:(hash(i+333)-.5)*.045,
      leanZ:(hash(i+377)-.5)*.050
    };
  });
  let activeForestCount=forestCapacity;
  let travel=0,detail=1,boundsDirty=true;
  function refresh(){
    for(const e of entries){
      const z=((e.z+travel*(.26+e.layer*.17)+310)%330+330)%330-310;
      dummy.position.set(e.x,-5,z);dummy.rotation.set(0,0,0);dummy.scale.set(e.width,e.height,e.depth);dummy.updateMatrix();bands[e.layer].setMatrixAt(e.index,dummy.matrix);
    }
    for(const mesh of bands){
      mesh.instanceMatrix.needsUpdate=true;
      if(boundsDirty){
        mesh.computeBoundingSphere();
        if(mesh.boundingSphere)mesh.boundingSphere.radius+=150;
      }
    }

    forestChunkCounts.fill(0);
    for(let i=0;i<activeForestCount;i++){
      const e=forestEntries[i],z=((e.z+travel+305)%325+325)%325-305;
      const sideIndex=e.x<0?0:1;
      const depthIndex=z>-105?0:z>-205?1:2;
      const chunkIndex=sideIndex*3+depthIndex;
      const slot=forestChunkCounts[chunkIndex]++;
      dummy.position.set(e.x,terrainHeight(e.x,z-travel)-.05,z);
      dummy.rotation.set(e.leanX,e.ry,e.leanZ);
      dummy.scale.set(e.s*.72*e.width,e.s,e.s*.72*e.width);dummy.updateMatrix();forestChunks[chunkIndex].setMatrixAt(slot,dummy.matrix);
      const depthFade=THREE.MathUtils.clamp((-z-58)/235,0,1);forestTint.copy(forestNear).lerp(forestFar,depthFade*.58);forestTint.offsetHSL((hash(i+101)-.5)*.015,0,(hash(i+203)-.5)*.045);forestChunks[chunkIndex].setColorAt(slot,forestTint);
    }
    for(let i=0;i<forestChunks.length;i++){
      const mesh=forestChunks[i];
      mesh.count=forestChunkCounts[i];
      mesh.visible=mesh.count>0;
      mesh.instanceMatrix.needsUpdate=true;
      if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
      if(mesh.visible&&boundsDirty){
        mesh.computeBoundingSphere();
        if(mesh.boundingSphere)mesh.boundingSphere.radius+=120;
      }
    }
    boundsDirty=false;
  }
  function setDetail(value){
    detail=THREE.MathUtils.clamp(value,0,1);
    activeForestCount=Math.round(80+200*detail);
    bands[2].visible=detail>.75;
    boundsDirty=true;
    refresh();
  }
  function reset(){travel=0;boundsDirty=true;refresh();}
  function update(dt,speed){if(!speed)return;travel+=dt*speed;refresh();}
  reset();return {
    update,reset,setDetail,
    getDiagnostics:()=>({
      forestActive:activeForestCount,
      forestChunks:forestChunks.length,
      forestVisibleChunks:forestChunks.reduce((sum,mesh)=>sum+Number(mesh.visible),0),
      mountainBandsVisible:bands.reduce((sum,mesh)=>sum+Number(mesh.visible),0)
    })
  };
}
