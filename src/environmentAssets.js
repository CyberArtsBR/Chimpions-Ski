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

function createChaletGeometry(){
  const body=new THREE.BoxGeometry(1.5,.85,1.15).toNonIndexed();
  body.translate(0,.425,0);

  const roof=new THREE.ConeGeometry(1.12,.72,4).toNonIndexed();
  roof.rotateY(Math.PI/4);
  roof.scale(1,.72,.82);
  roof.translate(0,1.03,0);

  const positions=[];
  const normals=[];
  const colors=[];
  const append=(geometry,color)=>{
    const p=geometry.getAttribute('position');
    const n=geometry.getAttribute('normal');
    for(let i=0;i<p.count;i++){
      positions.push(p.getX(i),p.getY(i),p.getZ(i));
      normals.push(n.getX(i),n.getY(i),n.getZ(i));
      colors.push(color.r,color.g,color.b);
    }
  };
  append(body,new THREE.Color(0x745849));
  append(roof,new THREE.Color(0xeaf4f8));

  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeBoundingSphere();
  body.dispose();roof.dispose();
  return geometry;
}

export function createAlpineBackgroundVariety({scene}){
  const group=new THREE.Group();
  group.renderOrder=-6;
  scene.add(group);

  const chaletMaterial=new THREE.MeshStandardMaterial({
    color:0xffffff,roughness:.90,metalness:0,vertexColors:true,fog:true
  });
  chaletMaterial.userData.dayCycleRole='background';
  chaletMaterial.userData.baseDayColor=chaletMaterial.color.clone();

  const chaletCount=12;
  const chalets=new THREE.InstancedMesh(createChaletGeometry(),chaletMaterial,chaletCount);
  chalets.frustumCulled=false;
  chalets.castShadow=false;
  chalets.receiveShadow=false;
  for(let i=0;i<chaletCount;i++){
    const side=i%2===0?-1:1;
    const band=Math.floor(i/2);
    const x=side*(31+hash(i*3.1+9)*28+band*.55);
    const z=-76-hash(i*5.7+2)*88;
    const scale=.65+hash(i*7.9+4)*.55;
    setInstance(chalets,i,x,-2.7,z,scale,scale,scale,side<0?.12:-.16);
  }
  chalets.instanceMatrix.needsUpdate=true;
  group.add(chalets);

  const towerMaterial=new THREE.MeshStandardMaterial({
    color:0x56646c,roughness:.68,metalness:.18,fog:true
  });
  towerMaterial.userData.dayCycleRole='background';
  towerMaterial.userData.baseDayColor=towerMaterial.color.clone();

  const towerCount=8;
  const towerGeometry=new THREE.CylinderGeometry(.07,.11,4.6,6);
  const towers=new THREE.InstancedMesh(towerGeometry,towerMaterial,towerCount);
  towers.frustumCulled=false;
  towers.castShadow=false;
  towers.receiveShadow=false;

  const cablePositions=[];
  const towerX=43;
  for(let i=0;i<towerCount;i++){
    const side=i<4?-1:1;
    const local=i%4;
    const x=side*(towerX+local*4.2);
    const z=-66-local*34-(side>0?12:0);
    const y=-.7+local*.24;
    setInstance(towers,i,x,y,z,1,1,1,side*.03);
    cablePositions.push(x,y+2.18,z);
    if(local<3){
      const nx=side*(towerX+(local+1)*4.2);
      const nz=-66-(local+1)*34-(side>0?12:0);
      const ny=-.7+(local+1)*.24+2.18;
      cablePositions.push(nx,ny,nz);
    }
  }
  towers.instanceMatrix.needsUpdate=true;
  group.add(towers);

  const cableMaterial=new THREE.LineBasicMaterial({
    color:0x53626b,transparent:true,opacity:.68,fog:true
  });
  cableMaterial.userData.dayCycleRole='background';
  cableMaterial.userData.baseDayColor=cableMaterial.color.clone();
  const cableGeometry=new THREE.BufferGeometry();
  cableGeometry.setAttribute('position',new THREE.Float32BufferAttribute(cablePositions,3));
  const cables=new THREE.LineSegments(cableGeometry,cableMaterial);
  cables.frustumCulled=false;
  group.add(cables);

  return {
    group,
    materials:[chaletMaterial,towerMaterial,cableMaterial],
    objects:{chalets,towers,cables}
  };
}
