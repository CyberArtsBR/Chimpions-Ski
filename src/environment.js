import * as THREE from 'three';

const _dummy=new THREE.Object3D();
const _snowCapGeometry=new THREE.ConeGeometry(.62,.9,10);
const _rockCapGeometry=new THREE.SphereGeometry(.48,12,8);
const _haloGeometry=new THREE.TorusGeometry(.54,.022,6,28);
const _stripeGeometry=new THREE.BoxGeometry(.68,.04,.13);
const _lipGeometry=new THREE.BoxGeometry(2.34,.055,.13);
const _logSnowGeometry=new THREE.BoxGeometry(1.8,.08,.36);
const _snowDetailMaterial=new THREE.MeshStandardMaterial({color:0xfbfeff,roughness:.94,metalness:0});
const _rockSnowMaterial=new THREE.MeshStandardMaterial({color:0xf2f9fc,roughness:1});
const _bananaHaloMaterial=new THREE.MeshBasicMaterial({color:0xffdf58,transparent:true,opacity:.42,depthWrite:false});
const _jumpMaterial=new THREE.MeshStandardMaterial({color:0x9fe4f4,roughness:.52,metalness:.03,emissive:0x0b5268,emissiveIntensity:.18});
const _jumpStripeMaterial=new THREE.MeshStandardMaterial({color:0xffd33d,roughness:.42,emissive:0x6b3900,emissiveIntensity:.5});
const _logSnowMaterial=new THREE.MeshStandardMaterial({color:0xf4fbff,roughness:.98});

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
    positions.push(prevX,baseY,0,prevX,prevY,0,x,y,0, prevX,baseY,0,x,y,0,x,baseY,0);
    prevX=x;prevY=y;
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.computeVertexNormals();
  return geometry;
}

function createRidge(width,height,y,z,color,opacity,seed,segments=26){
  const material=new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,depthWrite:false,fog:true});
  const mesh=new THREE.Mesh(ridgeGeometry(width,height,-height*.46,segments,seed),material);
  mesh.position.set(0,y,z);
  mesh.renderOrder=-20;
  return mesh;
}

function setInstance(mesh,index,x,y,z,sx,sy,sz,ry=0){
  _dummy.position.set(x,y,z);
  _dummy.rotation.set(0,ry,0);
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
  entry.x=side*(9.2+wave(i*2.7+11)*5.8);
  entry.z=-12-wave(i*4.1+21)*205;
  entry.sx=(deep?2.8:2.1)+wave(i*3.4+5)*(deep?3.3:2.6);
  entry.sy=(deep?.34:.18)+wave(i*7.1+9)*(deep?.42:.22);
  entry.sz=(deep?1.1:.7)+wave(i*5.7+4)*(deep?1.7:1.15);
  entry.ry=wave(i*8.4+2)*Math.PI;
}

function resetTree(entry,i){
  const side=i%2===0?-1:1;
  entry.x=side*(10.6+wave(i*5.37+1)*8.2);
  entry.z=-18-wave(i*6.91+8)*220;
  entry.s=.66+wave(i*4.17+3)*1.05;
  entry.ry=wave(i*2.61+6)*Math.PI*2;
}

function makeSky(){
  const material=new THREE.ShaderMaterial({
    side:THREE.BackSide,
    depthWrite:false,
    uniforms:{
      topColor:{value:new THREE.Color(0x6ebde2)},
      horizonColor:{value:new THREE.Color(0xd9f1fb)},
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

function makeSnowLayer(count,size,opacity,xSpread,zMin,zMax,speedBase){
  const positions=new Float32Array(count*3);
  const fall=new Float32Array(count);
  const sway=new Float32Array(count);
  for(let i=0;i<count;i++){
    positions[i*3]=(wave(i*2.3+11)-.5)*xSpread*2;
    positions[i*3+1]=.4+wave(i*3.7+2)*14.5;
    positions[i*3+2]=zMin+wave(i*5.2+7)*(zMax-zMin);
    fall[i]=speedBase+wave(i*8.1+4)*speedBase*.85;
    sway[i]=wave(i*7.7+9)*Math.PI*2;
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const material=new THREE.PointsMaterial({color:0xffffff,size,transparent:true,opacity,depthWrite:false,sizeAttenuation:true});
  const points=new THREE.Points(geometry,material);
  points.frustumCulled=false;
  return {count,positions,fall,sway,geometry,points,xSpread,zMin,zMax};
}

function makePowderPool(scene){
  const count=260;
  const positions=new Float32Array(count*3);
  const velocity=new Float32Array(count*3);
  const life=new Float32Array(count);
  const maxLife=new Float32Array(count);
  for(let i=0;i<count;i++)positions[i*3+1]=-100;
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const material=new THREE.PointsMaterial({color:0xffffff,size:.13,transparent:true,opacity:.5,depthWrite:false,sizeAttenuation:true});
  const points=new THREE.Points(geometry,material);
  points.frustumCulled=false;
  scene.add(points);
  return {count,positions,velocity,life,maxLife,geometry,points,cursor:0,lastLanding:0,emitCarry:0};
}

function emitPowder(pool,x,y,z,edge,speed,count,landing=false){
  const direction=edge===0?(wave(pool.cursor+3)>.5?1:-1):-Math.sign(edge);
  for(let n=0;n<count;n++){
    const i=pool.cursor++%pool.count;
    const base=i*3;
    const r1=wave(pool.cursor*1.17+n*2.3);
    const r2=wave(pool.cursor*2.71+n*5.1);
    const r3=wave(pool.cursor*4.33+n*7.9);
    pool.positions[base]=x+(r1-.5)*.72;
    pool.positions[base+1]=y+.05+r2*(landing?.26:.14);
    pool.positions[base+2]=z+.35+r3*.52;
    pool.velocity[base]=direction*(.45+r1*(landing?1.8:1.15))+(r2-.5)*.6;
    pool.velocity[base+1]=(landing?.9:.55)+r2*(landing?2.8:1.7);
    pool.velocity[base+2]=1.0+r3*(landing?3.0:2.0)+speed*.025;
    pool.life[i]=(landing?.52:.32)+r1*(landing?.5:.32);
    pool.maxLife[i]=pool.life[i];
  }
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
  }else if(kind==='log'){
    const snow=new THREE.Mesh(_logSnowGeometry,_logSnowMaterial);
    snow.position.set(0,.54,0);snow.rotation.z=.015;snow.castShadow=true;root.add(snow);
  }
  return root;
}

export function createSkiEnvironment({scene,world,renderer,camera}){
  scene.background=new THREE.Color(0xd8eff9);
  scene.fog=new THREE.Fog(0xd8eff9,31,158);
  renderer.toneMappingExposure=1.02;

  const sky=makeSky();scene.add(sky);
  const atmosphere=new THREE.Group();scene.add(atmosphere);
  atmosphere.add(
    createRidge(190,33,-3,-142,0x789caf,.78,2.4,34),
    createRidge(160,27,-5,-116,0x8fb3c2,.86,5.9,31),
    createRidge(132,21,-6,-92,0xadcbd5,.95,9.1,27)
  );

  const fill=new THREE.HemisphereLight(0xf0fbff,0x7893a4,.48);scene.add(fill);
  const rim=new THREE.DirectionalLight(0xcceeff,.46);rim.position.set(11,8,-8);scene.add(rim);

  const bankGeometry=new THREE.SphereGeometry(1,12,7);
  const bankMaterial=new THREE.MeshStandardMaterial({color:0xf8fcff,roughness:.98});
  const ridgeMaterial=new THREE.MeshStandardMaterial({color:0xdcecf3,roughness:1});
  const bankMesh=new THREE.InstancedMesh(bankGeometry,bankMaterial,34);bankMesh.receiveShadow=true;world.add(bankMesh);
  const windMesh=new THREE.InstancedMesh(bankGeometry,ridgeMaterial,24);windMesh.receiveShadow=true;world.add(windMesh);
  const banks=createMovingInstances(34,bankMesh,i=>{const e={};resetBank(e,i,true);return e;});
  const windBanks=createMovingInstances(24,windMesh,i=>{const e={};resetBank(e,i,false);return e;});

  const trunkMesh=new THREE.InstancedMesh(new THREE.CylinderGeometry(.16,.26,1.7,7),new THREE.MeshStandardMaterial({color:0x5a3e2b,roughness:.95}),82);
  const foliageGeo=new THREE.ConeGeometry(1.05,2.25,9);
  const foliageMat=new THREE.MeshStandardMaterial({color:0x174b48,roughness:.9});
  const foliageLower=new THREE.InstancedMesh(foliageGeo,foliageMat,82);
  const foliageUpper=new THREE.InstancedMesh(foliageGeo,foliageMat,82);
  const capMesh=new THREE.InstancedMesh(new THREE.ConeGeometry(.72,1.05,9),_snowDetailMaterial,82);
  for(const mesh of [trunkMesh,foliageLower,foliageUpper,capMesh]){mesh.castShadow=true;mesh.receiveShadow=true;world.add(mesh);}
  const trees=createMovingInstances(82,trunkMesh,i=>{const e={};resetTree(e,i);return e;});

  const snowLayers=[
    makeSnowLayer(320,.045,.52,20,-56,10,1.15),
    makeSnowLayer(460,.075,.66,18,-48,12,1.65),
    makeSnowLayer(360,.12,.74,16,-38,13,2.15)
  ];
  for(const layer of snowLayers)scene.add(layer.points);
  const powder=makePowderPool(scene);

  function refreshBanks(group,deep){
    const {mesh,entries}=group;
    for(let i=0;i<entries.length;i++){
      const e=entries[i];
      setInstance(mesh,i,e.x,-.33,e.z,e.sx,e.sy,e.sz,e.ry);
    }
    mesh.instanceMatrix.needsUpdate=true;
    if(deep)mesh.computeBoundingSphere();
  }
  function refreshTrees(){
    for(let i=0;i<trees.entries.length;i++){
      const e=trees.entries[i],s=e.s;
      setInstance(trunkMesh,i,e.x,.78*s,e.z,.9*s,s,.9*s,e.ry);
      setInstance(foliageLower,i,e.x,1.8*s,e.z,1.04*s,1.02*s,1.04*s,e.ry);
      setInstance(foliageUpper,i,e.x,2.62*s,e.z,.82*s,.88*s,.82*s,e.ry+.15);
      setInstance(capMesh,i,e.x,3.0*s,e.z,.7*s,.62*s,.7*s,e.ry+.15);
    }
    trunkMesh.instanceMatrix.needsUpdate=true;
    foliageLower.instanceMatrix.needsUpdate=true;
    foliageUpper.instanceMatrix.needsUpdate=true;
    capMesh.instanceMatrix.needsUpdate=true;
  }
  refreshBanks(banks,true);refreshBanks(windBanks,false);refreshTrees();

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
    refreshBanks(banks,false);refreshBanks(windBanks,false);

    for(let i=0;i<trees.entries.length;i++){
      const e=trees.entries[i];e.z+=worldSpeed*dt;
      if(e.z>24){resetTree(e,i);e.z=-190-wave(time*.9+i)*70;}
    }
    refreshTrees();

    for(const layer of snowLayers){
      const p=layer.positions;
      for(let i=0;i<layer.count;i++){
        const k=i*3;
        p[k+1]-=dt*(layer.fall[i]+speed*.018);
        p[k+2]+=dt*(1.55+worldSpeed*.33+layer.fall[i]*.28);
        p[k]+=Math.sin(time*(.55+layer.fall[i]*.12)+layer.sway[i])*dt*.11;
        if(p[k+1]<.15)p[k+1]=10+wave(i+time)*5.5;
        if(p[k+2]>15){p[k+2]=layer.zMin+wave(i*3.2+time)*(layer.zMax-layer.zMin)*.28;p[k]=(wave(i*4.9+time)-.5)*layer.xSpread*2;}
      }
      layer.geometry.attributes.position.needsUpdate=true;
    }

    if(!air){
      const carve=Math.abs(edge);
      powder.emitCarry+=dt*((carve*.92)+Math.max(0,speed-22)*.012)*34;
      const emit=Math.min(8,Math.floor(powder.emitCarry));
      if(emit>0){emitPowder(powder,playerX,playerY,playerZ,edge,speed,emit,false);powder.emitCarry-=emit;}
    }
    if(landingPulse>.18&&powder.lastLanding<=.18)emitPowder(powder,playerX,playerY,playerZ,edge,speed,22,true);
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
  }

  return {update};
}
