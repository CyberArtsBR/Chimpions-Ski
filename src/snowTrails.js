import * as THREE from 'three';

const TRACK_Y_OFFSET=.010;
const TRACK_LIFE=6.8;

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
  float edge=pow(side,1.55);
  float compressed=1.0-smoothstep(.18,.62,side);
  float berm=smoothstep(.52,.78,side)*(1.0-smoothstep(.84,1.0,side));
  vec3 groove=vec3(0.27,0.45,0.56),packed=vec3(0.48,0.66,0.74),snowEdge=vec3(0.80,0.91,0.95);
  vec3 color=mix(groove,snowEdge,edge*.68);color=mix(color,packed,compressed*.34);color+=snowEdge*berm*.12;
  float feather=1.0-smoothstep(.80,1.0,side)*.48;
  gl_FragColor=vec4(color,vAlpha*feather);
}
`;

export function createSkiTrails({world,terrainHeight,capacity=192}){
  const skiCount=2;
  const segmentCount=capacity*skiCount;
  const positions=new Float32Array(segmentCount*4*3);
  const alphas=new Float32Array(segmentCount*4);
  const sides=new Float32Array(segmentCount*4);
  const indices=new Uint16Array(segmentCount*6);
  const ages=new Float32Array(segmentCount);
  const strengths=new Float32Array(segmentCount);
  const active=new Uint8Array(segmentCount);
  const cursors=new Uint16Array(skiCount);
  const prevX=new Float32Array(skiCount);
  const prevY=new Float32Array(skiCount);
  const prevZ=new Float32Array(skiCount);
  const hasPrev=new Uint8Array(skiCount);
  const contact=new THREE.Vector3();
  const contactB=new THREE.Vector3();

  for(let i=0;i<segmentCount;i++){
    const v=i*4;
    const k=i*6;
    sides[v]=-1;sides[v+1]=1;sides[v+2]=-1;sides[v+3]=1;
    indices[k]=v;indices[k+1]=v+2;indices[k+2]=v+1;
    indices[k+3]=v+1;indices[k+4]=v+2;indices[k+5]=v+3;
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
    const v=index*4;
    alphas[v]=alphas[v+1]=alphas[v+2]=alphas[v+3]=0;
  }

  function writeSegment(skiIndex,x,y,z,edge,snowboard=false){
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
    const px=-dz/length*halfWidth;
    const pz=dx/length*halfWidth;
    const strength=snowboard
      ?.38+carve*.25
      :.30+carve*.16+outside*.16;
    const v=index*4;

    setVertex(v,prevX[skiIndex]-px,prevY[skiIndex],prevZ[skiIndex]-pz,strength);
    setVertex(v+1,prevX[skiIndex]+px,prevY[skiIndex],prevZ[skiIndex]+pz,strength);
    setVertex(v+2,x-px,y,z-pz,strength);
    setVertex(v+3,x+px,y,z+pz,strength);

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
      const sy=terrainHeight(sx,sz-travel)+TRACK_Y_OFFSET;
      if(hasPrev[0])writeSegment(0,sx,sy,sz,edge,true);
      prevX[0]=sx;prevY[0]=sy;prevZ[0]=sz;hasPrev[0]=1;
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
        const sy=terrainHeight(sx,sz-travel)+TRACK_Y_OFFSET;

        if(hasPrev[skiIndex])writeSegment(skiIndex,sx,sy,sz,edge,false);
        prevX[skiIndex]=sx;
        prevY[skiIndex]=sy;
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
      const v=i*4;
      const fadeStart=2.35;
      const fade=ages[i]<=fadeStart?1:Math.max(0,1-(ages[i]-fadeStart)/(TRACK_LIFE-fadeStart));
      const alpha=strengths[i]*fade;

      for(let n=0;n<4;n++){
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
