import * as THREE from 'three';

const INITIAL_DELAY_MIN=.7;
const INITIAL_DELAY_MAX=1.8;
const REPEAT_DELAY_MIN=2.2;
const REPEAT_DELAY_MAX=4.8;
const MAX_ACTIVE=7;
const TYPE_WEIGHTS=Object.freeze([
  ['birds',.18],
  ['plane',.26],
  ['zeppelin',.14],
  ['ufo',.24],
  ['fighter',.18]
]);

const clamp01=value=>THREE.MathUtils.clamp(value,0,1);
const smoothstep=value=>{
  const t=clamp01(value);
  return t*t*(3-2*t);
};
const randomRange=(min,max)=>min+Math.random()*(max-min);

function material(options,role='body',basic=false){
  const m=basic?new THREE.MeshBasicMaterial(options):new THREE.MeshStandardMaterial(options);
  if(role==='light')m.toneMapped=false;
  m.userData.flybyBaseColor=m.color?.clone?.()||null;
  m.userData.flybyRole=role;
  return m;
}
function disableShadows(root){
  root.traverse(object=>{
    if(object.isMesh){
      object.castShadow=false;
      object.receiveShadow=false;
    }
  });
  return root;
}

function makePlane(){
  const root=new THREE.Group();
  root.name='AmbientPlaneFlyby';
  root.userData.flybyType='plane';
  const body=material({color:0xdce5eb,roughness:.46,metalness:.30},'metal');
  const dark=material({color:0x2b4359,roughness:.42,metalness:.16},'dark');
  const accent=material({color:0xe05f42,roughness:.48,metalness:.08},'accent');

  const fuselage=new THREE.Mesh(new THREE.CylinderGeometry(.23,.31,2.7,10),body);
  fuselage.rotation.z=Math.PI/2;root.add(fuselage);
  const nose=new THREE.Mesh(new THREE.ConeGeometry(.24,.52,10),body);
  nose.rotation.z=-Math.PI/2;nose.position.x=1.58;root.add(nose);
  const wing=new THREE.Mesh(new THREE.BoxGeometry(1.18,.06,3.25),dark);
  wing.position.x=-.08;root.add(wing);
  const tailWing=new THREE.Mesh(new THREE.BoxGeometry(.58,.05,1.34),accent);
  tailWing.position.x=-1.10;root.add(tailWing);
  const tail=new THREE.Mesh(new THREE.BoxGeometry(.52,.78,.06),dark);
  tail.position.set(-1.12,.34,0);tail.rotation.z=-.18;root.add(tail);
  for(const [z,color] of [[-1.55,0xff4b55],[1.55,0x66ff9c]]){
    const lampMaterial=material({color,transparent:true,opacity:1,depthWrite:false},'light',true);
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(.088,8,6),lampMaterial);
    lamp.position.set(-.04,.03,z);root.add(lamp);
  }
  const strobeMaterial=material({color:0xe9fbff,transparent:true,opacity:1,depthWrite:false},'light',true);
  const strobe=new THREE.Mesh(new THREE.SphereGeometry(.075,8,6),strobeMaterial);
  strobe.position.set(-1.02,.46,0);root.add(strobe);
  return disableShadows(root);
}

function makeBirdFlock(){
  const root=new THREE.Group();
  root.name='AmbientBirdFlock';
  root.userData.flybyType='birds';
  const dark=material({color:0x202b34,roughness:.9,metalness:0},'dark',true);
  const wingGeometry=new THREE.BoxGeometry(.34,.025,.055);
  const positions=[
    [0,0,0],[-.55,-.05,.30],[-1.05,.02,.62],[-1.52,-.08,.93],
    [.55,.04,.30],[1.05,-.02,.62],[1.52,.07,.93],
    [-.82,.18,1.12],[.82,.14,1.12]
  ];
  positions.forEach(([x,y,z],index)=>{
    const bird=new THREE.Group();
    bird.name='Bird-'+index;
    const left=new THREE.Mesh(wingGeometry,dark);
    left.position.x=-.16;left.rotation.z=.28;
    const right=new THREE.Mesh(wingGeometry,dark);
    right.position.x=.16;right.rotation.z=-.28;
    bird.add(left,right);
    bird.position.set(x,y,z);
    root.add(bird);
  });
  return disableShadows(root);
}

function makeZeppelin(){
  const root=new THREE.Group();
  root.name='AmbientZeppelin';
  root.userData.flybyType='zeppelin';
  const hull=material({color:0xc7d6df,roughness:.58,metalness:.18},'metal');
  const stripe=material({color:0x7f3047,roughness:.55,metalness:.08},'accent');
  const dark=material({color:0x334657,roughness:.62,metalness:.08},'dark');
  const warm=material({color:0xffd67a,transparent:true,opacity:.88,depthWrite:false},'light',true);

  const balloon=new THREE.Mesh(new THREE.SphereGeometry(1,18,10),hull);
  balloon.scale.set(3.1,1.05,1.05);root.add(balloon);
  const band=new THREE.Mesh(new THREE.TorusGeometry(.98,.07,6,22),stripe);
  band.rotation.y=Math.PI/2;band.scale.x=1.05;root.add(band);
  const gondola=new THREE.Mesh(new THREE.BoxGeometry(1.35,.28,.42),dark);
  gondola.position.y=-1.02;root.add(gondola);
  for(const x of [-.48,0,.48]){
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(.055,6,5),warm);
    lamp.position.set(x,-1.18,.23);root.add(lamp);
  }
  const fin=new THREE.Mesh(new THREE.BoxGeometry(.65,.8,.06),stripe);
  fin.position.set(-2.72,.42,0);fin.rotation.z=-.12;root.add(fin);
  return disableShadows(root);
}

function makeUfo(){
  const root=new THREE.Group();
  root.name='AmbientColorUfo';
  root.userData.flybyType='ufo';
  const hull=material({color:0x8ea8ba,roughness:.28,metalness:.76},'metal');
  const underside=material({color:0x27364c,roughness:.34,metalness:.58},'dark');
  const dome=material({color:0x72dcff,roughness:.12,metalness:.04,transparent:true,opacity:.76},'glass');
  const glowColors=[0x4df9ff,0xff5df0,0x8dff65,0xffd84d,0x718cff,0xff765f];

  const upper=new THREE.Mesh(new THREE.SphereGeometry(1,18,9),hull);
  upper.scale.set(1.7,.30,1.12);root.add(upper);
  const lower=new THREE.Mesh(new THREE.SphereGeometry(1,16,8),underside);
  lower.scale.set(1.18,.18,.80);lower.position.y=-.18;root.add(lower);
  const canopy=new THREE.Mesh(new THREE.SphereGeometry(.58,14,8,0,Math.PI*2,0,Math.PI*.55),dome);
  canopy.scale.set(1,.58,.82);canopy.position.y=.19;root.add(canopy);
  glowColors.forEach((color,index)=>{
    const light=material({color,transparent:true,opacity:.95,depthWrite:false},'light',true);
    const angle=index/glowColors.length*Math.PI*2;
    const bulb=new THREE.Mesh(new THREE.SphereGeometry(.112,8,6),light);
    bulb.position.set(Math.cos(angle)*1.12,-.20,Math.sin(angle)*.74);
    root.add(bulb);
  });
  const ringLight=material({color:0x60efff,transparent:true,opacity:.72,depthWrite:false,blending:THREE.AdditiveBlending},'light',true);
  const glowRing=new THREE.Mesh(new THREE.TorusGeometry(.94,.035,7,40),ringLight);
  glowRing.rotation.x=Math.PI/2;glowRing.position.y=-.205;root.add(glowRing);
  return disableShadows(root);
}

function makeFighter(){
  const root=new THREE.Group();
  root.name='AmbientHighTechFighter';
  root.userData.flybyType='fighter';
  const body=material({color:0x4f6070,roughness:.32,metalness:.68},'metal');
  const dark=material({color:0x18212c,roughness:.34,metalness:.50},'dark');
  const canopy=material({color:0x72cfff,roughness:.08,metalness:.10,transparent:true,opacity:.82},'glass');
  const engine=material({color:0x55e7ff,transparent:true,opacity:.98,depthWrite:false},'light',true);

  const fuselage=new THREE.Mesh(new THREE.ConeGeometry(.40,3.25,7),body);
  fuselage.rotation.z=-Math.PI/2;fuselage.position.x=.25;root.add(fuselage);
  const wing=new THREE.Mesh(new THREE.BoxGeometry(1.35,.07,3.55),dark);
  wing.position.x=-.28;wing.rotation.y=.12;root.add(wing);
  const noseCanopy=new THREE.Mesh(new THREE.SphereGeometry(.40,10,7),canopy);
  noseCanopy.scale.set(1.1,.42,.56);noseCanopy.position.set(.62,.25,0);root.add(noseCanopy);
  for(const z of [-.48,.48]){
    const thruster=new THREE.Mesh(new THREE.CylinderGeometry(.11,.18,.28,8),engine);
    thruster.rotation.z=Math.PI/2;thruster.position.set(-1.56,-.03,z);root.add(thruster);
  }
  return disableShadows(root);
}

function tintObject(object,skyColor){
  if(!skyColor?.isColor)return;
  object.traverse(node=>{
    if(!node.isMesh)return;
    const materials=Array.isArray(node.material)?node.material:[node.material];
    for(const mat of materials){
      const base=mat?.userData?.flybyBaseColor;
      if(!base||!mat.color)continue;
      const role=mat.userData.flybyRole;
      const amount=role==='dark'?.10:role==='light'?.025:.16;
      mat.color.copy(base).lerp(skyColor,amount);
    }
  });
}

function chooseType(){
  let roll=Math.random();
  for(const [type,weight] of TYPE_WEIGHTS){
    roll-=weight;
    if(roll<=0)return type;
  }
  return 'plane';
}

export function createAmbientFlybys({scene,camera}){
  const root=new THREE.Group();
  root.name='AmbientSkyFlybys';
  scene.add(root);

  const prototypes={
    plane:makePlane(),
    birds:makeBirdFlock(),
    zeppelin:makeZeppelin(),
    ufo:makeUfo(),
    fighter:makeFighter()
  };
  const active=[];
  let enabled=true;
  let nextEventIn=randomRange(INITIAL_DELAY_MIN,INITIAL_DELAY_MAX);
  let eventCount=0;
  let lastType='none';

  function removeAt(index){
    const item=active[index];
    if(!item)return;
    root.remove(item.object);
    active.splice(index,1);
  }
  function clearActive(){
    for(let i=active.length-1;i>=0;i--)removeAt(i);
  }
  function scheduleNext(initial=false){
    nextEventIn=randomRange(
      initial?INITIAL_DELAY_MIN:REPEAT_DELAY_MIN,
      initial?INITIAL_DELAY_MAX:REPEAT_DELAY_MAX
    );
  }
  function spawn(type=chooseType()){
    if(!enabled||active.length>=MAX_ACTIVE)return false;
    const prototype=prototypes[type]||prototypes.plane;
    const object=prototype.clone(true);
    object.visible=true;

    const direction=Math.random()<.5?1:-1;
    const centerX=camera?.position?.x||0;
    const centerY=camera?.position?.y||0;
    const centerZ=camera?.position?.z||0;
    const depth=randomRange(
      type==='birds'?36:type==='ufo'?44:type==='fighter'?50:type==='plane'?56:72,
      type==='birds'?52:type==='ufo'?72:type==='fighter'?78:type==='plane'?88:105
    );
    const altitude=randomRange(
      type==='birds'?10:type==='ufo'?9:type==='fighter'?12:type==='plane'?14:20,
      type==='birds'?15:type==='ufo'?16:type==='fighter'?19:type==='plane'?22:29
    );
    const lateralStart=randomRange(36,54);
    const lateralEnd=randomRange(36,56);
    const duration={
      birds:randomRange(12,17),
      plane:randomRange(11,15),
      zeppelin:randomRange(19,25),
      ufo:randomRange(10,15),
      fighter:randomRange(7.5,10.5)
    }[type]||14;

    object.position.set(centerX-direction*lateralStart,centerY+altitude,centerZ-depth);
    const scale={
      birds:randomRange(.72,1.08),
      plane:randomRange(.84,1.14),
      zeppelin:randomRange(.78,1.05),
      ufo:randomRange(.82,1.18),
      fighter:randomRange(.80,1.08)
    }[type]||1;
    object.scale.setScalar(scale);

    if(type==='ufo')object.rotation.set(0,randomRange(-Math.PI,Math.PI),0);
    else object.rotation.set(0,direction>0?0:Math.PI,randomRange(-.04,.04));

    root.add(object);
    active.push({
      object,type,direction,duration,elapsed:0,
      startX:centerX-direction*lateralStart,
      endX:centerX+direction*lateralEnd,
      baseY:centerY+altitude,
      startZ:centerZ-depth,
      zDrift:randomRange(-8,5),
      arc:type==='ufo'?randomRange(1.0,2.4):type==='birds'?randomRange(.4,1.2):randomRange(.2,.8),
      wobblePhase:randomRange(0,Math.PI*2)
    });
    eventCount++;
    lastType=type;
    return true;
  }

  function reset(){
    clearActive();
    eventCount=0;
    lastType='none';
    // Populate the sky immediately instead of waiting for one rare flyby.
    spawn('birds');
    spawn(Math.random()<.5?'plane':'fighter');
    spawn(Math.random()<.5?'zeppelin':'ufo');
    scheduleNext(true);
  }
  function setEnabled(value=true){
    enabled=!!value;
    if(!enabled)clearActive();
    else if(!active.length)reset();
    return enabled;
  }

  function update(dt,{running=true,skyColor=null}={}){
    if(!Number.isFinite(dt)||dt<=0||!enabled)return;

    if(running){
      nextEventIn=Math.max(0,nextEventIn-dt);
      if(nextEventIn<=0){
        spawn();
        scheduleNext(false);
      }
    }

    for(let i=active.length-1;i>=0;i--){
      const item=active[i];
      const {object,type,direction}=item;
      if(!running){
        tintObject(object,skyColor);
        continue;
      }

      item.elapsed+=dt;
      const raw=item.elapsed/item.duration;
      const t=smoothstep(raw);
      object.position.x=THREE.MathUtils.lerp(item.startX,item.endX,t);
      object.position.y=item.baseY+Math.sin(t*Math.PI)*item.arc;
      object.position.z=item.startZ+item.zDrift*t;

      if(type==='ufo'){
        object.rotation.y+=dt*1.15*direction;
        object.rotation.z=Math.sin(item.elapsed*1.25+item.wobblePhase)*.075;
        object.position.y+=Math.sin(item.elapsed*1.8+item.wobblePhase)*.22;
      }else if(type==='birds'){
        object.rotation.z=direction*Math.sin(item.elapsed*2.2+item.wobblePhase)*.035;
        object.position.y+=Math.sin(item.elapsed*2.7+item.wobblePhase)*.14;
        object.children.forEach((bird,index)=>{
          bird.rotation.x=Math.sin(item.elapsed*6.5+index*.8)*.16;
        });
      }else if(type==='fighter'){
        object.rotation.x=Math.sin(item.elapsed*1.8+item.wobblePhase)*.045;
        object.rotation.z=direction*Math.sin(t*Math.PI)*-.095;
      }else if(type==='zeppelin'){
        object.rotation.z=Math.sin(item.elapsed*.55+item.wobblePhase)*.018;
        object.position.y+=Math.sin(item.elapsed*.65+item.wobblePhase)*.05;
      }else{
        object.rotation.x=Math.sin(item.elapsed*1.15+item.wobblePhase)*.025;
        object.rotation.z=direction*Math.sin(t*Math.PI)*-.045;
      }

      tintObject(object,skyColor);
      if(raw>=1)removeAt(i);
    }
  }

  function getDiagnostics(){
    return {
      activeType:active.map(item=>item.type).join(',')||'none',
      activeCount:active.length,
      nextEventIn,
      eventCount,
      lastType,
      sharedPrototypeCount:Object.keys(prototypes).length,
      maxActive:MAX_ACTIVE,
      enabled
    };
  }

  reset();
  return {root,update,reset,getDiagnostics,setEnabled};
}
