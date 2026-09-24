import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {makeBarkTexture} from './alpineArt.js';
import {OBSTACLE_TUNING} from './obstacleTuning.js';

// Shared prototypes: pooling and course instancing reuse these resources.
let oilPrototype,rampPrototype;
function oilSurface(){
  const positions=[0,.026,0],colors=[.035,.044,.052],indices=[];
  const segments=72,rings=5;
  const {visualScaleX:sx,visualScaleZ:sz}=OBSTACLE_TUNING.oil;
  for(let ring=1;ring<=rings;ring++)for(let i=0;i<segments;i++){
    const a=i/segments*Math.PI*2,t=ring/rings;
    const contour=.90+.085*Math.sin(a*3+.6)+.065*Math.sin(a*5-1.2)+.040*Math.cos(a*2+.8);
    const x=Math.cos(a)*sx*contour*t,z=Math.sin(a)*sz*contour*t;
    // Broad broken streaks, not a concentric sheen or a raised central disk.
    const film=Math.pow(Math.max(0,Math.sin(x*2.8+z*4.1+Math.sin(x*1.7))),6)*.42;
    positions.push(x,.026,z);
    colors.push(.035+film*.10,.044+film*.15,.052+film*.20);
    const current=1+(ring-1)*segments+i,next=1+(ring-1)*segments+(i+1)%segments;
    if(ring===1)indices.push(0,next,current);
    else {const inner=current-segments,innerNext=next-segments;indices.push(inner,innerNext,current,current,innerNext,next);}
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  const material=new THREE.MeshPhysicalMaterial({color:0xffffff,vertexColors:true,roughness:.24,metalness:.12,clearcoat:.75,clearcoatRoughness:.20,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  const root=new THREE.Group();root.add(new THREE.Mesh(geometry,material));
  return root;
}
export function createOilVisual(){return (oilPrototype??=oilSurface()).clone();}

function rampSurface(){
  const root=new THREE.Group(),boards=[],frame=[],snow=[],markings=[];
  const slope=.18,angle=Math.atan(slope),height=z=>.45-z*slope;
  const box=(parts,w,h,d,x,y,z,tilt=0)=>{
    const g=new THREE.BoxGeometry(w,h,d);g.rotateX(tilt);g.translate(x,y,z);parts.push(g);
  };
  // Top matches the existing ramp deck and takeoff envelope.
  for(let i=0;i<12;i++){
    const z=1.46-i*.266;
    box(boards,2.32,.075,.252,0,height(z)-.038,z,angle);
  }
  for(const side of [-1,1]){
    box(frame,.10,.13,3.22,side*1.15,.365,0,angle);
    for(const z of [-1.35,-.45,.50]){
      const h=Math.max(.06,height(z)-.12);
      box(frame,.11,h,.13,side*1.08,h*.5,z);
    }
    box(snow,.105,.028,2.85,side*1.07,.473,0,angle);
  }
  box(frame,2.22,.09,.11,0,.12,-1.32);
  box(markings,2.30,.022,.13,0,height(-1.45)+.016,-1.45,angle);
  box(markings,2.30,.018,.10,0,height(1.50)+.012,1.50,angle);
  // Two restrained directional chevrons on the wooden deck.
  for(const z of [.6,-.2])for(const side of [-1,1]){
    const g=new THREE.BoxGeometry(.62,.016,.07);
    g.rotateY(side*-.52);g.rotateX(angle);g.translate(side*.26,height(z)+.015,z);markings.push(g);
  }
  const bark=makeBarkTexture(256);
  const materials=[
    new THREE.MeshStandardMaterial({color:0x9c805d,map:bark,bumpMap:bark,bumpScale:.014,roughness:.83}),
    new THREE.MeshStandardMaterial({color:0x294b58,roughness:.66,metalness:.28}),
    new THREE.MeshStandardMaterial({color:0xf0f7fa,roughness:.92}),
    new THREE.MeshStandardMaterial({color:0xf1bc49,roughness:.60})
  ];
  [boards,frame,snow,markings].forEach((parts,i)=>{
    const geometry=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());
    const mesh=new THREE.Mesh(geometry,materials[i]);mesh.receiveShadow=true;root.add(mesh);
  });
  root.userData.visualPrototype='timber-kicker-v3';
  return root;
}
export function createRampVisual(){return (rampPrototype??=rampSurface()).clone();}
