import * as THREE from 'three';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function createCinematicGrounding({scene}={}){
  if(!scene)throw new Error('createCinematicGrounding requires scene');

  const uniforms={
    color:{value:new THREE.Color(0x274657)},
    opacity:{value:0},
    rideMode:{value:0},
    airborne:{value:0}
  };
  const material=new THREE.ShaderMaterial({
    uniforms,
    transparent:true,
    depthWrite:false,
    depthTest:true,
    toneMapped:false,
    vertexShader:`
      varying vec2 vUv;
      void main(){
        vUv=uv;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
      }
    `,
    fragmentShader:`
      varying vec2 vUv;
      uniform vec3 color;
      uniform float opacity;
      uniform float rideMode;
      uniform float airborne;

      float softEllipse(vec2 p,vec2 scale,float power){
        float d=dot(p*scale,p*scale);
        return exp(-d*power);
      }

      void main(){
        vec2 p=vUv*2.0-1.0;
        float core=softEllipse(p,vec2(1.14,2.35),2.10);
        float leftSki=softEllipse(p-vec2(-0.28,0.02),vec2(4.3,1.24),2.35);
        float rightSki=softEllipse(p-vec2(0.28,0.02),vec2(4.3,1.24),2.35);
        float snowboard=softEllipse(p,vec2(2.65,1.18),2.15);
        float equipment=mix(max(leftSki,rightSki),snowboard,rideMode);
        float contact=max(core*.46,equipment);
        float edge=1.0-smoothstep(.72,1.0,max(abs(p.x),abs(p.y)));
        float alpha=contact*edge*opacity*(1.0-airborne*.32);
        if(alpha<.002)discard;
        gl_FragColor=vec4(color,alpha);
      }
    `
  });

  const geometry=new THREE.PlaneGeometry(2.15,3.45,1,1);
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='cinematic-rider-grounding';
  mesh.rotation.x=-Math.PI/2;
  mesh.position.y=-100;
  mesh.renderOrder=7;
  mesh.frustumCulled=false;
  mesh.castShadow=false;
  mesh.receiveShadow=false;
  mesh.visible=false;
  scene.add(mesh);

  let enabled=false;
  let strength=0;
  let profile='low';
  let updateCount=0;
  let visibleFrames=0;

  function setProfile(settings={}){
    profile=String(settings.profile||profile||'low');
    enabled=!!settings.contactGrounding&&(profile==='high'||profile==='max');
    strength=clamp(Number(settings.contactGroundingStrength)||0,0,1.25);
    if(!enabled){
      mesh.visible=false;
      uniforms.opacity.value=0;
    }
    return getDiagnostics();
  }

  function update({
    dt=0,
    x=0,
    y=0,
    z=0,
    groundY=0,
    air=false,
    landingPulse=0,
    running=true,
    rideMode='ski'
  }={}){
    updateCount++;
    if(!enabled||!running){
      mesh.visible=false;
      uniforms.opacity.value=0;
      return false;
    }

    const jumpHeight=Math.max(0,Number(y)-Number(groundY));
    const contact=clamp(1-jumpHeight/3.2,0,1);
    if(contact<=.01){
      mesh.visible=false;
      uniforms.opacity.value=0;
      return false;
    }

    const landingAccent=1+clamp(Number(landingPulse)||0,0,1)*.12;
    const target=.185*strength*contact*(air?.78:1)*landingAccent;
    const response=1-Math.pow(.001,Math.max(0,Number(dt)||0));
    uniforms.opacity.value=THREE.MathUtils.lerp(uniforms.opacity.value,target,response);
    uniforms.rideMode.value=rideMode==='snowboard'?1:0;
    uniforms.airborne.value=air?1:0;

    const spread=1+clamp(jumpHeight/3.2,0,1)*.34;
    mesh.position.set(Number(x)||0,Math.max(.008,(Number(groundY)||0)+.014),(Number(z)||0)+.025);
    mesh.scale.set(spread*landingAccent,spread,1);
    mesh.visible=uniforms.opacity.value>.002;
    if(mesh.visible)visibleFrames++;
    return mesh.visible;
  }

  function reset(){
    uniforms.opacity.value=0;
    uniforms.airborne.value=0;
    mesh.position.y=-100;
    mesh.visible=false;
  }

  function getDiagnostics(){
    return {
      profile,
      enabled,
      strength,
      drawCalls:enabled?1:0,
      renderTargets:0,
      textureAllocations:0,
      updateCount,
      visibleFrames
    };
  }

  function dispose(){
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
  }

  return {mesh,setProfile,update,reset,getDiagnostics,dispose};
}
