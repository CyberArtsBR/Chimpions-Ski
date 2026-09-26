import * as THREE from 'three';
import {COURSE_FLAG_X} from './environmentCorridor.js';

const SLOT_COUNT=4;
const SLOT_SPACING=150;
const WRAP_DISTANCE=SLOT_COUNT*SLOT_SPACING;
const SAFE_SIDE_X=COURSE_FLAG_X+15;
const dummy=new THREE.Object3D();
const tempColor=new THREE.Color();
const iceNightColor=new THREE.Color(0x9bbcff);
const clamp01=value=>THREE.MathUtils.clamp(Number(value)||0,0,1);
const hash=n=>{const x=Math.sin(n*117.13+41.7)*43758.5453;return x-Math.floor(x);};

export const LANDMARK_STYLES=Object.freeze([
  'ridge','forest','glacier','lodge','lift','competition','rescue','massif','whiteout','moon-glacier','panorama'
]);

function pool(group,name,geometry,material,capacity){
  const mesh=new THREE.InstancedMesh(geometry,material,capacity);
  mesh.name='alpine-landmark-'+name;
  mesh.count=0;
  mesh.castShadow=false;
  mesh.receiveShadow=false;
  mesh.frustumCulled=true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.userData.environmentOnly=true;
  group.add(mesh);
  return {mesh,capacity,count:0};
}

function put(entry,index,x,y,z,sx=1,sy=1,sz=1,ry=0,rx=0,rz=0){
  dummy.position.set(x,y,z);
  dummy.rotation.set(rx,ry,rz);
  dummy.scale.set(sx,sy,sz);
  dummy.updateMatrix();
  entry.mesh.setMatrixAt(index,dummy.matrix);
}

export function createAlpineLandmarks({world,terrainHeight,biomeDirector}){
  const root=new THREE.Group();
  root.name='streaming-alpine-landmarks';
  root.userData.environmentOnly=true;
  world.add(root);

  const rockMaterial=new THREE.MeshStandardMaterial({color:0x526878,roughness:.92,metalness:.02,flatShading:true});
  const iceMaterial=new THREE.MeshStandardMaterial({color:0x7edcf2,roughness:.20,metalness:.04,transparent:true,opacity:.84,depthWrite:true,flatShading:true});
  const wallMaterial=new THREE.MeshStandardMaterial({color:0x6d8793,roughness:.82,metalness:.06});
  const timberMaterial=new THREE.MeshStandardMaterial({color:0x5b453b,roughness:.76,metalness:.02});
  const roofMaterial=new THREE.MeshStandardMaterial({color:0x2f3f48,roughness:.68,metalness:.16});
  const snowMaterial=new THREE.MeshStandardMaterial({color:0xf3f9fc,roughness:.92,metalness:0});
  const warmMaterial=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(1.4,.68,.20),toneMapped:false,transparent:true,opacity:.86,fog:true});
  const steelMaterial=new THREE.MeshStandardMaterial({color:0x50636d,roughness:.44,metalness:.66});
  const lightMaterial=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(.42,.84,1.65),toneMapped:false,transparent:true,opacity:.82,fog:true});
  const bannerMaterial=new THREE.MeshStandardMaterial({color:0x35a6cf,roughness:.46,metalness:.03,side:THREE.DoubleSide});
  const darkMaterial=new THREE.MeshStandardMaterial({color:0x24313a,roughness:.66,metalness:.18});

  const pools={
    rocks:pool(root,'rocks',new THREE.DodecahedronGeometry(1,0),rockMaterial,80),
    ice:pool(root,'blue-ice',new THREE.ConeGeometry(1,2.4,5),iceMaterial,64),
    walls:pool(root,'structures',new THREE.BoxGeometry(1,1,1),wallMaterial,56),
    timber:pool(root,'timber',new THREE.BoxGeometry(1,1,1),timberMaterial,56),
    roofs:pool(root,'roofs',new THREE.ConeGeometry(1,.75,4),roofMaterial,32),
    snow:pool(root,'snow-caps',new THREE.BoxGeometry(1,.18,1),snowMaterial,44),
    windows:pool(root,'warm-windows',new THREE.PlaneGeometry(1,1),warmMaterial,72),
    masts:pool(root,'masts',new THREE.CylinderGeometry(.08,.11,1,7),steelMaterial,48),
    lights:pool(root,'course-lights',new THREE.SphereGeometry(.16,8,6),lightMaterial,48),
    fences:pool(root,'avalanche-fences',new THREE.BoxGeometry(1,.10,.10),darkMaterial,64),
    banners:pool(root,'event-banners',new THREE.PlaneGeometry(1,1),bannerMaterial,40)
  };

  const slots=Array.from({length:SLOT_COUNT},(_,index)=>({z:-72-index*SLOT_SPACING,sectorIndex:index}));
  let travel=0;
  let detail=1;
  let weather={preset:'day',night:0,storm:0,snow:0,wet:0,visibility:1};
  let visibleStyles='';

  function add(name,x,z,sx=1,sy=1,sz=1,ry=0,yOffset=0,rx=0,rz=0){
    const entry=pools[name];
    if(!entry||entry.count>=entry.capacity)return;
    const y=terrainHeight(x,z-travel)+yOffset;
    put(entry,entry.count++,x,y,z,sx,sy,sz,ry,rx,rz);
  }
  function addWindow(x,z,sx,sy,ry,yOffset){add('windows',x,z,sx,sy,1,ry,yOffset);}
  function side(seed){return hash(seed)>.5?1:-1;}

  function lodge(z,seed,scale=1){
    const s=side(seed),x=s*(SAFE_SIDE_X+9+hash(seed+1)*6),yaw=s>0?-.08:.08;
    add('timber',x,z,8.2*scale,3.2*scale,5.4*scale,yaw,1.55*scale);
    add('roofs',x,z,5.8*scale,1.9*scale,4.1*scale,Math.PI*.25+yaw,4.05*scale);
    add('snow',x,z,8.7*scale,1,5.7*scale,yaw,3.35*scale);
    for(let i=0;i<5;i++)addWindow(x-s*4.13*scale,z+(i-2)*.82*scale,.48*scale,.42*scale,s>0?Math.PI/2:-Math.PI/2,1.5*scale);
    for(let i=0;i<4;i++)add('fences',x-s*(5.0+i*1.35)*scale,z+2.4*scale,1.15*scale,1,1,0,.82*scale);
    for(let i=0;i<3;i++){
      const lx=x-s*(5.2+i*2.2)*scale,lz=z-2.0*scale;
      add('masts',lx,lz,1,4.2*scale,1,0,2.1*scale);
      add('lights',lx,lz,1,1,1,0,4.28*scale);
    }
  }

  function glacier(z,seed,moon=false){
    const s=side(seed),baseX=s*(SAFE_SIDE_X+6);
    const count=Math.max(5,Math.round((8+detail*6)*(weather.visibility*.55+.45)));
    for(let i=0;i<count;i++){
      const x=baseX+s*(i*2.0+hash(seed+i)*2.6),zz=z+(hash(seed+i*3)-.5)*24;
      add('ice',x,zz,1.5+hash(i+seed)*1.7,4.6+hash(i*5+seed)*4.7,1.6+hash(i+7)*1.6,(hash(i+13)-.5)*.35,-.35);
      if(i%3===0)add('rocks',x+s*1.2,zz+1.4,1.6,1.7,1.4,hash(i)*Math.PI,.45);
    }
    if(moon){
      for(let i=0;i<4;i++){
        const x=-s*(SAFE_SIDE_X+4+i*5.2),zz=z-10+i*5;
        add('masts',x,zz,1,5.2,1,0,2.6);
        add('lights',x,zz,1.1,1.1,1.1,0,5.3);
      }
    }
  }

  function competition(z,seed){
    const signScale=.72+.28*detail;
    for(const s of [-1,1]){
      for(let i=0;i<5;i++){
        const x=s*(SAFE_SIDE_X+2.5+i*2.7),zz=z-18+i*8.5;
        add('masts',x,zz,1,6.8,1,0,3.4);
        add('lights',x,zz,1.15,1.15,1.15,0,6.95);
        if(i<4)add('banners',s*(COURSE_FLAG_X+2.6),zz+3.2,2.7*signScale,1.05*signScale,1,s>0?-Math.PI/2:Math.PI/2,1.6);
      }
      for(let i=0;i<6;i++)add('fences',s*(SAFE_SIDE_X+1.0),z-20+i*7.2,4.8,1,1,0,.82);
    }
    const pocketSide=side(seed);
    for(let i=0;i<7;i++)add('rocks',pocketSide*(SAFE_SIDE_X+5+hash(seed+i)*8),z-8+(i-3)*2.2,.38,.65,.38,0,.32);
  }

  function liftStation(z,seed){
    for(const s of [-1,1]){
      const x=s*(SAFE_SIDE_X+8),zz=z+(s>0?-5:6);
      add('walls',x,zz,6.2,2.4,4.8,0,1.2);
      add('snow',x,zz,6.6,1,5.1,0,2.52);
      add('windows',x-s*3.12,zz,2.2,1.0,1,s>0?Math.PI/2:-Math.PI/2,1.45);
      for(let i=0;i<2;i++){
        const px=s*(SAFE_SIDE_X+1+i*4.6),pz=z-9+i*15;
        add('masts',px,pz,1,7.2,1,0,3.6);
        add('fences',px,pz,5.2,1,1,0,7.05);
      }
    }
    for(let i=0;i<3;i++){
      const bs=side(seed+i);
      add('banners',bs*(COURSE_FLAG_X+2.4),z-13+i*13,2.2,1.0,1,bs>0?-Math.PI/2:Math.PI/2,1.55);
    }
  }

  function rescue(z,seed){
    const s=side(seed),x=s*(SAFE_SIDE_X+7);
    add('timber',x,z,4.8,2.4,3.8,0,1.2);
    add('roofs',x,z,3.45,1.2,2.8,Math.PI*.25,3.0);
    add('snow',x,z,5.0,1,4.0,0,2.52);
    addWindow(x-s*2.42,z,1.1,.75,s>0?Math.PI/2:-Math.PI/2,1.45);
    add('masts',x+s*4.2,z-1.5,1,10,1,0,5);
    add('lights',x+s*4.2,z-1.5,1.1,1.1,1.1,0,10.1);
    add('banners',x+s*4.2,z-1.5,1.0,2.2,1,s>0?Math.PI/2:-Math.PI/2,7.3);
    for(let i=0;i<3;i++)add('fences',x-s*3.3,z-6+i*5.2,4.3,1,1,.12*s,.9);
  }

  function massif(z,seed){
    const s=side(seed);
    for(let i=0;i<10;i++){
      const x=s*(SAFE_SIDE_X+8+i*3.7+hash(seed+i)*4),zz=z+(hash(seed+i*7)-.5)*34;
      add('rocks',x,zz,3.0+hash(i+1)*4.0,4.5+hash(i+4)*7.0,2.6+hash(i+8)*3.8,(hash(i+11)-.5)*.65,.4);
    }
    for(let i=0;i<6;i++)add('fences',-s*(SAFE_SIDE_X+5+i*3.2),z-14+i*4.8,4.4,1,1,(hash(i+seed)-.5)*.18,2.0+i*.12);
  }

  function whiteout(z,seed){
    const s=side(seed);
    for(let i=0;i<7;i++){
      const x=s*(COURSE_FLAG_X+3.4+i%2*2.2),zz=z-20+i*6.3;
      add('masts',x,zz,1,3.5,1,0,1.75);
      add('lights',x,zz,.7,.7,.7,0,3.58);
    }
    for(let i=0;i<6;i++)add('fences',-s*(SAFE_SIDE_X+3),z-18+i*7.4,5.0,1,1,.04*s,.78);
  }

  function ridge(z,seed){
    const s=side(seed);
    for(let i=0;i<8;i++){
      const x=s*(SAFE_SIDE_X+5+i*3.6),zz=z-16+hash(seed+i)*32;
      add('rocks',x,zz,1.8+hash(i)*3.0,2.5+hash(i+4)*4.8,1.8+hash(i+9)*2.4,(hash(i+2)-.5)*.42,.3);
    }
    for(let i=0;i<7;i++)add('fences',-s*(SAFE_SIDE_X+6+i*.7),z-18+i*5.3,5.4,1,1,(hash(seed+i)-.5)*.22,1.7+i*.10);
  }

  function forestClearing(z,seed){
    const s=side(seed);
    add('timber',s*(SAFE_SIDE_X+9),z,3.6,2.0,3.2,0,1.0);
    add('roofs',s*(SAFE_SIDE_X+9),z,2.6,1.0,2.3,Math.PI*.25,2.52);
    addWindow(s*(SAFE_SIDE_X+9)-s*1.82,z,.72,.58,s>0?Math.PI/2:-Math.PI/2,1.2);
    for(let i=0;i<5;i++)add('fences',-s*(SAFE_SIDE_X+3.5),z-12+i*6.2,4.4,1,1,.06*s,.78);
  }

  function panorama(z,seed){
    const s=side(seed);
    for(let i=0;i<6;i++)add('rocks',s*(SAFE_SIDE_X+11+i*5.4),z-14+hash(seed+i)*28,2.0+hash(i)*2.4,2.4+hash(i+4)*3.8,2.0+hash(i+8)*2.0,(hash(i+6)-.5)*.5,.25);
    if(detail>.55)lodge(z+5,seed+.4,.72);
  }

  function emit(style,z,seed){
    if(style==='glacier')glacier(z,seed,false);
    else if(style==='moon-glacier')glacier(z,seed,true);
    else if(style==='lodge')lodge(z,seed,1);
    else if(style==='lift')liftStation(z,seed);
    else if(style==='competition')competition(z,seed);
    else if(style==='rescue')rescue(z,seed);
    else if(style==='massif')massif(z,seed);
    else if(style==='whiteout')whiteout(z,seed);
    else if(style==='ridge')ridge(z,seed);
    else if(style==='panorama')panorama(z,seed);
    else forestClearing(z,seed);
  }

  function clearPools(){for(const entry of Object.values(pools))entry.count=0;}
  function commitPools(){
    for(const entry of Object.values(pools)){
      entry.mesh.count=entry.count;
      entry.mesh.visible=entry.count>0;
      if(entry.count>0){
        entry.mesh.instanceMatrix.needsUpdate=true;
        entry.mesh.computeBoundingSphere();
        if(entry.mesh.boundingSphere)entry.mesh.boundingSphere.radius+=90;
      }
    }
  }

  function refresh(){
    clearPools();
    const activeSlots=detail<.38?2:detail<.70?3:SLOT_COUNT;
    const styles=[];
    for(let i=0;i<activeSlots;i++){
      const slot=slots[i],profile=biomeDirector.getSector(slot.sectorIndex);
      styles.push(profile.style);
      emit(profile.style,slot.z,slot.sectorIndex*17+3);
    }
    visibleStyles=styles.join(',');
    const night=clamp01(weather.night),storm=clamp01(weather.storm),wet=clamp01(weather.wet);
    warmMaterial.opacity=.32+.58*Math.max(night,.15)+storm*.10;
    lightMaterial.opacity=.18+.72*Math.max(night,storm*.55,weather.snow*.30);
    roofMaterial.roughness=.68-wet*.18;
    rockMaterial.roughness=.92-wet*.24;
    tempColor.setHex(0x7edcf2).lerp(iceNightColor,night*.35);iceMaterial.color.copy(tempColor);
    commitPools();
  }

  function setDetail(value=1){detail=clamp01(value);refresh();return detail;}
  function setWeatherState(next={}){
    weather={
      preset:String(next.preset||next.mode||weather.preset||'day'),
      night:clamp01(next.night),
      storm:clamp01(Math.max(Number(next.rain)||0,(Number(next.cloud)||0)-.45)),
      snow:clamp01(next.snowfall),
      wet:clamp01(next.wet),
      visibility:clamp01(1-(Number(next.fogDensity)||0)*34)
    };
    refresh();
    return weather;
  }
  function reset(){
    travel=0;
    slots.forEach((slot,index)=>{slot.z=-72-index*SLOT_SPACING;slot.sectorIndex=index;});
    refresh();
  }
  function update(dt,speed){
    const step=Math.max(0,Number(dt)||0)*Math.max(0,Number(speed)||0);
    if(step<=0)return;
    travel+=step;
    for(const slot of slots){
      slot.z+=step;
      if(slot.z>35){slot.z-=WRAP_DISTANCE;slot.sectorIndex+=SLOT_COUNT;}
    }
    refresh();
  }
  function getDiagnostics(){
    const counts={};let total=0,drawCalls=0;
    for(const [name,entry] of Object.entries(pools)){counts[name]=entry.count;total+=entry.count;if(entry.count>0)drawCalls++;}
    return {
      landmarkSlots:SLOT_COUNT,
      visibleStyles,
      landmarkInstances:total,
      landmarkDrawCalls:drawCalls,
      pooledResourceTypes:Object.keys(pools).length,
      detail,
      weatherPreset:weather.preset,
      counts
    };
  }

  reset();
  return {root,update,reset,setDetail,setWeatherState,getDiagnostics};
}
