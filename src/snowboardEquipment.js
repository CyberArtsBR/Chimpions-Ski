import * as THREE from 'three';

function makeBoardGeometry(width=0.48,length=2.08,thickness=.045,upturn=.085){
  const halfW=width*.5;
  const halfL=length*.5;
  const shape=new THREE.Shape();
  shape.moveTo(-halfW*.72,halfL);
  shape.quadraticCurveTo(0,halfL*1.035,halfW*.72,halfL);
  shape.quadraticCurveTo(halfW,halfL*.92,halfW,halfL*.72);
  shape.lineTo(halfW,-halfL*.72);
  shape.quadraticCurveTo(halfW,-halfL*.92,halfW*.72,-halfL);
  shape.quadraticCurveTo(0,-halfL*1.035,-halfW*.72,-halfL);
  shape.quadraticCurveTo(-halfW,-halfL*.92,-halfW,-halfL*.72);
  shape.lineTo(-halfW,halfL*.72);
  shape.quadraticCurveTo(-halfW,halfL*.92,-halfW*.72,halfL);
  shape.closePath();

  const geometry=new THREE.ExtrudeGeometry(shape,{
    depth:thickness,
    steps:1,
    bevelEnabled:true,
    bevelSegments:2,
    bevelSize:.008,
    bevelThickness:.006,
    curveSegments:10
  });
  geometry.rotateX(Math.PI/2);
  geometry.translate(0,thickness*.5,0);

  const position=geometry.attributes.position;
  const bendStart=length*.35;
  const bendRange=length*.14;
  for(let i=0;i<position.count;i++){
    const z=position.getZ(i);
    const amount=Math.abs(z)-bendStart;
    if(amount>0){
      const t=THREE.MathUtils.clamp(amount/bendRange,0,1);
      position.setY(i,position.getY(i)+upturn*t*t);
    }
  }
  position.needsUpdate=true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createSnowboardEquipment({centerX=0,z=0,topColor=0x8b3fd1}={}){
  const root=new THREE.Group();
  root.name='snowboard-equipment';

  const edgeMaterial=new THREE.MeshStandardMaterial({color:0x111923,roughness:.28,metalness:.48});
  const deckMaterial=new THREE.MeshPhysicalMaterial({
    color:topColor,roughness:.30,metalness:.05,clearcoat:.52,clearcoatRoughness:.34
  });
  const graphicMaterial=new THREE.MeshStandardMaterial({
    color:0xffd95e,roughness:.34,metalness:.04,emissive:0x3b2200,emissiveIntensity:.08
  });
  const bindingMaterial=new THREE.MeshStandardMaterial({color:0x17222b,roughness:.38,metalness:.22});
  const strapMaterial=new THREE.MeshStandardMaterial({color:0xe8f6fb,roughness:.30,metalness:.12});

  const edge=new THREE.Mesh(makeBoardGeometry(.50,2.10,.052,.082),edgeMaterial);
  edge.castShadow=edge.receiveShadow=true;
  root.add(edge);

  const deck=new THREE.Mesh(makeBoardGeometry(.47,2.06,.036,.090),deckMaterial);
  deck.position.y=.025;
  deck.castShadow=deck.receiveShadow=true;
  root.add(deck);

  const stripe=new THREE.Mesh(new THREE.BoxGeometry(.045,.009,1.18),graphicMaterial);
  stripe.position.set(0,.060,.02);
  root.add(stripe);

  for(const [index,zOffset] of [-.34,.34].entries()){
    const sign=index===0?-1:1;
    const binding=new THREE.Group();
    binding.position.set(0,.086,zOffset);
    binding.rotation.y=sign*.16;

    const plate=new THREE.Mesh(new THREE.BoxGeometry(.34,.045,.17),bindingMaterial);
    plate.castShadow=true;
    binding.add(plate);

    const strap=new THREE.Mesh(new THREE.BoxGeometry(.36,.035,.045),strapMaterial);
    strap.position.set(0,.055,-.005);
    strap.rotation.z=sign*.03;
    strap.castShadow=true;
    binding.add(strap);

    const heel=new THREE.Mesh(new THREE.BoxGeometry(.28,.13,.045),bindingMaterial);
    heel.position.set(0,.095,.075*sign);
    heel.rotation.x=sign*.16;
    heel.castShadow=true;
    binding.add(heel);

    root.add(binding);
  }

  root.position.set(centerX,.058,z);
  root.userData.restPosition=root.position.clone();

  const trailContacts=[-1,1].map(side=>{
    const contact=new THREE.Object3D();
    contact.position.set(side*.15,.005,.48);
    contact.name=side<0?'snowboard-left-edge-contact':'snowboard-right-edge-contact';
    root.add(contact);
    return contact;
  });

  return {root,trailContacts};
}
