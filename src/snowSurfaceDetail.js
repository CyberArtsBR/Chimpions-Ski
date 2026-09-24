import * as THREE from 'three';

const _dummy=new THREE.Object3D();

function hash(seed){
  const x=Math.sin(seed*12.9898+78.233)*43758.5453;
  return x-Math.floor(x);
}

function setInstance(mesh,index,x,y,z,sx,sy,sz,ry=0){
  _dummy.position.set(x,y,z);
  _dummy.rotation.set(0,ry,0);
  _dummy.scale.set(sx,sy,sz);
  _dummy.updateMatrix();
  mesh.setMatrixAt(index,_dummy.matrix);
}

export function createSnowSurfaceDetail({world,terrainHeight,snowMaterial,detailLevel=1}){
  const moundCount=54;
  const ridgeCount=72;
  const moundGeometry=new THREE.SphereGeometry(1,12,7);
  const ridgeGeometry=new THREE.BoxGeometry(1,.018,1);

  const moundMaterial=snowMaterial.clone();
  moundMaterial.roughness=Math.min(1,(moundMaterial.roughness??.9)+.06);
  moundMaterial.clearcoat=.02;

  const ridgeMaterial=new THREE.MeshStandardMaterial({
    color:0xddebf2,
    roughness:.92,
    metalness:0,
    transparent:true,
    opacity:.42,
    depthWrite:false,
    polygonOffset:true,
    polygonOffsetFactor:-1,
    polygonOffsetUnits:-1
  });

  const mounds=new THREE.InstancedMesh(moundGeometry,moundMaterial,moundCount);
  const ridges=new THREE.InstancedMesh(ridgeGeometry,ridgeMaterial,ridgeCount);
  for(const mesh of [mounds,ridges]){
    mesh.receiveShadow=true;
    mesh.frustumCulled=true;
    world.add(mesh);
  }

  const moundData=new Array(moundCount);
  const ridgeData=new Array(ridgeCount);
  let activeMounds=moundCount;
  let activeRidges=ridgeCount;
  let travel=0;

  function resetEntry(entry,i,isRidge){
    entry.x=(hash(i*3.17+4)-.5)*(isRidge?23:25);
    entry.z=-6-hash(i*5.73+9)*220;
    entry.ry=(hash(i*7.41+3)-.5)*(isRidge?.42:Math.PI);
    if(isRidge){
      entry.sx=.65+hash(i*4.83+7)*2.4;
      entry.sy=1;
      entry.sz=.055+hash(i*6.11+5)*.11;
    }else{
      entry.sx=.65+hash(i*4.83+7)*1.9;
      entry.sy=.018+hash(i*6.11+5)*.038;
      entry.sz=.70+hash(i*8.37+13)*2.1;
    }
  }

  for(let i=0;i<moundCount;i++){
    const e={};resetEntry(e,i,false);moundData[i]=e;
  }
  for(let i=0;i<ridgeCount;i++){
    const e={};resetEntry(e,i,true);ridgeData[i]=e;
  }

  function refresh(){
    for(let i=0;i<activeMounds;i++){
      const e=moundData[i];
      const ground=terrainHeight(e.x,e.z-travel);
      setInstance(mounds,i,e.x,ground-e.sy*.45,e.z,e.sx,e.sy,e.sz,e.ry);
    }
    for(let i=0;i<activeRidges;i++){
      const e=ridgeData[i];
      const ground=terrainHeight(e.x,e.z-travel);
      setInstance(ridges,i,e.x,ground+.010,e.z,e.sx,1,e.sz,e.ry);
    }
    mounds.count=activeMounds;
    ridges.count=activeRidges;
    mounds.instanceMatrix.needsUpdate=true;
    ridges.instanceMatrix.needsUpdate=true;
    if(mounds.count>0)mounds.computeBoundingSphere();
    if(ridges.count>0)ridges.computeBoundingSphere();
  }

  function update(dt,worldSpeed){
    if(worldSpeed===0)return;
    const dz=worldSpeed*dt;
    travel+=dz;
    for(let i=0;i<activeMounds;i++){
      const e=moundData[i];
      e.z+=dz;
      if(e.z>18)e.z-=225;
    }
    for(let i=0;i<activeRidges;i++){
      const e=ridgeData[i];
      e.z+=dz;
      if(e.z>18)e.z-=225;
    }
    refresh();
  }

  function setDensity(value=1){
    const density=THREE.MathUtils.clamp(Number(value)||1,.1,1);
    activeMounds=Math.max(1,Math.round(moundCount*density));
    activeRidges=Math.max(1,Math.round(ridgeCount*density));
    refresh();
  }

  function reset(){
    travel=0;
    for(let i=0;i<moundCount;i++)resetEntry(moundData[i],i,false);
    for(let i=0;i<ridgeCount;i++)resetEntry(ridgeData[i],i,true);
    refresh();
  }

  function getDiagnostics(){
    return {activeMounds,activeRidges,moundCapacity:moundCount,ridgeCapacity:ridgeCount};
  }

  reset();
  setDensity(detailLevel);
  return {update,reset,setDensity,getDiagnostics,moundMaterial,ridgeMaterial,setDetailLevel:setDensity,getDetailLevel:()=>activeMounds/moundCount};
}
