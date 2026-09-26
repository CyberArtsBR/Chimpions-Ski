import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {makeBarkTexture} from './alpineArt.js';
import {OBSTACLE_TUNING} from './obstacleTuning.js';

// Shared prototypes: pooling and course instancing reuse these resources.
let oilPrototype,rampPrototype;
function oilSurface(){
  const positions=[0,.026,0],colors=[.010,.015,.020],indices=[];
  const segments=72,rings=5;
  const {visualScaleX:sx,visualScaleZ:sz}=OBSTACLE_TUNING.oil;
  for(let ring=1;ring<=rings;ring++)for(let i=0;i<segments;i++){
    const a=i/segments*Math.PI*2,t=ring/rings;
    const contour=.90+.085*Math.sin(a*3+.6)+.065*Math.sin(a*5-1.2)+.040*Math.cos(a*2+.8);
    const x=Math.cos(a)*sx*contour*t,z=Math.sin(a)*sz*contour*t;
    // Broad broken streaks and a slightly lifted ragged perimeter stay legible
    // in snow/rain without turning the oil into a chrome mirror.
    const film=Math.pow(Math.max(0,Math.sin(x*2.8+z*4.1+Math.sin(x*1.7))),6)*.31;
    const edge=THREE.MathUtils.smoothstep(t,.70,1);
    const y=.024+edge*(.010+.006*Math.max(0,Math.sin(a*4.0+1.3)));
    positions.push(x,y,z);
    colors.push(
      .010+film*.075+edge*.008,
      .015+film*.105+edge*.010,
      .020+film*.135+edge*.014
    );
    const current=1+(ring-1)*segments+i,next=1+(ring-1)*segments+(i+1)%segments;
    if(ring===1)indices.push(0,next,current);
    else {const inner=current-segments,innerNext=next-segments;indices.push(inner,innerNext,current,current,innerNext,next);}
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  const material=new THREE.MeshPhysicalMaterial({color:0xffffff,vertexColors:true,roughness:.48,metalness:.04,clearcoat:.38,clearcoatRoughness:.36,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  const root=new THREE.Group();root.add(new THREE.Mesh(geometry,material));
  root.userData.visualRole='hazard-oil';
  root.userData.readability='dark-irregular-low-sheen';
  return root;
}
export function createOilVisual(){return (oilPrototype??=oilSurface()).clone();}

function rampSurface(){
  const root=new THREE.Group(),deck=[],chassis=[],cores=[],glows=[],markings=[],underglow=[],bloom=[];
  const slope=.18,angle=Math.atan(slope),height=z=>.45-z*slope;
  const box=(parts,w,h,d,x,y,z,tilt=0,ry=0)=>{const g=new THREE.BoxGeometry(w,h,d);if(ry)g.rotateY(ry);if(tilt)g.rotateX(tilt);g.translate(x,y,z);parts.push(g);};
  const addMerged=(parts,material,{cast=false,renderOrder=0}={})=>{const geometry=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=cast;mesh.receiveShadow=true;mesh.renderOrder=renderOrder;root.add(mesh);};
  box(deck,2.30,.11,3.04,0,height(0)-.055,0,angle);
  for(let i=0;i<13;i++){const z=1.42-i*.228;box(deck,2.16,.016,.032,0,height(z)+.012,z,angle);}
  for(const side of [-1,1]){
    box(chassis,.14,.20,3.24,side*1.15,.35,0,angle);
    box(chassis,.085,.115,3.05,side*1.055,height(0)-.13,0,angle);
    for(const z of [-1.30,-.66,.02,.70,1.25]){
      const h=Math.max(.10,height(z)-.10);
      box(chassis,.12,h,.15,side*1.08,h*.5,z);
      box(glows,.075,Math.max(.08,h*.62),.055,side*1.115,h*.55,z);
      box(cores,.025,Math.max(.06,h*.58),.026,side*1.124,h*.55,z);
      box(bloom,.014,Math.max(.06,h*.57),.014,side*1.092,h*.55,z);
    }
    // Taller uphill entry fins make the ramp read as an intentional gate from
    // long range without narrowing the playable deck.
    box(chassis,.13,.42,.13,side*1.075,.28,1.38);
    box(glows,.070,.31,.050,side*1.113,.31,1.385);
    box(cores,.024,.27,.023,side*1.124,.31,1.39);
    box(bloom,.012,.26,.012,side*1.095,.31,1.392);
    box(glows,.20,.10,2.96,side*1.19,height(0)+.038,0,angle);
    box(cores,.052,.040,2.98,side*1.20,height(0)+.041,0,angle);
    box(bloom,.021,.018,2.98,side*1.195,height(0)+.069,0,angle);
  }
  box(glows,2.24,.085,.17,0,height(-1.47)+.043,-1.47,angle);box(cores,2.19,.034,.078,0,height(-1.47)+.048,-1.47,angle);box(bloom,2.18,.014,.021,0,height(-1.47)+.071,-1.47,angle);box(glows,2.22,.070,.14,0,height(1.48)+.038,1.48,angle);box(cores,2.18,.028,.064,0,height(1.48)+.042,1.48,angle);box(bloom,2.17,.014,.021,0,height(1.48)+.064,1.48,angle);box(chassis,2.24,.105,.12,0,.13,-1.35);box(underglow,1.72,.035,2.46,0,.16,-.04,angle);
  for(const [markIndex,z] of [.78,.18,-.42,-1.02].entries())for(const side of [-1,1]){
    const arm=.50+markIndex*.035;
    const g=new THREE.BoxGeometry(arm,.018,.070);g.rotateY(side*-.54);g.rotateX(angle);g.translate(side*.21,height(z)+.024,z);markings.push(g);
    const filament=new THREE.BoxGeometry(arm*.70,.022,.036);filament.rotateY(side*-.54);filament.rotateX(angle);filament.translate(side*.21,height(z)+.039,z);bloom.push(filament);
  }
  // A thin downhill spine reinforces travel direction without using arcade arrows.
  for(const z of [.94,.38,-.18,-.74])box(markings,.075,.016,.36,0,height(z)+.026,z,angle);
  const deckMaterial=new THREE.MeshPhysicalMaterial({color:0x12232d,roughness:.31,metalness:.72,clearcoat:.32,clearcoatRoughness:.22});
  const chassisMaterial=new THREE.MeshStandardMaterial({color:0x06141d,roughness:.23,metalness:.92,emissive:0x020b10,emissiveIntensity:.46});
  const ledMaterial=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(.018,.34,1.48),toneMapped:false,fog:false});
  const glowMaterial=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(.008,.13,.78),transparent:true,opacity:.34,depthWrite:false,toneMapped:false,fog:false,blending:THREE.AdditiveBlending});
  const underglowMaterial=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(.006,.09,.54),transparent:true,opacity:.22,depthWrite:false,toneMapped:false,fog:false,blending:THREE.AdditiveBlending});
  const markingMaterial=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(.035,.38,1.20),toneMapped:false,fog:false});
  // Keep HDR energy strongly blue so bloom never clips to a misleading white rail.
  const bloomMaterial=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(.012,.52,4.8),toneMapped:false,fog:false});
  addMerged(deck,deckMaterial,{cast:true});addMerged(chassis,chassisMaterial,{cast:true});addMerged(underglow,underglowMaterial,{renderOrder:4});addMerged(glows,glowMaterial,{renderOrder:5});addMerged(cores,ledMaterial,{renderOrder:6});addMerged(markings,markingMaterial,{renderOrder:6});addMerged(bloom,bloomMaterial,{renderOrder:7});
  root.userData.visualPrototype='competition-tech-kicker-v7-readability';
  root.userData.visualRole='safe-opportunity';
  root.userData.travelDirection='negative-z';
  root.userData.edgeLightHue='blue';
  return root;
}
export function createRampVisual(){return (rampPrototype??=rampSurface()).clone();}
