import * as THREE from 'three';
import {createSnowMaterials} from './snowMaterial.js';

const _dummy=new THREE.Object3D();
const _snowCapGeometry=new THREE.ConeGeometry(.62,.9,10);
const _rockCapGeometry=new THREE.DodecahedronGeometry(.5,1);
const _rockAccentGeometry=new THREE.DodecahedronGeometry(.43,0);
const _haloGeometry=new THREE.TorusGeometry(.56,.018,6,32);
const _stripeGeometry=new THREE.BoxGeometry(.68,.045,.13);
const _lipGeometry=new THREE.BoxGeometry(2.34,.07,.14);
const _entryGeometry=new THREE.BoxGeometry(2.32,.055,.12);
const _rampRailGeometry=new THREE.BoxGeometry(.085,.10,2.98);
const _logSnowGeometry=new THREE.BoxGeometry(1.82,.085,.34);
const _logBandGeometry=new THREE.TorusGeometry(.255,.018,5,12);
const _rampBankGeometry=new THREE.SphereGeometry(1,12,7);
const _snowDetailMaterial=new THREE.MeshPhysicalMaterial({color:0xfbfeff,roughness:.88,metalness:0,clearcoat:.035,clearcoatRoughness:.76});
const _rockSnowMaterial=new THREE.MeshStandardMaterial({color:0xf4fbff,roughness:.96});
const _bananaHaloMaterial=new THREE.MeshBasicMaterial({color:0xffdb45,transparent:true,opacity:.24,depthWrite:false,blending:THREE.AdditiveBlending});
const _jumpMaterial=new THREE.MeshStandardMaterial({color:0x48b8d8,roughness:.42,metalness:.02,emissive:0x063947,emissiveIntensity:.18});
const _jumpStripeMaterial=new THREE.MeshStandardMaterial({color:0xffd642,roughness:.34,emissive:0x6b3600,emissiveIntensity:.42});
const _jumpEntryMaterial=new THREE.MeshStandardMaterial({color:0xe9fbff,roughness:.42,emissive:0x164e5c,emissiveIntensity:.14});
const _jumpSideMaterial=new THREE.MeshStandardMaterial({color:0x17647e,roughness:.58,metalness:.02});
const _logSnowMaterial=new THREE.MeshStandardMaterial({color:0xf7fcff,roughness:.94});
const _barkMaterial=new THREE.MeshStandardMaterial({color:0x5b3826,roughness:.92});
const _barkDarkMaterial=new THREE.MeshStandardMaterial({color:0x3b2419,roughness:.96});
const _pineMaterial=new THREE.MeshStandardMaterial({color:0x0f5148,roughness:.86});
const _pineMaterial2=new THREE.MeshStandardMaterial({color:0x17665a,roughness:.88});
const _rockMaterial=new THREE.MeshStandardMaterial({color:0x526874,roughness:.91});
const _rockAccentMaterial=new THREE.MeshStandardMaterial({color:0x3f535f,roughness:.96});
const _bananaMaterial=new THREE.MeshStandardMaterial({color:0xffd32f,roughness:.38,emissive:0x6a3d00,emissiveIntensity:.16});
const _logMaterial=new THREE.MeshStandardMaterial({color:0x6a402b,roughness:.91});
const _logEndMaterial=new THREE.MeshStandardMaterial({color:0xa8754b,roughness:.92});

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

function createMountainField({count,z,spreadX,baseY,heightMin,heightMax,widthMin,widthMax,color,snowColor,seed}){
  const group=new THREE.Group();
  const mountainGeometry=new THREE.ConeGeometry(1,1,6,1);
  mountainGeometry.rotateY(Math.PI/6);
  const capGeometry=new THREE.ConeGeometry(1,1,6,1);
  capGeometry.rotateY(Math.PI/6);

  const mountainMaterial=new THREE.MeshStandardMaterial({
    color,
    roughness:1,
    metalness:0,
    flatShading:true
  });
  const capMaterial=new THREE.MeshStandardMaterial({
    color:snowColor,
    roughness:.96,
    metalness:0,
    flatShading:true
  });

  const mountains=new THREE.InstancedMesh(mountainGeometry,mountainMaterial,count);
  const caps=new THREE.InstancedMesh(capGeometry,capMaterial,count);
  mountains.receiveShadow=false;
  caps.receiveShadow=false;

  for(let i=0;i<count;i++){
    const t=count===1?.5:i/(count-1);
    const x=(t-.5)*spreadX+(wave(seed+i*2.17)-.5)*spreadX*.13;
    const depth=(wave(seed+i*4.73)-.5)*15;
    const h=heightMin+wave(seed+i*5.91)*(heightMax-heightMin);
    const w=widthMin+wave(seed+i*7.31)*(widthMax-widthMin);
    const ry=(wave(seed+i*3.37)-.5)*.44;
    const peakZ=z+depth;
    setInstance(mountains,i,x,baseY+h*.5,peakZ,w,h,w*.74,ry);
    setInstance(caps,i,x,baseY+h*.83,peakZ-.02,w*.62,h*.34,w*.46,ry);
  }

  mountains.instanceMatrix.needsUpdate=true;
  caps.instanceMatrix.needsUpdate=true;
  group.add(mountains,caps);
  return group;
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
  const cluster=Math.floor(i/6);
  const within=i%6;
  const side=cluster%2===0?-1:1;
  const clusterZ=-16-wave(cluster*4.91+8)*218;
  const clusterX=side*(10.4+wave(cluster*2.7+4)*7.4);
  entry.x=clusterX+(wave(i*5.37+1)-.5)*(4.0+within*.24);
  entry.z=clusterZ+(wave(i*6.91+8)-.5)*14.5;
  entry.s=.58+wave(i*4.17+3)*1.18;
  entry.width=.82+wave(i*9.13+12)*.34;
  entry.ry=wave(i*2.61+6)*Math.PI*2;
  entry.phase=wave(i*8.23+17)*Math.PI*2;
}

function makeSky(){
  const material=new THREE.ShaderMaterial({
    side:THREE.BackSide,
    depthWrite:false,
    uniforms:{
      zenith:{value:new THREE.Color(0x4fa5d6)},
      high:{value:new THREE.Color(0x8bc9e6)},
      horizon:{value:new THREE.Color(0xe2f4fb)},
      sunColor:{value:new THREE.Color(0xfff1c8)}
    },
    vertexShader:'varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0); }',
    fragmentShader:'varying vec3 vDir; uniform vec3 zenith; uniform vec3 high; uniform vec3 horizon; uniform vec3 sunColor; void main(){ float y=clamp(vDir.y*.5+.5,0.0,1.0); vec3 c=mix(horizon,high,smoothstep(.44,.70,y)); c=mix(c,zenith,smoothstep(.68,1.0,y)); vec3 sunDir=normalize(vec3(-.48,.30,-.82)); float sun=pow(max(dot(normalize(vDir),sunDir),0.0),96.0); float haze=pow(1.0-abs(clamp(vDir.y,-1.0,1.0)),5.0); c+=sunColor*sun*.42+vec3(.08,.12,.16)*haze*.16; gl_FragColor=vec4(c,1.0); }'
  });
  const sky=new THREE.Mesh(new THREE.SphereGeometry(190,36,18),material);
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
  const count=480;
  const positions=new Float32Array(count*3);
  const velocity=new Float32Array(count*3);
  const life=new Float32Array(count);
  const maxLife=new Float32Array(count);
  for(let i=0;i<count;i++)positions[i*3+1]=-100;
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const material=new THREE.PointsMaterial({
    color:0xffffff,
    size:.12,
    transparent:true,
    opacity:.66,
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
  const outsideX=x-turnSign*.30;
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
    for(const [y,s] of [[1.92,1.02],[2.62,.82],[3.20,.60]]){
      const cap=new THREE.Mesh(_snowCapGeometry,_snowDetailMaterial);
      cap.position.y=y;
      cap.scale.set(s,.34,s);
      cap.castShadow=true;
      root.add(cap);
    }
  }else if(kind==='rock'){
    const cap=new THREE.Mesh(_rockCapGeometry,_rockSnowMaterial);
    cap.position.set(-.06,.76,-.03);
    cap.scale.set(1.15,.24,.88);
    cap.castShadow=true;
    root.add(cap);

    const accent=new THREE.Mesh(_rockAccentGeometry,_rockAccentMaterial);
    accent.position.set(.12,.33,-.08);
    accent.scale.set(.78,.48,.72);
    accent.rotation.set(.18,.42,-.08);
    root.add(accent);

    root.rotation.y=(wave(root.id*.71)-.5)*.68;
    root.scale.x*=.88+wave(root.id*.37)*.25;
    root.scale.z*=.90+wave(root.id*.51)*.18;
  }else if(kind==='banana'){
    const halo=new THREE.Mesh(_haloGeometry,_bananaHaloMaterial);
    halo.rotation.set(Math.PI/2,0,.35);
    halo.position.y=-.08;
    root.add(halo);
  }else if(kind==='ramp'){
    const deck=root.children[0];
    if(deck?.isMesh)deck.material=_jumpMaterial;
    if(deck){
      for(const z of [.80,.16,-.48]){
        const left=new THREE.Mesh(_stripeGeometry,_jumpStripeMaterial);
        const right=new THREE.Mesh(_stripeGeometry,_jumpStripeMaterial);
        left.position.set(-.22,.148,z);
        right.position.set(.22,.148,z);
        left.rotation.y=.62;
        right.rotation.y=-.62;
        deck.add(left,right);
      }

      const entry=new THREE.Mesh(_entryGeometry,_jumpEntryMaterial);
      entry.position.set(0,.145,1.43);
      deck.add(entry);

      const lip=new THREE.Mesh(_lipGeometry,_jumpStripeMaterial);
      lip.position.set(0,.165,-1.47);
      deck.add(lip);

      for(const side of [-1,1]){
        const rail=new THREE.Mesh(_rampRailGeometry,_jumpSideMaterial);
        rail.position.set(side*1.15,.05,0);
        deck.add(rail);
      }
    }

    for(const side of [-1,1]){
      const bank=new THREE.Mesh(_rampBankGeometry,_snowDetailMaterial);
      bank.position.set(side*1.32,.00,.12);
      bank.scale.set(.35,.17,1.62);
      bank.castShadow=true;
      root.add(bank);
    }
  }else if(kind==='log'){
    const snow=new THREE.Mesh(_logSnowGeometry,_logSnowMaterial);
    snow.position.set(0,.54,-.015);
    snow.rotation.z=.012;
    snow.castShadow=true;
    root.add(snow);

    for(const x of [-.72,.72]){
      const band=new THREE.Mesh(_logBandGeometry,_barkDarkMaterial);
      band.rotation.y=Math.PI/2;
      band.position.set(x,.28,0);
      root.add(band);
    }
  }
  return root;
}

export function createSkiEnvironment({scene,world,renderer,camera}){
  scene.background=new THREE.Color(0xd4edf8);
  scene.fog=new THREE.Fog(0xd8eef7,36,182);
  renderer.toneMappingExposure=1.03;

  const snowMaterials=createSnowMaterials(renderer);

  const sky=makeSky();
  scene.add(sky);

  const atmosphere=new THREE.Group();
  scene.add(atmosphere);
  atmosphere.add(
    createRidge(230,39,-5,-174,0xc9dce5,.62,2.4,40),
    createRidge(194,33,-5,-141,0x9ebdca,.72,5.9,36),
    createRidge(154,25,-6,-106,0x759cae,.82,9.1,30),
    createMountainField({
      count:11,z:-157,spreadX:190,baseY:-9,
      heightMin:27,heightMax:43,widthMin:17,widthMax:28,
      color:0x9bb8c5,snowColor:0xe8f4f8,seed:12.4
    }),
    createMountainField({
      count:10,z:-124,spreadX:154,baseY:-8,
      heightMin:23,heightMax:36,widthMin:15,widthMax:24,
      color:0x708f9d,snowColor:0xf2f9fc,seed:31.7
    }),
    createMountainField({
      count:8,z:-92,spreadX:112,baseY:-7,
      heightMin:18,heightMax:29,widthMin:13,widthMax:20,
      color:0x536f7b,snowColor:0xf7fcff,seed:47.2
    })
  );

  const ambient=new THREE.HemisphereLight(0xe8f8ff,0x6d879a,1.36);
  scene.add(ambient);

  const sun=new THREE.DirectionalLight(0xffedc6,3.15);
  sun.position.set(-9,15,7);
  sun.castShadow=true;
  sun.shadow.mapSize.set(4096,4096);
  sun.shadow.bias=-.00032;
  sun.shadow.normalBias=.022;
  sun.shadow.radius=2.1;
  Object.assign(sun.shadow.camera,{left:-15,right:15,top:19,bottom:-9,near:.5,far:48});
  scene.add(sun);

  const rim=new THREE.DirectionalLight(0xb8e5fb,.50);
  rim.position.set(11,8,-10);
  scene.add(rim);

  const fill=new THREE.DirectionalLight(0xdff4ff,.24);
  fill.position.set(-6,5,-7);
  scene.add(fill);

  const bankGeometry=new THREE.SphereGeometry(1,14,8);
  const bankMesh=new THREE.InstancedMesh(bankGeometry,snowMaterials.bank,42);
  bankMesh.receiveShadow=true;
  world.add(bankMesh);
  const windMesh=new THREE.InstancedMesh(bankGeometry,snowMaterials.shadowBank,30);
  windMesh.receiveShadow=true;
  world.add(windMesh);
  const banks=createMovingInstances(42,bankMesh,i=>{const e={};resetBank(e,i,true);return e;});
  const windBanks=createMovingInstances(30,windMesh,i=>{const e={};resetBank(e,i,false);return e;});

  const treeCount=118;
  const trunkMesh=new THREE.InstancedMesh(new THREE.CylinderGeometry(.16,.29,1.85,8),_barkMaterial,treeCount);
  const foliageGeo=new THREE.ConeGeometry(1.05,2.15,9);
  const foliageLower=new THREE.InstancedMesh(foliageGeo,_pineMaterial,treeCount);
  const foliageMid=new THREE.InstancedMesh(foliageGeo,_pineMaterial2,treeCount);
  const foliageUpper=new THREE.InstancedMesh(foliageGeo,_pineMaterial,treeCount);
  const snowShelf=new THREE.InstancedMesh(new THREE.ConeGeometry(.92,.30,9),_snowDetailMaterial,treeCount);
  const capMesh=new THREE.InstancedMesh(new THREE.ConeGeometry(.70,1.00,9),_snowDetailMaterial,treeCount);
  for(const mesh of [trunkMesh,foliageLower,foliageMid,foliageUpper,snowShelf,capMesh]){
    mesh.castShadow=true;
    mesh.receiveShadow=true;
    world.add(mesh);
  }
  const trees=createMovingInstances(treeCount,trunkMesh,i=>{const e={};resetTree(e,i);return e;});

  const snowLayers=[
    makeSnowLayer(170,.042,.34,23,-62,10,.90,false),
    makeSnowLayer(260,.070,.50,20,-50,12,1.38,false),
    makeSnowLayer(210,.105,.58,18,-38,13,1.86,false),
    makeSnowLayer(260,.050,.50,13,-31,11,.42,true)
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
      const e=trees.entries[i],s=e.s,w=e.width;
      const sway=Math.sin(time*.72+e.phase)*.016;
      setInstance(trunkMesh,i,e.x,.82*s,e.z,.92*s,s,.92*s,e.ry);
      setInstance(foliageLower,i,e.x,1.72*s,e.z,1.10*s*w,1.00*s,1.10*s*w,e.ry,0,sway*.28);
      setInstance(foliageMid,i,e.x,2.35*s,e.z,.90*s*w,.90*s,.90*s*w,e.ry+.11,0,sway*.58);
      setInstance(foliageUpper,i,e.x,2.92*s,e.z,.68*s*w,.78*s,.68*s*w,e.ry+.22,0,sway);
      setInstance(snowShelf,i,e.x,2.52*s,e.z,.86*s*w,.82*s,.86*s*w,e.ry+.10,0,sway*.50);
      setInstance(capMesh,i,e.x,3.26*s,e.z,.58*s*w,.60*s,.58*s*w,e.ry+.22,0,sway*.88);
    }
    trunkMesh.instanceMatrix.needsUpdate=true;
    foliageLower.instanceMatrix.needsUpdate=true;
    foliageMid.instanceMatrix.needsUpdate=true;
    foliageUpper.instanceMatrix.needsUpdate=true;
    snowShelf.instanceMatrix.needsUpdate=true;
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
      const straight=speed01*.15;
      powder.emitCarry+=dt*(straight+carve*(1.08+speed01*.88))*38;
      const emit=Math.min(14,Math.floor(powder.emitCarry));
      if(emit>0){
        emitPowder(powder,playerX,playerY,playerZ,edge,speed,emit,false);
        powder.emitCarry-=emit;
      }
    }
    if(landingPulse>.18&&powder.lastLanding<=.18){
      emitPowder(powder,playerX,playerY,playerZ,edge,speed,34+Math.floor(speed01*12),true);
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
    contactShadow.material.opacity=THREE.MathUtils.lerp(contactShadow.material.opacity,.19*groundAlpha,air?.22:.38);
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
