import * as THREE from 'three';

function hash(seed){
  const x=Math.sin(seed*12.9898+78.233)*43758.5453;
  return x-Math.floor(x);
}

function smoothFade(t){
  t=THREE.MathUtils.clamp(t,0,1);
  return t*t*(3-2*t);
}

function createPool(scene,count,size,opacity){
  const positions=new Float32Array(count*3);
  const velocity=new Float32Array(count*3);
  const life=new Float32Array(count);
  const maxLife=new Float32Array(count);
  const floorY=new Float32Array(count);
  const alphas=new Float32Array(count);
  const sizes=new Float32Array(count);
  for(let i=0;i<count;i++)positions[i*3+1]=-100;

  const geometry=new THREE.BufferGeometry();
  const positionAttribute=new THREE.BufferAttribute(positions,3);
  const alphaAttribute=new THREE.BufferAttribute(alphas,1);
  const sizeAttribute=new THREE.BufferAttribute(sizes,1);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  alphaAttribute.setUsage(THREE.DynamicDrawUsage);
  sizeAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position',positionAttribute);
  geometry.setAttribute('aAlpha',alphaAttribute);
  geometry.setAttribute('aSize',sizeAttribute);

  const material=new THREE.ShaderMaterial({
    uniforms:{uColor:{value:new THREE.Color(0xffffff)}},
    vertexShader:`
      attribute float aAlpha;
      attribute float aSize;
      varying float vAlpha;
      void main(){
        vAlpha=aAlpha;
        vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
        gl_PointSize=max(1.0,aSize*(300.0/max(1.0,-mvPosition.z)));
        gl_Position=projectionMatrix*mvPosition;
      }
    `,
    fragmentShader:`
      uniform vec3 uColor;
      varying float vAlpha;
      void main(){
        vec2 p=gl_PointCoord-vec2(.5);
        float d=length(p);
        float feather=1.0-smoothstep(.34,.50,d);
        if(feather<=.001||vAlpha<=.001)discard;
        gl_FragColor=vec4(uColor,vAlpha*feather);
      }
    `,
    transparent:true,
    depthWrite:false
  });
  const points=new THREE.Points(geometry,material);
  points.frustumCulled=false;
  scene.add(points);
  return {
    count,positions,velocity,life,maxLife,floorY,alphas,sizes,
    geometry,positionAttribute,alphaAttribute,sizeAttribute,
    material,baseSize:size,opacity,cursor:0
  };
}

function emit(pool,x,y,z,edge,speed,count,landing=false,inside=false){
  const turnSign=Math.sign(edge);
  const speed01=THREE.MathUtils.clamp((speed-30)/30,0,1);
  const direction=turnSign===0?(hash(pool.cursor+3)>.5?1:-1):(inside?turnSign:-turnSign);
  const lateral=turnSign===0?0:(inside?turnSign*.18:-turnSign*.34);
  const strength=inside?.58:1;

  for(let n=0;n<count;n++){
    const i=pool.cursor++%pool.count;
    const k=i*3;
    const r1=hash(pool.cursor*1.17+n*2.3);
    const r2=hash(pool.cursor*2.71+n*5.1);
    const r3=hash(pool.cursor*4.33+n*7.9);
    const spread=landing?1.18:(inside?.30:.60);

    pool.positions[k]=(landing?x:x+lateral)+(r1-.5)*spread;
    pool.positions[k+1]=y+.035+r2*(landing?.32:(inside?.09:.15));
    pool.positions[k+2]=z+.30+r3*(landing?.68:.58);
    pool.floorY[i]=y-.12;
    pool.alphas[i]=pool.opacity;
    pool.sizes[i]=pool.baseSize*(.72+r3*.72)*(landing?1.08:1);

    pool.velocity[k]=direction*((.44+r1*(landing?2.45:1.68))*strength)+(r2-.5)*.52;
    pool.velocity[k+1]=(landing?1.10:.48)*strength+r2*(landing?3.45:2.05)*strength;
    pool.velocity[k+2]=(.92+r3*(landing?3.90:2.55)+speed*(.027+.010*speed01))*strength;

    pool.life[i]=(landing?.56:.31)+r1*(landing?.64:.40);
    pool.maxLife[i]=pool.life[i];
  }
  pool.sizeAttribute.needsUpdate=true;
  pool.alphaAttribute.needsUpdate=true;
}

export function createSnowParticles({scene}){
  const mist=createPool(scene,460,.072,.50);
  const chunks=createPool(scene,210,.165,.72);
  let emitCarry=0;
  let bumpCarry=0;
  let lastLanding=0;

  function spray(dt,x,y,z,speed,edge,air,landingPulse,running){
    if(!running)return;
    const speed01=THREE.MathUtils.clamp((speed-30)/30,0,1);

    if(!air){
      const carve=Math.abs(edge);
      emitCarry+=dt*(5+speed01*14+carve*(36+speed01*28));
      const total=Math.min(22,Math.floor(emitCarry));
      if(total>0){
        const inside=carve>.20?Math.max(1,Math.floor(total*(.14+carve*.08))):0;
        const outside=total-inside;
        emit(mist,x,y,z,edge,speed,Math.max(1,outside),false,false);
        if(inside>0)emit(mist,x,y,z,edge,speed,inside,false,true);

        if(carve>.28||speed01>.58){
          const chunkCount=Math.max(1,Math.floor(total*(.12+carve*.10+speed01*.05)));
          emit(chunks,x,y,z,edge,speed,chunkCount,false,false);
        }
        emitCarry-=total;
      }

      bumpCarry+=dt*(.55+speed01*.95);
      if(bumpCarry>=1){
        bumpCarry-=1;
        const bumpCount=2+Math.floor(speed01*3);
        emit(chunks,x,y,z,edge,speed,bumpCount,false,false);
      }
    }

    if(landingPulse>.18&&lastLanding<=.18){
      emit(mist,x,y,z,edge,speed,54+Math.floor(speed01*28),true,false);
      emit(chunks,x,y,z,edge,speed,22+Math.floor(speed01*15),true,false);
    }
    lastLanding=landingPulse;
  }

  function updatePool(pool,dt,worldSpeed,gravity){
    let dirty=false;
    for(let i=0;i<pool.count;i++){
      if(pool.life[i]<=0)continue;
      const k=i*3;
      pool.life[i]-=dt;
      pool.velocity[k+1]-=gravity*dt;
      pool.velocity[k]*=Math.pow(.992,dt*60);
      pool.velocity[k+2]*=Math.pow(.997,dt*60);
      pool.positions[k]+=pool.velocity[k]*dt;
      pool.positions[k+1]+=pool.velocity[k+1]*dt;
      pool.positions[k+2]+=(pool.velocity[k+2]+worldSpeed*.18)*dt;

      const ratio=Math.max(0,pool.life[i]/Math.max(.001,pool.maxLife[i]));
      pool.alphas[i]=pool.opacity*smoothFade(ratio);
      if(pool.life[i]<=0||pool.positions[k+1]<pool.floorY[i]-.025){
        pool.life[i]=0;
        pool.alphas[i]=0;
        pool.positions[k+1]=-100;
      }
      dirty=true;
    }
    if(dirty){
      pool.positionAttribute.needsUpdate=true;
      pool.alphaAttribute.needsUpdate=true;
    }
  }

  function update(dt,worldSpeed){
    updatePool(mist,dt,worldSpeed,4.2);
    updatePool(chunks,dt,worldSpeed,5.4);
  }

  function resetPool(pool){
    pool.life.fill(0);
    pool.velocity.fill(0);
    pool.alphas.fill(0);
    for(let i=0;i<pool.count;i++)pool.positions[i*3+1]=-100;
    pool.cursor=0;
    pool.positionAttribute.needsUpdate=true;
    pool.alphaAttribute.needsUpdate=true;
  }

  function reset(){
    resetPool(mist);
    resetPool(chunks);
    emitCarry=0;
    bumpCarry=0;
    lastLanding=0;
  }

  function setTint(color){
    mist.material.uniforms.uColor.value.copy(color);
    chunks.material.uniforms.uColor.value.copy(color);
  }

  return {spray,update,reset,setTint};
}
