import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {makeSerratedFirGeometry} from './alpineArt.js';
import {COURSE_FLAG_X} from './environmentCorridor.js';

const hash=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
const dummy=new THREE.Object3D();
function mountainGeometry(seed){
  const nx=64,nz=28,p=[],uv=[],indices=[],colors=[];
  for(let z=0;z<=nz;z++)for(let x=0;x<=nx;x++){
    const u=x/nx,v=z/nz,xx=u*2-1,zz=v*2-1;
    const taper=Math.pow(Math.max(0,1-xx*xx),1.1)*Math.pow(Math.max(0,1-zz*zz),.85);
    const spine=.61+.20*Math.sin(xx*5.7+seed)+.13*Math.sin(xx*13.3+seed*.7);
    const striation=Math.abs(Math.sin(xx*29+zz*8+seed))*.075+Math.abs(Math.sin(xx*61-zz*17))*.025;
    const h=taper*Math.max(.05,spine-striation+Math.sin(zz*9+xx*6)*.10);
    p.push(xx*.5,h,zz*.5);uv.push(u,v);
    if(x<nx&&z<nz){const a=z*(nx+1)+x,b=a+nx+1;indices.push(a,b,a+1,a+1,b,b+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  const normal=g.attributes.normal;
  const stone=new THREE.Color(0x566b7a),snow=new THREE.Color(0xe5f1f6),c=new THREE.Color();
  for(let i=0;i<p.length/3;i++){
    const x=p[i*3],h=p[i*3+1],z=p[i*3+2];
    const snowLine=.30+.09*Math.sin(x*37+seed)+.06*Math.sin(z*29+x*13);
    const coverage=THREE.MathUtils.smoothstep(h,snowLine,snowLine+.15)*THREE.MathUtils.smoothstep(normal.getY(i),.24,.75);
    c.copy(stone).lerp(snow,coverage);c.multiplyScalar(.79+.21*normal.getY(i));colors.push(c.r,c.g,c.b);
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return g;
}
function forestGeometry(){
  const parts=[];
  for(let i=0;i<5;i++){
    const r=.95-i*.16,g=makeSerratedFirGeometry(r,1.35-i*.10,18,12+i*7);
    g.translate(.025*Math.sin(i),.95+i*.56,0);parts.push(g);
  }
  const merged=mergeGeometries(parts);for(const p of parts)p.dispose();return merged;
}
export function createAlpineLandscape({world,atmosphere,terrainHeight}){
  const geometries=[11,37,79].map(mountainGeometry);
  const bands=[],entries=[];
  for(let layer=0;layer<3;layer++){
    const material=new THREE.MeshStandardMaterial({color:[0xc7dce9,0xa4bfd0,0x8ca9bd][layer],vertexColors:true,roughness:1});
    material.userData.atmosphereRole='mountain';
    const mesh=new THREE.InstancedMesh(geometries[layer],material,8);
    mesh.castShadow=mesh.receiveShadow=false;mesh.frustumCulled=false;mesh.name='premium-alpine-band-'+layer;atmosphere.add(mesh);bands.push(mesh);
    for(let i=0;i<8;i++){
      const side=i%2?-1:1,rank=Math.floor(i/2),seed=layer*31+i*17;
      const width=45+hash(seed+1)*28,depth=38+hash(seed+2)*28;
      // Bounds use the entire massif width, never just its peak.
      const x=side*(COURSE_FLAG_X+18+(2-layer)*18+width*.5+hash(seed+4)*12);
      entries.push({layer,index:i,x,z:-52-rank*61-layer*15,width,depth,height:27+hash(seed+7)*25,side});
    }
  }
  const forestMaterial=new THREE.MeshStandardMaterial({color:0x31534e,roughness:1});
  const forest=new THREE.InstancedMesh(forestGeometry(),forestMaterial,280);
  forest.castShadow=false;forest.receiveShadow=false;forest.frustumCulled=false;forest.name='premium-distant-forest';world.add(forest);
  const forestEntries=Array.from({length:280},(_,i)=>({x:(i%2?-1:1)*(COURSE_FLAG_X+20+hash(i+19)*65),z:-55-hash(i+23)*240,s:.8+hash(i+45)*2.1,ry:hash(i+77)*Math.PI*2}));
  let travel=0,detail=1;
  function refresh(){
    for(const e of entries){
      const z=((e.z+travel*(.26+e.layer*.17)+310)%330+330)%330-310;
      dummy.position.set(e.x,-5,z);dummy.rotation.set(0,0,0);dummy.scale.set(e.width,e.height,e.depth);dummy.updateMatrix();bands[e.layer].setMatrixAt(e.index,dummy.matrix);
    }
    for(const mesh of bands)mesh.instanceMatrix.needsUpdate=true;
    for(let i=0;i<forest.count;i++){
      const e=forestEntries[i],z=((e.z+travel+305)%325+325)%325-305;
      dummy.position.set(e.x,terrainHeight(e.x,z-travel)-.05,z);dummy.rotation.set(0,e.ry,0);dummy.scale.set(e.s*.72,e.s,e.s*.72);dummy.updateMatrix();forest.setMatrixAt(i,dummy.matrix);
    }
    forest.instanceMatrix.needsUpdate=true;
  }
  function setDetail(value){detail=THREE.MathUtils.clamp(value,0,1);forest.count=Math.round(80+200*detail);bands[2].visible=detail>.75;refresh();}
  function reset(){travel=0;refresh();}
  function update(dt,speed){if(!speed)return;travel+=dt*speed;refresh();}
  reset();return {update,reset,setDetail};
}
