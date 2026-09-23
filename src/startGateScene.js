import * as THREE from 'three';

function createBannerTexture(){
  const canvas=document.createElement('canvas');
  canvas.width=1024;canvas.height=192;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#0b3655';ctx.fillRect(0,0,1024,192);
  const tile=48;
  for(let x=0;x<1024;x+=tile){
    ctx.fillStyle=(x/tile)%2===0?'#f04c48':'#f5f7ef';
    ctx.fillRect(x,0,tile,24);
    ctx.fillStyle=(x/tile)%2===0?'#f5f7ef':'#f04c48';
    ctx.fillRect(x,168,tile,24);
  }
  ctx.fillStyle='#ffffff';
  ctx.font='900 112px Impact,Arial Black,sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.shadowColor='rgba(0,0,0,.34)';ctx.shadowBlur=12;ctx.shadowOffsetY=5;
  ctx.fillText('START',512,97);
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
  const postMaterial=new THREE.MeshStandardMaterial({color:0x1a4663,roughness:.46,metalness:.42});
  const accentMaterial=new THREE.MeshStandardMaterial({color:0xf3f6ef,roughness:.52,metalness:.18});
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
    new THREE.MeshBasicMaterial({map:createBannerTexture(),side:THREE.DoubleSide,toneMapped:false})
  );
  banner.name='start-banner';
  banner.position.set(0,centerGround+4.02,z-.22);
  root.add(banner);

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
