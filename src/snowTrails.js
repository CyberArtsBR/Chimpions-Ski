import * as THREE from 'three';

const TRACK_Y_OFFSET=.010;
const TRACK_LIFE=6.8;
const PROFILE=[-1,-.80,-.52,0,.52,.80,1];
const SECTION=PROFILE.length,VERTICES=SECTION*2,INDEX_COUNT=(SECTION-1)*6;

export function createSkiTrails({world,terrainHeight,capacity=192}){
  const skiCount=2;
  const segmentCount=capacity*skiCount;
  const positions=new Float32Array(segmentCount*VERTICES*3);
  const alphas=new Float32Array(segmentCount*VERTICES);
  const normals=new Float32Array(segmentCount*VERTICES*3);
  const colors=new Float32Array(segmentCount*VERTICES*3);
  const glow=new Float32Array(segmentCount*VERTICES);
  const indices=new Uint16Array(segmentCount*INDEX_COUNT);
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
    const v=i*VERTICES,k=i*INDEX_COUNT;
    for(let j=0;j<VERTICES;j++){
      const side=Math.abs(PROFILE[j%SECTION]);
      glow[v+j]=side>.7&&side<.95?1:0;
      const tone=side>.7?[.92,.97,1]:side>.3?[.34,.52,.67]:[.56,.71,.82];
      colors.set(tone,(v+j)*3);normals[(v+j)*3+1]=1;
    }
    for(let j=0;j<SECTION-1;j++)indices.set([v+j,v+j+SECTION,v+j+1,v+j+1,v+j+SECTION,v+j+SECTION+1],k+j*6);
  }

  const geometry=new THREE.BufferGeometry();
  const positionAttribute=new THREE.BufferAttribute(positions,3);
  const alphaAttribute=new THREE.BufferAttribute(alphas,1);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  alphaAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position',positionAttribute);
  geometry.setAttribute('aAlpha',alphaAttribute);
  geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  geometry.setAttribute('aGlow',new THREE.BufferAttribute(glow,1));
  geometry.setIndex(new THREE.BufferAttribute(indices,1));

  const material=new THREE.MeshStandardMaterial({
    color:0xffffff,vertexColors:true,roughness:.98,
    transparent:true,
    depthWrite:false,
    side:THREE.DoubleSide,
    polygonOffset:true,
    polygonOffsetFactor:-1,
    polygonOffsetUnits:-1
  });
  material.onBeforeCompile=shader=>{
    shader.vertexShader='attribute float aAlpha;attribute float aGlow;varying float trailGlow;varying float trailAlpha;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntrailAlpha=aAlpha;trailGlow=aGlow;');
    shader.fragmentShader='varying float trailGlow;varying float trailAlpha;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a*=trailAlpha;if(diffuseColor.a<.002)discard;');
  };
  const compileTrail=material.onBeforeCompile;
  material.onBeforeCompile=shader=>{compileTrail(shader);shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=vec3(.34,.86,1.0)*5.8*trailGlow*trailAlpha;');};
  material.customProgramCacheKey=()=> 'emissive-carved-snow-ribbon-v2';

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
    const v=index*VERTICES;
    alphas.fill(0,v,v+VERTICES);
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
      ?.30+carve*.13
      :(.095+carve*.018+outside*.015);
    const px=-dz/length*halfWidth;
    const pz=dx/length*halfWidth;
    const strength=snowboard
      ?.74+carve*.20
      :.65+carve*.14+outside*.12;
    const v=index*VERTICES;
    for(let j=0;j<SECTION;j++){
      const side=PROFILE[j],bank=Math.exp(-Math.pow((Math.abs(side)-.8)/.16,2));
      const relief=bank*(snowboard?.055:.028)*(1+carve*.7)*(1+side*edge*.25);
      const opacity=(j===0||j===SECTION-1)?0:strength;
      setVertex(v+j,prevX[skiIndex]+px*side,prevY[skiIndex]+relief,prevZ[skiIndex]+pz*side,opacity);
      setVertex(v+SECTION+j,x+px*side,y+relief,z+pz*side,opacity);
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
      const v=i*VERTICES;
      const fadeStart=2.35;
      const fade=ages[i]<=fadeStart?1:Math.max(0,1-(ages[i]-fadeStart)/(TRACK_LIFE-fadeStart));
      const alpha=strengths[i]*fade;

      for(let n=0;n<VERTICES;n++){
        const vertex=v+n;
        const p=vertex*3;
        positions[p+2]+=worldSpeed*dt;
        const side=n%SECTION;
        alphas[vertex]=(side===0||side===SECTION-1)?0:alpha;
      }
      positionsDirty=true;
      alphaDirty=true;

      const frontZ=positions[(v+SECTION)*3+2];
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
