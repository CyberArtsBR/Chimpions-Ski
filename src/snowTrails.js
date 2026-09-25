import * as THREE from 'three';

const TRACK_Y_OFFSET=.010;
const TRACK_LIFE=6.8;
const PROFILE=[-1,-.78,-.56,0,.56,.78,1];
const VERTICES_PER_SEGMENT=PROFILE.length*2;
const INDICES_PER_SEGMENT=(PROFILE.length-1)*6;

const vertexShader=`
attribute float aAlpha;
attribute float aSide;
attribute float aBoard;
attribute float aCarve;
attribute float aEdgeBias;
varying float vAlpha;
varying float vSide;
varying float vBoard;
varying float vCarve;
varying float vEdgeBias;
void main(){
  vAlpha=aAlpha;
  vSide=aSide;
  vBoard=aBoard;
  vCarve=aCarve;
  vEdgeBias=aEdgeBias;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
}
`;

const fragmentShader=`
varying float vAlpha;
varying float vSide;
varying float vBoard;
varying float vCarve;
varying float vEdgeBias;
void main(){
  if(vAlpha<=0.001)discard;
  float side=clamp(abs(vSide),0.0,1.0);
  float board=clamp(vBoard,0.0,1.0);
  float carve=clamp(vCarve,0.0,1.0);
  float loadedEdge=clamp(.5+.5*vEdgeBias*vSide,0.0,1.0);
  float troughWidth=mix(.56,.78,board);
  float trough=1.0-smoothstep(.14,troughWidth,side);
  float boardCompression=board*(1.0-smoothstep(.30,.66,side))*(.28+.22*carve);
  float edgeGroove=board*smoothstep(.56,.73,side)*(1.0-smoothstep(.80,.96,side))*(.45+.55*loadedEdge);
  float skiBerm=(1.0-board)*smoothstep(.61,.75,side)*(1.0-smoothstep(.80,.90,side));
  float boardBerm=board*smoothstep(.72,.84,side)*(1.0-smoothstep(.87,.97,side))*(.60+.40*loadedEdge);
  float berm=max(skiBerm,boardBerm);
  vec3 shadow=vec3(.50,.64,.74),packed=vec3(.86,.92,.965);
  vec3 color=mix(packed,shadow,trough*(.72+.18*carve));
  color=mix(color,vec3(.76,.86,.93),boardCompression*.45+edgeGroove*.50);
  // HDR emission is confined to the raised crest; packed snow stays readable.
  color+=vec3(.38,3.8,5.4)*berm*(.85+.25*carve);
  float feather=1.0-smoothstep(.86,1.0,side)*.86;
  gl_FragColor=vec4(color,vAlpha*feather);
}
`;

export function createSkiTrails({world,terrainHeight,capacity=192}){
  const skiCount=2;
  const segmentCount=capacity*skiCount;
  const positions=new Float32Array(segmentCount*VERTICES_PER_SEGMENT*3);
  const alphas=new Float32Array(segmentCount*VERTICES_PER_SEGMENT);
  const sides=new Float32Array(segmentCount*VERTICES_PER_SEGMENT);
  const boards=new Float32Array(segmentCount*VERTICES_PER_SEGMENT);
  const carves=new Float32Array(segmentCount*VERTICES_PER_SEGMENT);
  const edgeBiases=new Float32Array(segmentCount*VERTICES_PER_SEGMENT);
  const indices=new Uint16Array(segmentCount*INDICES_PER_SEGMENT);
  const ages=new Float32Array(segmentCount);
  const strengths=new Float32Array(segmentCount);
  const lifetimes=new Float32Array(segmentCount);
  const fadeStarts=new Float32Array(segmentCount);
  const active=new Uint8Array(segmentCount);
  const cursors=new Uint16Array(skiCount);
  const prevX=new Float32Array(skiCount);
  const prevZ=new Float32Array(skiCount);
  const hasPrev=new Uint8Array(skiCount);
  const contact=new THREE.Vector3();
  const contactB=new THREE.Vector3();
  let currentSpeed=42;

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
  const boardAttribute=new THREE.BufferAttribute(boards,1);
  const carveAttribute=new THREE.BufferAttribute(carves,1);
  const edgeBiasAttribute=new THREE.BufferAttribute(edgeBiases,1);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  alphaAttribute.setUsage(THREE.DynamicDrawUsage);
  boardAttribute.setUsage(THREE.DynamicDrawUsage);
  carveAttribute.setUsage(THREE.DynamicDrawUsage);
  edgeBiasAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position',positionAttribute);
  geometry.setAttribute('aAlpha',alphaAttribute);
  geometry.setAttribute('aSide',new THREE.BufferAttribute(sides,1));
  geometry.setAttribute('aBoard',boardAttribute);
  geometry.setAttribute('aCarve',carveAttribute);
  geometry.setAttribute('aEdgeBias',edgeBiasAttribute);
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
    const speed01=THREE.MathUtils.clamp((currentSpeed-35)/50,0,1);
    const halfWidth=snowboard
      ?.205+carve*.082
      :(.045+carve*.012+outside*.009);
    const normalX=-dz/length,normalZ=dx/length;
    const outerWidth=halfWidth*(snowboard?1.8:2.0);
    const bermHeight=(snowboard?.080:.036)+carve*(snowboard?.098:.052)+speed01*(snowboard?.018:.008);
    const strength=snowboard
      ?.80+carve*.14+speed01*.04
      :.70+carve*.17+outside*.07+speed01*.035;
    lifetimes[index]=TRACK_LIFE*(.82+speed01*.32+carve*.10);
    fadeStarts[index]=2.15+speed01*.65+carve*.30;
    const v=index*VERTICES_PER_SEGMENT;
    for(let row=0;row<2;row++){
      const cx=row?x:prevX[skiIndex],cz=row?z:prevZ[skiIndex];
      for(let col=0;col<PROFILE.length;col++){
        const side=PROFILE[col],edgeDistance=Math.abs(side);
        const px=cx+normalX*side*outerWidth,pz=cz+normalZ*side*outerWidth;
        const broken=.86+.14*Math.sin(px*19.7+(pz-travel)*10.3+skiIndex*2.7);
        const loadedSide=snowboard?-Math.sign(edge||1):0;
        const edgeLoad=snowboard?THREE.MathUtils.clamp(.62+.38*side*loadedSide,.28,1):1;
        const crest=edgeDistance>.70&&edgeDistance<.85?bermHeight*broken*edgeLoad:0;
        const wall=edgeDistance>.50&&edgeDistance<.70?bermHeight*.24*edgeLoad:0;
        const compression=snowboard?(1-edgeDistance)*(.018+carve*.018):Math.max(0,1-edgeDistance*1.9)*(.010+carve*.014);
        const vertex=v+row*PROFILE.length+col;
        setVertex(vertex,px,terrainHeight(px,pz-travel)+TRACK_Y_OFFSET+.020+crest+wall-compression,pz,strength);
        boards[vertex]=snowboard?1:0;
        carves[vertex]=carve;
        edgeBiases[vertex]=THREE.MathUtils.clamp(edge,-1,1);
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
    boardAttribute.needsUpdate=true;
    carveAttribute.needsUpdate=true;
    edgeBiasAttribute.needsUpdate=true;
  }

  function breakTrail(){
    hasPrev[0]=hasPrev[1]=0;
  }

  function update(dt,worldSpeed){
    currentSpeed=Math.max(0,Number(worldSpeed)||0);
    let positionsDirty=false;
    let alphaDirty=false;

    for(let skiIndex=0;skiIndex<skiCount;skiIndex++){
      if(hasPrev[skiIndex])prevZ[skiIndex]+=worldSpeed*dt;
    }

    for(let i=0;i<segmentCount;i++){
      if(!active[i])continue;
      ages[i]+=dt;
      const v=i*VERTICES_PER_SEGMENT;
      const life=lifetimes[i]||TRACK_LIFE;
      const fadeStart=fadeStarts[i]||2.35;
      const fade=ages[i]<=fadeStart?1:Math.max(0,1-(ages[i]-fadeStart)/Math.max(.1,life-fadeStart));
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
      if(ages[i]>=(lifetimes[i]||TRACK_LIFE)||frontZ>20||alpha<=.012){
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
    lifetimes.fill(TRACK_LIFE);
    fadeStarts.fill(2.35);
    currentSpeed=42;
    boards.fill(0);
    carves.fill(0);
    edgeBiases.fill(0);
    cursors.fill(0);
    hasPrev.fill(0);
    alphaAttribute.needsUpdate=true;
  }

  return {emit,breakTrail,update,reset,mesh};
}
