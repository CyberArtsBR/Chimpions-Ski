import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {makeBarkTexture} from './alpineArt.js';
import {OBSTACLE_TUNING} from './obstacleTuning.js';

const hash=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
const bark=makeBarkTexture(256);
const wood=new THREE.MeshStandardMaterial({color:0xa06f42,map:bark,bumpMap:bark,bumpScale:.052,roughness:.91,vertexColors:true});
const foliage=new THREE.MeshPhysicalMaterial({color:0xffffff,vertexColors:true,roughness:.88,sheen:.20,sheenColor:new THREE.Color(0x608768),sheenRoughness:.94,side:THREE.DoubleSide});
const stone=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.90,flatShading:true});
const snowCover=new THREE.MeshPhysicalMaterial({color:0xf7fbff,roughness:.82,metalness:0,clearcoat:.035,clearcoatRoughness:.78,sheen:.22,sheenColor:new THREE.Color(0xd7edff)});
const snowmanSnow=new THREE.MeshPhysicalMaterial({color:0xf5fbff,roughness:.88,clearcoat:.08,clearcoatRoughness:.8,sheen:.32,sheenColor:new THREE.Color(0xc8e7ff)});
const snowmanDark=new THREE.MeshStandardMaterial({color:0x172536,roughness:.72});
const snowmanNose=new THREE.MeshStandardMaterial({color:0xef762e,roughness:.62});
const snowmanScarf=[0xb32737,0x1769aa,0x26834f,0x7336a8].map(color=>new THREE.MeshStandardMaterial({color,roughness:.68}));
const snowmanTwig=new THREE.MeshStandardMaterial({color:0x62432f,roughness:.92});

function paint(geometry,fn){
  const p=geometry.attributes.position,colors=[];
  for(let i=0;i<p.count;i++)colors.push(...fn(p.getX(i),p.getY(i),p.getZ(i),i));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  return geometry;
}
function merge(parts){
  const mixed=parts.some(part=>!part.index)&&parts.some(part=>part.index);
  const compatible=mixed?parts.map(part=>part.index?part.toNonIndexed():part):parts;
  const result=mergeGeometries(compatible,false);
  if(mixed)for(let i=0;i<parts.length;i++)if(compatible[i]!==parts[i])compatible[i].dispose();
  for(const part of parts)part.dispose();
  result.computeBoundingBox();result.computeBoundingSphere();
  return result;
}
function snowContactRibbon(halfWidth,halfDepth,seed){
  const segments=32,positions=[],indices=[];
  for(let i=0;i<=segments;i++){
    const a=i/segments*Math.PI*2;
    const irregular=1+.035*Math.sin(a*3+seed*.17)+.022*Math.cos(a*7-seed*.11);
    const ox=Math.cos(a)*halfWidth*irregular,oz=Math.sin(a)*halfDepth*irregular;
    const ix=Math.cos(a)*halfWidth*.76,iz=Math.sin(a)*halfDepth*.62;
    positions.push(ix,.010,iz,ox,.030+.010*Math.sin(a*5+seed),oz);
    if(i<segments){
      const a0=i*2,b=a0+2;
      indices.push(a0,b,a0+1,a0+1,b,b+1);
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setIndex(indices);g.computeVertexNormals();
  return g;
}
function branchBetween(a,b,r1,r2,seed){
  const delta=b.clone().sub(a);
  const g=new THREE.CylinderGeometry(r2,r1,delta.length(),9,3);
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const y=p.getY(i),angle=Math.atan2(p.getZ(i),p.getX(i));
    const k=1+.08*Math.sin(angle*5+y*7+seed);
    p.setX(i,p.getX(i)*k);p.setZ(i,p.getZ(i)*k);
  }
  paint(g,(x,y,z)=>{const v=.67+.25*hash(Math.round(y*15)+seed);return [v,v*.91,v*.81];});
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));
  g.translate(...a.clone().add(b).multiplyScalar(.5).toArray());
  g.computeVertexNormals();return g;
}

// Folded, serrated boughs and individual needle sprays, merged into one crown.
// Four authored silhouettes share materials; no per-obstacle geometry allocation.
function makeFir(variant){
  const seed=19+variant*41,woodParts=[],leaves=[];
  const height=[3.64,3.68,3.58,3.70][variant];
  // Keep foliage close to the actual collision contract: tall and readable,
  // but never a visually huge fake wall around a narrow trunk collider.
  const width=[.62,.68,.65,.70][variant];
  woodParts.push(branchBetween(new THREE.Vector3(0,-.035,0),new THREE.Vector3(.035,3.40,-.015),.19,.026,seed));
  for(let i=0;i<5;i++){
    const a=i*Math.PI*2/5;
    woodParts.push(branchBetween(new THREE.Vector3(Math.cos(a)*.31,.005,Math.sin(a)*.31),new THREE.Vector3(0,.28,0),.045,.075,seed+i));
  }
  const positions=[],colors=[],uvs=[];
  const triangle=(a,b,c,tone)=>{
    for(const v of [a,b,c]){positions.push(...v);colors.push(...tone);uvs.push(v[0],v[2]);}
  };
  for(let tier=0;tier<10;tier++){
    const y=.72+tier*.278;
    const radius=width*Math.pow(1-tier/11, .83);
    const branches=tier>7?6:9;
    for(let j=0;j<branches;j++){
      const angle=j*Math.PI*2/branches+tier*2.399+variant*.7;
      const reach=radius*(.79+hash(seed+tier*19+j)*.21);
      const dx=Math.cos(angle),dz=Math.sin(angle),px=-dz,pz=dx;
      const origin=[.025*Math.sin(tier+variant),y,.018*Math.cos(tier)];
      const tip=[dx*reach,y-.17*reach,dz*reach];
      woodParts.push(branchBetween(new THREE.Vector3(...origin),new THREE.Vector3(...tip),.024*(1-tier*.06),.006,seed+j));
      for(let k=0;k<7;k++){
        const t=.14+k*.12;
        const cx=dx*reach*t,cy=y-.19*reach*t,cz=dz*reach*t;
        const spread=reach*(1-t)*(.36+hash(seed+j+k)*.09);
        const tipT=Math.min(1.07,t+.28);
        const mid=[dx*reach*tipT,cy+.065,dz*reach*tipT];
        const back=[cx-dx*.09,cy+.045,cz-dz*.09];
        const green=.13+hash(seed+tier*13+j*7+k)*.11;
        const snowLoad=THREE.MathUtils.clamp(
          .22+(1-t)*.18+(tier/9)*.25+hash(seed+tier*17+j+k)*.14,
          0,.78
        );
        const baseTone=[green*.27,green,green*.60],winter=[.91,.965,1.0];
        const tone=baseTone.map((value,index)=>THREE.MathUtils.lerp(value,winter[index],snowLoad));
        triangle(back,[cx+px*spread,cy-.08,cz+pz*spread],mid,tone);
        triangle(back,mid,[cx-px*spread,cy-.08,cz-pz*spread],tone.map(v=>v*.8));
        // Pointed needle clusters create real silhouette detail, without alpha cards.
        for(const sign of [-1,1]){
          for(let n=0;n<3;n++){
            const f=(n+1)/4;
            const nx=cx+px*spread*f*sign,nz=cz+pz*spread*f*sign;
            const ny=cy-.06*f;
            const length=.10+(1-t)*.10;
            triangle([nx-dx*.018,ny,nz-dz*.018],
              [nx+dx*length+px*.045*sign,ny+.07,nz+dz*length+pz*.045*sign],
              [nx+dx*.027,ny+.018,nz+dz*.027],tone.map(v=>v*1.2));
          }
        }
      }
    }
  }
  const crown=new THREE.BufferGeometry();
  crown.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  crown.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  crown.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  crown.computeVertexNormals();leaves.push(crown);
  const spike=new THREE.ConeGeometry(.105,.59,9,3);spike.translate(.025,height-.295,-.01);
  paint(spike,()=>[.052,.235,.128]);leaves.push(spike);
  const group=new THREE.Group();
  for(const [geometry,material] of [[merge(woodParts),wood],[merge(leaves),foliage]]){
    const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
  }
  group.userData.visualPrototype='premium-readability-fir-'+variant;
  return group;
}

function makeSnowman(variant){
  const group=new THREE.Group(),offset=(variant-1.5)*.035;
  const ball=(radius,y,x=0,z=0,material=snowmanSnow)=>{const mesh=new THREE.Mesh(new THREE.SphereGeometry(radius,18,14),material);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);return mesh;};
  ball(.47,.48,offset);
  ball(.35,1.18,-offset*.5,-.015);
  ball(.245,1.78,offset*.25,-.025);
  // A tailored wool scarf with a short front tail and three coal buttons.
  const scarf=new THREE.Mesh(new THREE.TorusGeometry(.31,.075,8,24),snowmanScarf[variant]);
  scarf.rotation.x=Math.PI/2;scarf.position.set(0,1.43,-.015);scarf.castShadow=true;group.add(scarf);
  const tail=new THREE.Mesh(new THREE.BoxGeometry(.12,.40,.085),snowmanScarf[variant]);tail.position.set(.19,1.23,.255);tail.rotation.z=-.18;tail.castShadow=true;group.add(tail);
  const eyeMaterial=snowmanDark;
  for(const side of [-1,1]){ball(.034,1.84,offset*.25+side*.084,.193,eyeMaterial);}
  const nose=new THREE.Mesh(new THREE.ConeGeometry(.065,.34,9),snowmanNose);nose.rotation.x=Math.PI/2;nose.rotation.z=-.12;nose.position.set(0,1.75,.31);nose.castShadow=true;group.add(nose);
  for(let i=0;i<3;i++)ball(.036,1.20-i*.16,-offset*.5,.326,snowmanDark);
  // Twig arms spread into a clear obstacle silhouette; collision remains the
  // tree course object's original .62 x .68 footprint.
  for(const side of [-1,1]){
    const arm=new THREE.Mesh(new THREE.CylinderGeometry(.035,.052,.62,7),snowmanTwig);
    arm.position.set(side*.59,1.33,.005);arm.rotation.z=side*.91;arm.rotation.x=.10;arm.castShadow=true;group.add(arm);
    for(const twigSide of [-1,1]){
      const twig=new THREE.Mesh(new THREE.CylinderGeometry(.018,.026,.23,6),snowmanTwig);
      twig.position.set(side*.72,1.52+twigSide*.03,.005);twig.rotation.z=side*(.91+twigSide*.68);twig.castShadow=true;group.add(twig);
    }
  }
  // A compact top hat gives the head a distinctive outline at course speed.
  const brim=new THREE.Mesh(new THREE.CylinderGeometry(.28,.28,.055,18),snowmanDark);brim.position.set(offset*.25,2.00,-.025);brim.castShadow=true;group.add(brim);
  const crown=new THREE.Mesh(new THREE.CylinderGeometry(.17,.19,.30,16),snowmanDark);crown.position.set(offset*.25,2.17,-.025);crown.castShadow=true;group.add(crown);
  const band=new THREE.Mesh(new THREE.CylinderGeometry(.192,.192,.055,16),snowmanScarf[(variant+1)%snowmanScarf.length]);band.position.set(offset*.25,2.08,-.025);group.add(band);
  group.userData.visualPrototype='premium-course-snowman-'+variant;
  return group;
}

function makeRock(variant){
  const sides=11,rings=6,positions=[],colors=[],uvs=[],indices=[];
  const seed=variant*31+7;
  // Compact angular mass stays close to the .55 m collision half-width while
  // gaining vertical/tonal separation from white terrain.
  const radius=[.61,.64,.60,.63][variant];
  for(let r=0;r<rings;r++){
    const t=r/(rings-1);
    const envelope=[.80,1,.94,.76,.47,.13][r];
    for(let s=0;s<=sides;s++){
      const a=(s%sides)*Math.PI*2/sides;
      const shape=1+.105*Math.sin(a*3+seed)+.065*Math.cos(a*5+seed);
      const x=Math.cos(a)*radius*envelope*shape+.09*t;
      const z=Math.sin(a)*radius*.85*envelope*shape-.05*t;
      const y=-.035+t*.845+(r>0&&r<rings-1?Math.sin(a*3+seed)*.050:0);
      positions.push(x,y,z);uvs.push(s/sides,t);
      const grain=hash(s%sides+r*37+seed),v=.235+t*.10+grain*.07;
      const snowCap=THREE.MathUtils.smoothstep(t,.48,.84)*(.62+.38*Math.max(0,Math.cos(a*2+seed)));
      const embeddedSnow=(1-THREE.MathUtils.smoothstep(t,.04,.23))*Math.max(0,Math.sin(a*3+seed))*.24;
      const rockColor=[v*.61,v*.76,v*.89],snowTone=[.91,.965,1.0];
      const capMix=Math.max(snowCap,embeddedSnow);
      colors.push(
        THREE.MathUtils.lerp(rockColor[0],snowTone[0],capMix),
        THREE.MathUtils.lerp(rockColor[1],snowTone[1],capMix),
        THREE.MathUtils.lerp(rockColor[2],snowTone[2],capMix)
      );
      if(r<rings-1&&s<sides){const a0=r*(sides+1)+s,b=a0+sides+1;indices.push(a0,b,a0+1,a0+1,b,b+1);}
    }
  }
  const top=positions.length/3;
  positions.push(.09,.82,-.05);colors.push(.93,.97,1.0);uvs.push(.5,1);
  for(let j=0;j<sides;j++){const a=(rings-1)*(sides+1)+j;indices.push(a,top,a+1);}
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);
  g.computeVertexNormals();g.computeBoundingSphere();
  const mesh=new THREE.Mesh(g,stone);mesh.castShadow=mesh.receiveShadow=true;
  return mesh;
}

function makeEndTexture(){
  const size=256,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const nx=(x-size*.48)/(size*.5),ny=(y-size*.52)/(size*.5);
    const a=Math.atan2(ny,nx),r=Math.hypot(nx,ny);
    const growth=Math.sin(r*104+Math.sin(a*5)*.8+Math.sin(r*29)*1.1);
    const rings=Math.pow(Math.max(0,growth),8);
    const crack=Math.pow(Math.max(0,Math.cos(a*7+r*.35)),100)*Math.max(0,r-.32);
    const shade=1-rings*.24-crack*.75+(hash(x+y*size)-.5)*.06;
    const i=(y*size+x)*4;
    data[i]=210*shade;data[i+1]=163*shade;data[i+2]=104*shade;data[i+3]=255;
  }
  const t=new THREE.DataTexture(data,size,size);t.colorSpace=THREE.SRGBColorSpace;
  t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.needsUpdate=true;
  return t;
}
const endTexture=makeEndTexture();
const endMaterial=new THREE.MeshStandardMaterial({map:endTexture,bumpMap:endTexture,bumpScale:.012,roughness:.89});
function makeLog(wide,variant=0){
  const tuning=wide?OBSTACLE_TUNING.wideLog:OBSTACLE_TUNING.log;
  const radius=wide?.35:.28,parts=[],phase=variant*1.73;
  const body=new THREE.CylinderGeometry(radius*.83,radius,tuning.length,36,16,true),p=body.attributes.position;
  for(let i=0;i<p.count;i++){const y=p.getY(i),a=Math.atan2(p.getZ(i),p.getX(i)),ridge=1+.050*Math.sin(a*(12+variant)+y*(.72+variant*.11)+phase)+.021*Math.sin(a*(23-variant)-y*(1.7+variant*.16)-phase*.7)+.010*Math.cos(a*7+y*3.4+phase);p.setX(i,p.getX(i)*ridge);p.setZ(i,p.getZ(i)*ridge);}
  paint(body,(x,y,z)=>{const a=Math.atan2(z,x),grain=.5+.5*Math.sin(a*(8+variant)+y*(.55+variant*.08)+phase),knots=.5+.5*Math.sin(y*2.7+Math.cos(a*3+phase)*2.1),v=.53+grain*.24+knots*.08;return [Math.min(1,v*1.08),v*.74,v*.46];});
  body.rotateZ(Math.PI/2);body.translate(0,radius,0);body.computeVertexNormals();parts.push(body);
  const stubCount=wide?4:3;
  for(let i=0;i<stubCount;i++){const offset=(i-(stubCount-1)*.5)*tuning.length*(wide?.19:.25),side=i%2===0?1:-1,z=.08+side*.055;parts.push(branchBetween(new THREE.Vector3(offset,radius,z),new THREE.Vector3(offset+.06*side,radius*(1.48+.08*variant),z+side*(.16+.025*i)),.062,.029,variant*17+i+41));}
  for(let i=0;i<(wide?3:2);i++){const x=(i-(wide?1:.5))*tuning.length*.22+Math.sin(phase+i)*.10;parts.push(branchBetween(new THREE.Vector3(x,radius*.92,-.07),new THREE.Vector3(x+.035,radius*1.18,-.15),.040,.012,variant*29+i+71));}
  const group=new THREE.Group(),mesh=new THREE.Mesh(merge(parts),wood);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
  const snowPositions=[],snowIndices=[],steps=28,across=7;
  for(let i=0;i<=steps;i++)for(let j=0;j<=across;j++){
    const u=i/steps,v=j/across*2-1,x=(u-.5)*tuning.length*.90;
    const familyBreak=wide?.84+.16*Math.cos(u*Math.PI*4+phase):1;
    const width=radius*(.56+.115*Math.sin(u*(16+variant*2)+phase)+.060*Math.sin(u*31-phase))*Math.pow(Math.sin(u*Math.PI),.31)*familyBreak;
    const z=v*width;
    snowPositions.push(x,radius+Math.sqrt(Math.max(0,radius*radius-z*z))+.014+Math.sin(u*19+v*4+phase)*.004,z);
    if(i<steps&&j<across){const a=i*(across+1)+j,b=a+across+1;snowIndices.push(a,a+1,b,a+1,b+1,b);}
  }
  const snowGeometry=new THREE.BufferGeometry();
  snowGeometry.setAttribute('position',new THREE.Float32BufferAttribute(snowPositions,3));
  snowGeometry.setIndex(snowIndices);snowGeometry.computeVertexNormals();
  const contactLip=snowContactRibbon(
    Math.min(tuning.visualHalfWidth-.04,tuning.collisionHalfWidth+.07),
    Math.min(tuning.radiusZ*.92,radius*(wide?1.50:1.42)),
    variant*23+(wide?101:47)
  );
  const snowStrip=new THREE.Mesh(merge([snowGeometry,contactLip]),snowCover);snowStrip.receiveShadow=true;group.add(snowStrip);
  const caps=[];
  for(const sign of [-1,1]){
    const endX=sign*(tuning.length*.5+.002);
    const g=new THREE.CircleGeometry(radius*(sign<0?.83:.995),36);g.rotateY(sign*Math.PI/2);g.translate(endX,radius,0);caps.push(g);
    const rim=new THREE.TorusGeometry(radius*(wide?.93:.90),wide?.032:.020,6,28);
    rim.rotateY(Math.PI/2);rim.translate(endX+sign*.004,radius,0);caps.push(rim);
  }
  const ends=new THREE.Mesh(merge(caps),endMaterial);ends.castShadow=ends.receiveShadow=true;group.add(ends);
  group.userData.visualPrototype='premium-readability-'+(wide?'wide-':'')+'log-v'+variant;return group;
}

let library;
export function getPremiumObstacleLibrary(){
  if(library)return library;
  const logs=Array.from({length:3},(_,i)=>makeLog(false,i));
  const wideLogs=Array.from({length:3},(_,i)=>makeLog(true,i));
  library={trees:Array.from({length:4},(_,i)=>makeFir(i)),snowmen:Array.from({length:4},(_,i)=>makeSnowman(i)),rocks:Array.from({length:4},(_,i)=>makeRock(i)),logs,wideLogs,log:logs[0],wideLog:wideLogs[0]};
  return library;
}

export function applyPremiumObstacle(root,kind){
  const assets=getPremiumObstacleLibrary();
  const variants=kind==='tree'?[...assets.trees,...assets.snowmen]:kind==='rock'?assets.rocks:kind==='log'?assets.logs:kind==='wideLog'?assets.wideLogs:null;
  const source=variants?.[0]??assets[kind];
  if(!source)return false;
  const old=new Set();root.traverse(node=>{if(node.isMesh)old.add(node.geometry);});
  root.clear();
  if(root.isMesh){root.geometry=source.geometry;root.material=source.material;root.scale.set(1,1,1);root.rotation.set(0,0,0);root.position.y=0;root.castShadow=root.receiveShadow=true;}
  else for(const child of source.children)root.add(child.clone());
  for(const geometry of old)geometry.dispose();
  if(variants)root.userData.visualVariants=variants;
  root.userData.visualPrototype='premium-readability-'+kind;
  return true;
}
