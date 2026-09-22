import * as THREE from 'three';

const _dummy=new THREE.Object3D();

function addGeometryPiece(target,geometry,matrix,color){
  const source=geometry.index?geometry.toNonIndexed():geometry.clone();
  source.applyMatrix4(matrix);
  const position=source.getAttribute('position');
  const normal=source.getAttribute('normal');

  for(let i=0;i<position.count;i++){
    target.positions.push(position.getX(i),position.getY(i),position.getZ(i));
    if(normal){
      target.normals.push(normal.getX(i),normal.getY(i),normal.getZ(i));
    }else{
      target.normals.push(0,1,0);
    }
    target.colors.push(color.r,color.g,color.b);
  }
  source.dispose();
}

function pieceMatrix(x,y,z,sx,sy,sz,ry=0,rz=0){
  const position=new THREE.Vector3(x,y,z);
  const quaternion=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,ry,rz));
  const scale=new THREE.Vector3(sx,sy,sz);
  return new THREE.Matrix4().compose(position,quaternion,scale);
}

function buildTreeGeometry({variant=0,mid=false,far=false}){
  const target={positions:[],normals:[],colors:[]};
  const trunkColor=new THREE.Color(variant===0?0x71503a:variant===2?0x5f402f:0x684632);
  const pineDark=new THREE.Color(variant===0?0x155b50:variant===2?0x104a45:0x0f5148);
  const pineLight=new THREE.Color(variant===0?0x1f6d60:variant===2?0x175b52:0x17665a);
  const snowColor=new THREE.Color(0xf4fbff);

  if(far){
    const trunk=new THREE.CylinderGeometry(.13,.22,1.35,5);
    const crown=new THREE.ConeGeometry(1,3.2,6);
    addGeometryPiece(target,trunk,pieceMatrix(0,.67,0,1,1,1),trunkColor);
    addGeometryPiece(target,crown,pieceMatrix(0,2.18,0,.94,1,.94),pineDark);
    trunk.dispose();crown.dispose();
  }else if(mid){
    const trunk=new THREE.CylinderGeometry(.14,.25,1.65,6);
    const cone=new THREE.ConeGeometry(1,1,7);
    addGeometryPiece(target,trunk,pieceMatrix(0,.82,0,1,1,1),trunkColor);
    addGeometryPiece(target,cone,pieceMatrix(.03,1.46,0,1.04,1.10,.98,.08),pineDark);
    addGeometryPiece(target,cone,pieceMatrix(-.04,2.15,.02,.83,1.05,.79,-.11),pineLight);
    addGeometryPiece(target,cone,pieceMatrix(.02,2.80,-.02,.61,1.17,.58,.16),pineDark);
    addGeometryPiece(target,cone,pieceMatrix(-.02,2.45,.02,.69,.16,.66,-.10),snowColor);
    trunk.dispose();cone.dispose();
  }else{
    const trunk=new THREE.CylinderGeometry(.15,.29,1.85,8);
    const cone=new THREE.ConeGeometry(1,1,9);
    const profile=[
      variant===0?[1.00,.82,.64,.48]:variant===1?[1.16,.98,.76,.56]:[1.25,1.06,.84,.61],
      variant===0?[1.02,.96,.90,.84]:variant===1?[1.00,.96,.90,.82]:[.96,.94,.90,.82],
      variant===0?[.52,.43,.34]:variant===1?[.76,.58,.43]:[.90,.73,.56]
    ];
    const widths=profile[0],heights=profile[1],snow=profile[2];
    const ys=[1.38,1.92,2.45,2.92];
    const rys=[.05,-.11,.15,-.18];
    addGeometryPiece(target,trunk,pieceMatrix(0,.92,0,1,1,1),trunkColor);
    for(let i=0;i<4;i++){
      addGeometryPiece(
        target,cone,
        pieceMatrix((i%2?-.035:.035),ys[i],(i%2?.015:-.015),widths[i],heights[i],widths[i]*.96,rys[i]),
        i%2?pineLight:pineDark
      );
    }
    addGeometryPiece(target,cone,pieceMatrix(.015,3.40,0,.43,.96,.42,.20),pineDark);
    const snowYs=[1.68,2.54,3.13];
    for(let i=0;i<3;i++){
      addGeometryPiece(
        target,cone,
        pieceMatrix((i%2?-.02:.025),snowYs[i],.01,snow[i],.14,snow[i]*.95,rys[i]),
        snowColor
      );
    }
    trunk.dispose();cone.dispose();
  }

  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(target.positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(target.normals,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(target.colors,3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function applyInstance(mesh,index,entry,ground,time,lod){
  const s=entry.s;
  const height=entry.heightScale;
  const width=entry.widthScale;
  const sway=lod===2?0:Math.sin(time*.72+entry.phase)*(lod===0?.013:.006);
  const x=entry.x+(lod===0?entry.asymScaled*.14:0);
  const sx=s*width*(lod===2?.93:1);
  const sy=s*height*(lod===2?.97:1);
  const sz=s*width*(lod===2?.93:1);

  _dummy.position.set(x,ground,entry.z);
  _dummy.rotation.set(0,entry.ry,entry.lean+sway);
  _dummy.scale.set(sx,sy,sz);
  _dummy.updateMatrix();
  mesh.setMatrixAt(index,_dummy.matrix);

}

export function createTreeLodSystem({world,entries,terrainHeight}){
  const capacity=entries.length;
  const material=new THREE.MeshStandardMaterial({
    color:0xffffff,
    roughness:.88,
    metalness:0,
    vertexColors:true
  });
  material.userData.dayCycleRole='foliage';
  material.userData.baseDayColor=material.color.clone();

  const nearGeometries=[
    buildTreeGeometry({variant:0}),
    buildTreeGeometry({variant:1}),
    buildTreeGeometry({variant:2})
  ];
  const midGeometry=buildTreeGeometry({mid:true});
  const farGeometry=buildTreeGeometry({far:true});

  const nearMeshes=nearGeometries.map(geometry=>new THREE.InstancedMesh(geometry,material,capacity));
  const midMesh=new THREE.InstancedMesh(midGeometry,material,capacity);
  const farMesh=new THREE.InstancedMesh(farGeometry,material,capacity);
  const allMeshes=[...nearMeshes,midMesh,farMesh];

  for(const mesh of allMeshes){
    mesh.frustumCulled=false;
    mesh.count=0;
    world.add(mesh);
  }
  for(const mesh of nearMeshes){
    mesh.castShadow=true;
    mesh.receiveShadow=true;
  }
  midMesh.castShadow=false;
  midMesh.receiveShadow=false;
  farMesh.castShadow=false;
  farMesh.receiveShadow=false;

  const counters=new Uint16Array(5);
  const NEAR_MIN=58;
  const NEAR_SPREAD=16;
  const MID_MIN=126;
  const MID_SPREAD=20;

  function update(time,visualTravel){
    counters.fill(0);

    for(let i=0;i<entries.length;i++){
      const entry=entries[i];
      const ground=terrainHeight(entry.x,entry.z-visualTravel);
      // Stagger each tree's threshold across a band so an entire forest cluster
      // never changes LOD on the same frame. The farther band sits deep in fog.
      const nearEnd=-(NEAR_MIN+entry.colorSeed*NEAR_SPREAD);
      const midEnd=-(MID_MIN+entry.colorSeed*MID_SPREAD);

      if(entry.z>nearEnd){
        const variant=entry.variant===3?2:entry.variant%3;
        const mesh=nearMeshes[variant];
        applyInstance(mesh,counters[variant]++,entry,ground,time,0);
      }else if(entry.z>midEnd){
        applyInstance(midMesh,counters[3]++,entry,ground,time,1);
      }else{
        applyInstance(farMesh,counters[4]++,entry,ground,time,2);
      }
    }

    for(let i=0;i<nearMeshes.length;i++){
      const mesh=nearMeshes[i];
      mesh.count=counters[i];
      mesh.instanceMatrix.needsUpdate=true;
    }
    midMesh.count=counters[3];
    midMesh.instanceMatrix.needsUpdate=true;
    farMesh.count=counters[4];
    farMesh.instanceMatrix.needsUpdate=true;
  }

  return {
    update,
    material,
    meshes:allMeshes,
    nearMeshes,
    midMesh,
    farMesh,
    thresholds:{
      near:[NEAR_MIN,NEAR_MIN+NEAR_SPREAD],
      mid:[MID_MIN,MID_MIN+MID_SPREAD]
    }
  };
}
