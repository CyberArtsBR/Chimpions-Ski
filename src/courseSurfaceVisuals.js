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
  const root=new THREE.Group(),deck=[],chassis=[],leds=[],glows=[],markings=[];
  const slope=.18,angle=Math.atan(slope),height=z=>.45-z*slope;
  const box=(parts,w,h,d,x,y,z,tilt=0)=>{
    const g=new THREE.BoxGeometry(w,h,d);g.rotateX(tilt);g.translate(x,y,z);parts.push(g);
  };
  const addMerged=(parts,material,{cast=false,renderOrder=0}={})=>{
    const geometry=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());
    const mesh=new THREE.Mesh(geometry,material);
    mesh.castShadow=cast;mesh.receiveShadow=true;mesh.renderOrder=renderOrder;root.add(mesh);
  };

  // Preserve the original 2.3m x 3.2m gameplay/readability envelope while
  // upgrading the prop to a rigid premium competition kicker.
  box(deck,2.30,.105,3.04,0,height(0)-.055,0,angle);
  for(let i=0;i<10;i++){
    const z=1.34-i*.295;
    box(deck,2.18,.018,.045,0,height(z)+.012,z,angle);
  }
  for(const side of [-1,1]){
    box(chassis,.13,.19,3.24,side*1.15,.35,0,angle);
    box(chassis,.075,.11,3.05,side*1.06,height(0)-.13,0,angle);
    for(const z of [-1.30,-.42,.46,1.24]){
      const h=Math.max(.10,height(z)-.10);
      box(chassis,.12,h,.15,side*1.08,h*.5,z);
    }
    box(glows,.18,.09,2.94,side*1.19,height(0)+.035,0,angle);
    box(leds,.052,.038,2.96,side*1.20,height(0)+.038,0,angle);
  }
  // Bright takeoff and entry lips make the ramp readable at 300 km/h.
  box(glows,2.22,.075,.16,0,height(-1.47)+.04,-1.47,angle);
  box(leds,2.18,.032,.075,0,height(-1.47)+.045,-1.47,angle);
  box(leds,2.18,.026,.060,0,height(1.48)+.035,1.48,angle);
  box(chassis,2.24,.10,.12,0,.13,-1.35);

  // Three luminous forward chevrons are flush to the deck so they do not alter collision.
  for(const z of [.72,.08,-.56])for(const side of [-1,1]){
    const g=new THREE.BoxGeometry(.58,.018,.075);
    g.rotateY(side*-.54);g.rotateX(angle);
    g.translate(side*.24,height(z)+.022,z);
    markings.push(g);
  }

  const deckMaterial=new THREE.MeshPhysicalMaterial({
    color:0x172630,roughness:.34,metalness:.68,clearcoat:.28,clearcoatRoughness:.24
  });
  const chassisMaterial=new THREE.MeshStandardMaterial({
    color:0x08151d,roughness:.26,metalness:.88,emissive:0x031018,emissiveIntensity:.42
  });
  const ledMaterial=new THREE.MeshBasicMaterial({color:0x66efff,toneMapped:false});
  const glowMaterial=new THREE.MeshBasicMaterial({
    color:0x36cfff,transparent:true,opacity:.30,depthWrite:false,
    toneMapped:false,blending:THREE.AdditiveBlending
  });
  const markingMaterial=new THREE.MeshBasicMaterial({color:0xe8fdff,toneMapped:false});

  addMerged(deck,deckMaterial,{cast:true});
  addMerged(chassis,chassisMaterial,{cast:true});
  addMerged(glows,glowMaterial,{renderOrder:5});
  addMerged(leds,ledMaterial,{renderOrder:6});
  addMerged(markings,markingMaterial,{renderOrder:6});
  root.userData.visualPrototype='competition-tech-kicker-v4';
  return root;
}
export function createRampVisual(){return (rampPrototype??=rampSurface()).clone();}
