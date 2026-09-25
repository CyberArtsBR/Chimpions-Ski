import * as THREE from 'three';

function makeBoardGeometry(width=0.70,length=2.24,thickness=.054,upturn=.205){
  // Segmented geometry bends cleanly; unlike the old triangulated extrude it
  // cannot form raised diagonal facets when the twin tips curve upward.
  const halfW=width*.5,halfL=length*.5;
  const geometry=new THREE.BoxGeometry(width,thickness,length,8,1,36);
  const position=geometry.attributes.position;
  for(let i=0;i<position.count;i++){
    let x=position.getX(i),y=position.getY(i),z=position.getZ(i);
    const longitudinal=THREE.MathUtils.clamp(Math.abs(z)/halfL,0,1);
    const widthScale=.84+.16*Math.pow(longitudinal,1.55);
    x*=widthScale;
    if(longitudinal>.965){
      const localHalfW=Math.max(.001,halfW*widthScale);
      const across=THREE.MathUtils.clamp(Math.abs(x)/localHalfW,0,1);
      z+=Math.sign(z)*.055*(1-across*across);
    }
    if(longitudinal>.66){
      let t=THREE.MathUtils.clamp((longitudinal-.66)/.34,0,1);
      t=Math.sin(t*Math.PI*.5);
      const centerLift=.82+.18*(1-THREE.MathUtils.clamp(Math.abs(x)/halfW,0,1));
      y+=upturn*t*t*centerLift;
    }
    position.setXYZ(i,x,y,z);
  }
  position.needsUpdate=true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createSnowboardEquipment({
  centerX=0,z=0,boardY=.040,topColor=0x8b3fd1,stanceHalfLength=.28,
  leftBindingX=0,rightBindingX=0,leftBindingZ=null,rightBindingZ=null
}={}){
  const bindingOffset=THREE.MathUtils.clamp(Number(stanceHalfLength)||.28,.19,.40);
  const root=new THREE.Group();
  root.name='snowboard-equipment';

  const edgeMaterial=new THREE.MeshStandardMaterial({color:0x101820,roughness:.22,metalness:.62});
  const deckMaterial=new THREE.MeshPhysicalMaterial({
    color:topColor,roughness:.24,metalness:.06,clearcoat:.74,clearcoatRoughness:.24,
    sheen:.14,sheenColor:new THREE.Color(0xd9f2ff),sheenRoughness:.46,
    emissive:0x000000,emissiveIntensity:0
  });
  const graphicMaterial=new THREE.MeshStandardMaterial({
    color:0xffd95e,roughness:.28,metalness:.08,emissive:0x3b2200,emissiveIntensity:.10
  });
  const accentMaterial=new THREE.MeshPhysicalMaterial({
    color:0x73e4ff,roughness:.22,metalness:.22,clearcoat:.58,clearcoatRoughness:.24,
    emissive:0x073b4a,emissiveIntensity:.14
  });
  const bindingMaterial=new THREE.MeshStandardMaterial({color:0x15212b,roughness:.32,metalness:.30});
  const bindingPadMaterial=new THREE.MeshStandardMaterial({color:0x263744,roughness:.44,metalness:.12});
  const strapMaterial=new THREE.MeshStandardMaterial({color:0xeaf8fb,roughness:.24,metalness:.18});
  const buckleMaterial=new THREE.MeshStandardMaterial({color:0x8fa8b5,roughness:.24,metalness:.72});
  const powerMaterials=[deckMaterial,graphicMaterial,accentMaterial];
  const powerBase=powerMaterials.map(mat=>({emissive:mat.emissive.clone(),intensity:mat.emissiveIntensity||0}));
  const powerColor=new THREE.Color(0x1b7be5);
  const powerBloomMaterial=new THREE.MeshBasicMaterial({
    color:new THREE.Color().setRGB(.025,1.05,11.6),toneMapped:false,fog:false
  });
  const bloomStrips=[];
  for(const side of [-1,1]){
    const strip=new THREE.Mesh(new THREE.BoxGeometry(.014,.006,1.38),powerBloomMaterial);
    strip.position.set(side*.245,.070,0);
    strip.visible=false;
    root.add(strip);
    bloomStrips.push(strip);
  }
  function setPowerGlow(level=0,time=0){
    const strength=THREE.MathUtils.clamp(Number(level)||0,0,1);
    for(const strip of bloomStrips)strip.visible=strength>.001;
    powerMaterials.forEach((mat,index)=>{
      const base=powerBase[index];
      mat.emissive.copy(base.emissive).lerp(powerColor,strength*(index===0?.82:1));
      mat.emissiveIntensity=base.intensity+strength*(index===0?1.08:1.55);
    });
    root.userData.powerGlow=strength;
    return strength;
  }

  const edge=new THREE.Mesh(makeBoardGeometry(.72,2.24,.054,.210),edgeMaterial);
  edge.castShadow=edge.receiveShadow=true;
  root.add(edge);

  const deck=new THREE.Mesh(makeBoardGeometry(.68,2.20,.038,.224),deckMaterial);
  deck.position.y=.026;
  deck.castShadow=deck.receiveShadow=true;
  root.add(deck);

  const stripe=new THREE.Mesh(new THREE.BoxGeometry(.055,.009,1.22),graphicMaterial);
  stripe.position.set(0,.061,.02);
  root.add(stripe);

  for(const side of [-1,1]){
    const edgeAccent=new THREE.Mesh(new THREE.BoxGeometry(.024,.008,1.46),accentMaterial);
    edgeAccent.position.set(side*.235,.063,.015);
    edgeAccent.rotation.y=side*.012;
    root.add(edgeAccent);
  }

  for(const endSign of [-1,1]){
    const endGraphic=new THREE.Mesh(new THREE.BoxGeometry(.22,.010,.055),graphicMaterial);
    endGraphic.position.set(0,.064,endSign*.80);
    endGraphic.rotation.y=endSign*.18;
    root.add(endGraphic);

    const tipBadge=new THREE.Mesh(new THREE.RingGeometry(.055,.105,18),endSign>0?accentMaterial:graphicMaterial);
    tipBadge.rotation.x=-Math.PI/2;
    tipBadge.position.set(0,.069,endSign*.86);
    tipBadge.scale.y=.76;
    root.add(tipBadge);
  }

  const resolvedLeftZ=Number.isFinite(leftBindingZ)
    ?THREE.MathUtils.clamp(leftBindingZ,-.44,-.18)
    :-bindingOffset;
  const resolvedRightZ=Number.isFinite(rightBindingZ)
    ?THREE.MathUtils.clamp(rightBindingZ,.18,.44)
    :bindingOffset;
  const bindingSpecs=[
    {foot:'left',role:'front',xOffset:THREE.MathUtils.clamp(Number(leftBindingX)||0,-.12,.12),zOffset:resolvedLeftZ,angle:-.18},
    {foot:'right',role:'rear',xOffset:THREE.MathUtils.clamp(Number(rightBindingX)||0,-.12,.12),zOffset:resolvedRightZ,angle:.12}
  ];
  for(const [index,spec] of bindingSpecs.entries()){
    const sign=index===0?-1:1;
    const binding=new THREE.Group();
    binding.name=`snowboard-${spec.foot}-${spec.role}-binding`;
    binding.userData.foot=spec.foot;
    binding.userData.stanceRole=spec.role;
    binding.position.set(spec.xOffset,.072,spec.zOffset);
    binding.rotation.y=spec.angle;

    const plate=new THREE.Mesh(new THREE.BoxGeometry(.44,.046,.19),bindingMaterial);
    plate.castShadow=true;
    binding.add(plate);

    const pad=new THREE.Mesh(new THREE.BoxGeometry(.35,.018,.15),bindingPadMaterial);
    pad.position.y=.033;
    pad.castShadow=true;
    binding.add(pad);

    const strap=new THREE.Mesh(new THREE.BoxGeometry(.46,.036,.054),strapMaterial);
    strap.position.set(0,.062,-.004);
    strap.rotation.z=sign*.025;
    strap.castShadow=true;
    binding.add(strap);

    for(const buckleX of [-.155,.155]){
      const buckle=new THREE.Mesh(new THREE.BoxGeometry(.055,.040,.060),buckleMaterial);
      buckle.position.set(buckleX,.079,-.004);
      buckle.rotation.z=sign*.035;
      buckle.castShadow=true;
      binding.add(buckle);
    }

    const toeRamp=new THREE.Mesh(new THREE.BoxGeometry(.36,.028,.095),bindingMaterial);
    toeRamp.position.set(0,.058,-.095*sign);
    toeRamp.rotation.x=-sign*.10;
    toeRamp.castShadow=true;
    binding.add(toeRamp);

    const heel=new THREE.Mesh(new THREE.BoxGeometry(.32,.14,.050),bindingMaterial);
    heel.position.set(0,.098,.078*sign);
    heel.rotation.x=sign*.15;
    heel.castShadow=true;
    binding.add(heel);

    root.add(binding);
  }

  root.position.set(centerX,boardY,z);
  root.userData.restPosition=root.position.clone();
  root.userData.stance='regular';
  root.userData.frontFoot='left';
  root.userData.rearFoot='right';
  root.userData.stanceHalfLength=bindingOffset;
  root.userData.boardWidth=.68;
  root.userData.boardLength=2.20;
  root.userData.deckTopOffset=.064;
  root.userData.setPowerGlow=setPowerGlow;
  setPowerGlow(0,0);

  const trailContacts=[-1,1].map(side=>{
    const contact=new THREE.Object3D();
    contact.position.set(side*.285,.006,.46);
    contact.name=side<0?'snowboard-left-edge-contact':'snowboard-right-edge-contact';
    root.add(contact);
    return contact;
  });

  return {root,trailContacts,setPowerGlow};
}
