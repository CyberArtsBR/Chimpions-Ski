import * as THREE from 'three';

const TRACK_Y_OFFSET=.010;
const TRACK_LIFE=6.8;
const PROFILE=[-1,-.78,-.56,0,.56,.78,1];
const VERTICES_PER_SEGMENT=PROFILE.length*2;
const INDICES_PER_SEGMENT=(PROFILE.length-1)*6;

const vertexShader=`
attribute float aAlpha;
attribute float aSide;
varying float vAlpha;
varying float vSide;
void main(){
  vAlpha=aAlpha;
  vSide=aSide;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
}
`;

const fragmentShader=`
varying float vAlpha;
varying float vSide;
void main(){
  if(vAlpha<=0.001)discard;
  float side=clamp(abs(vSide),0.0,1.0);
  float trough=1.0-smoothstep(.12,.56,side);
  float berm=smoothstep(.55,.76,side)*(1.0-smoothstep(.81,1.0,side));
  vec3 shadow=vec3(.48,.63,.75),packed=vec3(.78,.87,.93),snowEdge=vec3(.97,.99,1.0);
  vec3 color=mix(packed,shadow,trough*.68);
  color=mix(color,snowEdge,berm*.90);
  float feather=1.0-smoothstep(.78,1.0,side)*.65;
  gl_FragColor=vec4(color,vAlpha*feather);
}
`;

export function createSkiTrails({world,terrainHeight,capacity=192}){
  const skiCount=2;
  const segmentCount=capacity*skiCount;
  const positions=new Float32Array(segmentCount*VERTICES_PER_SEGMENT*3);
  const alphas=new Float32Array(segmentCount*VERTICES_PER_SEGMENT);
  const sides=new Float32Array(segmentCount*VERTICES_PER_SEGMENT);
  const indices=new Uint16Array(segmentCount*INDICES_PER_SEGMENT);
  const ages=new Float32Array(segmentCount);
  const strengths=new Float32Array(segmentCount);
  const active=new Uint8Array(segmentCount);
  const cursors=new Uint16Array(skiCount);
  const prevX=new Float32Array(skiCount);
  const prevZ=new Float32Array(skiCount);
  const hasPrev=new Uint8Array(skiCount);
  const contact=new THREE.Vector3();
  const contactB=new THREE.Vector3();

  for(let i=0;i<segmentCount;i++){
    const v=i*VERTICES_PER_SEGMENT,k=i*INDICES_PER_SEGMENT;
    for(let row=0;row<2;row++)for(let col=0;col<PROFILE.length;col++)sides[v+row*PROFILE.length+col]=PROFILE[col];
    for(let col=0;col<PROFILE.length-1;col++){
      const a=v+col,b=a+PROFILE.length,j=k+col*6;
      indices[j]=a;indices[j+1]=b;indices[j+2]=a+1;
      indices[j+3]=a+1;indices[j+4]=b;indices[j+5]=b+1;
    }
  }

  const geometry=new THREE.BufferGeometry();
  const positionAttribute=new THREE.BufferAttribute(positions,3);
  const alphaAttribute=new THREE.BufferAttribute(alphas,1);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  alphaAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position',positionAttribute);
  geometry.setAttribute('aAlpha',alphaAttribute);
  geometry.setAttribute('aSide',new THREE.BufferAttribute(sides,1));
  geometry.setIndex(new THREE.BufferAttribute(indices,1));

  const material=new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent:true,
    depthWrite:false,
    side:THREE.DoubleSide,
    polygonOffset:true,
    polygonOffsetFactor:-1,
    polygonOffsetUnits:-1
  });

  const mesh=new THREE.Mesh(geometry,material);
  mesh.frustumCulled=false;
  mesh.renderOrder=3;
  world.add(mesh);

  function setVertex(vertex,x,y,z,alpha){
    const p=vertex*3;
    positions[p]=x;
    positions[p+1]=y;
    positions[p+2]=z;
    alphas[vertex]=alpha;
  }

  function clearSegment(index){
    active[index]=0;
    alphas.fill(0,index*VERTICES_PER_SEGMENT,(index+1)*VERTICES_PER_SEGMENT);
  }

  function writeSegment(skiIndex,x,z,edge,travel,snowboard=false){
    const base=skiIndex*capacity;
    const index=base+cursors[skiIndex];
    cursors[skiIndex]=(cursors[skiIndex]+1)%capacity;
    const dx=x-prevX[skiIndex];
    const dz=z-prevZ[skiIndex];
    const length=Math.max(.0001,Math.sqrt(dx*dx+dz*dz));
    const sideSign=skiIndex===0?-1:1;
    const carve=Math.abs(edge);
    const outside=Math.max(0,-sideSign*edge);
    const halfWidth=snowboard
      ?.205+carve*.075
      :(.047+carve*.010+outside*.008);
    const normalX=-dz/length,normalZ=dx/length;
    const outerWidth=halfWidth*(snowboard?1.8:2.0);
    const bermHeight=(snowboard?.065:.025)+carve*(snowboard?.075:.032);
    const strength=snowboard
      ?.68+carve*.18
      :.52+carve*.19+outside*.09;
    const v=index*VERTICES_PER_SEGMENT;
    for(let row=0;row<2;row++){
      const cx=row?x:prevX[skiIndex],cz=row?z:prevZ[skiIndex];
      for(let col=0;col<PROFILE.length;col++){
        const side=PROFILE[col],edgeDistance=Math.abs(side);
        const px=cx+normalX*side*outerWidth,pz=cz+normalZ*side*outerWidth;
        const broken=.72+.28*Math.sin(px*19.7+(pz-travel)*10.3+skiIndex*2.7);
        const crest=edgeDistance>.70&&edgeDistance<.85?bermHeight*broken:0;
        const wall=edgeDistance>.50&&edgeDistance<.70?bermHeight*.24:0;
        setVertex(v+row*PROFILE.length+col,px,terrainHeight(px,pz-travel)+TRACK_Y_OFFSET+.018+crest+wall,pz,strength);
      }
    }

    active[index]=1;
    ages[index]=0;
    strengths[index]=strength;
  }

  function emit({x,z,travel,heading=0,edge=0,spacing=.245,skis,rideMode='ski'}){
    const c=Math.cos(heading);
    const s=Math.sin(heading);
    const snowboard=rideMode==='snowboard';

    if(snowboard){
      const left=skis?.[0];
      const right=skis?.[1];
      let sx=x;
      let sz=z+.48;
      if(left&&right){
        left.updateWorldMatrix(true,false);
        right.updateWorldMatrix(true,false);
        left.localToWorld(contact.set(0,0,.48));
        right.localToWorld(contactB.set(0,0,.48));
        sx=(contact.x+contactB.x)*.5;
        sz=(contact.z+contactB.z)*.5;
      }
      if(hasPrev[0])writeSegment(0,sx,sz,edge,travel,true);
      prevX[0]=sx;prevZ[0]=sz;hasPrev[0]=1;
      // Slot 1 is reserved for the second ski groove and must stay broken
      // while riding a snowboard.
      hasPrev[1]=0;
    }else{
      for(let skiIndex=0;skiIndex<skiCount;skiIndex++){
        const sideSign=skiIndex===0?-1:1;
        const ski=skis?.[skiIndex];
        if(ski){
          ski.updateWorldMatrix(true,false);
          ski.localToWorld(contact.set(0,0,.48));
        }
        const sx=ski?contact.x:x+sideSign*spacing*c;
        const sz=ski?contact.z:z+.48+sideSign*spacing*s;
        if(hasPrev[skiIndex])writeSegment(skiIndex,sx,sz,edge,travel,false);
        prevX[skiIndex]=sx;
        prevZ[skiIndex]=sz;
        hasPrev[skiIndex]=1;
      }
    }
    positionAttribute.needsUpdate=true;
    alphaAttribute.needsUpdate=true;
  }

  function breakTrail(){
    hasPrev[0]=hasPrev[1]=0;
  }

  function update(dt,worldSpeed){
    let positionsDirty=false;
    let alphaDirty=false;

    for(let skiIndex=0;skiIndex<skiCount;skiIndex++){
      if(hasPrev[skiIndex])prevZ[skiIndex]+=worldSpeed*dt;
    }

    for(let i=0;i<segmentCount;i++){
      if(!active[i])continue;
      ages[i]+=dt;
      const v=i*VERTICES_PER_SEGMENT;
      const fadeStart=2.35;
      const fade=ages[i]<=fadeStart?1:Math.max(0,1-(ages[i]-fadeStart)/(TRACK_LIFE-fadeStart));
      const alpha=strengths[i]*fade;

      for(let n=0;n<VERTICES_PER_SEGMENT;n++){
        const vertex=v+n;
        const p=vertex*3;
        positions[p+2]+=worldSpeed*dt;
        alphas[vertex]=alpha;
      }
      positionsDirty=true;
      alphaDirty=true;

      const frontZ=positions[(v+2)*3+2];
      if(ages[i]>=TRACK_LIFE||frontZ>20||alpha<=.012){
        clearSegment(i);
        alphaDirty=true;
      }
    }

    if(positionsDirty)positionAttribute.needsUpdate=true;
    if(alphaDirty)alphaAttribute.needsUpdate=true;
  }

  function reset(){
    active.fill(0);
    alphas.fill(0);
    ages.fill(0);
    strengths.fill(0);
    cursors.fill(0);
    hasPrev.fill(0);
    alphaAttribute.needsUpdate=true;
  }

  return {emit,breakTrail,update,reset,mesh};
}
