import * as THREE from 'three';
import {makeBarkTexture} from './alpineArt.js';
import {applyPremiumObstacle,getPremiumObstacleLibrary} from './premiumObstacles.js';
import {createAlpineSky} from './alpineSky.js';
import {createAlpineLandscape} from './alpineLandscape.js';
import {createSnowMaterials} from './snowMaterial.js';
import {getSpeedFeel} from './gameplayTuning.js';
import {terrainHeight} from './terrainContact.js';
import {createDayCycle} from './dayCycle.js';
import {createBoundaryMarkers} from './boundaryMarkers.js';
import {createSnowParticles} from './snowParticles.js';
import {createSnowSurfaceDetail} from './snowSurfaceDetail.js';
import {createAmbientFlybys} from './ambientFlybys.js';
import {normalizeEnvironmentQuality} from './environmentQuality.js';
import {COURSE_FLAG_X,SCENERY_SIDE_MIN_CENTER_X,sideForIndex} from './environmentCorridor.js';

// clearHorizon contract: mountains stay on left/right sides outside the central exclusion corridor; recycled scenery preserves side assignment.

const _dummy=new THREE.Object3D();
const _instanceColor=new THREE.Color();
const _stripeGeometry=new THREE.BoxGeometry(.68,.045,.13);
const _lipGeometry=new THREE.BoxGeometry(2.34,.07,.14);
const _entryGeometry=new THREE.BoxGeometry(2.32,.055,.12);
const _rampRailGeometry=new THREE.BoxGeometry(.085,.10,2.98);
const _jumpMaterial=new THREE.MeshStandardMaterial({color:0x42bddf,roughness:.39,metalness:.02,emissive:0x063947,emissiveIntensity:.21});
const _jumpStripeMaterial=new THREE.MeshStandardMaterial({color:0xffd943,roughness:.32,emissive:0x754000,emissiveIntensity:.48});
const _jumpEntryMaterial=new THREE.MeshStandardMaterial({color:0xe9fbff,roughness:.42,emissive:0x164e5c,emissiveIntensity:.14});
const _jumpSideMaterial=new THREE.MeshStandardMaterial({color:0x17647e,roughness:.58,metalness:.02});
const _barkTexture=makeBarkTexture();
const _barkMaterial=new THREE.MeshStandardMaterial({color:0x87583b,map:_barkTexture,roughness:.78,metalness:0,flatShading:true});
const _pineMaterial=new THREE.MeshStandardMaterial({color:0x0d594b,roughness:.72,metalness:0,flatShading:true});
const _rockMaterial=new THREE.MeshStandardMaterial({color:0x455f6c,roughness:.90});
const _bananaMaterial=new THREE.MeshStandardMaterial({color:0xffd32f,roughness:.36,emissive:0x784500,emissiveIntensity:.19});
const _logMaterial=new THREE.MeshStandardMaterial({color:0x77482c,roughness:.76,metalness:0,flatShading:true});
const _logEndMaterial=new THREE.MeshStandardMaterial({color:0xc08b58,roughness:.80,metalness:0,flatShading:true});

function wave(seed){
  const x=Math.sin(seed*12.9898+78.233)*43758.5453;
  return x-Math.floor(x);
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
  entry.asym=(wave(i*5.83+41)-.5)*.22;
  entry.lean=(wave(i*3.41+37)-.5)*.045;
  entry.ry=wave(i*2.61+6)*Math.PI*2;
  entry.phase=wave(i*8.23+17)*Math.PI*2;

  const young=entry.variant===0;
  const large=entry.variant===2;
  const heavy=entry.variant===3;
  entry.heightScale=young?.90:(large?1.15:(heavy?1.06:1));
  entry.widthScale=entry.width*(young?.72:(large?1.16:(heavy?1.08:1)));
  entry.asymScaled=entry.asym*entry.s;
  entry.trunkScale=entry.s*entry.trunk;

  // Keep the complete crown, not just the trunk center, visually outside the ski corridor.
  const crownHalfWidth=1.24*entry.s*entry.widthScale+Math.abs(entry.asymScaled);
  const minTreeCenter=Math.max(SCENERY_SIDE_MIN_CENTER_X,COURSE_FLAG_X+8.75+crownHalfWidth);
  if(Math.abs(entry.x)<minTreeCenter)entry.x=side*minTreeCenter;
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
  const size=64,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const r=Math.hypot((x+.5)/size*2-1,(y+.5)/size*2-1);
    const i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=255;
    data[i+3]=Math.pow(Math.max(0,1-r*r),2)*255;
  }
  const map=new THREE.DataTexture(data,size,size);map.magFilter=THREE.LinearFilter;map.needsUpdate=true;
  const material=new THREE.MeshBasicMaterial({
    color:0x385f76,map,
    transparent:true,
    opacity:.18,
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

  if(applyPremiumObstacle(root,kind))return root;
  if(kind==='ramp'){
    const deck=root.children[0];
    if(deck?.isMesh){
      deck.material=_jumpMaterial;
      deck.receiveShadow=true;
      for(const [index,z] of [.80,.16,-.48].entries()){
        const stripe=new THREE.Mesh(_stripeGeometry,_jumpStripeMaterial);
        stripe.position.set(0,.148,z);
        stripe.rotation.y=index%2===0?.055:-.055;
        stripe.scale.set(2.06,1,1);
        stripe.castShadow=false;
        deck.add(stripe);
      }

      const entry=new THREE.Mesh(_entryGeometry,_jumpEntryMaterial);
      entry.position.set(0,.145,1.43);
      entry.castShadow=false;
      deck.add(entry);

      const lip=new THREE.Mesh(_lipGeometry,_jumpStripeMaterial);
      lip.position.set(0,.165,-1.47);
      lip.castShadow=false;
      deck.add(lip);

      for(const side of [-1,1]){
        const rail=new THREE.Mesh(_rampRailGeometry,_jumpSideMaterial);
        rail.position.set(side*1.15,.05,0);
        rail.castShadow=false;
        rail.receiveShadow=true;
        deck.add(rail);
      }
    }

    root.userData.visualPrototype='readable-ramp-v2';
  }
  return root;
}

export function createSkiEnvironment({scene,world,renderer,camera,quality={}}){
  let environmentQuality=normalizeEnvironmentQuality(quality);
  let environmentProfileName=String(quality?.profile||'high');
  let environmentShadowMapSize=Math.max(512,Math.round(Number(quality?.shadowMapSize)||4096));
  let environmentSnowLayerDensity=Math.max(.1,Math.min(1,Number(quality?.snowLayerDensity)||1));
  let distantSceneryUpdateHz=Math.max(0,Number(quality?.distantSceneryUpdateHz)||0);
  scene.background=new THREE.Color(0xd4edf8);
  scene.fog=new THREE.Fog(0xd8eef7,48,268);
  renderer.toneMappingExposure=1.11;

  const snowMaterials=createSnowMaterials(renderer,{detailLevel:environmentQuality.snowDetailLevel});

  const sky=createAlpineSky();
  scene.add(sky);
  const ambientFlybys=createAmbientFlybys({scene,camera});

  const atmosphere=new THREE.Group();
  scene.add(atmosphere);
  const landscape=createAlpineLandscape({world,atmosphere,terrainHeight});
  const ambient=new THREE.HemisphereLight(0xe8f8ff,0x6d879a,1.36);
  scene.add(ambient);

  const sun=new THREE.DirectionalLight(0xffedc6,3.15);
  sun.position.set(-9,15,7);
  sun.castShadow=true;
  sun.shadow.mapSize.set(environmentShadowMapSize,environmentShadowMapSize);
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
  let activeBankCount=banks.entries.length;
  let activeWindBankCount=windBanks.entries.length;

  const treeCount=120;
  const forestPrototypes=getPremiumObstacleLibrary().trees;
  const forestBatches=forestPrototypes.map(prototype=>prototype.children.map(child=>{
    const mesh=new THREE.InstancedMesh(child.geometry,child.material,treeCount);
    mesh.castShadow=mesh.receiveShadow=true;mesh.frustumCulled=false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);world.add(mesh);return mesh;
  }));
  const decorativeTreeMeshes=forestBatches.flat();
  const trees={entries:Array.from({length:treeCount},(_,i)=>{const e={};resetTree(e,i);return e;})};
  let activeTreeCount=treeCount;
  const forestCounts=new Uint16Array(forestBatches.length);

  const snowLayers=[
    makeSnowLayer(190,.042,.34,35,-62,10,.90,false),
    makeSnowLayer(290,.070,.50,32,-50,12,1.38,false),
    makeSnowLayer(235,.105,.58,29,-38,13,1.86,false),
    makeSnowLayer(310,.050,.52,25,-31,11,.42,true)
  ];
  for(const layer of snowLayers)scene.add(layer.points);
  const snowParticles=createSnowParticles({scene,densityMultiplier:environmentQuality.particleDensityMultiplier});
  const surfaceDetail=createSnowSurfaceDetail({world,terrainHeight,snowMaterial:snowMaterials.bank,detailLevel:environmentQuality.snowDetailLevel});
  const boundaryMarkers=createBoundaryMarkers({
    world,terrainHeight,limit:COURSE_FLAG_X,countPerSide:40,spacing:7.2,
    woodTexture:_barkTexture,
    decorativeShadows:environmentQuality.decorativeShadows
  });
  const contactShadow=makeContactShadow(scene);
  const dayCycle=createDayCycle({
    scene,sky,fog:scene.fog,hemisphere:ambient,sun,rim,fill,snowMaterials,atmosphere
  });

  let visualTravel=0;
  function setQualityProfile(overrides={}){
    const input=overrides||{};
    if(input.profile)environmentProfileName=String(input.profile);
    if(Number.isFinite(Number(input.shadowMapSize)))environmentShadowMapSize=Math.max(512,Math.round(Number(input.shadowMapSize)));
    if(Number.isFinite(Number(input.snowLayerDensity)))environmentSnowLayerDensity=Math.max(.1,Math.min(1,Number(input.snowLayerDensity)));
    if(Number.isFinite(Number(input.distantSceneryUpdateHz)))distantSceneryUpdateHz=Math.max(0,Number(input.distantSceneryUpdateHz));

    const mapped={...input};
    if(input.snowParticleDensity!=null||input.particleDensityMultiplier!=null)mapped.particleDensityMultiplier=input.snowParticleDensity??input.particleDensityMultiplier;
    if(input.environmentDecorationDensity!=null||input.decorativeDensity!=null)mapped.decorativeDensity=input.environmentDecorationDensity??input.decorativeDensity;
    if(input.decorativeShadowCasting!=null||input.decorativeShadows!=null)mapped.decorativeShadows=input.decorativeShadowCasting??input.decorativeShadows;
    if(input.snowSurfaceDetailDensity!=null||input.snowDetailLevel!=null)mapped.snowDetailLevel=input.snowSurfaceDetailDensity??input.snowDetailLevel;
    if(input.profile&&input.distantSceneryDetail==null)mapped.distantSceneryDetail=environmentProfileName==='reduced'?.72:1;
    environmentQuality=normalizeEnvironmentQuality({...environmentQuality,...mapped});

    activeBankCount=Math.max(12,Math.min(banks.entries.length,Math.round(banks.entries.length*environmentQuality.decorativeDensity)));
    activeWindBankCount=Math.max(8,Math.min(windBanks.entries.length,Math.round(windBanks.entries.length*environmentQuality.decorativeDensity)));
    activeTreeCount=Math.max(5,Math.min(treeCount,Math.round(treeCount*environmentQuality.decorativeDensity)));
    bankMesh.count=activeBankCount;
    windMesh.count=activeWindBankCount;
    for(const mesh of decorativeTreeMeshes){
      mesh.castShadow=environmentQuality.decorativeShadows;
    }
    bankMesh.castShadow=environmentQuality.decorativeShadows;
    refreshTrees();

    for(const layer of snowLayers){
      layer.activeCount=Math.max(1,Math.min(layer.count,Math.round(layer.count*environmentSnowLayerDensity)));
      layer.geometry.setDrawRange(0,layer.activeCount);
      layer.points.visible=layer.activeCount>0;
    }

    snowParticles.setDensityMultiplier(environmentQuality.particleDensityMultiplier);
    surfaceDetail.setDetailLevel(environmentQuality.snowDetailLevel);
    snowMaterials.setDetailLevel(environmentQuality.snowDetailLevel);
    boundaryMarkers.setDecorativeShadows(environmentQuality.decorativeShadows);
    sky.material.uniforms.sceneryDetail.value=environmentQuality.distantSceneryDetail;
    landscape.setDetail(environmentQuality.distantSceneryDetail);

    if(sun.shadow.mapSize.x!==environmentShadowMapSize||sun.shadow.mapSize.y!==environmentShadowMapSize){
      sun.shadow.mapSize.set(environmentShadowMapSize,environmentShadowMapSize);
      if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}
      sun.shadow.needsUpdate=true;
    }
    return getQualityProfile();
  }
  function getQualityProfile(){
    return {
      ...environmentQuality,
      profile:environmentProfileName,
      shadowMapSize:environmentShadowMapSize,
      snowLayerDensity:environmentSnowLayerDensity,
      distantSceneryUpdateHz
    };
  }
  function applyQuality(settings={}){
    return setQualityProfile(settings);
  }
  function getQualityDiagnostics(){
    return {
      environmentQualityProfile:environmentProfileName,
      environmentShadowMapSize:sun.shadow.mapSize.x,
      decorativeShadowCasting:!!environmentQuality.decorativeShadows,
      activeBanks:activeBankCount,
      activeWindBanks:activeWindBankCount,
      activeDecorativeTrees:activeTreeCount,
      activeSnowLayerParticles:snowLayers.reduce((sum,layer)=>sum+(layer.activeCount??layer.count),0),
      snowParticlePool:snowParticles.getDiagnostics?.()||{densityScale:snowParticles.getDensityMultiplier?.()},
      snowSurfaceDetail:surfaceDetail.getDiagnostics?.()||{detailLevel:surfaceDetail.getDetailLevel?.()}
    };
  }
  setQualityProfile();
  function refreshBanks(group,activeCount=group.entries.length){
    const {mesh,entries}=group;
    for(let i=0;i<activeCount;i++){
      const e=entries[i];
      const ground=terrainHeight(e.x,e.z-visualTravel);
      setInstance(mesh,i,e.x,ground+e.y,e.z,e.sx,e.sy,e.sz,e.ry);
    }
    mesh.instanceMatrix.needsUpdate=true;
  }

  function refreshTrees(time=0){
    forestCounts.fill(0);
    for(let i=0;i<activeTreeCount;i++){
      const e=trees.entries[i],slot=forestCounts[e.variant]++;
      const ground=terrainHeight(e.x,e.z-visualTravel);
      const sway=Math.sin(time*.72+e.phase)*.009;
      _instanceColor.setRGB(.88+wave(i+3)*.12,.91+wave(i+5)*.09,.88+wave(i+7)*.12);
      for(const mesh of forestBatches[e.variant]){
        setInstance(mesh,slot,e.x,ground,e.z,e.s*e.widthScale,e.s*e.heightScale,e.s*e.widthScale,e.ry,0,e.lean+sway);
        mesh.setColorAt(slot,_instanceColor);
      }
    }
    for(let v=0;v<forestBatches.length;v++)for(const mesh of forestBatches[v]){
      mesh.count=forestCounts[v];mesh.instanceMatrix.needsUpdate=true;
      if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    }
  }

  refreshBanks(banks,activeBankCount);refreshBanks(windBanks,activeWindBankCount);refreshTrees();

  let time=0;
  let sceneryAccumulator=0;
  function reset(){
    time=0;
    visualTravel=0;
    sceneryAccumulator=0;
    sky.material.uniforms.time.value=0;
    banks.entries.forEach((entry,index)=>resetBank(entry,index,true));
    windBanks.entries.forEach((entry,index)=>resetBank(entry,index,false));
    trees.entries.forEach((entry,index)=>resetTree(entry,index));
    refreshBanks(banks,activeBankCount);refreshBanks(windBanks,activeWindBankCount);refreshTrees();
    for(const layer of snowLayers){
      layer.positions.set(layer.initialPositions);
      layer.geometry.attributes.position.needsUpdate=true;
    }
    snowParticles.reset();
    surfaceDetail.reset();
    boundaryMarkers.reset();
    ambientFlybys.reset();
    landscape.reset();
    contactShadow.position.y=-100;
    contactShadow.material.opacity=.18;
    contactShadow.scale.set(1.45,.52,1);
    dayCycle.apply(0);
    snowMaterials.setTravel(0);
  }
  function update(dt,worldSpeed,playerX,playerY,playerZ,speed,edge,air,landingPulse,running=true,groundY=playerY,runTime=time){
    time+=dt;
    visualTravel+=worldSpeed*dt;
    sky.position.copy(camera.position);
    sky.material.uniforms.time.value=time;
    dayCycle.apply(runTime);
    snowMaterials.setTravel(visualTravel);
    ambientFlybys.update(dt,{running,skyColor:scene.background});
    snowParticles.setTint(snowMaterials.terrain.color);
    surfaceDetail.moundMaterial.color.copy(snowMaterials.bank.color);
    surfaceDetail.ridgeMaterial.color.copy(snowMaterials.shadowBank.color);


    for(const layer of snowLayers)layer.points.material.color.copy(snowMaterials.terrain.color);

    let sceneryStep=dt;
    let refreshScenery=true;
    if(distantSceneryUpdateHz>0){
      sceneryAccumulator+=dt;
      const interval=1/distantSceneryUpdateHz;
      if(sceneryAccumulator<interval)refreshScenery=false;
      else{sceneryStep=sceneryAccumulator;sceneryAccumulator=0;}
    }

    const speed01=getSpeedFeel(speed);
    if(refreshScenery){
      landscape.update(sceneryStep,worldSpeed);
      for(let i=0;i<activeBankCount;i++){
        const e=banks.entries[i];e.z+=worldSpeed*sceneryStep;
        if(e.z>22){resetBank(e,i,true);e.z=-218-wave(time+i)*50;}
      }
      for(let i=0;i<activeWindBankCount;i++){
        const e=windBanks.entries[i];e.z+=worldSpeed*sceneryStep;
        if(e.z>20){resetBank(e,i,false);e.z=-216-wave(time*1.7+i)*54;}
      }
      refreshBanks(banks,activeBankCount);refreshBanks(windBanks,activeWindBankCount);

      for(let i=0;i<activeTreeCount;i++){
        const e=trees.entries[i];e.z+=worldSpeed*sceneryStep;
        if(e.z>24){resetTree(e,i);e.z=-238-wave(time*.9+i)*68;}
      }
      refreshTrees(time);

      for(const layer of snowLayers){
        const p=layer.positions;
        layer.materialScale=speed01;
        for(let i=0;i<(layer.activeCount??layer.count);i++){
          const k=i*3;
          if(layer.ground){
            p[k+2]+=sceneryStep*(3.8+worldSpeed*(.52+speed01*.55));
            p[k]+=Math.sin(time*.8+layer.sway[i])*sceneryStep*(.08+speed01*.08);
            if(p[k+2]>13){
              p[k+2]=layer.zMin+wave(i*3.2+time)*9;
              p[k]=(wave(i*4.9+time)-.5)*layer.xSpread*2;
              p[k+1]=groundY-.06+wave(i*2.8+time)*(.65+speed01*.65);
            }
          }else{
            p[k+1]-=sceneryStep*(layer.fall[i]+speed*.018);
            p[k+2]+=sceneryStep*(1.55+worldSpeed*.33+layer.fall[i]*.28);
            p[k]+=Math.sin(time*(.55+layer.fall[i]*.12)+layer.sway[i])*sceneryStep*.11;
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
    }

    snowParticles.spray(dt,playerX,playerY,playerZ,speed,edge,air,landingPulse,running);
    snowParticles.update(dt,worldSpeed);
    surfaceDetail.update(dt,worldSpeed);

    boundaryMarkers.update(dt,worldSpeed);

    contactShadow.position.set(playerX,Math.max(.006,groundY-.108),playerZ+.02);
    const groundAlpha=air?0:THREE.MathUtils.clamp(1-landingPulse*.12,.72,1);
    contactShadow.material.opacity=THREE.MathUtils.lerp(contactShadow.material.opacity,.21*groundAlpha,1-Math.pow(1-(air?.22:.38),dt*60));
    const contactScale=1+landingPulse*.12;
    contactShadow.scale.set(1.42*contactScale,.5*contactScale,1);
  }

  return {
    update,
    reset,
    ambientFlybys,
    setQualityProfile,
    getQualityProfile,
    applyQuality,
    getQualityDiagnostics,
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
