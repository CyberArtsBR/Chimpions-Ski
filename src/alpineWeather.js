import * as THREE from 'three';
import {terrainHeight} from './terrainContact.js';
import {softSprite} from './weatherAssets.js';
const rand=i=>{const a=Math.sin(i*127.1+9.2)*43758.5453;return a-Math.floor(a);};
function cloudTexture(){
  const size=256,data=new Uint8Array(size*size*4);
  function noise(x,y,period){
    const ix=Math.floor(x),iy=Math.floor(y);let fx=x-ix,fy=y-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);
    const h=(a,b)=>rand(((a%period+period)%period)*17+((b%period+period)%period)*131);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(h(ix,iy),h(ix+1,iy),fx),THREE.MathUtils.lerp(h(ix,iy+1),h(ix+1,iy+1),fx),fy);
  }
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    let value=0,amplitude=.56;for(let octave=0;octave<5;octave++){const period=4*2**octave;value+=noise(x/size*period,y/size*period,period)*amplitude;amplitude*=.5;}
    const v=Math.round(value*255);data.set([v,v,v,255],(y*size+x)*4);
  }
  const texture=new THREE.DataTexture(data,size,size);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;return texture;
}
function makeSeeds(count){const seeds=new Float32Array(count*3);for(let i=0;i<seeds.length;i++)seeds[i]=rand(i+91);return seeds;}
export function createAlpineWeather({scene,camera,renderer,sun,ambient,rim,settings}){
  let time=0;
  const sunDirection=new THREE.Vector3(-.55,.7,-.65).normalize(),targetDirection=new THREE.Vector3(),white=new THREE.Color(0xe9f4ff);
  const skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color()},horizon:{value:new THREE.Color()},sunColor:{value:new THREE.Color()},direction:{value:sunDirection},clouds:{value:cloudTexture()},time:{value:0},cover:{value:0},night:{value:0},flash:{value:0},wind:{value:0}},
    vertexShader:'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 vDirection;uniform vec3 top,horizon,sunColor,direction;uniform sampler2D clouds;uniform float time,cover,night,flash,wind;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){
        vec3 d=normalize(vDirection);float elevation=max(0.,d.y);
        vec3 color=mix(horizon,top,pow(smoothstep(-.05,.95,d.y),.65));
        float alignment=max(0.,dot(d,direction));
        float disk=smoothstep(mix(.99965,.99925,night),mix(.99987,.9997,night),alignment);
        color+=sunColor*(disk*mix(3.,1.25,night)+pow(alignment,180.)*.11+pow(alignment,14.)*.065);
        vec2 sphereUV=vec2(atan(d.x,d.z)/6.283185+.5,asin(d.y)/3.14159+.5);
        vec2 starGrid=sphereUV*vec2(900.,450.);float starSeed=hash(floor(starGrid));
        float star=(1.-smoothstep(.04,.20,length(fract(starGrid)-.5)))*step(.996,starSeed);
        color+=vec3(.7,.82,1.)*star*night*(1.-cover)*smoothstep(.07,.3,d.y)*.7;
        vec2 uv=d.xz/(max(.08,d.y)+.28)*.15+vec2(time*(.00175+abs(wind)*.00085),time*(.00030+wind*.00016));
        float shape=texture2D(clouds,uv).r,detail=texture2D(clouds,uv*2.7+vec2(.4,-time*.0007)).r;
        float cloud=smoothstep(.72-cover*.38,.88-cover*.28,shape*.82+detail*.18);
        vec2 highUv=d.xz/(max(.10,d.y)+.42)*.085+vec2(-time*(.00062+abs(wind)*.00025),time*(.00014+wind*.00007));
        float highShape=texture2D(clouds,highUv+vec2(.17,.33)).r;
        float highCloud=smoothstep(.66-cover*.22,.90-cover*.12,highShape)*(.28+.34*cover);
        float edge=texture2D(clouds,uv+direction.xz*.012).r-shape;
        vec3 cloudColor=mix(horizon*.80,sunColor*.9,clamp(.42+edge*9.,0.,1.))*(1.-night*.62);
        cloudColor+=vec3(.62,.72,1.)*flash*(.3+detail);
        color=mix(color,cloudColor,cloud*smoothstep(.015,.15,d.y));
        color=mix(color,mix(top,horizon,.45),highCloud*smoothstep(.18,.42,d.y)*.32);
        // A far glacial skyline closes the valley without filling the course view.
        float azimuth=atan(d.x,-d.z),center=1.-smoothstep(.17,.48,abs(azimuth));
        float peaks=.010+.009*abs(sin(azimuth*23.))+ .006*abs(sin(azimuth*61.+1.4));
        float ridge=(1.-smoothstep(peaks,peaks+.004,d.y))*smoothstep(-.065,-.018,d.y)*center;
        color=mix(color,mix(horizon*.72,top*.78,.28),ridge*(.50-night*.18));
        float horizonAir=exp(-max(d.y,0.)*13.0)*(1.-night*.45);color=mix(color,horizon,horizonAir*.075);
        color+=vec3(.38,.47,.7)*flash*.35;
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  const sky=new THREE.Mesh(new THREE.SphereGeometry(240,32,18),skyMaterial);sky.frustumCulled=false;sky.renderOrder=-100;scene.add(sky);
  const common={time:{value:0},travel:{value:0},center:{value:new THREE.Vector3()},wind:{value:0},tint:{value:new THREE.Color()},amount:{value:0},pixelRatio:{value:1}};
  const snowGeometry=new THREE.BufferGeometry();snowGeometry.setAttribute('position',new THREE.BufferAttribute(makeSeeds(1200),3));
  const snowMaterial=new THREE.ShaderMaterial({uniforms:{...common,amount:{value:0}},transparent:true,depthWrite:false,
    vertexShader:`uniform float time,travel,wind,pixelRatio;uniform vec3 center;varying float alpha;
      void main(){vec3 p=position;
        p.x=mod(p.x*36.+time*wind*1.1,36.)-18.+center.x;
        p.y=mod(p.y*17.-time*(.8+position.x*1.3),17.)+.15;
        p.z=mod(p.z*62.+travel*.55+time*1.1,62.)-49.+center.z;
        p.x+=sin(time*.65+position.z*40.)*.35;
        vec4 view=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*view;
        gl_PointSize=clamp((16.+position.y*20.)/max(2.,-view.z),.75,5.)*pixelRatio;
        alpha=smoothstep(1.,5.,-view.z)*(1.-smoothstep(30.,60.,-view.z));
      }`,
    fragmentShader:`uniform vec3 tint;uniform float amount;varying float alpha;
      void main(){float a=(1.-smoothstep(.12,.5,length(gl_PointCoord-.5)))*alpha*amount*.72;if(a<.005)discard;gl_FragColor=vec4(tint,a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`});
  const snow=new THREE.Points(snowGeometry,snowMaterial);snow.frustumCulled=false;scene.add(snow);
  function instancedPlane(count){
    const base=new THREE.PlaneGeometry(1,1),g=new THREE.InstancedBufferGeometry();g.index=base.index;g.setAttribute('position',base.attributes.position);g.setAttribute('uv',base.attributes.uv);g.setAttribute('seed',new THREE.InstancedBufferAttribute(makeSeeds(count),3));return g;
  }
  const rainGeometry=instancedPlane(2000),rainMaterial=new THREE.ShaderMaterial({uniforms:{...common,amount:{value:0}},transparent:true,depthWrite:false,
    vertexShader:`attribute vec3 seed;uniform float time,travel,wind;uniform vec3 center;varying vec2 vUv;varying float alpha;
      void main(){
        vec3 p=vec3(mod(seed.x*34.+time*wind*3.,34.)-17.+center.x,mod(seed.y*19.-time*(20.+seed.x*8.),19.)+.1,mod(seed.z*60.+travel*.55,60.)-47.+center.z);
        vec4 view=modelViewMatrix*vec4(p,1.);
        float length=.35+seed.y*.45;view.xy+=vec2(position.x*.018-position.y*wind*.10,position.y*length);
        gl_Position=projectionMatrix*view;vUv=uv;alpha=smoothstep(1.5,5.,-view.z)*(1.-smoothstep(35.,60.,-view.z))*(.3+seed.x*.5);
      }`,
    fragmentShader:`uniform vec3 tint;uniform float amount;varying vec2 vUv;varying float alpha;
      void main(){float a=sin(vUv.y*3.14159)*(1.-smoothstep(.12,.5,abs(vUv.x-.5)))*alpha*amount*.6;gl_FragColor=vec4(tint,a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`});
  const rain=new THREE.Mesh(rainGeometry,rainMaterial);rain.frustumCulled=false;scene.add(rain);
  const mistGeometry=instancedPlane(24),mistMaterial=new THREE.ShaderMaterial({uniforms:{...common,amount:{value:0}},transparent:true,depthWrite:false,
    vertexShader:`attribute vec3 seed;uniform float time,travel,wind;uniform vec3 center;varying vec2 vUv;varying float alpha;
      void main(){vec3 p=vec3(mod(seed.x*32.+time*wind,32.)-16.+center.x,.45+seed.y*.5,mod(seed.z*55.+travel*.5,55.)-44.+center.z);
      vec4 view=modelViewMatrix*vec4(p,1.);view.xy+=position.xy*vec2(5.+seed.x*5.,.8+seed.y*.7);gl_Position=projectionMatrix*view;vUv=uv;alpha=smoothstep(5.,12.,-view.z)*(1.-smoothstep(35.,48.,-view.z));}`,
    fragmentShader:`uniform vec3 tint;uniform float amount;varying vec2 vUv;varying float alpha;void main(){float a=exp(-dot((vUv-.5)*5.,(vUv-.5)*5.))*amount*alpha*.06;gl_FragColor=vec4(tint,a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`});
  const mist=new THREE.Mesh(mistGeometry,mistMaterial);mist.frustumCulled=false;scene.add(mist);
  const splashGeometry=new THREE.RingGeometry(.58,1,10);splashGeometry.rotateX(-Math.PI/2);
  const fades=new Float32Array(96);splashGeometry.setAttribute('splashFade',new THREE.InstancedBufferAttribute(fades,1));
  const splashMaterial=new THREE.ShaderMaterial({uniforms:{tint:common.tint,amount:{value:0}},transparent:true,depthWrite:false,side:THREE.DoubleSide,
    vertexShader:'attribute float splashFade;varying float fade;void main(){fade=splashFade;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
    fragmentShader:`uniform vec3 tint;uniform float amount;varying float fade;void main(){gl_FragColor=vec4(tint,fade*amount*.23);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`});
  const splashes=new THREE.InstancedMesh(splashGeometry,splashMaterial,96);splashes.frustumCulled=false;scene.add(splashes);const dummy=new THREE.Object3D();
  // Reuse one bolt and a softer halo; neither contributes another shadow pass.
  const boltPositions=new Float32Array(60*3),boltGeometry=new THREE.BufferGeometry();boltGeometry.setAttribute('position',new THREE.BufferAttribute(boltPositions,3));
  const boltMaterial=new THREE.LineBasicMaterial({color:0xd7e7ff,transparent:true,opacity:0,depthWrite:false,toneMapped:false});
  const bolt=new THREE.LineSegments(boltGeometry,boltMaterial);bolt.frustumCulled=false;scene.add(bolt);
  const boltGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:softSprite(),color:0x9ebcff,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));boltGlow.scale.set(22,30,1);scene.add(boltGlow);
  const lightningLight=new THREE.PointLight(0xa8c6ff,0,115,1.7);lightningLight.castShadow=false;scene.add(lightningLight);
  function strike(serial){
    const side=serial%2?-1:1,x=side*(19+rand(serial)*16),z=-80-rand(serial+1)*32;
    let px=x,py=45,pz=z,index=0;
    for(let i=0;i<18;i++){
      const nx=px+(rand(serial*31+i)-.5)*4,ny=py-1.8,nz=pz+(rand(i+76)-.5)*1.2;
      boltPositions.set([px,py,pz,nx,ny,nz],index);index+=6;
      if(i%3===1){boltPositions.set([nx,ny,nz,nx+side*(2+rand(i)*3),ny-1.5,nz+.2],index);index+=6;}
      px=nx;py=ny;pz=nz;
    }
    boltGeometry.setDrawRange(0,index/3);boltGeometry.attributes.position.needsUpdate=true;boltGlow.position.set(x,30,z);lightningLight.position.set(x,14,z+9);
  }
  function setQuality(next){settings=next;snowGeometry.setDrawRange(0,next.snowCount);rainGeometry.instanceCount=next.rainCount;mistGeometry.instanceCount=next.mistCount;splashes.count=next.splashCount;}
  setQuality(settings);
  function update(dt,state,w){
    time+=dt;common.time.value=time;common.travel.value=state.travel;common.center.value.set(camera.position.x*.75,0,camera.position.z-10.5);common.wind.value=w.wind;common.tint.value.copy(w.snow).lerp(white,.2+w.flash*.5);common.pixelRatio.value=renderer.getPixelRatio();
    sky.position.copy(camera.position);skyMaterial.uniforms.time.value=time;skyMaterial.uniforms.top.value.copy(w.top);skyMaterial.uniforms.horizon.value.copy(w.horizon);skyMaterial.uniforms.sunColor.value.copy(w.sun);skyMaterial.uniforms.cover.value=w.cloud;skyMaterial.uniforms.night.value=w.night;skyMaterial.uniforms.flash.value=w.flash;skyMaterial.uniforms.wind.value=w.wind;
    const lowSun=w.preset==='sunset'?.30:.7;sunDirection.lerp(targetDirection.set(-.55,lowSun,-.65).normalize(),1-Math.exp(-dt*.55)).normalize();
    sun.color.copy(w.sun).lerp(white,w.flash*.75);sun.intensity=w.key+w.flash*2.5;
    sun.position.copy(sunDirection).multiplyScalar(24);sun.position.x+=state.x*.45;sun.position.z-=5;sun.target.position.set(state.x*.45,0,-5);
    ambient.color.copy(w.ambient);ambient.groundColor.setHex(0x566479);ambient.intensity=w.fill+w.flash*.25;
    rim.color.copy(w.ambient).lerp(white,w.flash*.16);rim.intensity=.22+w.night*.25+w.flash*.34;
    scene.background.copy(w.fog);scene.fog.color.copy(w.fog).lerp(white,w.flash*.13);if(scene.fog.isFogExp2)scene.fog.density=w.fogDensity;else{scene.fog.near=48-w.rain*12;scene.fog.far=Math.max(155,Math.min(280,2.2/w.fogDensity));}renderer.toneMappingExposure=w.exposure;
    scene.environmentIntensity=.55-w.night*.30+w.flash*.08;
    snowMaterial.uniforms.amount.value=w.snowfall;snow.visible=w.snowfall>.01;
    rainMaterial.uniforms.amount.value=w.rain;rain.visible=w.rain>.01;
    mistMaterial.uniforms.amount.value=Math.max(w.rain,w.snowfall*.4);mist.visible=mistMaterial.uniforms.amount.value>.12;
    splashes.visible=w.rain>.05;splashMaterial.uniforms.amount.value=w.rain;
    if(splashes.visible){
      for(let i=0;i<settings.splashCount;i++){
        const phase=(time*(1.5+rand(i)*.8)+rand(i+8))%1;
        const x=state.x*.3+(rand(i+20)-.5)*21,z=10-((rand(i+55)*34-state.travel)%34+34)%34;
        dummy.position.set(x,terrainHeight(x,z-state.travel)+.025,z);dummy.scale.setScalar(.035+phase*.13);dummy.updateMatrix();splashes.setMatrixAt(i,dummy.matrix);fades[i]=(1-phase)**2;
      }
      splashes.instanceMatrix.needsUpdate=true;splashGeometry.attributes.splashFade.needsUpdate=true;
    }
    if(w.strike&&!w.reducedFlashes)strike(w.strikeSerial);
    bolt.visible=!w.reducedFlashes&&w.flash>.02;boltMaterial.opacity=Math.min(1,w.flash*1.6);boltGlow.visible=bolt.visible;boltGlow.material.opacity=w.flash*.27*settings.glow;lightningLight.visible=bolt.visible;lightningLight.intensity=bolt.visible?w.flash*62*settings.glow:0;
  }
  return {update,setQuality};
}
