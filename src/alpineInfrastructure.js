import * as THREE from 'three';
import {COURSE_FLAG_X} from './environmentCorridor.js';

const dummy=new THREE.Object3D();
const hash=n=>{const x=Math.sin(n*91.73+17.19)*43758.5453;return x-Math.floor(x);};
function put(mesh,index,x,y,z,sx=1,sy=1,sz=1,ry=0){
  dummy.position.set(x,y,z);dummy.rotation.set(0,ry,0);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);
}

export function createAlpineInfrastructure({world,terrainHeight}){
  const group=new THREE.Group();group.name='distant-alpine-infrastructure';group.userData.environmentOnly=true;world.add(group);
  const towerCount=14,chaletCount=8;
  const towerMaterial=new THREE.MeshStandardMaterial({color:0x526772,roughness:.48,metalness:.64});
  const crossMaterial=new THREE.MeshStandardMaterial({color:0x78909b,roughness:.40,metalness:.72});
  const chaletMaterial=new THREE.MeshStandardMaterial({color:0x59443a,roughness:.78,metalness:0});
  const roofMaterial=new THREE.MeshStandardMaterial({color:0x2d3940,roughness:.72,metalness:.14});
  const windowMaterial=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(1.25,.72,.22),toneMapped:false,fog:true});
  const cableMaterial=new THREE.LineBasicMaterial({color:0x41545e,transparent:true,opacity:.72,depthWrite:false});
  const towers=new THREE.InstancedMesh(new THREE.CylinderGeometry(.09,.14,1,8),towerMaterial,towerCount);
  const crossarms=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.11,.10),crossMaterial,towerCount);
  const chalets=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),chaletMaterial,chaletCount);
  const roofs=new THREE.InstancedMesh(new THREE.ConeGeometry(.82,.65,4),roofMaterial,chaletCount);
  const windows=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),windowMaterial,chaletCount*2);
  const cablePositions=new Float32Array((towerCount-2)*2*3);
  const cableGeometry=new THREE.BufferGeometry();cableGeometry.setAttribute('position',new THREE.BufferAttribute(cablePositions,3));
  const cables=new THREE.LineSegments(cableGeometry,cableMaterial);
  for(const mesh of [towers,crossarms,chalets,roofs,windows]){mesh.castShadow=false;mesh.receiveShadow=false;mesh.frustumCulled=true;mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);group.add(mesh);}
  cables.frustumCulled=false;group.add(cables);

  const towerData=[],chaletData=[];
  for(let i=0;i<towerCount;i++){
    const side=i%2?-1:1,rank=Math.floor(i/2),x=side*(COURSE_FLAG_X+31+hash(i+3)*19),z=-34-rank*34-(side<0?12:0),h=5.4+hash(i+7)*2.2;
    towerData.push({x,z,h,side});
  }
  for(let i=0;i<chaletCount;i++){
    const side=i%2?-1:1,rank=Math.floor(i/2),x=side*(COURSE_FLAG_X+38+hash(i+51)*26),z=-68-rank*56-(side>0?18:0),s=.8+hash(i+61)*.55;
    chaletData.push({x,z,s,side});
  }
  let detail=1,travel=0,wind=0;

  function build(){
    let cableIndex=0;
    for(let i=0;i<towerData.length;i++){
      const e=towerData[i],ground=terrainHeight(e.x,e.z);
      put(towers,i,e.x,ground+e.h*.5,e.z,1,e.h,1);
      put(crossarms,i,e.x,ground+e.h,e.z,3.2,1,1,e.side*.025);
      if(i>=2){
        const p=towerData[i-2],pg=terrainHeight(p.x,p.z),a=cableIndex*6;
        cablePositions[a]=p.x;cablePositions[a+1]=pg+p.h+.02;cablePositions[a+2]=p.z;
        cablePositions[a+3]=e.x;cablePositions[a+4]=ground+e.h+.02;cablePositions[a+5]=e.z;cableIndex++;
      }
    }
    cableGeometry.setDrawRange(0,cableIndex*2);cableGeometry.attributes.position.needsUpdate=true;
    for(let i=0;i<chaletData.length;i++){
      const e=chaletData[i],ground=terrainHeight(e.x,e.z),s=e.s;
      put(chalets,i,e.x,ground+.58*s,e.z,1.35*s,1.08*s,1.02*s,(hash(i+83)-.5)*.20);
      put(roofs,i,e.x,ground+1.35*s,e.z,1.22*s,.86*s,1.22*s,Math.PI*.25);
      const facing=e.side>0?Math.PI/2:-Math.PI/2;
      for(let w=0;w<2;w++)put(windows,i*2+w,e.x-e.side*.69*s,ground+(.48+w*.30)*s,e.z+(w-.5)*.44*s,.20*s,.15*s,1,facing);
    }
    for(const mesh of [towers,crossarms,chalets,roofs,windows]){mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();}
  }
  function setDetail(value=1){
    detail=THREE.MathUtils.clamp(Number(value)||0,0,1);const density=.35+.65*detail;
    towers.count=crossarms.count=Math.max(6,Math.round(towerCount*density));
    chalets.count=roofs.count=Math.max(2,Math.round(chaletCount*density));windows.count=chalets.count*2;
    cables.visible=detail>.42;group.visible=detail>.08;return detail;
  }
  function setWind(value=0){wind=THREE.MathUtils.clamp(Number(value)||0,-1.5,1.5);cableMaterial.opacity=.66+Math.min(.12,Math.abs(wind)*.08);return wind;}
  function update(dt,speed){if(!speed)return;travel+=dt*speed;group.position.z=((travel*.92)%272+272)%272;}
  function reset(){travel=0;group.position.z=0;}
  function getDiagnostics(){return {towerCount:towers.count,chaletCount:chalets.count,cableSegments:cableGeometry.drawRange.count/2,detail,wind,drawCalls:6};}
  build();setDetail(1);
  return {group,update,reset,setDetail,setWind,getDiagnostics};
}
