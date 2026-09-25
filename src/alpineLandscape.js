import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {makeSerratedFirGeometry} from './alpineArt.js';
import {COURSE_FLAG_X} from './environmentCorridor.js';

const hash=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
const dummy=new THREE.Object3D();
const forestTint=new THREE.Color(),forestNear=new THREE.Color(0x31534e),forestFar=new THREE.Color(0x718b94);
function mountainGeometry(seed){
  const nx=96,nz=40,p=[],uv=[],indices=[],colors=[];
  for(let z=0;z<=nz;z++)for(let x=0;x<=nx;x++){
    const u=x/nx,v=z/nz,xx=u*2-1,zz=v*2-1;
    const taper=Math.pow(Math.max(0,1-xx*xx),.85)*Math.pow(Math.max(0,1-zz*zz),.72);
    const ridgeZ=zz-.19*Math.sin(xx*4.7+seed)-.11*Math.sin(xx*10.3+seed*.3);
    const spine=.48+.24*Math.sin(xx*5.7+seed)+.16*Math.sin(xx*13.3+seed*.7)+.075*Math.sin(xx*31.7+seed*2);
    const gullies=Math.abs(Math.sin(xx*24+ridgeZ*9+seed+Math.sin(ridgeZ*5)))*.10+Math.abs(Math.sin(xx*57-ridgeZ*19+seed))*.035;
    const ridge=Math.exp(-Math.abs(ridgeZ)*2.4);
    const h=taper*Math.max(.035,spine*(.40+.60*ridge)-gullies*(.4+.6*ridge)+.075*Math.sin(zz*13+xx*7));
    p.push(xx*.5,h,zz*.5);uv.push(u,v);
    if(x<nx&&z<nz){const a=z*(nx+1)+x,b=a+nx+1;indices.push(a,b,a+1,a+1,b,b+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  const normal=g.attributes.normal;
  const stone=new THREE.Color(0x566b7a),snow=new THREE.Color(0xe5f1f6),c=new THREE.Color();
  for(let i=0;i<p.length/3;i++){
    const x=p[i*3],h=p[i*3+1],z=p[i*3+2];
    const snowLine=.07+.035*Math.sin(x*37+seed)+.025*Math.sin(z*29+x*13);
    const coverage=THREE.MathUtils.smoothstep(h,snowLine,snowLine+.09)*(.48+.52*THREE.MathUtils.smoothstep(normal.getY(i),.09,.63));
    c.copy(stone).lerp(snow,coverage);c.multiplyScalar(.85+.15*normal.getY(i));colors.push(c.r,c.g,c.b);
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return g;
}
function forestGeometry(){
  const parts=[];
  for(let i=0;i<5;i++){
    const r=.95-i*.16,g=makeSerratedFirGeometry(r,1.35-i*.10,18,12+i*7);
    g.translate(.025*Math.sin(i),.95+i*.56,0);parts.push(g);
  }
  const merged=mergeGeometries(parts);for(const p of parts)p.dispose();return merged;
}
export function createAlpineLandscape({world,atmosphere,terrainHeight}){
  const geometries=[11,37,79].map(mountainGeometry);
  const bands=[],entries=[];
  for(let layer=0;layer<3;layer++){
    const material=new THREE.MeshStandardMaterial({color:[0xc7dce9,0xa4bfd0,0x8ca9bd][layer],vertexColors:true,roughness:1});
    material.userData.atmosphereRole='mountain';
    material.userData.atmosphereDepth=(2-layer)/2;
    const mesh=new THREE.InstancedMesh(geometries[layer],material,8);
    mesh.castShadow=mesh.receiveShadow=false;mesh.frustumCulled=true;mesh.name='premium-alpine-band-'+layer;atmosphere.add(mesh);bands.push(mesh);
    for(let i=0;i<8;i++){
      const side=i%2?-1:1,rank=Math.floor(i/2),seed=layer*31+i*17;
      const width=57+hash(seed+1)*44,depth=48+hash(seed+2)*36;
      // Bounds use the entire massif width, never just its peak.
      const x=side*(COURSE_FLAG_X+18+(2-layer)*18+width*.5+hash(seed+4)*12);
      entries.push({layer,index:i,x,z:-52-rank*61-layer*15,width,depth,height:40+hash(seed+7)*38,side});
    }
  }
  const horizonMaterial=new THREE.MeshStandardMaterial({color:0xc7dce9,vertexColors:true,roughness:1});
  horizonMaterial.userData.atmosphereRole='mountain';horizonMaterial.userData.atmosphereDepth=1;
  const horizonRidge=new THREE.Mesh(mountainGeometry(137),horizonMaterial);
  horizonRidge.name='distant-alpine-watershed';horizonRidge.position.set(0,-13,-225);horizonRidge.scale.set(330,58,76);atmosphere.add(horizonRidge);
  const forestMaterial=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1});
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
  const forestEntries=Array.from({length:forestCapacity},(_,i)=>({x:(i%2?-1:1)*(COURSE_FLAG_X+20+hash(i+19)*65),z:-55-hash(i+23)*240,s:.8+hash(i+45)*2.1,ry:hash(i+77)*Math.PI*2}));
  let activeForestCount=forestCapacity;
  let travel=0,detail=1;
  function refresh(){
    for(const e of entries){
      const z=((e.z+travel*(.26+e.layer*.17)+310)%330+330)%330-310;
      dummy.position.set(e.x,-5,z);dummy.rotation.set(0,0,0);dummy.scale.set(e.width,e.height,e.depth);dummy.updateMatrix();bands[e.layer].setMatrixAt(e.index,dummy.matrix);
    }
    for(const mesh of bands){
      mesh.instanceMatrix.needsUpdate=true;
      mesh.computeBoundingSphere();
    }

    forestChunkCounts.fill(0);
    for(let i=0;i<activeForestCount;i++){
      const e=forestEntries[i],z=((e.z+travel+305)%325+325)%325-305;
      const sideIndex=e.x<0?0:1;
      const depthIndex=z>-105?0:z>-205?1:2;
      const chunkIndex=sideIndex*3+depthIndex;
      const slot=forestChunkCounts[chunkIndex]++;
      dummy.position.set(e.x,terrainHeight(e.x,z-travel)-.05,z);
      dummy.rotation.set(0,e.ry,0);
      dummy.scale.set(e.s*.72,e.s,e.s*.72);dummy.updateMatrix();forestChunks[chunkIndex].setMatrixAt(slot,dummy.matrix);
      const depthFade=THREE.MathUtils.clamp((-z-58)/235,0,1);forestTint.copy(forestNear).lerp(forestFar,depthFade*.58);forestTint.offsetHSL((hash(i+101)-.5)*.015,0,(hash(i+203)-.5)*.045);forestChunks[chunkIndex].setColorAt(slot,forestTint);
    }
    for(let i=0;i<forestChunks.length;i++){
      const mesh=forestChunks[i];
      mesh.count=forestChunkCounts[i];
      mesh.visible=mesh.count>0;
      mesh.instanceMatrix.needsUpdate=true;
      if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
      if(mesh.visible)mesh.computeBoundingSphere();
    }
  }
  function setDetail(value){
    detail=THREE.MathUtils.clamp(value,0,1);
    activeForestCount=Math.round(80+200*detail);
    bands[2].visible=detail>.75;
    refresh();
  }
  function reset(){travel=0;refresh();}
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
