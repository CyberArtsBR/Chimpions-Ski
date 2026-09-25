import * as THREE from 'three';

export function createStartGateScene({world,terrainHeight=()=>0}={}){
  const root=new THREE.Group();
  root.name='arcade-start-gate';
  world?.add(root);

  const z=1.25;
  const centerGround=terrainHeight(0,z);
  const postMaterial=new THREE.MeshStandardMaterial({color:0x123f5c,roughness:.38,metalness:.48});
  const accentMaterial=new THREE.MeshStandardMaterial({color:0x263d50,roughness:.36,metalness:.75});
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

  const cyan=new THREE.MeshStandardMaterial({color:0x8bf4ff,emissive:0x21dfff,emissiveIntensity:5.5,roughness:.25});
  const violet=new THREE.MeshStandardMaterial({color:0xdec4ff,emissive:0x9b51ff,emissiveIntensity:5,roughness:.25});
  const snow=new THREE.MeshStandardMaterial({color:0xe6f5ff,roughness:.94});
  function beam(w,h,d,x,y,depth,material){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,depth);root.add(mesh);return mesh;}
  for(const face of [-1,1]){
    const depth=z+face*.24;
    beam(9.2,.065,.045,0,centerGround+4.72,depth,cyan);
    beam(8.8,.055,.045,0,centerGround+3.72,depth,violet);
    for(const side of [-1,1]){
      beam(.065,4.4,.045,side*4.65,terrainHeight(side*4.65,z)+2.36,depth,cyan);
      beam(.9,.05,.055,side*4.65,terrainHeight(side*4.65,z)+.20,depth,violet);
      for(let i=0;i<4;i++){const slash=beam(.075,.38,.06,side*(.3+i*.32),centerGround+4.17,depth,cyan);slash.rotation.z=side*-.55;}
    }
  }
  beam(9.7,.12,.48,0,centerGround+4.96,z,snow);
  for(const x of [-4.65,4.65])beam(.44,.12,.50,x,terrainHeight(x,z)+4.80,z,snow);

  const lampGeometry=new THREE.SphereGeometry(.17,10,8);
  const lampMaterials=[
    new THREE.MeshStandardMaterial({color:0xcf9fff,emissive:0x984cff,emissiveIntensity:4.5,roughness:.28}),
    new THREE.MeshStandardMaterial({color:0x69e7ff,emissive:0x2ac9ff,emissiveIntensity:5,roughness:.28})
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
