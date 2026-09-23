import * as THREE from 'three';

export const START_CROWD_COUNT=20;
const UNIQUE_PORTRAITS=8;
const ROWS=[
  {count:7,z:6.25,rise:.45},
  {count:7,z:7.65,rise:.92},
  {count:6,z:9.05,rise:1.39}
];

function fallbackPortraitTexture(){
  const canvas=document.createElement('canvas');
  canvas.width=256;canvas.height=320;
  const ctx=canvas.getContext('2d');
  const gradient=ctx.createLinearGradient(0,0,0,320);
  gradient.addColorStop(0,'#183f5c');
  gradient.addColorStop(1,'#071d31');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,256,320);
  ctx.fillStyle='#ffe07a';
  ctx.beginPath();ctx.arc(128,132,64,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#5d3a22';
  ctx.beginPath();ctx.arc(128,138,49,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#f4c88d';
  ctx.beginPath();ctx.ellipse(128,150,36,29,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#101923';
  ctx.beginPath();ctx.arc(111,128,6,0,Math.PI*2);ctx.arc(145,128,6,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#101923';ctx.lineWidth=5;ctx.lineCap='round';
  ctx.beginPath();ctx.arc(128,151,18,.22*Math.PI,.78*Math.PI);ctx.stroke();
  ctx.fillStyle='#d7f5ff';ctx.font='700 21px system-ui,sans-serif';ctx.textAlign='center';
  ctx.fillText('CHIMPION',128,276);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.needsUpdate=true;
  return texture;
}

function setTexture(material,texture){
  material.map=texture;
  material.color.set(0xffffff);
  material.needsUpdate=true;
}

export function createStartCrowd({world,terrainHeight=()=>0}={}){
  const root=new THREE.Group();
  root.name='start-crowd';
  world?.add(root);

  const bleacherMaterial=new THREE.MeshStandardMaterial({color:0x825a36,roughness:.82,metalness:.02});
  const railMaterial=new THREE.MeshStandardMaterial({color:0xdce8ec,roughness:.42,metalness:.58});
  const frameMaterial=new THREE.MeshStandardMaterial({color:0x16364b,roughness:.62,metalness:.05});
  const seatGeometry=new THREE.BoxGeometry(17,.18,.86);
  const railGeometry=new THREE.BoxGeometry(17,.08,.08);
  const frameGeometry=new THREE.BoxGeometry(1.16,1.42,.06);
  const portraitGeometry=new THREE.PlaneGeometry(1.06,1.30);
  const fallback=fallbackPortraitTexture();
  const portraitMaterials=[];
  const actors=[];
  const textureCache=new Map();

  let actorIndex=0;
  for(let rowIndex=0;rowIndex<ROWS.length;rowIndex++){
    const row=ROWS[rowIndex];
    const ground=terrainHeight(0,row.z);
    const seatY=ground+row.rise;

    const seat=new THREE.Mesh(seatGeometry,bleacherMaterial);
    seat.position.set(0,seatY,row.z);
    seat.castShadow=false;seat.receiveShadow=true;
    root.add(seat);

    const rail=new THREE.Mesh(railGeometry,railMaterial);
    rail.position.set(0,seatY+1.64,row.z+.48);
    root.add(rail);

    for(const railX of [-8.35,8.35]){
      const upright=new THREE.Mesh(new THREE.BoxGeometry(.08,1.72,.08),railMaterial);
      upright.position.set(railX,seatY+.82,row.z+.48);
      root.add(upright);
    }

    for(let column=0;column<row.count;column++){
      const t=row.count===1?.5:column/(row.count-1);
      const x=THREE.MathUtils.lerp(-7.35,7.35,t)+(rowIndex===1?.16:rowIndex===2?-.11:0);
      const actor=new THREE.Group();
      actor.name='start-spectator-'+actorIndex;
      const baseY=seatY+.88;
      actor.position.set(x,baseY,row.z-.08);

      const frame=new THREE.Mesh(frameGeometry,frameMaterial);
      frame.position.z=.025;
      actor.add(frame);

      const portraitMaterial=new THREE.MeshBasicMaterial({
        map:fallback,
        side:THREE.DoubleSide,
        toneMapped:false
      });
      portraitMaterials.push(portraitMaterial);
      const portrait=new THREE.Mesh(portraitGeometry,portraitMaterial);
      portrait.position.z=-.012;
      actor.add(portrait);

      const amp=actorIndex%5===0?0:.09+(actorIndex%4)*.045;
      actor.userData.baseY=baseY;
      actor.userData.jumpAmplitude=amp;
      actor.userData.jumpHz=.72+(actorIndex%7)*.13;
      actor.userData.phase=(actorIndex*.61803398875%1)*Math.PI*2;
      actor.userData.sway=(actorIndex%2?-1:1)*(.012+(actorIndex%3)*.006);
      actors.push(actor);
      root.add(actor);
      actorIndex++;
    }
  }

  const loader=new THREE.TextureLoader();
  function loadPortrait(url,materials){
    if(!url)return;
    if(textureCache.has(url)){
      const cached=textureCache.get(url);
      if(cached)for(const material of materials)setTexture(material,cached);
      return;
    }
    textureCache.set(url,null);
    loader.load(url,texture=>{
      texture.colorSpace=THREE.SRGBColorSpace;
      texture.anisotropy=2;
      textureCache.set(url,texture);
      for(const material of materials)setTexture(material,texture);
    },undefined,()=>textureCache.delete(url));
  }

  function setSpectators(entries=[]){
    const usable=entries.filter(entry=>entry?.image);
    if(!usable.length)return;
    const pool=[];
    for(let i=0;i<Math.min(UNIQUE_PORTRAITS,usable.length);i++){
      pool.push(usable[Math.floor(i*usable.length/Math.min(UNIQUE_PORTRAITS,usable.length))]);
    }
    const assignments=new Map();
    portraitMaterials.forEach((material,index)=>{
      setTexture(material,fallback);
      const url=pool[index%pool.length]?.image;
      if(!url)return;
      if(!assignments.has(url))assignments.set(url,[]);
      assignments.get(url).push(material);
    });
    for(const [url,materials] of assignments)loadPortrait(url,materials);
  }

  let clock=0;
  function reset(){
    root.position.z=0;
    root.visible=true;
    clock=0;
    for(const actor of actors){
      actor.position.y=actor.userData.baseY;
      actor.rotation.z=0;
    }
  }

  function update(dt,{mode='menu',worldDistance=0,time=0}={}){
    root.position.z+=Math.max(0,Number(worldDistance)||0);
    root.visible=root.position.z<28;
    if(!root.visible)return;
    const moving=mode==='countdown'||(mode==='playing'&&root.position.z<13);
    if(moving)clock+=(Math.max(0,Number(dt)||0));
    const t=Number.isFinite(time)?time:clock;
    for(const actor of actors){
      const amp=moving?actor.userData.jumpAmplitude:0;
      const wave=Math.sin((clock*actor.userData.jumpHz+t*.035)*Math.PI*2+actor.userData.phase);
      const jump=amp*Math.pow(Math.max(0,wave),4);
      actor.position.y=actor.userData.baseY+jump;
      actor.rotation.z=moving?Math.sin(clock*(1.5+actor.userData.jumpHz)+actor.userData.phase)*actor.userData.sway:0;
    }
  }

  return {
    setSpectators,
    reset,
    update,
    get count(){return actors.length;},
    get visible(){return root.visible;}
  };
}
