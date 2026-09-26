import * as THREE from 'three';

const clamp01=value=>THREE.MathUtils.clamp(Number(value)||0,0,1);

export function createAlpineSky(){
  const material=new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,
    uniforms:{
      zenith:{value:new THREE.Color(0x3c87bd)},high:{value:new THREE.Color(0x95cbe8)},horizon:{value:new THREE.Color(0xe2f0f7)},sunColor:{value:new THREE.Color(0xffedc6)},
      time:{value:0},sceneryDetail:{value:1},weatherNight:{value:0},weatherStorm:{value:0},weatherSnow:{value:0},weatherSunset:{value:0},weatherFlash:{value:0}
    },
    vertexShader:`varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0);}`,
    fragmentShader:`
      varying vec3 vDir;
      uniform vec3 zenith,high,horizon,sunColor;
      uniform float time,sceneryDetail,weatherNight,weatherStorm,weatherSnow,weatherSunset,weatherFlash;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      float fbm(vec2 p){float v=0.0,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=mat2(.8,-.6,.6,.8)*p*2.07+vec2(7.3,3.1);a*=.49;}return v;}
      void main(){
        vec3 d=normalize(vDir),sunDir=normalize(vec3(-9.0,15.0,7.0));
        float elevation=max(d.y,0.0),mu=max(dot(d,sunDir),0.0);
        vec3 color=mix(horizon,high,smoothstep(0.0,.36,elevation));
        color=mix(color,zenith,smoothstep(.16,.98,elevation));
        color=mix(color,vec3(.10,.17,.29),weatherNight*.16);
        color=mix(color,vec3(.60,.30,.25),weatherSunset*(1.0-smoothstep(.05,.42,elevation))*.14);
        float air=exp(-elevation*7.0);
        float mie=.006/pow(max(.016,1.0+.87*.87-2.0*.87*mu),1.5);
        color+=sunColor*(mie*.20+pow(mu,14.0)*.07)*(1.0-weatherStorm*.55);
        color=mix(color,horizon,air*.10);
        float disk=smoothstep(.99980,.99991,mu);
        color+=sunColor*(disk*2.2+pow(mu,550.0)*.23)*(1.0-weatherStorm*.72);
        if(d.y>.015){
          vec2 p=d.xz/(d.y+.26)*1.2+vec2(time*.0016,0.0);
          float shape=fbm(p*1.15);
          float threshold=.49-weatherStorm*.15-weatherSnow*.07;
          float body=smoothstep(threshold,.72-weatherStorm*.08,shape);
          float erosion=fbm(p*4.6+vec2(1.7,9.2));
          float density=clamp(body-(1.0-erosion)*(.19-weatherStorm*.05),0.0,1.0);
          float edge=clamp((fbm(p*1.15+sunDir.xz*.09)-shape)*8.0+.52,0.0,1.0);
          vec3 shade=mix(high*.68,horizon*.95,edge);
          shade=mix(shade,vec3(.30,.37,.48),weatherStorm*.42+weatherNight*.20);
          vec3 cloud=mix(shade,sunColor,.22+edge*.23);
          cloud+=sunColor*pow(mu,8.0)*(1.0-density)*.23;
          cloud+=vec3(.56,.68,.95)*weatherFlash*.35;
          float cover=density*smoothstep(.025,.14,d.y)*(1.0-smoothstep(.76,.99,d.y));
          color=mix(color,cloud,cover*(.54+.32*sceneryDetail+.18*weatherStorm));
          float wisps=pow(max(0.0,fbm(p*vec2(.45,5.2)+17.0)-.42),2.0);
          color=mix(color,horizon,wisps*.5*smoothstep(.12,.4,d.y));
          float cirrus=pow(max(0.0,fbm(p*vec2(.22,7.4)+vec2(-time*.0008,23.0))-.47),2.6);
          color=mix(color,vec3(.91,.96,1.0),cirrus*.30*sceneryDetail*smoothstep(.22,.55,d.y)*(1.0-weatherStorm*.75));
        }
        // Asymmetric side massifs frame the route while preserving a quiet central downhill window.
        float a=atan(d.x,-d.z),sides=smoothstep(.20,.52,abs(a));
        float ridge=.023+sin(a*7.0+1.1)*.017+sin(a*19.0-.6)*.009+abs(sin(a*41.0+2.1))*.005;
        ridge+=smoothstep(.62,1.32,abs(a))*.011;
        float mask=(1.0-smoothstep(ridge,ridge+.004,d.y))*smoothstep(-.10,-.02,d.y)*sides;
        float ridge2=.014+sin(a*10.0-2.7)*.010+abs(sin(a*29.0+.9))*.006;
        float mask2=(1.0-smoothstep(ridge2,ridge2+.003,d.y))*smoothstep(-.085,-.018,d.y)*smoothstep(.12,.42,abs(a));
        float distantFade=1.0-weatherSnow*.38-weatherStorm*.24;
        vec3 ridgeColor=mix(horizon,high*.54,.48);
        ridgeColor=mix(ridgeColor,vec3(.16,.22,.31),weatherNight*.30+weatherStorm*.22);
        color=mix(color,ridgeColor,mask*(.66+.14*sceneryDetail)*distantFade);
        color=mix(color,mix(horizon*.90,high*.60,.36),mask2*.30*distantFade);
        color+=vec3(.38,.47,.70)*weatherFlash*.18;
        gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const sky=new THREE.Mesh(new THREE.SphereGeometry(220,48,28),material);
  sky.frustumCulled=false;sky.renderOrder=-100;
  sky.userData.setWeatherState=(state={})=>{
    material.uniforms.weatherNight.value=clamp01(state.night);
    material.uniforms.weatherStorm.value=clamp01(Math.max(Number(state.rain)||0,(Number(state.cloud)||0)-.45));
    material.uniforms.weatherSnow.value=clamp01(state.snowfall);
    material.uniforms.weatherSunset.value=state.preset==='sunset'?1:0;
    material.uniforms.weatherFlash.value=clamp01(state.flash);
  };
  return sky;
}
