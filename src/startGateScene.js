import * as THREE from 'three';

function createBannerTexture(){
  const canvas=document.createElement('canvas');
  canvas.width=1024;canvas.height=192;
  const ctx=canvas.getContext('2d');
  const bg=ctx.createLinearGradient(0,0,1024,192);
  bg.addColorStop(0,'#082d49');bg.addColorStop(.5,'#135879');bg.addColorStop(1,'#082d49');
  ctx.fillStyle=bg;ctx.fillRect(0,0,1024,192);
  ctx.fillStyle='#f6d86a';ctx.fillRect(0,0,1024,18);ctx.fillRect(0,174,1024,18);
  ctx.fillStyle='rgba(91,221,255,.72)';
  for(let x=18;x<1024;x+=72){
    ctx.beginPath();ctx.moveTo(x,27);ctx.lineTo(x+26,27);ctx.lineTo(x+38,38);ctx.lineTo(x+26,49);ctx.lineTo(x,49);ctx.lineTo(x+12,38);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(x,143);ctx.lineTo(x+26,143);ctx.lineTo(x+38,154);ctx.lineTo(x+26,165);ctx.lineTo(x,165);ctx.lineTo(x+12,154);ctx.closePath();ctx.fill();
  }
  ctx.fillStyle='#ffe28a';ctx.strokeStyle='#05243a';ctx.lineWidth=9;
  ctx.font='900 112px Impact,Arial Black,sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.shadowColor='rgba(0,0,0,.34)';ctx.shadowBlur=12;ctx.shadowOffsetY=5;
  ctx.strokeText('START',512,97);ctx.fillText('START',512,97);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.needsUpdate=true;
  return texture;
}

export function createStartGateScene({world,terrainHeight=()=>0}={}){
  const root=new THREE.Group();
  root.name='arcade-start-gate';
  world?.add(root);

  const z=1.25;
  const centerGround=terrainHeight(0,z);
  const postMaterial=new THREE.MeshStandardMaterial({color:0x123f5c,roughness:.38,metalness:.48});
  const accentMaterial=new THREE.MeshStandardMaterial({color:0xf2cf63,roughness:.42,metalness:.22});
  const postGeometry=new THREE.BoxGeometry(.34,4.75,.38);
  const footGeometry=new THREE.BoxGeometry(.9,.18,.82);

  for(const x of [-4.65,4.65]){
    const ground=terrainHeight(x,z);
    const post=new THREE.Mesh(postGeometry,postMaterial);
    post.position.set(x,ground+2.38,z);
    post.castShadow=true;
    root.add(post);

    const foot=new THREE.Mesh(footGeometry,accentMaterial);
    foot.position.set(x,ground+.09,z);
    foot.castShadow=true;foot.receiveShadow=true;
    root.add(foot);
  }

  const crossbar=new THREE.Mesh(new THREE.BoxGeometry(9.65,.34,.40),postMaterial);
  crossbar.position.set(0,centerGround+4.72,z);
  crossbar.castShadow=true;
  root.add(crossbar);

  const banner=new THREE.Mesh(
    new THREE.PlaneGeometry(6.55,1.23),
    new THREE.MeshBasicMaterial({map:createBannerTexture(),side:THREE.FrontSide,toneMapped:false})
  );
  banner.name='start-banner-rear';
  banner.position.set(0,centerGround+4.02,z-.22);
  root.add(banner);
  const frontBanner=banner.clone();
  frontBanner.name='start-banner-front';
  frontBanner.rotation.y=Math.PI;
  frontBanner.position.z-=.025;
  root.add(frontBanner);

  const lampGeometry=new THREE.SphereGeometry(.17,10,8);
  const lampMaterials=[
    new THREE.MeshStandardMaterial({color:0xff6659,emissive:0xff3020,emissiveIntensity:1.65,roughness:.28}),
    new THREE.MeshStandardMaterial({color:0x69e7ff,emissive:0x2ac9ff,emissiveIntensity:1.45,roughness:.28})
  ];
  [-3.85,3.85].forEach((x,index)=>{
    const lamp=new THREE.Mesh(lampGeometry,lampMaterials[index]);
    lamp.position.set(x,centerGround+5.06,z-.02);
    root.add(lamp);
  });

  function reset(){
    root.position.z=0;
    root.visible=true;
  }
  function update(worldDistance=0){
    root.position.z+=Math.max(0,Number(worldDistance)||0);
    root.visible=root.position.z<27;
  }

  return {
    reset,
    update,
    get visible(){return root.visible;}
  };
}
