import * as THREE from 'three';
import {Pass,FullScreenQuad} from 'three/addons/postprocessing/Pass.js';

const VERTEX=`varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const GRADES={
  day:{shadow:[.96,1,1.035],highlight:[1.025,1.008,.98],saturation:1.015},
  sunset:{shadow:[.92,1.015,1.055],highlight:[1.07,1.015,.94],saturation:1.035},
  night:{shadow:[.92,.975,1.08],highlight:[.98,1.015,1.045],saturation:.98},
  snow:{shadow:[.965,.995,1.04],highlight:[1.01,1.015,1.01],saturation:.96},
  rain:{shadow:[.94,.985,1.045],highlight:[1.,1.015,1.03],saturation:.94},
  storm:{shadow:[.93,.985,1.055],highlight:[1.,1.015,1.035],saturation:.91}
};
// A small, real 16^3 RGB look-up table packed into a 256 x 16 2D texture.
function createLut(grade){
  const pixels=new Uint8Array(256*16*4);
  for(let b=0;b<16;b++)for(let g=0;g<16;g++)for(let r=0;r<16;r++){
    const input=[r/15,g/15,b/15],luma=input[0]*.2126+input[1]*.7152+input[2]*.0722;
    const idx=(g*256+b*16+r)*4;
    for(let c=0;c<3;c++){
      const warmth=grade.shadow[c]*(1-luma)+grade.highlight[c]*luma;
      pixels[idx+c]=Math.round(255*THREE.MathUtils.clamp((luma+(input[c]-luma)*grade.saturation)*warmth,0,1));
    }
    pixels[idx+3]=255;
  }
  const tex=new THREE.DataTexture(pixels,256,16,THREE.RGBAFormat);
  tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;
  tex.wrapS=THREE.ClampToEdgeWrapping;tex.wrapT=THREE.ClampToEdgeWrapping;
  tex.generateMipmaps=false;tex.needsUpdate=true;
  return tex;
}
const lutFragment=`
  uniform sampler2D tDiffuse; uniform sampler2D tLut;
  uniform vec2 texel; uniform float sharpen; uniform float grading;
  uniform float dof; uniform sampler2D tDepth; uniform float cameraNear; uniform float cameraFar;
  varying vec2 vUv;
  vec3 lut(vec3 rgb){
    vec3 p=clamp(rgb,0.,1.)*15.;float slice=floor(p.b);
    vec2 a=vec2((p.r+.5+slice*16.)/256.,(p.g+.5)/16.);
    vec2 b=vec2((p.r+.5+min(slice+1.,15.)*16.)/256.,(p.g+.5)/16.);
    return mix(texture2D(tLut,a).rgb,texture2D(tLut,b).rgb,fract(p.b));
  }
  void main(){
    vec3 center=texture2D(tDiffuse,vUv).rgb;
    vec3 color=center;
    if(dof>0.001){
      float depth=texture2D(tDepth,vUv).x;
      float viewDistance=(2.*cameraNear*cameraFar)/(cameraFar+cameraNear-(depth*2.-1.)*(cameraFar-cameraNear));
      float distance=smoothstep(24.,95.,viewDistance);
      float radius=dof*distance*2.25;
      vec2 offset=texel*radius;
      vec3 blur=(texture2D(tDiffuse,vUv+vec2(offset.x,offset.y)).rgb+
        texture2D(tDiffuse,vUv+vec2(-offset.x,offset.y)).rgb+
        texture2D(tDiffuse,vUv+vec2(offset.x,-offset.y)).rgb+
        texture2D(tDiffuse,vUv-vec2(offset.x,offset.y)).rgb)*.25;
      color=mix(center,blur,clamp(dof*distance*.56,0.,.56));
    }
    if(sharpen>0.001){
      vec3 n=texture2D(tDiffuse,vUv+vec2(0.,texel.y)).rgb;
      vec3 s=texture2D(tDiffuse,vUv-vec2(0.,texel.y)).rgb;
      vec3 e=texture2D(tDiffuse,vUv+vec2(texel.x,0.)).rgb;
      vec3 w=texture2D(tDiffuse,vUv-vec2(texel.x,0.)).rgb;
      vec3 lo=min(min(n,s),min(e,w));vec3 hi=max(max(n,s),max(e,w));
      vec3 detail=center-(n+s+e+w)*.25;
      float contrast=clamp(max(max(hi.r-lo.r,hi.g-lo.g),hi.b-lo.b)*3.,0.,1.);
      color=clamp(color+detail*sharpen*contrast,lo*.96,hi*1.04);
    }
    color=mix(color,lut(color),grading);
    gl_FragColor=vec4(color,1.);
  }`;
const fogFragment=`
  uniform sampler2D tDepth; uniform float density; uniform float distanceScale;
  uniform float shaft; uniform vec2 sunUv; uniform vec3 fogColor; uniform float nearPlane; uniform float farPlane;
  varying vec2 vUv;
  void main(){
    float depth=texture2D(tDepth,vUv).x;
    float viewZ=(2.*nearPlane*farPlane)/(farPlane+nearPlane-(depth*2.-1.)*(farPlane-nearPlane));
    float farFog=smoothstep(46.,175.,viewZ)*density;
    float horizon=smoothstep(.36,.83,vUv.y)*(.25+.75*smoothstep(48.,130.,viewZ));
    float corridor=1.-.62*(1.-smoothstep(.12,.43,abs(vUv.x-.5)))*(1.-smoothstep(.12,.52,vUv.y));
    float mist=farFog*horizon*corridor*distanceScale;
    vec2 toward=sunUv-vUv;
    float radial=exp(-dot(toward,toward)*9.);
    float beams=.5+.5*sin(atan(toward.y,toward.x)*13.+2.);
    float rays=shaft*radial*beams*max(0.,horizon)*.13;
    gl_FragColor=vec4(fogColor,clamp(mist+rays,0.,.20));
  }`;
const compositeFragment=`
  uniform sampler2D tDiffuse;uniform sampler2D tFog;
  varying vec2 vUv;
  void main(){vec4 fog=texture2D(tFog,vUv);vec3 rgb=texture2D(tDiffuse,vUv).rgb;
    gl_FragColor=vec4(mix(rgb,fog.rgb,fog.a),1.);}`;

function material(fragmentShader,uniforms){return new THREE.ShaderMaterial({uniforms,vertexShader:VERTEX,fragmentShader,depthTest:false,depthWrite:false,toneMapped:false});}

// A stable quarter/half resolution atmosphere buffer; no stochastic sample noise.
export class CinematicAtmospherePass extends Pass{
  constructor(depth,camera,settings){
    super();this.depth=depth;this.camera=camera;this.scale=settings.volumetricResolutionScale;this.settingsDensity=settings.volumetricDensity;
    this.target=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
    this.fog=material(fogFragment,{tDepth:{value:depth},density:{value:0},distanceScale:{value:settings.volumetricDistance},shaft:{value:0},sunUv:{value:new THREE.Vector2(.5,.8)},fogColor:{value:new THREE.Color(0x9bbacb)},nearPlane:{value:camera.near},farPlane:{value:camera.far}});
    this.composite=material(compositeFragment,{tDiffuse:{value:null},tFog:{value:this.target.texture}});
    this.quad=new FullScreenQuad(this.fog);
  }
  update(weather,sun){
    const preset=weather?.preset||'day';
    const storm=preset==='storm'||preset==='rain';
    const density=storm?1.1:preset==='snow'?1.05:preset==='sunset'?.82:preset==='night'?.50:.45;
    this.fog.uniforms.density.value=this.settingsDensity*density;
    this.fog.uniforms.fogColor.value.set(storm?0x657d97:preset==='sunset'?0xe1ad92:preset==='night'?0x526d94:0xbed6e2);
    if(sun){const screen=sun.position.clone().project(this.camera);this.fog.uniforms.sunUv.value.set(screen.x*.5+.5,screen.y*.5+.5);}
    this.fog.uniforms.shaft.value=(!storm&&sun&&preset!=='night')?(preset==='sunset'?.8:preset==='day'?.18:.12):0;
  }
  setSize(w,h){this.target.setSize(Math.max(1,Math.round(w*this.scale)),Math.max(1,Math.round(h*this.scale)));}
  render(renderer,write,read){
    const previous=renderer.getRenderTarget();
    this.fog.uniforms.nearPlane.value=this.camera.near;this.fog.uniforms.farPlane.value=this.camera.far;
    renderer.setRenderTarget(this.target);this.quad.material=this.fog;this.quad.render(renderer);
    this.composite.uniforms.tDiffuse.value=read.texture;
    renderer.setRenderTarget(this.renderToScreen?null:write);this.quad.material=this.composite;this.quad.render(renderer);
    renderer.setRenderTarget(previous);
  }
  dispose(){this.target.dispose();this.fog.dispose();this.composite.dispose();this.quad.dispose();}
}

export class CinematicFinishPass extends Pass{
  constructor(depth,camera,settings){
    super();this.camera=camera;this.luts=Object.fromEntries(Object.entries(GRADES).map(([key,value])=>[key,createLut(value)]));
    this.material=material(lutFragment,{tDiffuse:{value:null},tLut:{value:this.luts.day},texel:{value:new THREE.Vector2(1,1)},sharpen:{value:settings.sharpenStrength},grading:{value:settings.colorGrading?1:0},dof:{value:0},tDepth:{value:depth},cameraNear:{value:camera.near},cameraFar:{value:camera.far}});
    this.quad=new FullScreenQuad(this.material);
  }
  update(preset,cinematic){this.material.uniforms.tLut.value=this.luts[preset]||this.luts.day;this.material.uniforms.dof.value=cinematic?1:0;}
  setSize(w,h){this.material.uniforms.texel.value.set(1/Math.max(w,1),1/Math.max(h,1));}
  render(renderer,write,read){this.material.uniforms.tDiffuse.value=read.texture;this.material.uniforms.cameraNear.value=this.camera.near;this.material.uniforms.cameraFar.value=this.camera.far;renderer.setRenderTarget(this.renderToScreen?null:write);this.quad.render(renderer);}
  dispose(){Object.values(this.luts).forEach(texture=>texture.dispose());this.material.dispose();this.quad.dispose();}
}
