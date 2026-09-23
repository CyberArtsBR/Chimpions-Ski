import * as THREE from 'three';
import {COURSE_FLAG_X} from './environmentCorridor.js';

const PROFILE_COUNT=5;
const _dummy=new THREE.Object3D();

function wave(seed){
  const x=Math.sin(seed*12.9898+78.233)*43758.5453;
  return x-Math.floor(x);
}

function smoothstep01(value){
  const t=THREE.MathUtils.clamp(value,0,1);
  return t*t*(3-2*t);
}

function ridgeProfile(seed,samples=12){
  const points=[];
  for(let i=0;i<=samples;i++){
    const t=i/samples;
    const x=t-.5;
    const envelope=.46+.36*Math.sin(t*Math.PI);
    const broad=Math.sin(t*Math.PI*(1.45+wave(seed+3.1)*.58)+seed*.13)*.14;
    const secondary=Math.sin(t*Math.PI*(3.6+wave(seed+4.2)*1.5)+seed*.71)*.09;
    const tooth=(wave(seed+i*2.73)-.5)*.16;
    const y=THREE.MathUtils.clamp(envelope+broad+secondary+tooth,.26,.99);
    points.push({x,y});
  }
  return points;
}

function ridgeFillGeometry(points,seed){
  const positions=[];
  const colors=[];
  function triangle(a,b,c,shade){
    positions.push(a[0],a[1],0,b[0],b[1],0,c[0],c[1],0);
    const sideShade=THREE.MathUtils.clamp(shade,.58,1);
    colors.push(
      sideShade,sideShade*.99,sideShade*.98,
      sideShade,sideShade*.99,sideShade*.98,
      sideShade,sideShade*.99,sideShade*.98
    );
  }
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1];
    const shade=.73+wave(seed+i*4.11)*.22;
    triangle([a.x,0],[a.x,a.y],[b.x,b.y],shade);
    triangle([a.x,0],[b.x,b.y],[b.x,0],Math.min(1,shade+.055));
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeVertexNormals();
  return geometry;
}

function ridgeSnowGeometry(points,seed){
  const positions=[];
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1];
    const da=.070+a.y*.086+wave(seed+i*1.91)*.028;
    const db=.070+b.y*.086+wave(seed+(i+1)*1.91)*.028;
    const ay=Math.max(.08,a.y-da);
    const by=Math.max(.08,b.y-db);
    positions.push(
      a.x,ay,.012, a.x,a.y,.012, b.x,b.y,.012,
      a.x,ay,.012, b.x,b.y,.012, b.x,by,.012
    );
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.computeVertexNormals();
  return geometry;
}

const PROFILES=Array.from({length:PROFILE_COUNT},(_,index)=>{
  const seed=37.4+index*19.73;
  const points=ridgeProfile(seed,11+index%3);
  return {
    body:ridgeFillGeometry(points,seed),
    snow:ridgeSnowGeometry(points,seed)
  };
});

function makeMaterial({color,opacity=1,role='mountain',roughness=.96,depthWrite=true,vertexColors=false}){
  const material=new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness:0,
    flatShading:true,
    side:THREE.DoubleSide,
    vertexColors,
    transparent:opacity<.999,
    opacity,
    depthWrite
  });
  material.userData.atmosphereRole=role;
  return material;
}

function configureMesh(mesh,renderOrder){
  mesh.frustumCulled=false;
  mesh.renderOrder=renderOrder;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

function createBand(config,bandIndex){
  const group=new THREE.Group();
  const capacity=config.pairs*2;
  const bodyMaterial=makeMaterial({
    color:config.color,
    opacity:config.opacity,
    roughness:.98,
    depthWrite:config.opacity>.86,
    vertexColors:true
  });
  const snowMaterial=makeMaterial({
    color:config.snowColor,
    opacity:Math.min(1,config.opacity+.10),
    role:'snowcap',
    roughness:.90,
    depthWrite:config.opacity>.82
  });

  const bodyMeshes=[];
  const snowMeshes=[];
  for(let profile=0;profile<PROFILE_COUNT;profile++){
    const order=-30+bandIndex*2;
    const body=configureMesh(new THREE.InstancedMesh(PROFILES[profile].body,bodyMaterial,capacity),order);
    const snow=configureMesh(new THREE.InstancedMesh(PROFILES[profile].snow,snowMaterial,capacity),order+1);
    body.count=0;
    snow.count=0;
    bodyMeshes.push(body);
    snowMeshes.push(snow);
    group.add(body,snow);
  }

  const entries=new Array(capacity);
  const span=Math.abs(config.zFar-config.recycleNear)+18;

  function configureEntry(entry,index,generation,z){
    const side=entry.side??(index%2===0?-1:1);
    const rank=Math.floor(index/2);
    const seed=config.seed+rank*7.31+side*3.17+generation*31.73;
    entry.side=side;
    entry.generation=generation;
    entry.z=z;
    entry.width=THREE.MathUtils.lerp(config.widthMin,config.widthMax,wave(seed+1.7));
    entry.height=THREE.MathUtils.lerp(config.heightMin,config.heightMax,wave(seed+5.1));
    entry.jitter=wave(seed+8.3);
    entry.profile=Math.min(PROFILE_COUNT-1,Math.floor(wave(seed+11.9)*PROFILE_COUNT));
    entry.tilt=(wave(seed+14.2)-.5)*.065;
    entry.depthBias=(wave(seed+17.8)-.5)*5.5;
    return entry;
  }

  function writeMatrix(mesh,index,x,y,z,width,height,tilt){
    _dummy.position.set(x,y,z);
    _dummy.rotation.set(0,0,tilt);
    _dummy.scale.set(width,height,1);
    _dummy.updateMatrix();
    mesh.setMatrixAt(index,_dummy.matrix);
  }

  function refresh(){
    const counts=new Array(PROFILE_COUNT).fill(0);
    const denominator=Math.max(1,config.recycleNear-config.zFar);

    for(const entry of entries){
      const nearT=smoothstep01((entry.z-config.zFar)/denominator);
      const perspective=THREE.MathUtils.lerp(.70,1.18,nearT);
      const width=entry.width*perspective;
      const height=entry.height*THREE.MathUtils.lerp(.76,1.12,nearT);
      const halfWidth=width*.5;
      const clearInner=Math.max(config.innerEdge,COURSE_FLAG_X+12.5)+halfWidth+1.1;
      const clearOuter=Math.max(clearInner,config.outerEdge-halfWidth);
      const xAbs=THREE.MathUtils.lerp(clearInner,clearOuter,entry.jitter);
      const x=entry.side*xAbs;
      const y=config.baseY+nearT*.24;
      const z=entry.z+entry.depthBias*(1-nearT*.6);
      const slot=counts[entry.profile]++;

      writeMatrix(bodyMeshes[entry.profile],slot,x,y,z,width,height,entry.tilt*entry.side);
      writeMatrix(snowMeshes[entry.profile],slot,x,y,z,width,height,entry.tilt*entry.side);
    }

    for(let profile=0;profile<PROFILE_COUNT;profile++){
      for(const mesh of [bodyMeshes[profile],snowMeshes[profile]]){
        mesh.count=counts[profile];
        mesh.instanceMatrix.needsUpdate=true;
      }
    }
  }

  function reset(){
    for(let pair=0;pair<config.pairs;pair++){
      const t=config.pairs<=1?0:pair/(config.pairs-1);
      const baseZ=THREE.MathUtils.lerp(config.zNear,config.zFar,t)+(wave(config.seed+pair*4.61)-.5)*10;
      for(let sideSlot=0;sideSlot<2;sideSlot++){
        const index=pair*2+sideSlot;
        const entry=entries[index]||{side:sideSlot===0?-1:1};
        const offset=(wave(config.seed+index*2.37)-.5)*7;
        configureEntry(entry,index,0,baseZ+offset);
        entries[index]=entry;
      }
    }
    refresh();
  }

  function update(dt,worldSpeed){
    const dz=worldSpeed*dt*config.speedFactor;
    if(!Number.isFinite(dz)||Math.abs(dz)<1e-7)return;
    for(let i=0;i<entries.length;i++){
      const entry=entries[i];
      entry.z+=dz;
      if(entry.z>config.recycleNear){
        const side=entry.side;
        const generation=entry.generation+1;
        let nextZ=entry.z-span;
        while(nextZ>config.recycleNear)nextZ-=span;
        configureEntry(entry,i,generation,nextZ);
        entry.side=side;
      }
    }
    refresh();
  }

  group.userData.sideOnly=true;
  group.userData.streaming=true;
  group.userData.centralExclusionHalfWidth=config.innerEdge;
  group.userData.bandName=config.name;
  reset();
  return {group,entries,reset,update};
}

const BAND_CONFIGS=[
  {
    name:'distant',pairs:7,zNear:-88,zFar:-244,recycleNear:32,
    innerEdge:45,outerEdge:114,baseY:-6.15,
    widthMin:29,widthMax:46,heightMin:25,heightMax:39,
    color:0x91adba,snowColor:0xeaf5f8,
    opacity:.70,seed:13.7,speedFactor:.56
  },
  {
    name:'middle',pairs:8,zNear:-56,zFar:-218,recycleNear:34,
    innerEdge:35,outerEdge:94,baseY:-5.85,
    widthMin:24,widthMax:40,heightMin:20,heightMax:33,
    color:0x698997,snowColor:0xf0f8fb,
    opacity:.84,seed:47.3,speedFactor:.76
  },
  {
    name:'near',pairs:8,zNear:-26,zFar:-190,recycleNear:36,
    innerEdge:26,outerEdge:78,baseY:-5.40,
    widthMin:20,widthMax:34,heightMin:16,heightMax:27,
    color:0x496a78,snowColor:0xf6fbfd,
    opacity:.96,seed:89.1,speedFactor:.96
  }
];

export function createMountainBands(){
  const group=new THREE.Group();
  group.name='StreamingSideMountainBands';
  group.userData.clearHorizon=true;
  group.userData.sideOnly=true;
  group.userData.streaming=true;

  const bands=BAND_CONFIGS.map((config,index)=>createBand(config,index));
  for(const band of bands)group.add(band.group);

  function reset(){
    for(const band of bands)band.reset();
  }

  function update(dt,worldSpeed){
    for(const band of bands)band.update(dt,worldSpeed);
  }

  return {
    group,
    bands,
    reset,
    update,
    minCentralExclusion:Math.min(...BAND_CONFIGS.map(config=>config.innerEdge))
  };
}
