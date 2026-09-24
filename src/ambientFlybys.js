import * as THREE from 'three';

const INITIAL_DELAY_MIN=13;
const INITIAL_DELAY_MAX=24;
const REPEAT_DELAY_MIN=28;
const REPEAT_DELAY_MAX=52;
const UFO_CHANCE=.18;
const MAX_ACTIVE=1;

const clamp01=value=>THREE.MathUtils.clamp(value,0,1);
const smoothstep=value=>{
  const t=clamp01(value);
  return t*t*(3-2*t);
};
const randomRange=(min,max)=>min+Math.random()*(max-min);

function prepareMaterial(material,role='body'){
  material.userData.flybyBaseColor=material.color?.clone?.()||null;
  material.userData.flybyRole=role;
  return material;
}

function makePlane(){
  const root=new THREE.Group();
  root.name='AmbientPlaneFlyby';

  const body=prepareMaterial(new THREE.MeshStandardMaterial({
    color:0xd8e1e8,roughness:.48,metalness:.34
  }),'metal');
  const dark=prepareMaterial(new THREE.MeshStandardMaterial({
    color:0x31465b,roughness:.42,metalness:.18
  }),'dark');
  const accent=prepareMaterial(new THREE.MeshStandardMaterial({
    color:0xd76243,roughness:.50,metalness:.08
  }),'accent');
  const glass=prepareMaterial(new THREE.MeshPhysicalMaterial({
    color:0x86b9d5,roughness:.16,metalness:.08,transparent:true,opacity:.82,
    transmission:.10,clearcoat:.52,clearcoatRoughness:.24
  }),'glass');

  const fuselage=new THREE.Mesh(new THREE.CylinderGeometry(.23,.31,2.55,12),body);
  fuselage.rotation.z=Math.PI/2;
  root.add(fuselage);

  const nose=new THREE.Mesh(new THREE.ConeGeometry(.24,.48,12),body);
  nose.rotation.z=-Math.PI/2;
  nose.position.x=1.49;
  root.add(nose);

  const cockpit=new THREE.Mesh(new THREE.SphereGeometry(.25,12,8),glass);
  cockpit.scale.set(1.24,.48,.76);
  cockpit.position.set(.48,.20,0);
  root.add(cockpit);

  const wing=new THREE.Mesh(new THREE.BoxGeometry(1.10,.055,3.05),dark);
  wing.position.x=-.10;
  wing.rotation.y=-.08;
  root.add(wing);

  const tailWing=new THREE.Mesh(new THREE.BoxGeometry(.52,.045,1.28),accent);
  tailWing.position.x=-1.03;
  root.add(tailWing);

  const tail=new THREE.Mesh(new THREE.BoxGeometry(.52,.74,.055),dark);
  tail.position.set(-1.05,.33,0);
  tail.rotation.z=-.18;
  root.add(tail);

  const lightMaterial=prepareMaterial(new THREE.MeshBasicMaterial({
    color:0xf8e4a0,transparent:true,opacity:.78,depthWrite:false
  }),'light');
  for(const z of [-1.48,1.48]){
    const light=new THREE.Mesh(new THREE.SphereGeometry(.055,8,6),lightMaterial);
    light.position.set(-.06,.02,z);
    root.add(light);
  }

  root.userData.flybyMaterials=[body,dark,accent,glass,lightMaterial];
  root.userData.flybyType='plane';
  root.traverse(object=>{
    if(object.isMesh){
      object.castShadow=false;
      object.receiveShadow=false;
    }
  });
  return root;
}

function makeUfo(){
  const root=new THREE.Group();
  root.name='AmbientUfoFlyby';

  const hull=prepareMaterial(new THREE.MeshStandardMaterial({
    color:0x8da7b8,roughness:.30,metalness:.72
  }),'metal');
  const underside=prepareMaterial(new THREE.MeshStandardMaterial({
    color:0x34445d,roughness:.35,metalness:.52
  }),'dark');
  const dome=prepareMaterial(new THREE.MeshPhysicalMaterial({
    color:0x81d8df,roughness:.12,metalness:.04,transparent:true,opacity:.75,
    transmission:.18,clearcoat:.62,clearcoatRoughness:.18
  }),'glass');
  const glow=prepareMaterial(new THREE.MeshBasicMaterial({
    color:0x92f4dc,transparent:true,opacity:.48,depthWrite:false
  }),'light');

  const upper=new THREE.Mesh(new THREE.SphereGeometry(1,20,10),hull);
  upper.scale.set(1.55,.28,1.05);
  root.add(upper);

  const lower=new THREE.Mesh(new THREE.SphereGeometry(1,18,8),underside);
  lower.scale.set(1.12,.17,.78);
  lower.position.y=-.17;
  root.add(lower);

  const canopy=new THREE.Mesh(new THREE.SphereGeometry(.55,16,10,0,Math.PI*2,0,Math.PI*.55),dome);
  canopy.scale.set(1,.56,.82);
  canopy.position.y=.18;
  root.add(canopy);

  const ring=new THREE.Mesh(new THREE.TorusGeometry(.86,.035,8,28),glow);
  ring.rotation.x=Math.PI/2;
  ring.position.y=-.20;
  root.add(ring);

  root.userData.flybyMaterials=[hull,underside,dome,glow];
  root.userData.flybyType='ufo';
  root.traverse(object=>{
    if(object.isMesh){
      object.castShadow=false;
      object.receiveShadow=false;
    }
  });
  return root;
}

function tintObject(object,skyColor){
  if(!skyColor?.isColor)return;
  for(const material of object.userData.flybyMaterials||[]){
    const base=material.userData.flybyBaseColor;
    if(!base||!material.color)continue;
    const role=material.userData.flybyRole;
    const amount=role==='dark'?.16:role==='light'?.08:.22;
    material.color.copy(base).lerp(skyColor,amount);
  }
}

export function createAmbientFlybys({scene,camera}){
  const root=new THREE.Group();
  root.name='AmbientSkyFlybys';
  scene.add(root);

  const prototypes={plane:makePlane(),ufo:makeUfo()};
  let active=null;
  let enabled=true;
  let nextEventIn=randomRange(INITIAL_DELAY_MIN,INITIAL_DELAY_MAX);
  let eventCount=0;
  let lastType='none';

  function disposeActive(){
    if(!active)return;
    root.remove(active.object);
    active.object.visible=false;
    active=null;
  }

  function scheduleNext(initial=false){
    nextEventIn=randomRange(
      initial?INITIAL_DELAY_MIN:REPEAT_DELAY_MIN,
      initial?INITIAL_DELAY_MAX:REPEAT_DELAY_MAX
    );
  }

  function spawn(){
    if(active||root.children.length>=MAX_ACTIVE)return false;

    const type=Math.random()<UFO_CHANCE?'ufo':'plane';
    const object=prototypes[type];
    object.visible=true;
    const direction=Math.random()<.5?1:-1;
    const depth=randomRange(55,92);
    const altitude=randomRange(15.5,24.5);
    const lateralStart=randomRange(43,57);
    const lateralEnd=randomRange(43,57);
    const duration=type==='ufo'?randomRange(12.5,17.5):randomRange(11.5,15.5);
    const centerX=camera?.position?.x||0;
    const centerY=camera?.position?.y||0;
    const centerZ=camera?.position?.z||0;

    object.position.set(
      centerX-direction*lateralStart,
      centerY+altitude,
      centerZ-depth
    );
    object.scale.setScalar(type==='ufo'?randomRange(.58,.82):randomRange(.66,.92));
    if(type==='plane')object.rotation.set(0,direction>0?0:Math.PI,randomRange(-.035,.035));
    else object.rotation.set(0,randomRange(-Math.PI,Math.PI),randomRange(-.035,.035));
    root.add(object);

    active={
      object,type,direction,duration,elapsed:0,
      startX:centerX-direction*lateralStart,
      endX:centerX+direction*lateralEnd,
      baseY:centerY+altitude,
      startZ:centerZ-depth,
      zDrift:randomRange(-5.5,4.0),
      arc:type==='ufo'?randomRange(.7,1.8):randomRange(.25,.9),
      wobblePhase:randomRange(0,Math.PI*2)
    };
    eventCount++;
    lastType=type;
    return true;
  }

  function reset(){
    disposeActive();
    scheduleNext(true);
    eventCount=0;
    lastType='none';
  }

  function setEnabled(value=true){
    enabled=!!value;
    if(!enabled)disposeActive();
    return enabled;
  }

  function update(dt,{running=true,skyColor=null}={}){
    if(!Number.isFinite(dt)||dt<=0||!enabled)return;

    if(!running){
      if(active)tintObject(active.object,skyColor);
      return;
    }

    if(!active){
      nextEventIn=Math.max(0,nextEventIn-dt);
      if(nextEventIn<=0){
        spawn();
        scheduleNext(false);
      }
      return;
    }

    active.elapsed+=dt;
    const raw=active.elapsed/active.duration;
    const t=smoothstep(raw);
    const {object,type,direction}=active;
    object.position.x=THREE.MathUtils.lerp(active.startX,active.endX,t);
    object.position.y=active.baseY+Math.sin(t*Math.PI)*active.arc;
    object.position.z=active.startZ+active.zDrift*t;

    if(type==='plane'){
      object.rotation.x=Math.sin(t*Math.PI*2+active.wobblePhase)*.025;
      object.rotation.z=direction*Math.sin(t*Math.PI)*-.045;
    }else{
      object.rotation.y+=dt*.42*direction;
      object.rotation.z=Math.sin(active.elapsed*.82+active.wobblePhase)*.035;
      object.position.y+=Math.sin(active.elapsed*1.28+active.wobblePhase)*.08;
    }
    tintObject(object,skyColor);

    if(raw>=1)disposeActive();
  }

  function getDiagnostics(){
    return {
      activeType:active?.type||'none',
      nextEventIn,
      eventCount,
      lastType,
      sharedPrototypeCount:2,
      enabled
    };
  }

  reset();
  return {root,update,reset,getDiagnostics,setEnabled};
}
