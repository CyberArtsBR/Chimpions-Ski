import * as THREE from 'three';
import {createSnowMaterials} from './snowMaterial.js';

const _dummy=new THREE.Object3D();
const _snowCapGeometry=new THREE.ConeGeometry(.62,.9,10);
const _rockCapGeometry=new THREE.SphereGeometry(.48,12,8);
const _haloGeometry=new THREE.TorusGeometry(.54,.022,6,28);
const _stripeGeometry=new THREE.BoxGeometry(.68,.04,.13);
const _lipGeometry=new THREE.BoxGeometry(2.34,.055,.13);
const _logSnowGeometry=new THREE.BoxGeometry(1.8,.08,.36);
const _rampBankGeometry=new THREE.SphereGeometry(1,10,6);
const _snowDetailMaterial=new THREE.MeshStandardMaterial({color:0xfbfeff,roughness:.94,metalness:0});
const _rockSnowMaterial=new THREE.MeshStandardMaterial({color:0xf2f9fc,roughness:1});
const _bananaHaloMaterial=new THREE.MeshBasicMaterial({color:0xffdf58,transparent:true,opacity:.34,depthWrite:false});
const _jumpMaterial=new THREE.MeshStandardMaterial({color:0x73cfe8,roughness:.5,metalness:.03,emissive:0x083c4c,emissiveIntensity:.14});
const _jumpStripeMaterial=new THREE.MeshStandardMaterial({color:0xffd33d,roughness:.42,emissive:0x5a3100,emissiveIntensity:.36});
const _logSnowMaterial=new THREE.MeshStandardMaterial({color:0xf4fbff,roughness:.98});
const _barkMaterial=new THREE.MeshStandardMaterial({color:0x68452e,roughness:.94});
const _pineMaterial=new THREE.MeshStandardMaterial({color:0x174e49,roughness:.88});
const _rockMaterial=new THREE.MeshStandardMaterial({color:0x687985,roughness:.94});
const _bananaMaterial=new THREE.MeshStandardMaterial({color:0xffd74e,roughness:.52,emissive:0x4d3100,emissiveIntensity:.08});
const _logMaterial=new THREE.MeshStandardMaterial({color:0x74472f,roughness:.94});
const _logEndMaterial=new THREE.MeshStandardMaterial({color:0x9a704d,roughness:.95});

function wave(seed){
  const x=Math.sin(seed*12.9898+78.233)*43758.5453;
  return x-Math.floor(x);
}

function ridgeGeometry(width,height,baseY,segments,seed){
  const positions=[];
  let prevX=-width*.5;
  let prevY=baseY+height*(.34+wave(seed)*.3);
  for(let i=1;i<=segments;i++){
    const t=i/segments;
    const x=-width*.5+width*t;
    const macro=Math.sin(t*Math.PI)*.5+Math.sin(t*Math.PI*3.1+seed)*.16;
    const tooth=(wave(seed+i*1.91)-.5)*.42;
    const y=baseY+height*(.28+macro+tooth);
    positions.push(
      prevX,baseY,0, prevX,prevY,0, x,y,0,
      prevX,baseY,0, x,y,0, x,baseY,0
    );
    prevX=x;prevY=y;
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.computeVertexNormals();
  return geometry;
}

function createRidge(width,height,y,z,color,opacity,seed,segments=26){
  const material=new THREE.MeshBasicMaterial({
    color,
    transparent:opacity<1,
    opacity,
    depthWrite:false,
    fog:true
  });
  const mesh=new THREE.Mesh(ridgeGeometry(width,height,-height*.46,segments,seed),material);
  mesh.position.set(0,y,z);
  mesh.renderOrder=-20;
  return mesh;
}

function setInstance(mesh,index,x,y,z,sx,sy,sz,ry=0,rx=0,rz=0){
  _dummy.position.set(x,y,z);
  _dummy.rotation.set(rx,ry,rz);
  _dummy.scale.set(sx,sy,sz);
  _dummy.updateMatrix();
  mesh.setMatrixAt(index,_dummy.matrix);
}

function createMovingInstances(count,mesh,makeEntry){
  const entries=new Array(count);
  for(let i=0;i<count;i++)entries[i]=makeEntry(i);
  return {mesh,entries};
}

function resetBank(entry,i,deep=false){
  const side=i%2===0?-1:1;
  entry.x=side*(8.9+wave(i*2.7+11)*6.4);
  entry.z=-12-wave(i*4.1+21)*205;
  entry.sx=(deep?2.8:2.1)+wave(i*3.4+5)*(deep?3.3:2.6);
  entry.sy=(deep?.34:.18)+wave(i*7.1+9)*(deep?.42:.22);
  entry.sz=(deep?1.1:.7)+wave(i*5.7+4)*(deep?1.7:1.15);
  entry.ry=wave(i*8.4+2)*Math.PI;
}

function resetTree(entry,i){
  const cluster=Math.floor(i/5);
  const within=i%5;
  const side=cluster%2===0?-1:1;
  const clusterZ=-18-wave(cluster*4.91+8)*210;
  const clusterX=side*(11.0+wave(cluster*2.7+4)*5.8);
  entry.x=clusterX+(wave(i*5.37+1)-.5)*(3.4+within*.18);
  entry.z=clusterZ+(wave(i*6.91+8)-.5)*12.5;
  entry.s=.62+wave(i*4.17+3)*1.08;
  entry.ry=wave(i*2.61+6)*Math.PI*2;
  entry.phase=wave(i*8.23+17)*Math.PI*2;
}

function makeSky(){
  const material=new THREE.ShaderMaterial({
    side:THREE.BackSide,
    depthWrite:false,
    uniforms:{
      topColor:{value:new THREE.Color(0x68b5db)},
      horizonColor:{value:new THREE.Color(0xd9eef7)},
      lowColor:{value:new THREE.Color(0xf8fcff)}
    },
    vertexShader:'varying float vY; void main(){ vec4 wp=modelMatrix*vec4(position,1.0); vY=normalize(wp.xyz-cameraPosition).y; gl_Position=projectionMatrix*viewMatrix*vec4(position,1.0); }',
    fragmentShader:'varying float vY; uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 lowColor; void main(){ float h=smoothstep(-0.22,0.18,vY); float t=smoothstep(0.02,0.72,vY); vec3 c=mix(lowColor,horizonColor,h); c=mix(c,topColor,t); gl_FragColor=vec4(c,1.0); }'
  });
  const sky=new THREE.Mesh(new THREE.SphereGeometry(145,28,14),material);
  sky.frustumCulled=false;
  sky.renderOrder=-100;
  return sky;
}

function makeSnowLayer(count,size,opacity,xSpread,zMin,zMax,speedBase,ground=false){
  const positions=new Float32Array(count*3);
  const fall=new Float32Array(count);
  const sway=new Float32Array(count);
  for(let i=0;i<count;i++){
    positions[i*3]=(wave(i*2.3+11)-.5)*xSpread*2;
    positions[i*3+1]=ground?.08+wave(i*3.7+2)*1.15:.4+wave(i*3.7+2)*14.5;
    positions[i*3+2]=zMin+wave(i*5.2+7)*(zMax-zMin);
    fall[i]=speedBase+wave(i*8.1+4)*speedBase*.85;
    sway[i]=wave(i*7.7+9)*Math.PI*2;
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const material=new THREE.PointsMaterial({
    color:ground?0xeefaff:0xffffff,
    size,
    transparent:true,
    opacity,
    depthWrite:false,
    sizeAttenuation:true
  });
  const points=new THREE.Points(geometry,material);
  points.frustumCulled=false;
  return {count,positions,fall,sway,geometry,points,xSpread,zMin,zMax,ground};
}

function makePowderPool(scene){
  const count=320;
  const positions=new Float32Array(count*3);
  const velocity=new Float32Array(count*3);
  const life=new Float32Array(count);
  const maxLife=new Float32Array(count);
  for(let i=0;i<count;i++)positions[i*3+1]=-100;
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const material=new THREE.PointsMaterial({
    color:0xffffff,
    size:.135,
    transparent:true,
    opacity:.56,
    depthWrite:false,
    sizeAttenuation:true
  });
  const points=new THREE.Points(geometry,material);
  points.frustumCulled=false;
  scene.add(points);
  return {count,positions,velocity,life,maxLife,geometry,points,cursor:0,lastLanding:0,emitCarry:0};
}

function emitPowder(pool,x,y,z,edge,speed,count,landing=false){
  const turnSign=Math.sign(edge);
  const outsideX=x-turnSign*.22;
  const direction=turnSign===0?(wave(pool.cursor+3)>.5?1:-1):-turnSign;
  for(let n=0;n<count;n++){
    const i=pool.cursor++%pool.count;
    const base=i*3;
    const r1=wave(pool.cursor*1.17+n*2.3);
    const r2=wave(pool.cursor*2.71+n*5.1);
    const r3=wave(pool.cursor*4.33+n*7.9);
    pool.positions[base]=(landing?x:outsideX)+(r1-.5)*(landing?.9:.52);
    pool.positions[base+1]=y+.04+r2*(landing?.28:.13);
    pool.positions[base+2]=z+.34+r3*.5;
    pool.velocity[base]=direction*(.5+r1*(landing?1.9:1.35))+(r2-.5)*.48;
    pool.velocity[base+1]=(landing?.95:.5)+r2*(landing?2.9:1.75);
    pool.velocity[base+2]=1.0+r3*(landing?3.1:2.1)+speed*.026;
    pool.life[i]=(landing?.5:.3)+r1*(landing?.52:.34);
    pool.maxLife[i]=pool.life[i];
  }
}

function makeContactShadow(scene){
  const material=new THREE.MeshBasicMaterial({
    color:0x456b7f,
    transparent:true,
    opacity:.16,
    depthWrite:false
  });
  const shadow=new THREE.Mesh(new THREE.CircleGeometry(.62,28),material);
  shadow.rotation.x=-Math.PI/2;
  shadow.scale.set(1.45,.52,1);
  shadow.renderOrder=8;
  scene.add(shadow);
  return shadow;
}

export function decorateCourseObject(root,kind){
  if(!root||root.userData.environmentDecorated)return root;
  root.userData.environmentDecorated=true;
  if(kind==='tree'){
    for(const [y,s] of [[2.18,.92],[2.87,.72]]){
      const cap=new THREE.Mesh(_snowCapGeometry,_snowDetailMaterial);
      cap.position.y=y;cap.scale.set(s,.48,s);cap.castShadow=true;root.add(cap);
    }
  }else if(kind==='rock'){
    const cap=new THREE.Mesh(_rockCapGeometry,_rockSnowMaterial);
    cap.position.set(-.05,.78,-.02);cap.scale.set(1.12,.22,.86);cap.castShadow=true;root.add(cap);
    root.rotation.y=(wave(root.id*.71)-.5)*.5;
    root.scale.x*=.9+wave(root.id*.37)*.22;
  }else if(kind==='banana'){
    const halo=new THREE.Mesh(_haloGeometry,_bananaHaloMaterial);
    halo.rotation.set(Math.PI/2,0,.35);halo.position.y=.02;root.add(halo);
  }else if(kind==='ramp'){
    const deck=root.children[0];
    if(deck?.isMesh)deck.material=_jumpMaterial;
    if(deck){
      for(const z of [-.78,0,.78]){
        const left=new THREE.Mesh(_stripeGeometry,_jumpStripeMaterial);
        const right=new THREE.Mesh(_stripeGeometry,_jumpStripeMaterial);
        left.position.set(-.22,.145,z);right.position.set(.22,.145,z);
        left.rotation.y=.62;right.rotation.y=-.62;
        deck.add(left,right);
      }
      const lip=new THREE.Mesh(_lipGeometry,_jumpStripeMaterial);
      lip.position.set(0,.15,-1.47);deck.add(lip);
    }
    for(const side of [-1,1]){
      const bank=new THREE.Mesh(_rampBankGeometry,_snowDetailMaterial);
      bank.position.set(side*1.32,.03,.68);
      bank.scale.set(.34,.16,1.45);
      bank.castShadow=true;
      root.add(bank);
    }
  }else if(kind==='log'){
    const snow=new THREE.Mesh(_logSnowGeometry,_logSnowMaterial);
    snow.position.set(0,.54,0);snow.rotation.z=.015;snow.castShadow=true;root.add(snow);
  }
  return root;
}

export function createSkiEnvironment({scene,world,renderer,camera}){
  scene.background=new THREE.Color(0xd8eff9);
  scene.fog=new THREE.Fog(0xd8eff9,30,158);
  renderer.toneMappingExposure=.98;

  const snowMaterials=createSnowMaterials(renderer);

  const sky=makeSky();scene.add(sky);
  const atmosphere=new THREE.Group();scene.add(atmosphere);
  atmosphere.add(
    createRidge(202,35,-4,-148,0xbad2dd,.72,2.4,36),
    createRidge(168,29,-5,-118,0x91b4c3,.86,5.9,32),
    createRidge(138,22,-6,-91,0x6f96a8,.96,9.1,28)
  );

  const ambient=new THREE.HemisphereLight(0xeaf9ff,0x708ca1,1.46);scene.add(ambient);
  const sun=new THREE.DirectionalLight(0xfff1d1,2.85);
  sun.position.set(-8,14,8);
  sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);
  sun.shadow.bias=-.00045;
  sun.shadow.normalBias=.025;
  Object.assign(sun.shadow.camera,{left:-14,right:14,top:18,bottom:-8,near:.5,far:45});
  scene.add(sun);
  const rim=new THREE.DirectionalLight(0xb8def1,.4);
  rim.position.set(10,7,-8);
  scene.add(rim);

  const bankGeometry=new THREE.SphereGeometry(1,12,7);
  const bankMesh=new THREE.InstancedMesh(bankGeometry,snowMaterials.bank,36);bankMesh.receiveShadow=true;world.add(bankMesh);
  const windMesh=new THREE.InstancedMesh(bankGeometry,snowMaterials.shadowBank,26);windMesh.receiveShadow=true;world.add(windMesh);
  const banks=createMovingInstances(36,bankMesh,i=>{const e={};resetBank(e,i,true);return e;});
  const windBanks=createMovingInstances(26,windMesh,i=>{const e={};resetBank(e,i,false);return e;});

  const treeCount=86;
  const trunkMesh=new THREE.InstancedMesh(new THREE.CylinderGeometry(.16,.26,1.7,7),_barkMaterial,treeCount);
  const foliageGeo=new THREE.ConeGeometry(1.05,2.25,9);
  const foliageLower=new THREE.InstancedMesh(foliageGeo,_pineMaterial,treeCount);
  const foliageUpper=new THREE.InstancedMesh(foliageGeo,_pineMaterial,treeCount);
  const capMesh=new THREE.InstancedMesh(new THREE.ConeGeometry(.72,1.05,9),_snowDetailMaterial,treeCount);
  for(const mesh of [trunkMesh,foliageLower,foliageUpper,capMesh]){
    mesh.castShadow=true;mesh.receiveShadow=true;world.add(mesh);
  }
  const trees=createMovingInstances(treeCount,trunkMesh,i=>{const e={};resetTree(e,i);return e;});

  const snowLayers=[
    makeSnowLayer(250,.045,.45,21,-58,10,1.05,false),
    makeSnowLayer(390,.075,.62,19,-48,12,1.55,false),
    makeSnowLayer(300,.115,.7,17,-38,13,2.05,false),
    makeSnowLayer(190,.052,.52,15,-30,11,.45,true)
  ];
  for(const layer of snowLayers)scene.add(layer.points);
  const powder=makePowderPool(scene);
  const contactShadow=makeContactShadow(scene);

  function refreshBanks(group){
    const {mesh,entries}=group;
    for(let i=0;i<entries.length;i++){
      const e=entries[i];
      setInstance(mesh,i,e.x,-.33,e.z,e.sx,e.sy,e.sz,e.ry);
    }
    mesh.instanceMatrix.needsUpdate=true;
  }

  function refreshTrees(time=0){
    for(let i=0;i<trees.entries.length;i++){
      const e=trees.entries[i],s=e.s;
      const sway=Math.sin(time*.72+e.phase)*.018;
      setInstance(trunkMesh,i,e.x,.78*s,e.z,.9*s,s,.9*s,e.ry);
      setInstance(foliageLower,i,e.x,1.8*s,e.z,1.04*s,1.02*s,1.04*s,e.ry,0,sway*.42);
      setInstance(foliageUpper,i,e.x,2.62*s,e.z,.82*s,.88*s,.82*s,e.ry+.15,0,sway);
      setInstance(capMesh,i,e.x,3.0*s,e.z,.7*s,.62*s,.7*s,e.ry+.15,0,sway*.9);
    }
    trunkMesh.instanceMatrix.needsUpdate=true;
    foliageLower.instanceMatrix.needsUpdate=true;
    foliageUpper.instanceMatrix.needsUpdate=true;
    capMesh.instanceMatrix.needsUpdate=true;
  }

  refreshBanks(banks);refreshBanks(windBanks);refreshTrees();

  let time=0;
  function update(dt,worldSpeed,playerX,playerY,playerZ,speed,edge,air,landingPulse){
    time+=dt;
    sky.position.copy(camera.position);

    for(let i=0;i<banks.entries.length;i++){
      const e=banks.entries[i];e.z+=worldSpeed*dt;
      if(e.z>22){resetBank(e,i,true);e.z=-185-wave(time+i)*55;}
    }
    for(let i=0;i<windBanks.entries.length;i++){
      const e=windBanks.entries[i];e.z+=worldSpeed*dt;
      if(e.z>20){resetBank(e,i,false);e.z=-170-wave(time*1.7+i)*65;}
    }
    refreshBanks(banks);refreshBanks(windBanks);

    for(let i=0;i<trees.entries.length;i++){
      const e=trees.entries[i];e.z+=worldSpeed*dt;
      if(e.z>24){resetTree(e,i);e.z=-190-wave(time*.9+i)*70;}
    }
    refreshTrees(time);

    const speed01=THREE.MathUtils.clamp((speed-12)/19,0,1);
    for(const layer of snowLayers){
      const p=layer.positions;
      layer.materialScale=speed01;
      for(let i=0;i<layer.count;i++){
        const k=i*3;
        if(layer.ground){
          p[k+2]+=dt*(3.8+worldSpeed*(.52+speed01*.55));
          p[k]+=Math.sin(time*.8+layer.sway[i])*dt*(.08+speed01*.08);
          if(p[k+2]>13){
            p[k+2]=layer.zMin+wave(i*3.2+time)*9;
            p[k]=(wave(i*4.9+time)-.5)*layer.xSpread*2;
            p[k+1]=.06+wave(i*2.8+time)*(.65+speed01*.65);
          }
        }else{
          p[k+1]-=dt*(layer.fall[i]+speed*.018);
          p[k+2]+=dt*(1.55+worldSpeed*.33+layer.fall[i]*.28);
          p[k]+=Math.sin(time*(.55+layer.fall[i]*.12)+layer.sway[i])*dt*.11;
          if(p[k+1]<.15)p[k+1]=10+wave(i+time)*5.5;
          if(p[k+2]>15){
            p[k+2]=layer.zMin+wave(i*3.2+time)*(layer.zMax-layer.zMin)*.28;
            p[k]=(wave(i*4.9+time)-.5)*layer.xSpread*2;
          }
        }
      }
      if(layer.ground){
        layer.points.material.opacity=.34+speed01*.34;
        layer.points.material.size=.048+speed01*.035;
      }
      layer.geometry.attributes.position.needsUpdate=true;
    }

    if(!air){
      const carve=Math.abs(edge);
      const straight=speed01*.12;
      powder.emitCarry+=dt*(straight+carve*(.78+speed01*.7))*34;
      const emit=Math.min(10,Math.floor(powder.emitCarry));
      if(emit>0){
        emitPowder(powder,playerX,playerY,playerZ,edge,speed,emit,false);
        powder.emitCarry-=emit;
      }
    }
    if(landingPulse>.18&&powder.lastLanding<=.18){
      emitPowder(powder,playerX,playerY,playerZ,edge,speed,26+Math.floor(speed01*8),true);
    }
    powder.lastLanding=landingPulse;

    for(let i=0;i<powder.count;i++){
      if(powder.life[i]<=0)continue;
      const k=i*3;
      powder.life[i]-=dt;
      powder.velocity[k+1]-=4.4*dt;
      powder.velocity[k]*=.994;
      powder.positions[k]+=powder.velocity[k]*dt;
      powder.positions[k+1]+=powder.velocity[k+1]*dt;
      powder.positions[k+2]+=(powder.velocity[k+2]+worldSpeed*.18)*dt;
      if(powder.life[i]<=0||powder.positions[k+1]<.015)powder.positions[k+1]=-100;
    }
    powder.geometry.attributes.position.needsUpdate=true;

    contactShadow.position.set(playerX,Math.max(.006,playerY-.108),playerZ+.02);
    const groundAlpha=air?0:THREE.MathUtils.clamp(1-landingPulse*.12,.72,1);
    contactShadow.material.opacity=THREE.MathUtils.lerp(contactShadow.material.opacity,.17*groundAlpha,air?.22:.38);
    const contactScale=1+landingPulse*.12;
    contactShadow.scale.set(1.42*contactScale,.5*contactScale,1);
  }

  return {
    update,
    terrainMaterial:snowMaterials.terrain,
    courseMaterials:{
      trunk:_barkMaterial,
      pine:_pineMaterial,
      rock:_rockMaterial,
      banana:_bananaMaterial,
      ramp:_jumpMaterial,
      log:_logMaterial,
      logEnd:_logEndMaterial
    }
  };
}
