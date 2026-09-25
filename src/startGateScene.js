import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

function canvasTexture(width,height,draw){
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');
  draw(ctx,width,height);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
  texture.needsUpdate=true;
  return texture;
}

function createBannerTexture(){
  return canvasTexture(1536,320,(ctx,w,h)=>{
    const bg=ctx.createLinearGradient(0,0,w,h);
    bg.addColorStop(0,'#031e34');
    bg.addColorStop(.24,'#073e63');
    bg.addColorStop(.5,'#062b49');
    bg.addColorStop(.76,'#073e63');
    bg.addColorStop(1,'#031e34');
    ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);

    const border=ctx.createLinearGradient(0,0,w,0);
    border.addColorStop(0,'#d6a931');border.addColorStop(.5,'#ffe277');border.addColorStop(1,'#d6a931');
    ctx.fillStyle=border;ctx.fillRect(0,0,w,24);ctx.fillRect(0,h-24,w,24);

    ctx.fillStyle='rgba(37,214,255,.92)';
    const drawChevron=(x,y,scale=1)=>{
      ctx.beginPath();
      ctx.moveTo(x,y);
      ctx.lineTo(x+72*scale,y);
      ctx.lineTo(x+122*scale,y+50*scale);
      ctx.lineTo(x+72*scale,y+100*scale);
      ctx.lineTo(x,y+100*scale);
      ctx.lineTo(x+50*scale,y+50*scale);
      ctx.closePath();
      ctx.fill();
    };
    drawChevron(58,110,.72);drawChevron(170,110,.72);drawChevron(282,110,.72);
    ctx.save();ctx.translate(w,0);ctx.scale(-1,1);
    drawChevron(58,110,.72);drawChevron(170,110,.72);drawChevron(282,110,.72);
    ctx.restore();

    ctx.strokeStyle='rgba(91,235,255,.58)';ctx.lineWidth=8;
    ctx.beginPath();ctx.moveTo(24,56);ctx.lineTo(510,56);ctx.moveTo(w-510,56);ctx.lineTo(w-24,56);ctx.stroke();
    ctx.beginPath();ctx.moveTo(24,h-56);ctx.lineTo(510,h-56);ctx.moveTo(w-510,h-56);ctx.lineTo(w-24,h-56);ctx.stroke();

    const plateGlow=ctx.createLinearGradient(w*.31,0,w*.69,0);
    plateGlow.addColorStop(0,'rgba(55,210,255,.08)');
    plateGlow.addColorStop(.5,'rgba(255,222,110,.14)');
    plateGlow.addColorStop(1,'rgba(55,210,255,.08)');
    ctx.fillStyle=plateGlow;
    ctx.fillRect(w*.31,66,w*.38,h-132);
    ctx.strokeStyle='rgba(120,235,255,.32)';
    ctx.lineWidth=6;
    ctx.strokeRect(w*.31,66,w*.38,h-132);

    ctx.save();
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.shadowColor='rgba(30,210,255,.42)';
    ctx.shadowBlur=20;
    ctx.fillStyle='#effbff';
    ctx.font='900 62px Inter, Arial, sans-serif';
    ctx.fillText('CHIMPIONS SKI',w*.5,h*.36);
    ctx.shadowColor='rgba(255,210,80,.42)';
    ctx.shadowBlur=16;
    ctx.fillStyle='#ffd95c';
    ctx.font='1000 108px Inter, Arial, sans-serif';
    ctx.fillText('START',w*.5,h*.66);
    ctx.restore();

    for(const x of [18,w-18]){
      ctx.fillStyle='#f9dd75';
      ctx.beginPath();ctx.arc(x,12,5,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(x,h-12,5,0,Math.PI*2);ctx.fill();
    }
  });
}

function createFenceTexture(){
  return canvasTexture(512,192,(ctx,w,h)=>{
    ctx.clearRect(0,0,w,h);
    ctx.strokeStyle='#ff5e38';
    ctx.lineWidth=12;
    ctx.globalAlpha=.96;
    for(let x=-h;x<w+h;x+=52){
      ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+h,h);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x+h,0);ctx.lineTo(x,h);ctx.stroke();
    }
    ctx.lineWidth=10;
    ctx.beginPath();ctx.moveTo(0,8);ctx.lineTo(w,8);ctx.moveTo(0,h-8);ctx.lineTo(w,h-8);ctx.stroke();
  });
}

function createFlagTexture(primary=0x1561ae,accent=0xffffff){
  const p='#'+new THREE.Color(primary).getHexString();
  const a='#'+new THREE.Color(accent).getHexString();
  return canvasTexture(256,512,(ctx,w,h)=>{
    ctx.fillStyle=p;ctx.fillRect(0,0,w,h);
    ctx.fillStyle='rgba(255,255,255,.08)';
    for(let y=0;y<h;y+=38)ctx.fillRect(0,y,w,12);
    ctx.fillStyle=a;
    ctx.beginPath();
    ctx.moveTo(w*.22,h*.53);ctx.lineTo(w*.48,h*.26);ctx.lineTo(w*.62,h*.43);ctx.lineTo(w*.74,h*.34);ctx.lineTo(w*.88,h*.58);
    ctx.lineTo(w*.22,h*.58);ctx.closePath();ctx.fill();
  });
}

function addMesh(parent,geometry,material,{position=null,rotation=null,scale=null,cast=false,receive=false,name=''}={}){
  const mesh=new THREE.Mesh(geometry,material);
  if(position)mesh.position.set(...position);
  if(rotation)mesh.rotation.set(...rotation);
  if(scale)mesh.scale.set(...scale);
  mesh.castShadow=cast;mesh.receiveShadow=receive;
  if(name)mesh.name=name;
  parent.add(mesh);
  return mesh;
}

function addSnowCluster(parent,material,x,y,z,sx=1,sz=1){
  const geometry=new THREE.SphereGeometry(1,14,8);
  const lumps=[
    [x,y,z,.52*sx,.10,.44*sz],
    [x-.28*sx,y+.015,z+.04,.34*sx,.085,.31*sz],
    [x+.31*sx,y+.010,z-.03,.39*sx,.090,.34*sz]
  ];
  for(const [px,py,pz,ax,ay,az] of lumps){
    addMesh(parent,geometry,material,{position:[px,py,pz],scale:[ax,ay,az],receive:true});
  }
}

function addTruss(parent,material,y,z,width=7.65){
  const beam=new THREE.BoxGeometry(width,.10,.10);
  addMesh(parent,beam,material,{position:[0,y+.48,z],cast:true});
  addMesh(parent,beam,material,{position:[0,y-.48,z],cast:true});
  const upright=new THREE.BoxGeometry(.10,1.02,.10);
  const diagonal=new THREE.BoxGeometry(.075,1.20,.075);
  for(let x=-width*.5+.18;x<=width*.5-.18;x+=.64){
    addMesh(parent,upright,material,{position:[x,y,z],cast:true});
    const d=addMesh(parent,diagonal,material,{position:[x+.26,y,z],cast:true});
    d.rotation.z=(Math.floor((x+width*.5)/.64)%2===0?1:-1)*.61;
  }
}

function addFloodlight(parent,housingMaterial,lightMaterial,x,y,z,side=1){
  const g=new THREE.Group();
  g.position.set(x,y,z);
  g.rotation.y=side<0 ? .30 : -.30;
  parent.add(g);
  addMesh(g,new RoundedBoxGeometry(.86,.58,.22,3,.06),housingMaterial,{position:[0,0,0],cast:true});
  addMesh(g,new RoundedBoxGeometry(.68,.40,.025,3,.045),lightMaterial,{position:[0,0,-.13],name:'start-floodlight-emitter'});
  for(const ox of [-.22,.22])for(const oy of [-.12,.12]){
    addMesh(g,new THREE.CircleGeometry(.082,16),lightMaterial,{position:[ox,oy,-.151],rotation:[0,Math.PI,0]});
  }
  const bracket=addMesh(g,new THREE.BoxGeometry(.12,.52,.10),housingMaterial,{position:[0,-.48,.08],cast:true});
  bracket.rotation.x=.18;
}

function addFlag(parent,poleMaterial,flagMaterial,x,z,ground,side=1){
  const poleHeight=2.55;
  addMesh(parent,new THREE.CylinderGeometry(.028,.034,poleHeight,8),poleMaterial,{position:[x,ground+poleHeight*.5,z],cast:true});
  const cap=addMesh(parent,new THREE.SphereGeometry(.055,8,6),poleMaterial,{position:[x,ground+poleHeight+.02,z]});
  cap.castShadow=true;
  const flag=addMesh(parent,new THREE.PlaneGeometry(.74,1.48,1,1),flagMaterial,{
    position:[x+side*.39,ground+1.78,z],rotation:[0,side<0?Math.PI:0,0],name:'start-side-flag'
  });
  flag.material.side=THREE.DoubleSide;
}

function addSafetyFence(parent,material,x,z,ground,side=1){
  const fence=addMesh(parent,new THREE.PlaneGeometry(5.0,.92),material,{
    position:[x,ground+.54,z],rotation:[0,Math.PI/2,0],name:'start-safety-net'
  });
  fence.material.side=THREE.DoubleSide;
  for(const dz of [-2.45,0,2.45]){
    addMesh(parent,new THREE.CylinderGeometry(.035,.045,1.20,7),
      new THREE.MeshStandardMaterial({color:0x71432d,roughness:.84,metalness:0}),
      {position:[x,ground+.60,z+dz],cast:true});
  }
}

export function createStartGateScene({world,terrainHeight=()=>0}={}){
  const root=new THREE.Group();
  root.name='premium-alpine-start-gate';
  world?.add(root);

  const z=1.25;
  const centerGround=terrainHeight(0,z);
  const frameMaterial=new THREE.MeshStandardMaterial({color:0x092a47,roughness:.34,metalness:.62,envMapIntensity:.55});
  const frameDarkMaterial=new THREE.MeshStandardMaterial({color:0x05131e,roughness:.30,metalness:.74,envMapIntensity:.46});
  const accentMaterial=new THREE.MeshStandardMaterial({color:0xe8bd3f,roughness:.42,metalness:.34,envMapIntensity:.45});
  const boltMaterial=new THREE.MeshStandardMaterial({color:0xaac0ca,roughness:.30,metalness:.72,envMapIntensity:.62});
  const snowMaterial=new THREE.MeshPhysicalMaterial({
    color:0xffffff,roughness:.94,metalness:0,clearcoat:.015,clearcoatRoughness:.90,
    sheen:.18,sheenColor:new THREE.Color(0xffffff),envMapIntensity:.08
  });
  const cyanLed=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(.025,.29,1.05),toneMapped:false,fog:false});
  const amberLed=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(1,.43,.035),toneMapped:false,fog:false});
  const redLed=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(1,.075,.025),toneMapped:false,fog:false});
  const whiteLed=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(.96,.83,.62),toneMapped:false,fog:false});
  const beaconGlowCyan=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(.008,.09,.52),transparent:true,opacity:.17,depthWrite:false,toneMapped:false,fog:false,blending:THREE.AdditiveBlending});
  const beaconGlowRed=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(.65,.035,.012),transparent:true,opacity:.16,depthWrite:false,toneMapped:false,fog:false,blending:THREE.AdditiveBlending});

  const towerGeometry=new RoundedBoxGeometry(.76,4.55,.72,5,.10);
  const towerInsetGeometry=new RoundedBoxGeometry(.44,3.06,.038,3,.055);
  const baseGeometry=new RoundedBoxGeometry(1.18,.34,1.02,4,.08);
  const armorGeometry=new RoundedBoxGeometry(.18,3.92,.80,3,.045);

  for(const side of [-1,1]){
    const x=side*4.62;
    const ground=terrainHeight(x,z);
    addMesh(root,baseGeometry,frameDarkMaterial,{position:[x,ground+.17,z],cast:true,receive:true});
    addMesh(root,new RoundedBoxGeometry(.96,.19,.88,3,.05),accentMaterial,{position:[x,ground+.36,z],cast:true,receive:true});
    addMesh(root,towerGeometry,frameMaterial,{position:[x,ground+2.46,z],cast:true});
    addMesh(root,towerInsetGeometry,frameDarkMaterial,{position:[x-side*.389,ground+2.42,z-.02],cast:true});

    const armor=addMesh(root,armorGeometry,accentMaterial,{position:[x+side*.30,ground+2.50,z+.01],cast:true});
    armor.scale.y=.88;
    for(const y of [1.52,2.30,3.08]){
      const chevron=addMesh(root,new THREE.PlaneGeometry(.30,.30),amberLed,{
        position:[x-side*.405,ground+y,z-.045],rotation:[0,side>0?Math.PI:0,0],name:'start-tower-chevron'
      });
      chevron.rotation.z=Math.PI/4;
      chevron.scale.y=.52;
    }

    for(const y of [.72,4.12]){
      for(const front of [-1,1]){
        addMesh(root,new THREE.CylinderGeometry(.050,.050,.055,12),boltMaterial,{
          position:[x-side*.40,ground+y,z+front*.30],rotation:[0,0,Math.PI/2],cast:true
        });
      }
    }

    addSnowCluster(root,snowMaterial,x,ground+4.77,z,1.16,1.04);
    addSnowCluster(root,snowMaterial,x,ground+.50,z+.05,1.15,1.12);

    const beaconBaseY=ground+5.03;
    addMesh(root,new THREE.CylinderGeometry(.21,.25,.15,16),frameDarkMaterial,{position:[x,beaconBaseY,z],cast:true});
    const beaconMaterial=side<0?cyanLed:redLed;
    const glowMaterial=side<0?beaconGlowCyan:beaconGlowRed;
    addMesh(root,new THREE.SphereGeometry(.18,14,10),beaconMaterial,{position:[x,beaconBaseY+.22,z],name:'start-beacon-core'});
    addMesh(root,new THREE.SphereGeometry(.29,14,10),glowMaterial,{position:[x,beaconBaseY+.22,z],name:'start-beacon-glow'});

    addFloodlight(root,frameDarkMaterial,whiteLed,x+side*.91,ground+4.00,z-.10,side);
  }

  const crossbarY=centerGround+4.73;
  addMesh(root,new RoundedBoxGeometry(9.72,.62,.72,5,.10),frameMaterial,{position:[0,crossbarY,z],cast:true});
  addMesh(root,new RoundedBoxGeometry(8.86,.18,.78,4,.05),accentMaterial,{position:[0,crossbarY+.31,z],cast:true});
  addMesh(root,new RoundedBoxGeometry(8.52,.11,.80,4,.04),frameDarkMaterial,{position:[0,crossbarY-.34,z],cast:true});
  addTruss(root,frameDarkMaterial,centerGround+4.00,z+.16,7.90);

  for(const x of [-3.70,-2.45,-1.20,1.20,2.45,3.70]){
    addMesh(root,new RoundedBoxGeometry(.64,.20,.18,3,.045),whiteLed,{position:[x,crossbarY+.04,z-.39],name:'start-overhead-lamp'});
  }
  addSnowCluster(root,snowMaterial,0,crossbarY+.39,z,5.6,1.0);
  addSnowCluster(root,snowMaterial,-2.60,crossbarY+.39,z+.02,2.2,1.0);
  addSnowCluster(root,snowMaterial,2.75,crossbarY+.39,z-.03,2.0,1.0);

  const bannerTexture=createBannerTexture();
  const bannerMaterial=new THREE.MeshBasicMaterial({map:bannerTexture,side:THREE.DoubleSide,toneMapped:false,fog:false});
  addMesh(root,new RoundedBoxGeometry(7.58,1.58,.12,4,.06),frameDarkMaterial,{
    position:[0,centerGround+4.03,z-.28],cast:true,name:'start-banner-backplate'
  });
  const frameZ=z-.14;
  addMesh(root,new RoundedBoxGeometry(7.62,.13,.16,3,.035),accentMaterial,{position:[0,centerGround+4.74,frameZ],cast:true});
  addMesh(root,new RoundedBoxGeometry(7.62,.13,.16,3,.035),accentMaterial,{position:[0,centerGround+3.32,frameZ],cast:true});
  addMesh(root,new RoundedBoxGeometry(.13,1.54,.16,3,.035),accentMaterial,{position:[-3.745,centerGround+4.03,frameZ],cast:true});
  addMesh(root,new RoundedBoxGeometry(.13,1.54,.16,3,.035),accentMaterial,{position:[3.745,centerGround+4.03,frameZ],cast:true});
  addMesh(root,new THREE.PlaneGeometry(7.25,1.28),bannerMaterial,{position:[0,centerGround+4.03,z-.12],name:'start-banner-front'});
  addMesh(root,new THREE.PlaneGeometry(7.25,1.28),bannerMaterial,{position:[0,centerGround+4.03,z+.12],rotation:[0,Math.PI,0],name:'start-banner-rear'});

  const lineMaterials=[
    new THREE.MeshStandardMaterial({color:0xf9fcff,roughness:.84,metalness:0}),
    new THREE.MeshStandardMaterial({color:0x237fc0,roughness:.76,metalness:.02})
  ];
  const tileW=.56;
  for(let ix=-8;ix<=8;ix++){
    const x=ix*tileW;
    for(let iz=0;iz<2;iz++){
      const localZ=z-.88-iz*.48;
      const ground=terrainHeight(x,localZ);
      addMesh(root,new THREE.BoxGeometry(tileW*.98,.018,.46),lineMaterials[(ix+iz+20)%2],{
        position:[x,ground+.018,localZ],receive:true,name:'start-checker-line'
      });
    }
  }

  const poleMaterial=new THREE.MeshStandardMaterial({color:0x536775,roughness:.34,metalness:.68});
  const blueFlag=new THREE.MeshBasicMaterial({map:createFlagTexture(0x155aaa,0xffffff),transparent:false,side:THREE.DoubleSide});
  const goldFlag=new THREE.MeshBasicMaterial({map:createFlagTexture(0xe5b936,0x195ca5),transparent:false,side:THREE.DoubleSide});
  const fenceMaterial=new THREE.MeshBasicMaterial({map:createFenceTexture(),transparent:true,depthWrite:false,side:THREE.DoubleSide});

  for(const side of [-1,1]){
    for(let i=0;i<3;i++){
      const flagZ=-2.6-i*4.5;
      const x=side*(5.90+i*.38);
      const ground=terrainHeight(x,flagZ);
      addFlag(root,poleMaterial,(i%2===0?blueFlag:goldFlag),x,flagZ,ground,side);
    }
    for(let i=0;i<2;i++){
      const fenceZ=-3.6-i*5.0;
      const x=side*6.25;
      const ground=terrainHeight(x,fenceZ);
      addSafetyFence(root,fenceMaterial,x,fenceZ,ground,side);
    }
  }

  /* Layered architectural shell: visual-only geometry kept outside the racing lane. */
  const structuralMaterial=new THREE.MeshStandardMaterial({color:0x102f49,roughness:.29,metalness:.68,envMapIntensity:.58});
  const structuralEdgeMaterial=new THREE.MeshStandardMaterial({color:0x2c5c77,roughness:.34,metalness:.54,envMapIntensity:.50});
  const crownGold=new THREE.MeshStandardMaterial({color:0xd9ad32,roughness:.32,metalness:.52,envMapIntensity:.52});
  const darkGlass=new THREE.MeshPhysicalMaterial({
    color:0x06243a,roughness:.18,metalness:.18,transmission:.08,transparent:true,opacity:.94,
    clearcoat:.58,clearcoatRoughness:.22,envMapIntensity:.72
  });

  for(const side of [-1,1]){
    const outerX=side*5.45;
    const outerGround=terrainHeight(outerX,z);

    addMesh(root,new RoundedBoxGeometry(.68,3.72,.64,4,.075),structuralMaterial,{
      position:[outerX,outerGround+2.16,z+.04],cast:true,name:'start-aaa-outer-pylon'
    });
    addMesh(root,new RoundedBoxGeometry(.92,.28,.86,3,.06),frameDarkMaterial,{
      position:[outerX,outerGround+.18,z+.04],cast:true,receive:true
    });
    addMesh(root,new RoundedBoxGeometry(.78,.12,.76,3,.04),crownGold,{
      position:[outerX,outerGround+.38,z+.04],cast:true
    });

    const upperBrace=addMesh(root,new THREE.BoxGeometry(1.82,.16,.20),structuralEdgeMaterial,{
      position:[side*4.80,outerGround+4.15,z+.12],cast:true,name:'start-aaa-upper-brace'
    });
    upperBrace.rotation.z=side*.56;

    const lowerBrace=addMesh(root,new THREE.BoxGeometry(1.68,.14,.18),structuralEdgeMaterial,{
      position:[side*4.88,outerGround+1.42,z+.13],cast:true,name:'start-aaa-lower-brace'
    });
    lowerBrace.rotation.z=-side*.72;

    addMesh(root,new RoundedBoxGeometry(.30,2.18,.05,2,.03),darkGlass,{
      position:[outerX-side*.35,outerGround+2.34,z-.335],
      name:'start-aaa-glass-inset'
    });

    for(const yy of [1.15,1.82,2.49,3.16]){
      addMesh(root,new RoundedBoxGeometry(.32,.055,.07,2,.02),cyanLed,{
        position:[outerX-side*.36,outerGround+yy,z-.37],name:'start-aaa-pylon-led'
      });
    }

    addFloodlight(root,frameDarkMaterial,whiteLed,outerX,outerGround+3.95,z-.20,side);
    addSnowCluster(root,snowMaterial,outerX,outerGround+4.20,z+.02,.92,.86);
  }

  /* Raised crown and stepped roofline make the silhouette read as a proper event structure. */
  addMesh(root,new RoundedBoxGeometry(6.65,.34,.62,5,.075),structuralMaterial,{
    position:[0,centerGround+5.58,z+.03],cast:true,name:'start-aaa-crown'
  });
  addMesh(root,new RoundedBoxGeometry(5.62,.18,.70,4,.05),crownGold,{
    position:[0,centerGround+5.79,z+.03],cast:true,name:'start-aaa-crown-trim'
  });
  addMesh(root,new RoundedBoxGeometry(3.45,.72,.24,4,.06),frameDarkMaterial,{
    position:[0,centerGround+6.08,z-.04],cast:true,name:'start-aaa-logo-housing'
  });
  addMesh(root,new RoundedBoxGeometry(3.10,.45,.035,3,.035),darkGlass,{
    position:[0,centerGround+6.08,z-.17],name:'start-aaa-logo-glass'
  });

  for(const x of [-1.20,-.60,0,.60,1.20]){
    addMesh(root,new RoundedBoxGeometry(.38,.075,.045,2,.022),x===0?amberLed:cyanLed,{
      position:[x,centerGround+6.08,z-.195],name:'start-aaa-logo-led'
    });
  }

  /* Small rear gantry gives the arch visible depth from the countdown camera. */
  const rearZ=z+.66;
  addMesh(root,new RoundedBoxGeometry(8.88,.18,.18,3,.035),structuralEdgeMaterial,{
    position:[0,centerGround+5.10,rearZ],cast:true,name:'start-aaa-rear-gantry'
  });
  for(const side of [-1,1]){
    addMesh(root,new RoundedBoxGeometry(.18,1.22,.18,3,.035),structuralEdgeMaterial,{
      position:[side*4.28,centerGround+4.55,rearZ],cast:true
    });
    const diagonal=addMesh(root,new THREE.BoxGeometry(1.12,.12,.12),structuralEdgeMaterial,{
      position:[side*3.90,centerGround+4.82,rearZ],cast:true
    });
    diagonal.rotation.z=-side*.62;
  }

  addSnowCluster(root,snowMaterial,0,centerGround+5.96,z+.04,3.35,.80);
  addSnowCluster(root,snowMaterial,-2.55,centerGround+5.80,z+.02,1.15,.78);
  addSnowCluster(root,snowMaterial,2.55,centerGround+5.80,z+.02,1.15,.78);

  function reset(){
    root.position.z=0;
    root.visible=true;
  }
  function update(worldDistance=0){
    root.position.z+=Math.max(0,Number(worldDistance)||0);
    root.visible=root.position.z<28;
  }

  return {
    root,
    reset,
    update,
    get visible(){return root.visible;}
  };
}
