import * as THREE from 'three';
import {createSnowMaterials} from './snowMaterial.js';
import {getSpeedFeel} from './gameplayTuning.js';
import {terrainHeight} from './terrainContact.js';
import {createDayCycle} from './dayCycle.js';
import {createBoundaryMarkers} from './boundaryMarkers.js';
import {createSnowParticles} from './snowParticles.js';
import {createSnowSurfaceDetail} from './snowSurfaceDetail.js';
import {
  COURSE_FLAG_X,
  MOUNTAIN_FIELD_LAYOUTS,
  RIDGE_LAYOUTS,
  SCENERY_SIDE_MIN_CENTER_X,
  mountainCenterForSide,
  mountainVisualHalfWidth,
  sideForIndex
} from './environmentCorridor.js';

const _dummy=new THREE.Object3D();
const _instanceColor=new THREE.Color();
const _snowCapGeometry=new THREE.ConeGeometry(.62,.9,10);
const _branchTierGeometry=new THREE.ConeGeometry(1.02,.52,10);
const _branchSnowGeometry=new THREE.ConeGeometry(.98,.16,10);
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
const _jumpMaterial=new THREE.MeshStandardMaterial({color:0x42bddf,roughness:.39,metalness:.02,emissive:0x063947,emissiveIntensity:.21});
const _jumpStripeMaterial=new THREE.MeshStandardMaterial({color:0xffd943,roughness:.32,emissive:0x754000,emissiveIntensity:.48});
const _jumpEntryMaterial=new THREE.MeshStandardMaterial({color:0xe9fbff,roughness:.42,emissive:0x164e5c,emissiveIntensity:.14});
const _jumpSideMaterial=new THREE.MeshStandardMaterial({color:0x17647e,roughness:.58,metalness:.02});
const _logSnowMaterial=new THREE.MeshStandardMaterial({color:0xf7fcff,roughness:.94});
const _barkMaterial=new THREE.MeshStandardMaterial({color:0x5b3826,roughness:.92});
const _barkDarkMaterial=new THREE.MeshStandardMaterial({color:0x3b2419,roughness:.96});
const _pineMaterial=new THREE.MeshStandardMaterial({color:0x0f5148,roughness:.86});
const _pineMaterial2=new THREE.MeshStandardMaterial({color:0x17665a,roughness:.88});
const _rockMaterial=new THREE.MeshStandardMaterial({color:0x455f6c,roughness:.90});
const _rockAccentMaterial=new THREE.MeshStandardMaterial({color:0x344c58,roughness:.95});
const _bananaMaterial=new THREE.MeshStandardMaterial({color:0xffd32f,roughness:.36,emissive:0x784500,emissiveIntensity:.19});
const _logMaterial=new THREE.MeshStandardMaterial({color:0x603821,roughness:.91});
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
  material.userData.atmosphereRole='mountain';
  const mesh=new THREE.Mesh(ridgeGeometry(width,height,-height*.46,segments,seed),material);
  mesh.position.set(0,y,z);
  mesh.renderOrder=-20;
  return mesh;
}

function createSideRidgePair({width,height,y,z,color,opacity,seed,segments=26,innerEdge}){
  const group=new THREE.Group();
  const center=innerEdge+width*.5;
  for(const side of [-1,1]){
    const ridge=createRidge(width,height,y,z,color,opacity,seed+(side>0?17.3:0),segments);
    ridge.position.x=side*center;
    ridge.userData.corridorSide=side;
    group.add(ridge);
  }
  return group;
}

function createMountainField({count,z,outerEdge,exclusionHalfWidth,baseY,heightMin,heightMax,widthMin,widthMax,color,snowColor,seed}){
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
  mountainMaterial.userData.atmosphereRole='mountain';
  const capMaterial=new THREE.MeshStandardMaterial({
    color:snowColor,
    roughness:.96,
    metalness:0,
    flatShading:true
  });
  capMaterial.userData.atmosphereRole='snowcap';

  const mountains=new THREE.InstancedMesh(mountainGeometry,mountainMaterial,count);
  const caps=new THREE.InstancedMesh(capGeometry,capMaterial,count);
  mountains.receiveShadow=false;
  caps.receiveShadow=false;

  for(let i=0;i<count;i++){
    const side=sideForIndex(i);
    const depth=(wave(seed+i*4.73)-.5)*15;
    const h=heightMin+wave(seed+i*5.91)*(heightMax-heightMin);
    const w=widthMin+wave(seed+i*7.31)*(widthMax-widthMin);
    const ry=(wave(seed+i*3.37)-.5)*.44;
    const visualHalfWidth=mountainVisualHalfWidth(w,w*.74,ry);
    const x=mountainCenterForSide({
      side,
      visualHalfWidth,
      exclusionHalfWidth,
      outerEdge,
      jitter01:wave(seed+i*2.17)
    });
    const peakZ=z+depth;
    setInstance(mountains,i,x,baseY+h*.5,peakZ,w,h,w*.74,ry);
    setInstance(caps,i,x,baseY+h*.83,peakZ-.02,w*.62,h*.34,w*.46,ry);
  }

  mountains.instanceMatrix.needsUpdate=true;
  caps.instanceMatrix.needsUpdate=true;
  group.userData.exclusionHalfWidth=exclusionHalfWidth;
  group.userData.outerEdge=outerEdge;
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

function createDistantForest(count,seed=81){
  const geometry=new THREE.ConeGeometry(1,2.8,7);
  const material=new THREE.MeshStandardMaterial({
    color:0x315861,
    roughness:1,
    metalness:0,
    flatShading:true
  });
  material.userData.atmosphereRole='mountain';
  const mesh=new THREE.InstancedMesh(geometry,material,count);
  mesh.frustumCulled=false;

  for(let i=0;i<count;i++){
    const side=i%2===0?-1:1;
    const rank=Math.floor(i/2);
    const x=side*(15+wave(i*2.91+seed)*43+rank*.18);
    const z=-64-wave(i*4.77+seed)*42;
    const h=1.0+wave(i*6.13+seed)*1.6;
    const w=.72+wave(i*8.21+seed)*.70;
    setInstance(mesh,i,x,-3.2+h*.55,z,w,h,w,wave(i*3.31+seed)*Math.PI);
  }
  mesh.instanceMatrix.needsUpdate=true;
  return mesh;
}

function createDistantValley(material){
  const xSegments=24;
  const zSegments=14;
  const width=220;
  const zNear=-172;
  const zFar=-268;
  const positions=[];
  const uvs=[];
  const indices=[];

  for(let zi=0;zi<=zSegments;zi++){
    const t=zi/zSegments;
    const z=THREE.MathUtils.lerp(zNear,zFar,t);
    for(let xi=0;xi<=xSegments;xi++){
      const u=xi/xSegments;
      const nx=u*2-1;
      const x=nx*width*.5;
      const side=Math.pow(Math.abs(nx),1.55);
      const y=
        -1.0-t*7.1+
        side*(5.5+t*4.6)+
        Math.sin(x*.043+z*.031)*.20+
        Math.sin(z*.064)*.12;
      positions.push(x,y,z);
      uvs.push(u*8,t*4);
    }
  }

  const stride=xSegments+1;
  for(let z=0;z<zSegments;z++){
    for(let x=0;x<xSegments;x++){
      const a=z*stride+x;
      const b=a+1;
      const c=a+stride;
      const d=c+1;
      indices.push(a,c,b,b,c,d);
    }
  }

  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const mesh=new THREE.Mesh(geometry,material);
  mesh.receiveShadow=true;
  mesh.frustumCulled=false;
  mesh.renderOrder=-8;
  return mesh;
}

function createMovingInstances(count,mesh,makeEntry){
  const entries=new Array(count);
  for(let i=0;i<count;i++)entries[i]=makeEntry(i);
  return {mesh,entries};
}

function resetBank(entry,i,deep=false){
  const side=entry.side??sideForIndex(i);
  entry.side=side;
  entry.x=side*((deep?20:15.5)+wave(i*2.7+11)*(deep?34:22));
  entry.z=-12-wave(i*4.1+21)*215;
  entry.sx=(deep?5.2:2.4)+wave(i*3.4+5)*(deep?7.8:3.8);
  entry.sy=(deep?.62:.14)+wave(i*7.1+9)*(deep?1.55:.32);
  entry.sz=(deep?3.2:.9)+wave(i*5.7+4)*(deep?7.2:2.2);
  entry.y=deep?(-.78+wave(i*6.9+15)*.36):(-.28+wave(i*4.2+17)*.14);
  entry.ry=wave(i*8.4+2)*Math.PI;
}

function resetTree(entry,i){
  const cluster=Math.floor(i/6);
  const within=i%6;
  const side=entry.side??sideForIndex(cluster);
  entry.side=side;
  const clusterZ=-16-wave(cluster*4.91+8)*224;
  const clusterX=side*(SCENERY_SIDE_MIN_CENTER_X+4+wave(cluster*2.7+4)*30);
  entry.x=clusterX+(wave(i*5.37+1)-.5)*(8.2+within*.42);
  if(Math.abs(entry.x)<SCENERY_SIDE_MIN_CENTER_X)entry.x=side*SCENERY_SIDE_MIN_CENTER_X;
  entry.z=clusterZ+(wave(i*6.91+8)-.5)*15.5;
  entry.s=.60+wave(i*4.17+3)*1.22;
  entry.width=.80+wave(i*9.13+12)*.38;
  entry.trunk=.86+wave(i*6.47+15)*.26;
  entry.variant=Math.min(3,Math.floor(wave(i*11.19+5)*4));
  entry.snow=.46+wave(i*7.63+29)*.54;
  entry.asym=(wave(i*5.83+41)-.5)*.22;
  entry.lean=(wave(i*3.41+37)-.5)*.045;
  entry.ry=wave(i*2.61+6)*Math.PI*2;
  entry.phase=wave(i*8.23+17)*Math.PI*2;

  const young=entry.variant===0;
  const large=entry.variant===2;
  const heavy=entry.variant===3;
  entry.heightScale=young?.90:(large?1.15:(heavy?1.06:1));
  entry.widthScale=entry.width*(young?.72:(large?1.16:(heavy?1.08:1)));
  entry.snowScale=entry.snow*(heavy?1.20:(young?.62:1));
  entry.asymScaled=entry.asym*entry.s;
  entry.trunkScale=entry.s*entry.trunk;
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
  return {
    count,positions,initialPositions:positions.slice(),fall,sway,
    geometry,points,xSpread,zMin,zMax,ground
  };
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
    for(const [y,s,ry] of [[1.22,1.12,.10],[1.88,.96,-.12],[2.55,.78,.16]]){
      const tier=new THREE.Mesh(_branchTierGeometry,ry>0?_pineMaterial2:_pineMaterial);
      tier.position.set(ry*.18,y,ry*.08);
      tier.rotation.y=ry;
      tier.scale.set(s,1,s*.94);
      tier.castShadow=true;
      root.add(tier);
    }
    for(const [y,s,ry] of [[1.58,1.02,.08],[2.28,.82,-.10],[2.92,.62,.13]]){
      const shelf=new THREE.Mesh(_branchSnowGeometry,_snowDetailMaterial);
      shelf.position.set(ry*.10,y,ry*.05);
      shelf.rotation.y=ry;
      shelf.scale.set(s,.90,s*.94);
      shelf.castShadow=true;
      root.add(shelf);
    }
    const cap=new THREE.Mesh(_snowCapGeometry,_snowDetailMaterial);
    cap.position.y=3.30;
    cap.scale.set(.58,.58,.58);
    cap.castShadow=true;
    root.add(cap);
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
  scene.fog=new THREE.Fog(0xd8eef7,44,202);
  renderer.toneMappingExposure=1.03;

  const snowMaterials=createSnowMaterials(renderer);

  const sky=makeSky();
  scene.add(sky);

  const atmosphere=new THREE.Group();
  scene.add(atmosphere);
  const distantValley=createDistantValley(snowMaterials.bank);
  scene.add(distantValley);
  atmosphere.add(
    createSideRidgePair({
      ...RIDGE_LAYOUTS.far,height:43,y:1.1,z:-190,
      color:0xd3e2e8,opacity:.52,seed:1.2,segments:44
    }),
    createSideRidgePair({
      ...RIDGE_LAYOUTS.midFar,height:39,y:-.3,z:-164,
      color:0xbfd4dd,opacity:.62,seed:2.4,segments:40
    }),
    createSideRidgePair({
      ...RIDGE_LAYOUTS.mid,height:33,y:-1.8,z:-132,
      color:0x94b3c0,opacity:.74,seed:5.9,segments:36
    }),
    createSideRidgePair({
      ...RIDGE_LAYOUTS.near,height:25,y:-3.1,z:-101,
      color:0x6d91a1,opacity:.84,seed:9.1,segments:30
    }),
    createMountainField({
      count:12,z:-166,...MOUNTAIN_FIELD_LAYOUTS.far,baseY:-5.6,
      heightMin:30,heightMax:47,widthMin:18,widthMax:30,
      color:0x9bb8c5,snowColor:0xe8f4f8,seed:12.4
    }),
    createMountainField({
      count:11,z:-132,...MOUNTAIN_FIELD_LAYOUTS.midFar,baseY:-5.3,
      heightMin:25,heightMax:38,widthMin:16,widthMax:25,
      color:0x708f9d,snowColor:0xf2f9fc,seed:31.7
    }),
    createMountainField({
      count:9,z:-99,...MOUNTAIN_FIELD_LAYOUTS.mid,baseY:-5.0,
      heightMin:19,heightMax:30,widthMin:13,widthMax:21,
      color:0x536f7b,snowColor:0xf7fcff,seed:47.2
    }),
    createMountainField({
      count:7,z:-73,...MOUNTAIN_FIELD_LAYOUTS.near,baseY:-5.6,
      heightMin:14,heightMax:22,widthMin:11,widthMax:17,
      color:0x3f606f,snowColor:0xf8fcff,seed:64.8
    }),
    createDistantForest(52,81)
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
  Object.assign(sun.shadow.camera,{left:-23,right:23,top:20,bottom:-9,near:.5,far:52});
  scene.add(sun);

  const rim=new THREE.DirectionalLight(0xb8e5fb,.50);
  rim.position.set(11,8,-10);
  scene.add(rim);

  const fill=new THREE.DirectionalLight(0xdff4ff,.24);
  fill.position.set(-6,5,-7);
  scene.add(fill);

  const bankGeometry=new THREE.SphereGeometry(1,14,8);
  const bankMesh=new THREE.InstancedMesh(bankGeometry,snowMaterials.bank,54);
  bankMesh.castShadow=true;
  bankMesh.receiveShadow=true;
  bankMesh.frustumCulled=false;
  world.add(bankMesh);
  const windMesh=new THREE.InstancedMesh(bankGeometry,snowMaterials.shadowBank,38);
  windMesh.receiveShadow=true;
  windMesh.frustumCulled=false;
  world.add(windMesh);
  const banks=createMovingInstances(54,bankMesh,i=>{const e={};resetBank(e,i,true);return e;});
  const windBanks=createMovingInstances(38,windMesh,i=>{const e={};resetBank(e,i,false);return e;});

  const treeCount=152;
  const trunkMesh=new THREE.InstancedMesh(new THREE.CylinderGeometry(.15,.30,2.05,8),_barkMaterial,treeCount);
  const branchGeo=new THREE.ConeGeometry(1.04,1.05,9);
  const crownGeo=new THREE.ConeGeometry(.70,1.40,9);
  const snowGeo=new THREE.ConeGeometry(.98,.18,9);
  const foliageLower=new THREE.InstancedMesh(branchGeo,_pineMaterial,treeCount);
  const foliageLowMid=new THREE.InstancedMesh(branchGeo,_pineMaterial2,treeCount);
  const foliageMid=new THREE.InstancedMesh(branchGeo,_pineMaterial,treeCount);
  const foliageHighMid=new THREE.InstancedMesh(branchGeo,_pineMaterial2,treeCount);
  const foliageUpper=new THREE.InstancedMesh(crownGeo,_pineMaterial,treeCount);
  const snowShelfLower=new THREE.InstancedMesh(snowGeo,_snowDetailMaterial,treeCount);
  const snowShelfUpper=new THREE.InstancedMesh(snowGeo,_snowDetailMaterial,treeCount);
  const capMesh=new THREE.InstancedMesh(new THREE.ConeGeometry(.60,.82,9),_snowDetailMaterial,treeCount);
  for(const mesh of [trunkMesh,foliageLower,foliageLowMid,foliageMid,foliageHighMid,foliageUpper,snowShelfLower,snowShelfUpper,capMesh]){
    mesh.castShadow=true;
    mesh.receiveShadow=true;
    mesh.frustumCulled=false;
    world.add(mesh);
  }
  const trees=createMovingInstances(treeCount,trunkMesh,i=>{const e={};resetTree(e,i);return e;});

  function applyTreeInstanceColors(){
    for(let i=0;i<trees.entries.length;i++){
      const e=trees.entries[i];
      const variant=e.variant;
      const cool=wave(i*3.77+19);
      const green=variant===0
        ?[.90,.99,.93]
        :variant===2
          ?[.78,.91,.84]
          :variant===3
            ?[.84,.94,.89]
            :[.86,.97,.90];
      _instanceColor.setRGB(
        green[0]*(.94+cool*.06),
        green[1]*(.95+cool*.05),
        green[2]*(.94+cool*.06)
      );
      for(const mesh of [foliageLower,foliageLowMid,foliageMid,foliageHighMid,foliageUpper]){
        mesh.setColorAt(i,_instanceColor);
      }
      _instanceColor.setRGB(.84+cool*.10,.82+cool*.08,.80+cool*.07);
      trunkMesh.setColorAt(i,_instanceColor);
    }
    for(const mesh of [trunkMesh,foliageLower,foliageLowMid,foliageMid,foliageHighMid,foliageUpper]){
      if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    }
  }
  applyTreeInstanceColors();

  const snowLayers=[
    makeSnowLayer(190,.042,.34,35,-62,10,.90,false),
    makeSnowLayer(290,.070,.50,32,-50,12,1.38,false),
    makeSnowLayer(235,.105,.58,29,-38,13,1.86,false),
    makeSnowLayer(310,.050,.52,25,-31,11,.42,true)
  ];
  for(const layer of snowLayers)scene.add(layer.points);
  const snowParticles=createSnowParticles({scene});
  const surfaceDetail=createSnowSurfaceDetail({world,terrainHeight,snowMaterial:snowMaterials.bank});
  const boundaryMarkers=createBoundaryMarkers({world,terrainHeight,limit:COURSE_FLAG_X,countPerSide:18,spacing:15.5});
  const contactShadow=makeContactShadow(scene);
  const dayCycle=createDayCycle({
    scene,sky,fog:scene.fog,hemisphere:ambient,sun,rim,fill,snowMaterials,atmosphere
  });

  let visualTravel=0;
  function refreshBanks(group){
    const {mesh,entries}=group;
    for(let i=0;i<entries.length;i++){
      const e=entries[i];
      const ground=terrainHeight(e.x,e.z-visualTravel);
      setInstance(mesh,i,e.x,ground+e.y,e.z,e.sx,e.sy,e.sz,e.ry);
    }
    mesh.instanceMatrix.needsUpdate=true;
  }

  function refreshTrees(time=0){
    for(let i=0;i<trees.entries.length;i++){
      const e=trees.entries[i],s=e.s;
      const sway=Math.sin(time*.72+e.phase)*.014;
      const height=e.heightScale;
      const width=e.widthScale;
      const snow=e.snowScale;
      const asym=e.asymScaled;
      const lean=e.lean;
      const trunkScale=e.trunkScale;
      const ground=terrainHeight(e.x,e.z-visualTravel);

      setInstance(trunkMesh,i,e.x,ground+.90*trunkScale,e.z,.92*s,1.05*trunkScale,.92*s,e.ry,0,lean);

      setInstance(foliageLower,i,e.x+asym,ground+1.40*s*height,e.z-asym*.18,1.18*s*width,1.00*s,1.12*s*width,e.ry+.04,0,sway*.20+lean);
      setInstance(foliageLowMid,i,e.x-asym*.55,ground+1.93*s*height,e.z+asym*.15,1.04*s*width,.96*s,1.00*s*width,e.ry-.10,0,sway*.35+lean);
      setInstance(foliageMid,i,e.x+asym*.32,ground+2.44*s*height,e.z-asym*.10,.87*s*width,.90*s,.84*s*width,e.ry+.15,0,sway*.52+lean);
      setInstance(foliageHighMid,i,e.x-asym*.24,ground+2.90*s*height,e.z+asym*.08,.69*s*width,.80*s,.67*s*width,e.ry-.17,0,sway*.70+lean);
      setInstance(foliageUpper,i,e.x+asym*.15,ground+3.34*s*height,e.z,.53*s*width,.78*s,.51*s*width,e.ry+.22,0,sway+lean);

      setInstance(snowShelfLower,i,e.x+asym*.40,ground+1.68*s*height,e.z,1.08*s*width*snow,.82*s,1.02*s*width*snow,e.ry+.02,0,sway*.25+lean);
      setInstance(snowShelfUpper,i,e.x-asym*.18,ground+2.63*s*height,e.z,.79*s*width*snow,.78*s,.75*s*width*snow,e.ry-.12,0,sway*.58+lean);
      setInstance(capMesh,i,e.x+asym*.10,ground+3.60*s*height,e.z,.48*s*width*snow,.60*s,.46*s*width*snow,e.ry+.20,0,sway*.90+lean);
    }
    trunkMesh.instanceMatrix.needsUpdate=true;
    foliageLower.instanceMatrix.needsUpdate=true;
    foliageLowMid.instanceMatrix.needsUpdate=true;
    foliageMid.instanceMatrix.needsUpdate=true;
    foliageHighMid.instanceMatrix.needsUpdate=true;
    foliageUpper.instanceMatrix.needsUpdate=true;
    snowShelfLower.instanceMatrix.needsUpdate=true;
    snowShelfUpper.instanceMatrix.needsUpdate=true;
    capMesh.instanceMatrix.needsUpdate=true;
  }

  refreshBanks(banks);refreshBanks(windBanks);refreshTrees();

  let time=0;
  function reset(){
    time=0;
    visualTravel=0;
    banks.entries.forEach((entry,index)=>resetBank(entry,index,true));
    windBanks.entries.forEach((entry,index)=>resetBank(entry,index,false));
    trees.entries.forEach((entry,index)=>resetTree(entry,index));
    refreshBanks(banks);refreshBanks(windBanks);refreshTrees();
    for(const layer of snowLayers){
      layer.positions.set(layer.initialPositions);
      layer.geometry.attributes.position.needsUpdate=true;
    }
    snowParticles.reset();
    surfaceDetail.reset();
    boundaryMarkers.reset();
    contactShadow.position.y=-100;
    contactShadow.material.opacity=.16;
    contactShadow.scale.set(1.45,.52,1);
    dayCycle.apply(0);
  }
  function update(dt,worldSpeed,playerX,playerY,playerZ,speed,edge,air,landingPulse,running=true,groundY=playerY,runTime=time){
    time+=dt;
    visualTravel+=worldSpeed*dt;
    sky.position.copy(camera.position);
    dayCycle.apply(runTime);
    snowParticles.setTint(snowMaterials.terrain.color);
    surfaceDetail.moundMaterial.color.copy(snowMaterials.bank.color);
    surfaceDetail.ridgeMaterial.color.copy(snowMaterials.shadowBank.color);
    _snowDetailMaterial.color.copy(snowMaterials.bank.color);
    _rockSnowMaterial.color.copy(snowMaterials.bank.color);
    _logSnowMaterial.color.copy(snowMaterials.bank.color);
    for(const layer of snowLayers)layer.points.material.color.copy(snowMaterials.terrain.color);

    for(let i=0;i<banks.entries.length;i++){
      const e=banks.entries[i];e.z+=worldSpeed*dt;
      if(e.z>22){resetBank(e,i,true);e.z=-218-wave(time+i)*50;}
    }
    for(let i=0;i<windBanks.entries.length;i++){
      const e=windBanks.entries[i];e.z+=worldSpeed*dt;
      if(e.z>20){resetBank(e,i,false);e.z=-216-wave(time*1.7+i)*54;}
    }
    refreshBanks(banks);refreshBanks(windBanks);

    for(let i=0;i<trees.entries.length;i++){
      const e=trees.entries[i];e.z+=worldSpeed*dt;
      if(e.z>24){resetTree(e,i);e.z=-220-wave(time*.9+i)*56;}
    }
    refreshTrees(time);

    const speed01=getSpeedFeel(speed);
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
            p[k+1]=groundY-.06+wave(i*2.8+time)*(.65+speed01*.65);
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

    snowParticles.spray(dt,playerX,playerY,playerZ,speed,edge,air,landingPulse,running);
    snowParticles.update(dt,worldSpeed);
    surfaceDetail.update(dt,worldSpeed);
    boundaryMarkers.update(dt,worldSpeed);

    contactShadow.position.set(playerX,Math.max(.006,groundY-.108),playerZ+.02);
    const groundAlpha=air?0:THREE.MathUtils.clamp(1-landingPulse*.12,.72,1);
    contactShadow.material.opacity=THREE.MathUtils.lerp(contactShadow.material.opacity,.19*groundAlpha,1-Math.pow(1-(air?.22:.38),dt*60));
    const contactScale=1+landingPulse*.12;
    contactShadow.scale.set(1.42*contactScale,.5*contactScale,1);
  }

  return {
    update,
    reset,
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
