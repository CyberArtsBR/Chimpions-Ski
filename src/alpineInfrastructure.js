import * as THREE from 'three';
import {COURSE_FLAG_X} from './environmentCorridor.js';

const dummy=new THREE.Object3D();
const hash=n=>{const x=Math.sin(n*91.73+17.19)*43758.5453;return x-Math.floor(x);};
const clamp01=value=>THREE.MathUtils.clamp(Number(value)||0,0,1);
function put(mesh,index,x,y,z,sx=1,sy=1,sz=1,ry=0,rx=0,rz=0){
  dummy.position.set(x,y,z);dummy.rotation.set(rx,ry,rz);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);
}

export function createAlpineInfrastructure({world,terrainHeight}){
  const group=new THREE.Group();group.name='distant-alpine-infrastructure';group.userData.environmentOnly=true;world.add(group);
  const towerCount=14,chaletCount=8,carrierCount=12,signCount=12,lampCount=12;
  const towerMaterial=new THREE.MeshStandardMaterial({color:0x526772,roughness:.48,metalness:.64});
  const crossMaterial=new THREE.MeshStandardMaterial({color:0x78909b,roughness:.40,metalness:.72});
  const snowMaterial=new THREE.MeshStandardMaterial({color:0xf3f9fc,roughness:.91,metalness:0});
  const chaletMaterial=new THREE.MeshStandardMaterial({color:0x59443a,roughness:.78,metalness:0});
  const roofMaterial=new THREE.MeshStandardMaterial({color:0x2d3940,roughness:.72,metalness:.14});
  const windowMaterial=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(1.25,.72,.22),toneMapped:false,fog:true,transparent:true,opacity:.82});
  const cableMaterial=new THREE.LineBasicMaterial({color:0x41545e,transparent:true,opacity:.72,depthWrite:false});
  const carrierMaterial=new THREE.MeshStandardMaterial({color:0x445d69,roughness:.42,metalness:.50});
  const carrierGlassMaterial=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(.30,.65,.86),toneMapped:false,fog:true,transparent:true,opacity:.58});
  const signMaterial=new THREE.MeshStandardMaterial({color:0x2492ba,roughness:.48,metalness:.05});
  const lampMaterial=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(.55,.90,1.65),toneMapped:false,fog:true,transparent:true,opacity:.74});

  const towers=new THREE.InstancedMesh(new THREE.CylinderGeometry(.09,.14,1,8),towerMaterial,towerCount);
  const crossarms=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.11,.10),crossMaterial,towerCount);
  const towerSnow=new THREE.InstancedMesh(new THREE.CylinderGeometry(.13,.17,.24,8),snowMaterial,towerCount);
  const chalets=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),chaletMaterial,chaletCount);
  const roofs=new THREE.InstancedMesh(new THREE.ConeGeometry(.82,.65,4),roofMaterial,chaletCount);
  const roofSnow=new THREE.InstancedMesh(new THREE.ConeGeometry(.86,.20,4),snowMaterial,chaletCount);
  const windows=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),windowMaterial,chaletCount*2);
  const carriers=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),carrierMaterial,carrierCount);
  const carrierGlass=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),carrierGlassMaterial,carrierCount);
  const signPosts=new THREE.InstancedMesh(new THREE.CylinderGeometry(.035,.045,1,6),towerMaterial,signCount);
  const signFaces=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,.08),signMaterial,signCount);
  const lampPosts=new THREE.InstancedMesh(new THREE.CylinderGeometry(.035,.055,1,6),towerMaterial,lampCount);
  const lampHeads=new THREE.InstancedMesh(new THREE.SphereGeometry(.13,8,6),lampMaterial,lampCount);

  const cablePositions=new Float32Array((towerCount-2)*2*3);
  const cableGeometry=new THREE.BufferGeometry();cableGeometry.setAttribute('position',new THREE.BufferAttribute(cablePositions,3));
  const cables=new THREE.LineSegments(cableGeometry,cableMaterial);
  const instanced=[towers,crossarms,towerSnow,chalets,roofs,roofSnow,windows,carriers,carrierGlass,signPosts,signFaces,lampPosts,lampHeads];
  for(const mesh of instanced){mesh.castShadow=false;mesh.receiveShadow=false;mesh.frustumCulled=true;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.userData.environmentOnly=true;group.add(mesh);}
  cables.frustumCulled=false;group.add(cables);

  const towerData=[],chaletData=[],carrierRoutes=[];
  for(let i=0;i<towerCount;i++){
    const side=i%2?-1:1,rank=Math.floor(i/2),x=side*(COURSE_FLAG_X+31+hash(i+3)*19),z=-34-rank*34-(side<0?12:0),h=5.4+hash(i+7)*2.2;
    towerData.push({x,z,h,side});
  }
  for(let i=2;i<towerData.length;i++)if(towerData[i].side===towerData[i-2].side)carrierRoutes.push([i-2,i]);
  for(let i=0;i<chaletCount;i++){
    const side=i%2?-1:1,rank=Math.floor(i/2),x=side*(COURSE_FLAG_X+38+hash(i+51)*26),z=-68-rank*56-(side>0?18:0),s=.8+hash(i+61)*.55;
    chaletData.push({x,z,s,side});
  }
  let detail=1,travel=0,wind=0,carrierClock=0,weather={night:0,wet:0,storm:0,snow:0};

  function buildStatic(){
    let cableIndex=0;
    for(let i=0;i<towerData.length;i++){
      const e=towerData[i],ground=terrainHeight(e.x,e.z);
      put(towers,i,e.x,ground+e.h*.5,e.z,1,e.h,1);
      put(crossarms,i,e.x,ground+e.h,e.z,3.2,1,1,e.side*.025);
      put(towerSnow,i,e.x,ground+e.h+.11,e.z,1,1,1);
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
      put(roofSnow,i,e.x,ground+1.69*s,e.z,1.18*s,.75*s,1.18*s,Math.PI*.25);
      const facing=e.side>0?Math.PI/2:-Math.PI/2;
      for(let w=0;w<2;w++)put(windows,i*2+w,e.x-e.side*.69*s,ground+(.48+w*.30)*s,e.z+(w-.5)*.44*s,.20*s,.15*s,1,facing);
    }
    for(let i=0;i<signCount;i++){
      const side=i%2?-1:1,rank=Math.floor(i/2),x=side*(COURSE_FLAG_X+4.0+hash(i+121)*4.5),z=-46-rank*43-(side<0?11:0),ground=terrainHeight(x,z);
      put(signPosts,i,x,ground+.86,z,1,1.72,1);
      put(signFaces,i,x-side*.07,ground+1.58,z,.82,.42,1,side>0?Math.PI/2:-Math.PI/2);
    }
    for(let i=0;i<lampCount;i++){
      const side=i%2?-1:1,rank=Math.floor(i/2),x=side*(COURSE_FLAG_X+8.2+hash(i+211)*6.5),z=-58-rank*47-(side>0?9:0),ground=terrainHeight(x,z),h=4.4+hash(i+221)*1.4;
      put(lampPosts,i,x,ground+h*.5,z,1,h,1);
      put(lampHeads,i,x-side*.10,ground+h+.08,z,1,1,1);
    }
    for(const mesh of [towers,crossarms,towerSnow,chalets,roofs,roofSnow,windows,signPosts,signFaces,lampPosts,lampHeads]){mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();}
  }

  function refreshCarriers(){
    const routeCount=carrierRoutes.length;
    const active=Math.max(2,Math.min(carrierCount,Math.round(carrierCount*(.30+.70*detail))));
    carriers.count=carrierGlass.count=active;
    for(let i=0;i<active;i++){
      const [a,b]=carrierRoutes[i%routeCount],from=towerData[a],to=towerData[b];
      const fromY=terrainHeight(from.x,from.z)+from.h+.18,toY=terrainHeight(to.x,to.z)+to.h+.18;
      const phase=(carrierClock*(.055+hash(i+13)*.018)+i/active)%1;
      const t=i%2?1-phase:phase;
      const x=THREE.MathUtils.lerp(from.x,to.x,t),z=THREE.MathUtils.lerp(from.z,to.z,t),y=THREE.MathUtils.lerp(fromY,toY,t)-.58;
      const yaw=Math.atan2(to.x-from.x,to.z-from.z);
      put(carriers,i,x,y,z,.90,.58,.70,yaw);
      put(carrierGlass,i,x,y+.06,z-.36*Math.sign(Math.cos(yaw)||1),.68,.31,.055,yaw);
    }
    carriers.instanceMatrix.needsUpdate=true;carrierGlass.instanceMatrix.needsUpdate=true;
    carriers.computeBoundingSphere();carrierGlass.computeBoundingSphere();
  }

  function setDetail(value=1){
    detail=clamp01(value);const density=.35+.65*detail;
    towers.count=crossarms.count=towerSnow.count=Math.max(6,Math.round(towerCount*density));
    chalets.count=roofs.count=roofSnow.count=Math.max(2,Math.round(chaletCount*density));windows.count=chalets.count*2;
    signPosts.count=signFaces.count=Math.max(4,Math.round(signCount*density));
    lampPosts.count=lampHeads.count=Math.max(4,Math.round(lampCount*density));
    cables.visible=detail>.42;group.visible=detail>.08;refreshCarriers();return detail;
  }
  function setWind(value=0){wind=THREE.MathUtils.clamp(Number(value)||0,-1.5,1.5);cableMaterial.opacity=.66+Math.min(.12,Math.abs(wind)*.08);return wind;}
  function setWeatherState(next={}){
    weather={night:clamp01(next.night),wet:clamp01(next.wet),storm:clamp01(Math.max(Number(next.rain)||0,(Number(next.cloud)||0)-.45)),snow:clamp01(next.snowfall)};
    windowMaterial.opacity=.42+.48*Math.max(weather.night,weather.storm*.45);
    lampMaterial.opacity=.20+.74*Math.max(weather.night,weather.storm*.58,weather.snow*.28);
    roofMaterial.roughness=.72-weather.wet*.20;carrierMaterial.roughness=.42-weather.wet*.14;
    return weather;
  }
  function update(dt,speed){
    const step=Math.max(0,Number(dt)||0)*Math.max(0,Number(speed)||0);
    if(step>0){travel+=step;group.position.z=((travel*.92)%272+272)%272;}
    carrierClock+=Math.max(0,Number(dt)||0)*(1+Math.abs(wind)*.05);
    refreshCarriers();
  }
  function reset(){travel=0;carrierClock=0;group.position.z=0;refreshCarriers();}
  function getDiagnostics(){
    const visible=[towers,crossarms,towerSnow,chalets,roofs,roofSnow,windows,carriers,carrierGlass,signPosts,signFaces,lampPosts,lampHeads].reduce((sum,mesh)=>sum+Number(mesh.visible!==false&&mesh.count>0),0);
    return {towerCount:towers.count,chaletCount:chalets.count,carrierCount:carriers.count,pisteSigns:signFaces.count,floodlights:lampHeads.count,cableSegments:cableGeometry.drawRange.count/2,detail,wind,weatherNight:weather.night,drawCalls:visible+Number(cables.visible)};
  }
  buildStatic();setDetail(1);setWeatherState({});
  return {group,update,reset,setDetail,setWind,setWeatherState,getDiagnostics};
}
