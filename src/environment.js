import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {makeSerratedFirGeometry,makeBarkTexture} from './alpineArt.js';
import {createSnowMaterials} from './snowMaterial.js';
import {getSpeedFeel} from './gameplayTuning.js';
import {terrainHeight} from './terrainContact.js';
import {createDayCycle} from './dayCycle.js';
import {createBoundaryMarkers} from './boundaryMarkers.js';
import {createSnowParticles} from './snowParticles.js';
import {createSnowSurfaceDetail} from './snowSurfaceDetail.js';
import {createMountainBands} from './mountainBands.js';
import {createAmbientFlybys} from './ambientFlybys.js';
import {
  COURSE_FLAG_X,
  MOUNTAIN_FIELD_LAYOUTS,
  RIDGE_LAYOUTS,
  SCENERY_SIDE_MIN_CENTER_X,
  mountainCenterForSide,
  mountainVisualHalfWidth,
  sideForIndex
} from './environmentCorridor.js';

// clearHorizon contract: mountains stay on left/right sides outside the central exclusion corridor; recycled scenery preserves side assignment.

const _dummy=new THREE.Object3D();
const _instanceColor=new THREE.Color();
const _snowCapGeometry=new THREE.ConeGeometry(.64,.92,12);
const _branchTierGeometry=makeSerratedFirGeometry(1.06,.94,12,1.7);
const _branchInnerGeometry=makeSerratedFirGeometry(.82,.82,12,3.4);
const _branchSnowGeometry=new THREE.ConeGeometry(1.00,.17,12);
const _trunkCollarGeometry=new THREE.CylinderGeometry(.34,.39,.18,12);
const _rockAccentGeometry=new THREE.DodecahedronGeometry(.43,0);
const _stripeGeometry=new THREE.BoxGeometry(.68,.045,.13);
const _lipGeometry=new THREE.BoxGeometry(2.34,.07,.14);
const _entryGeometry=new THREE.BoxGeometry(2.32,.055,.12);
const _rampRailGeometry=new THREE.BoxGeometry(.085,.10,2.98);
const _logSnowGeometry=new THREE.CylinderGeometry(.075,.11,1,12,1,false);
const _logBandGeometry=new THREE.TorusGeometry(.265,.020,6,16);
const _logKnotGeometry=new THREE.CylinderGeometry(.070,.090,.028,12);
const _rampBankGeometry=new THREE.SphereGeometry(1,12,7);
const _snowDetailMaterial=new THREE.MeshPhysicalMaterial({color:0xfbfeff,roughness:.74,metalness:0,clearcoat:.14,clearcoatRoughness:.56,sheen:.28,sheenColor:new THREE.Color(0xd7f2ff),sheenRoughness:.68});
const _jumpMaterial=new THREE.MeshStandardMaterial({color:0x42bddf,roughness:.39,metalness:.02,emissive:0x063947,emissiveIntensity:.21});
const _jumpStripeMaterial=new THREE.MeshStandardMaterial({color:0xffd943,roughness:.32,emissive:0x754000,emissiveIntensity:.48});
const _jumpEntryMaterial=new THREE.MeshStandardMaterial({color:0xe9fbff,roughness:.42,emissive:0x164e5c,emissiveIntensity:.14});
const _jumpSideMaterial=new THREE.MeshStandardMaterial({color:0x17647e,roughness:.58,metalness:.02});
const _logSnowMaterial=new THREE.MeshPhysicalMaterial({color:0xf9fdff,roughness:.74,metalness:0,clearcoat:.12,clearcoatRoughness:.58,sheen:.18,sheenColor:new THREE.Color(0xdff6ff)});
const _barkTexture=makeBarkTexture();
const _barkMaterial=new THREE.MeshStandardMaterial({color:0x87583b,map:_barkTexture,roughness:.78,metalness:0,flatShading:true});
const _barkDarkMaterial=new THREE.MeshStandardMaterial({color:0x4a2d20,map:_barkTexture,roughness:.91,metalness:0,flatShading:true});
const _pineMaterial=new THREE.MeshStandardMaterial({color:0x0d594b,roughness:.72,metalness:0,flatShading:true});
const _pineMaterial2=new THREE.MeshStandardMaterial({color:0x16705f,roughness:.74,metalness:0,flatShading:true});
const _rockMaterial=new THREE.MeshStandardMaterial({color:0x455f6c,roughness:.90});
const _rockAccentMaterial=new THREE.MeshStandardMaterial({color:0x344c58,roughness:.95});
const _bananaMaterial=new THREE.MeshStandardMaterial({color:0xffd32f,roughness:.36,emissive:0x784500,emissiveIntensity:.19});
const _logMaterial=new THREE.MeshStandardMaterial({color:0x77482c,roughness:.76,metalness:0,flatShading:true});
const _logEndMaterial=new THREE.MeshStandardMaterial({color:0xc08b58,roughness:.80,metalness:0,flatShading:true});

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

function createLateralMountainRun({
  segments=28,
  zNear=-24,
  zFar=-274,
  innerEdge=25.5,
  outerEdge=76,
  baseY=-5.0,
  heightMin=12,
  heightMax=20,
  widthMin=10,
  widthMax=16,
  color=0x496a78,
  snowColor=0xf4f9fb,
  seed=93.4,
  speedFactor=.94
}={}){
  const count=segments*2;
  const group=new THREE.Group();
  const mountainGeometry=new THREE.ConeGeometry(1,1,7,1);
  const capGeometry=new THREE.ConeGeometry(1,1,7,1);
  mountainGeometry.rotateY(Math.PI/7);
  capGeometry.rotateY(Math.PI/7);

  const mountainMaterial=new THREE.MeshStandardMaterial({
    color,roughness:.94,metalness:0,flatShading:true
  });
  const capMaterial=new THREE.MeshPhysicalMaterial({
    color:snowColor,roughness:.88,metalness:0,flatShading:true,
    clearcoat:.04,clearcoatRoughness:.78
  });
  mountainMaterial.userData.atmosphereRole='mountain';
  capMaterial.userData.atmosphereRole='snowcap';

  const mountains=new THREE.InstancedMesh(mountainGeometry,mountainMaterial,count);
  const caps=new THREE.InstancedMesh(capGeometry,capMaterial,count);
  mountains.frustumCulled=false;
  caps.frustumCulled=false;

  const entries=new Array(count);
  const span=Math.max(48,Math.abs(zFar-zNear));
  const recycleNear=Math.max(24,zNear+38);

  function configureEntry(entry,index,generation,z){
    const segment=Math.floor(index/2);
    const side=sideForIndex(index);
    const cycleSeed=seed+segment*6.71+side*2.37+generation*31.17;
    const h=heightMin+wave(cycleSeed+5.31)*(heightMax-heightMin);
    const w=widthMin+wave(cycleSeed+7.13)*(widthMax-widthMin);
    const ry=(wave(cycleSeed+4.17)-.5)*.34;
    const depth=w*(.68+wave(cycleSeed+8.91)*.10);
    const visualHalfWidth=mountainVisualHalfWidth(w,depth,ry);
    const x=mountainCenterForSide({
      side,
      visualHalfWidth,
      exclusionHalfWidth:innerEdge,
      outerEdge,
      jitter01:wave(cycleSeed+8.37)
    });
    Object.assign(entry,{side,generation,x,z,h,w,depth,ry});
  }

  function writeEntry(entry,index){
    setInstance(mountains,index,entry.x,baseY+entry.h*.5,entry.z,entry.w,entry.h,entry.depth,entry.ry);
    setInstance(caps,index,entry.x,baseY+entry.h*.83,entry.z-.02,entry.w*.59,entry.h*.32,entry.depth*.60,entry.ry);
  }

  function refresh(){
    for(let i=0;i<entries.length;i++)writeEntry(entries[i],i);
    mountains.instanceMatrix.needsUpdate=true;
    caps.instanceMatrix.needsUpdate=true;
  }

  function reset(){
    for(let segment=0;segment<segments;segment++){
      const t=segments<=1?0:segment/(segments-1);
      const baseZ=THREE.MathUtils.lerp(zNear,zFar,t)+(wave(seed+segment*3.19)-.5)*7.5;
      for(let sideSlot=0;sideSlot<2;sideSlot++){
        const index=segment*2+sideSlot;
        const entry=entries[index]||{};
        configureEntry(entry,index,0,baseZ);
        entries[index]=entry;
      }
    }
    refresh();
  }

  function update(dt,worldSpeed){
    const dz=worldSpeed*dt*speedFactor;
    if(!Number.isFinite(dz)||Math.abs(dz)<1e-7)return;
    for(let i=0;i<entries.length;i++){
      const entry=entries[i];
      entry.z+=dz;
      if(entry.z>recycleNear){
        const side=entry.side; // recycling preserves the left/right side assignment.
        const generation=entry.generation+1;
        let recycledZ=entry.z-span;
        while(recycledZ>recycleNear)recycledZ-=span;
        configureEntry(entry,i,generation,recycledZ);
        entry.side=side;
      }
    }
    refresh();
  }

  group.userData.exclusionHalfWidth=innerEdge;
  group.userData.outerEdge=outerEdge;
  group.userData.lateralRun=true;
  group.userData.streaming=true;
  group.add(mountains,caps);
  reset();
  return {group,entries,update,reset};
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
    const x=side*(COURSE_FLAG_X+10.5+wave(i*2.91+seed)*42+rank*.14);
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
  const clusterZ=-8-wave(cluster*4.91+8)*252;
  const clusterX=side*(SCENERY_SIDE_MIN_CENTER_X+4+wave(cluster*2.7+4)*30);
  entry.x=clusterX+(wave(i*5.37+1)-.5)*(8.2+within*.42);
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

  // Keep the complete crown, not just the trunk center, visually outside the ski corridor.
  const crownHalfWidth=1.24*entry.s*entry.widthScale+Math.abs(entry.asymScaled);
  const minTreeCenter=Math.max(SCENERY_SIDE_MIN_CENTER_X,COURSE_FLAG_X+8.75+crownHalfWidth);
  if(Math.abs(entry.x)<minTreeCenter)entry.x=side*minTreeCenter;
}

function makeSky(){
  const material=new THREE.ShaderMaterial({
    side:THREE.BackSide,
    depthWrite:false,
    uniforms:{
      zenith:{value:new THREE.Color(0x4fa5d6)},
      high:{value:new THREE.Color(0x8bc9e6)},
      horizon:{value:new THREE.Color(0xe2f4fb)},
      sunColor:{value:new THREE.Color(0xfff1c8)},
      time:{value:0}
    },
    vertexShader:'varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0); }',
    fragmentShader:'varying vec3 vDir; uniform vec3 zenith; uniform vec3 high; uniform vec3 horizon; uniform vec3 sunColor; uniform float time; float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); } float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x),f.y); } float fbm(vec2 p){ float v=0.0,a=.55; for(int i=0;i<3;i++){ v+=noise(p)*a; p=p*2.03+vec2(7.1,3.7); a*=.48; } return v; } void main(){ vec3 d=normalize(vDir); float y=clamp(d.y*.5+.5,0.0,1.0); vec3 c=mix(horizon,high,smoothstep(.38,.67,y)); c=mix(c,zenith,smoothstep(.66,1.0,y)); float horizonGlow=pow(1.0-clamp(abs(d.y),0.0,1.0),5.5); c+=mix(horizon,sunColor,.45)*horizonGlow*.10; vec3 sunDir=normalize(vec3(-.48,.30,-.82)); float sun=pow(max(dot(d,sunDir),0.0),112.0); c+=sunColor*sun*.44; float a=atan(d.z,d.x); vec2 cp=vec2(a*1.85+d.y*.72,d.y*7.4); float drift=time*.006; float cloudA=fbm(cp+vec2(drift,-drift*.24)); float cloudB=fbm(cp*1.72+vec2(-drift*.62,9.3)); float cloudNoise=mix(cloudA,cloudB,.34); float cloudBand=smoothstep(.49,.59,y)*(1.0-smoothstep(.83,.94,y)); float cloud=smoothstep(.57,.76,cloudNoise)*cloudBand; vec3 cloudTint=mix(high,vec3(1.0),.58); c=mix(c,cloudTint,cloud*.48); float veil=smoothstep(.52,.70,cloudA)*cloudBand*.08; c=mix(c,cloudTint,veil); gl_FragColor=vec4(c,1.0); }'
  });
  const sky=new THREE.Mesh(new THREE.SphereGeometry(220,40,20),material);
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
    const collar=new THREE.Mesh(_trunkCollarGeometry,_barkDarkMaterial);
    collar.position.y=.16;
    collar.scale.set(1,.78,1);
    collar.castShadow=true;
    root.add(collar);

    for(const [y,s,ry,rz] of [[1.10,1.18,.10,.035],[1.62,1.08,-.14,-.028],[2.12,.94,.17,.022],[2.68,.74,-.11,-.018]]){
      const tier=new THREE.Mesh(_branchTierGeometry,ry>0?_pineMaterial2:_pineMaterial);
      tier.position.set(ry*.22,y,ry*.10);
      tier.rotation.set(0,ry,rz);
      tier.scale.set(s,1,s*.92);
      tier.castShadow=true;
      root.add(tier);
    }
    for(const [y,s,ry] of [[1.38,.86,-.19],[2.35,.67,.22]]){
      const inner=new THREE.Mesh(_branchInnerGeometry,_pineMaterial);
      inner.position.set(-ry*.24,y,ry*.16);
      inner.rotation.y=ry;
      inner.scale.set(s,1,s*.88);
      inner.castShadow=true;
      root.add(inner);
    }
    for(const [y,s,ry] of [[1.45,1.08,.08],[2.05,.92,-.10],[2.67,.70,.13]]){
      const shelf=new THREE.Mesh(_branchSnowGeometry,_snowDetailMaterial);
      shelf.position.set(ry*.12,y,ry*.07);
      shelf.rotation.y=ry;
      shelf.scale.set(s,.92,s*.92);
      shelf.castShadow=true;
      root.add(shelf);
    }
    const cap=new THREE.Mesh(_snowCapGeometry,_snowDetailMaterial);
    cap.position.set(.025,3.28,-.015);
    cap.rotation.z=.018;
    cap.scale.set(.60,.62,.58);
    cap.castShadow=true;
    root.add(cap);
  }else if(kind==='rock'){
    const accent=new THREE.Mesh(_rockAccentGeometry,_rockAccentMaterial);
    accent.position.set(.12,.33,-.08);
    accent.scale.set(.78,.48,.72);
    accent.rotation.set(.18,.42,-.08);
    root.add(accent);

    root.rotation.y=(wave(root.id*.71)-.5)*.68;
    root.scale.x*=.88+wave(root.id*.37)*.25;
    root.scale.z*=.90+wave(root.id*.51)*.18;
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
  }else if(kind==='log'||kind==='wideLog'){
    const wide=kind==='wideLog';
    if(!wide){
      const snow=new THREE.Mesh(_logSnowGeometry,_logSnowMaterial);
      snow.position.set(0,.545,-.015);
      snow.rotation.z=Math.PI/2;
      snow.scale.set(1.05,2.58,2.30);
      snow.castShadow=true;
      root.add(snow);
    }

    const bandXs=wide?[-2.18,0,2.18]:[-.92,.92];
    for(const x of bandXs){
      const band=new THREE.Mesh(_logBandGeometry,_barkDarkMaterial);
      band.rotation.y=Math.PI/2;
      band.position.set(x,wide?.35:.28,0);
      band.scale.setScalar(wide?1.30:1);
      band.castShadow=true;
      root.add(band);
    }

    const knotSpecs=wide?[[-1.25,.41,.30],[1.34,.40,.30]]:[[-.42,.33,.235],[.58,.31,.24]];
    for(const [x,y,z] of knotSpecs){
      const knot=new THREE.Mesh(_logKnotGeometry,_logEndMaterial);
      knot.position.set(x,y,z);
      knot.rotation.x=Math.PI/2;
      knot.rotation.z=(wave(root.id+x*2.7)-.5)*.45;
      knot.scale.set(1.05,1,wide?1.20:1);
      knot.castShadow=true;
      root.add(knot);
    }
  }
  return root;
}

export function createSkiEnvironment({scene,world,renderer,camera}){
  scene.background=new THREE.Color(0xd4edf8);
  scene.fog=new THREE.Fog(0xd8eef7,48,268);
  renderer.toneMappingExposure=1.11;

  // Give metallic/dark Chimpions a stable reflected world without changing any
  // character mesh or material. The PMREM is generated once at environment init.
  const pmrem=new THREE.PMREMGenerator(renderer);
  const reflectionScene=new RoomEnvironment();
  const reflectionTarget=pmrem.fromScene(reflectionScene,.035);
  scene.environment=reflectionTarget.texture;
  scene.environmentIntensity=.72;
  pmrem.dispose();

  const snowMaterials=createSnowMaterials(renderer);

  const sky=makeSky();
  scene.add(sky);
  const ambientFlybys=createAmbientFlybys({scene,camera});

  const atmosphere=new THREE.Group();
  scene.add(atmosphere);
  // Only moving side mountains are rendered. The former fixed ridge/field layers and
  // distant cone forest were intentionally removed because they created a central
  // wallpaper silhouette, mountain-on-mountain clipping and detached tree tops.
  const mountainBands=createMountainBands();
  atmosphere.add(mountainBands.group);

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

  // Stable scene-wide support lights give metallic/dark avatars specular response
  // from every major viewing angle without flattening the stronger sun/rim hierarchy.
  const characterFillFront=new THREE.DirectionalLight(0xf5fbff,.82);
  characterFillFront.position.set(0,8,-11);
  scene.add(characterFillFront);

  const characterFillRear=new THREE.DirectionalLight(0xc8e6ff,.68);
  characterFillRear.position.set(0,7,12);
  scene.add(characterFillRear);

  const characterFillLeft=new THREE.DirectionalLight(0xffefd8,.48);
  characterFillLeft.position.set(-11,6,1);
  scene.add(characterFillLeft);

  const characterFillRight=new THREE.DirectionalLight(0xd9f2ff,.48);
  characterFillRight.position.set(11,6,1);
  scene.add(characterFillRight);

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
  const trunkMesh=new THREE.InstancedMesh(new THREE.CylinderGeometry(.16,.31,2.08,12),_barkMaterial,treeCount);
  const branchGeo=makeSerratedFirGeometry(1.06,1.18,12,5.3);
  const crownGeo=makeSerratedFirGeometry(.72,1.52,12,7.8);
  const snowGeo=new THREE.ConeGeometry(1.00,.17,12);
  branchGeo.rotateY(Math.PI/12);
  crownGeo.rotateY(Math.PI/12);
  snowGeo.rotateY(Math.PI/12);
  const foliageLower=new THREE.InstancedMesh(branchGeo,_pineMaterial,treeCount);
  const foliageLowMid=new THREE.InstancedMesh(branchGeo,_pineMaterial2,treeCount);
  const foliageMid=new THREE.InstancedMesh(branchGeo,_pineMaterial,treeCount);
  const foliageHighMid=new THREE.InstancedMesh(branchGeo,_pineMaterial2,treeCount);
  const foliageUpper=new THREE.InstancedMesh(crownGeo,_pineMaterial,treeCount);
  const snowShelfLower=new THREE.InstancedMesh(snowGeo,_snowDetailMaterial,treeCount);
  const snowShelfMid=new THREE.InstancedMesh(snowGeo,_snowDetailMaterial,treeCount);
  const snowShelfUpper=new THREE.InstancedMesh(snowGeo,_snowDetailMaterial,treeCount);
  const capMesh=new THREE.InstancedMesh(new THREE.ConeGeometry(.62,.86,12),_snowDetailMaterial,treeCount);
  for(const mesh of [trunkMesh,foliageLower,foliageLowMid,foliageMid,foliageHighMid,foliageUpper,snowShelfLower,snowShelfMid,snowShelfUpper,capMesh]){
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
  const boundaryMarkers=createBoundaryMarkers({world,terrainHeight,limit:COURSE_FLAG_X,countPerSide:40,spacing:7.2});
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

      setInstance(foliageLower,i,e.x+asym,ground+1.38*s*height,e.z-asym*.18,1.24*s*width,1.02*s,1.16*s*width,e.ry+.04,0,sway*.20+lean);
      setInstance(foliageLowMid,i,e.x-asym*.55,ground+1.91*s*height,e.z+asym*.15,1.09*s*width,.98*s,1.03*s*width,e.ry-.10,0,sway*.35+lean);
      setInstance(foliageMid,i,e.x+asym*.32,ground+2.43*s*height,e.z-asym*.10,.92*s*width,.92*s,.87*s*width,e.ry+.15,0,sway*.52+lean);
      setInstance(foliageHighMid,i,e.x-asym*.24,ground+2.91*s*height,e.z+asym*.08,.74*s*width,.83*s,.70*s*width,e.ry-.17,0,sway*.70+lean);
      setInstance(foliageUpper,i,e.x+asym*.15,ground+3.37*s*height,e.z,.56*s*width,.80*s,.53*s*width,e.ry+.22,0,sway+lean);

      setInstance(snowShelfLower,i,e.x+asym*.40,ground+1.66*s*height,e.z,1.12*s*width*snow,.82*s,1.05*s*width*snow,e.ry+.02,0,sway*.25+lean);
      setInstance(snowShelfMid,i,e.x-asym*.10,ground+2.18*s*height,e.z+asym*.05,.94*s*width*snow,.80*s,.89*s*width*snow,e.ry+.09,0,sway*.43+lean);
      setInstance(snowShelfUpper,i,e.x-asym*.18,ground+2.66*s*height,e.z,.82*s*width*snow,.78*s,.77*s*width*snow,e.ry-.12,0,sway*.58+lean);
      setInstance(capMesh,i,e.x+asym*.10,ground+3.64*s*height,e.z,.49*s*width*snow,.61*s,.47*s*width*snow,e.ry+.20,0,sway*.90+lean);
    }
    trunkMesh.instanceMatrix.needsUpdate=true;
    foliageLower.instanceMatrix.needsUpdate=true;
    foliageLowMid.instanceMatrix.needsUpdate=true;
    foliageMid.instanceMatrix.needsUpdate=true;
    foliageHighMid.instanceMatrix.needsUpdate=true;
    foliageUpper.instanceMatrix.needsUpdate=true;
    snowShelfLower.instanceMatrix.needsUpdate=true;
    snowShelfMid.instanceMatrix.needsUpdate=true;
    snowShelfUpper.instanceMatrix.needsUpdate=true;
    capMesh.instanceMatrix.needsUpdate=true;
  }

  refreshBanks(banks);refreshBanks(windBanks);refreshTrees();

  let time=0;
  function reset(){
    time=0;
    visualTravel=0;
    sky.material.uniforms.time.value=0;
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
    mountainBands.reset();
    ambientFlybys.reset();
    contactShadow.position.y=-100;
    contactShadow.material.opacity=.16;
    contactShadow.scale.set(1.45,.52,1);
    dayCycle.apply(0);
  }
  function update(dt,worldSpeed,playerX,playerY,playerZ,speed,edge,air,landingPulse,running=true,groundY=playerY,runTime=time){
    time+=dt;
    visualTravel+=worldSpeed*dt;
    sky.position.copy(camera.position);
    sky.material.uniforms.time.value=time;
    dayCycle.apply(runTime);
    ambientFlybys.update(dt,{running,skyColor:scene.background});
    snowParticles.setTint(snowMaterials.terrain.color);
    surfaceDetail.moundMaterial.color.copy(snowMaterials.bank.color);
    surfaceDetail.ridgeMaterial.color.copy(snowMaterials.shadowBank.color);
    _snowDetailMaterial.color.copy(snowMaterials.bank.color);
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
      if(e.z>24){resetTree(e,i);e.z=-238-wave(time*.9+i)*68;}
    }
    refreshTrees(time);
    mountainBands.update(dt,worldSpeed);

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
    ambientFlybys,
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
