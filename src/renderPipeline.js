import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';

const WINDOW=240;
const now=()=>globalThis.performance?.now?.()??Date.now();
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

function percentile(sorted,p){
  if(!sorted.length)return 0;
  const index=(sorted.length-1)*p;
  const lo=Math.floor(index),hi=Math.ceil(index);
  if(lo===hi)return sorted[lo];
  return sorted[lo]+(sorted[hi]-sorted[lo])*(index-lo);
}
function summarize(values){
  if(!values.length)return {average:0,p50:0,p95:0,p99:0,max:0,samples:0};
  const sorted=[...values].sort((a,b)=>a-b);
  const average=values.reduce((sum,value)=>sum+value,0)/values.length;
  const round=value=>Math.round(value*1000)/1000;
  return {
    average:round(average),
    p50:round(percentile(sorted,.50)),
    p95:round(percentile(sorted,.95)),
    p99:round(percentile(sorted,.99)),
    max:round(sorted.at(-1)||0),
    samples:values.length
  };
}
function pushSample(buffer,value){
  const numeric=Number(value);
  if(!Number.isFinite(numeric)||numeric<0)return;
  buffer.push(numeric);
  if(buffer.length>WINDOW)buffer.splice(0,buffer.length-WINDOW);
}

function createGpuTimer(renderer){
  const gl=renderer.getContext();
  const isWebGL2=!!renderer.capabilities.isWebGL2;
  const ext=isWebGL2
    ?gl.getExtension('EXT_disjoint_timer_query_webgl2')
    :gl.getExtension('EXT_disjoint_timer_query');
  const pending=[];
  let active=null;
  let disjointCount=0;

  function deleteQuery(query){
    if(!query)return;
    if(isWebGL2)gl.deleteQuery(query);
    else ext?.deleteQueryEXT?.(query);
  }
  function clearPending(){
    for(const query of pending)deleteQuery(query);
    pending.length=0;
  }
  function begin(){
    if(!ext||active||pending.length>=6)return false;
    try{
      active=isWebGL2?gl.createQuery():ext.createQueryEXT();
      if(!active)return false;
      if(isWebGL2)gl.beginQuery(ext.TIME_ELAPSED_EXT,active);
      else ext.beginQueryEXT(ext.TIME_ELAPSED_EXT,active);
      return true;
    }catch{
      deleteQuery(active);
      active=null;
      return false;
    }
  }
  function end(){
    if(!ext||!active)return;
    try{
      if(isWebGL2)gl.endQuery(ext.TIME_ELAPSED_EXT);
      else ext.endQueryEXT(ext.TIME_ELAPSED_EXT);
      pending.push(active);
    }catch{
      deleteQuery(active);
    }
    active=null;
  }
  function poll(){
    if(!ext||!pending.length)return null;
    try{
      if(gl.getParameter(ext.GPU_DISJOINT_EXT)){
        disjointCount++;
        clearPending();
        return null;
      }
      const query=pending[0];
      const available=isWebGL2
        ?gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE)
        :ext.getQueryObjectEXT(query,ext.QUERY_RESULT_AVAILABLE_EXT);
      if(!available)return null;
      const nanoseconds=isWebGL2
        ?gl.getQueryParameter(query,gl.QUERY_RESULT)
        :ext.getQueryObjectEXT(query,ext.QUERY_RESULT_EXT);
      pending.shift();
      deleteQuery(query);
      const milliseconds=Number(nanoseconds)/1e6;
      return Number.isFinite(milliseconds)&&milliseconds>=0?milliseconds:null;
    }catch{
      return null;
    }
  }
  function dispose(){
    if(active){
      try{
        if(isWebGL2)gl.endQuery(ext.TIME_ELAPSED_EXT);
        else ext?.endQueryEXT?.(ext.TIME_ELAPSED_EXT);
      }catch{}
      deleteQuery(active);
      active=null;
    }
    clearPending();
  }
  return {
    begin,
    end,
    poll,
    dispose,
    get supported(){return !!ext;},
    get pending(){return pending.length;},
    get disjointCount(){return disjointCount;}
  };
}

function targetTypeLabel(type){
  if(type===THREE.HalfFloatType)return 'half-float';
  if(type===THREE.FloatType)return 'float';
  if(type===THREE.UnsignedByteType)return 'unsigned-byte';
  return 'default';
}

export function createRenderPipeline({
  renderer,
  scene,
  camera,
  quality,
  width=globalThis.innerWidth||1,
  height=globalThis.innerHeight||1,
  shadowLight=null
}={}){
  if(!renderer||!scene||!camera||!quality)throw new Error('createRenderPipeline requires renderer, scene, camera and quality');

  let viewportWidth=Math.max(1,Math.floor(width));
  let viewportHeight=Math.max(1,Math.floor(height));
  let composer=null;
  let renderPass=null;
  let bloomPass=null;
  let outputPass=null;
  let rootTarget=null;
  let activeProfile='';
  let settings=quality.getSettings();
  let composerPixelRatio=0;
  let invalidated=true;
  let disposed=false;
  let lastRenderAt=-Infinity;
  let lastStaticReason=null;
  let staticFrameSkips=0;
  let staticFramesRendered=0;
  let dynamicFramesRendered=0;
  let pipelineRebuilds=0;
  let targetDisposals=0;
  let shadowConfigChanges=0;
  let anisotropyRefreshes=0;
  let anisotropyTextures=0;

  const cpuSamples=[];
  const postSamples=[];
  const gpuSamples=[];
  const gpuTimer=createGpuTimer(renderer);

  function countManagedRenderTargets(){
    if(!composer)return 0;
    let count=2;
    if(bloomPass){
      if(bloomPass.renderTargetBright)count++;
      count+=bloomPass.renderTargetsHorizontal?.length||0;
      count+=bloomPass.renderTargetsVertical?.length||0;
    }
    return count;
  }

  function disposePostPipeline(){
    if(!composer&&!rootTarget)return;
    try{bloomPass?.dispose?.();}catch{}
    try{renderPass?.dispose?.();}catch{}
    try{outputPass?.dispose?.();}catch{}
    try{composer?.dispose?.();}catch{}
    composer=null;
    renderPass=null;
    bloomPass=null;
    outputPass=null;
    rootTarget=null;
    composerPixelRatio=0;
    targetDisposals++;
  }

  function applyShadowSettings(next=settings){
    const enabled=!!next.shadows&&!!shadowLight;
    renderer.shadowMap.enabled=enabled;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate=enabled;
    if(!shadowLight)return;

    shadowLight.castShadow=enabled;
    if(!enabled){
      if(shadowLight.shadow?.map){
        shadowLight.shadow.map.dispose?.();
        shadowLight.shadow.map=null;
      }
      shadowConfigChanges++;
      return;
    }

    const mapSize=Math.max(512,Math.min(4096,Math.round(Number(next.shadowMapSize)||1024)));
    const radius=clamp(Number(next.shadowRadius)||28,12,48);
    const shadow=shadowLight.shadow;
    const changed=shadow.mapSize.x!==mapSize||shadow.mapSize.y!==mapSize||
      shadow.camera.left!==-radius||shadow.camera.right!==radius;
    shadow.mapSize.set(mapSize,mapSize);
    shadow.camera.left=-radius;
    shadow.camera.right=radius;
    shadow.camera.top=radius*.72;
    shadow.camera.bottom=-radius*.72;
    shadow.camera.near=1;
    shadow.camera.far=72;
    shadow.bias=Number(next.shadowBias)||0;
    shadow.normalBias=Math.max(0,Number(next.shadowNormalBias)||0);
    shadow.radius=next.profile==='max'?2:1;
    shadow.camera.updateProjectionMatrix();
    if(changed&&shadow.map){
      shadow.map.dispose?.();
      shadow.map=null;
    }
    renderer.shadowMap.needsUpdate=true;
    shadowConfigChanges++;
  }

  function refreshTextureQuality(root=scene){
    const maxSupported=Math.max(1,Number(renderer.capabilities.getMaxAnisotropy?.())||1);
    const requested=Math.max(1,Math.min(maxSupported,Math.round(Number(settings.maxAnisotropy)||1)));
    const textures=new Set();
    const textureKeys=['map','normalMap','roughnessMap','metalnessMap','emissiveMap','alphaMap','aoMap','bumpMap'];
    root?.traverse?.(object=>{
      if(!object?.material)return;
      const materials=Array.isArray(object.material)?object.material:[object.material];
      for(const material of materials){
        if(!material)continue;
        for(const key of textureKeys){
          const texture=material[key];
          if(texture?.isTexture)textures.add(texture);
        }
      }
    });
    let changed=0;
    for(const texture of textures){
      if(texture.anisotropy===requested)continue;
      texture.anisotropy=requested;
      texture.needsUpdate=true;
      changed++;
    }
    anisotropyRefreshes++;
    anisotropyTextures=textures.size;
    return {requested,maxSupported,changed,total:textures.size};
  }

  function applyRendererResolution(){
    const dpr=quality.getPixelRatio(globalThis.devicePixelRatio||1);
    if(Math.abs(renderer.getPixelRatio()-dpr)>.005)renderer.setPixelRatio(dpr);
    renderer.setSize(viewportWidth,viewportHeight,true);
    if(composer){
      const postScale=clamp(Number(settings.postResolutionScale)||1,.5,1);
      const nextComposerDpr=Math.max(.5,dpr*postScale);
      if(Math.abs(composerPixelRatio-nextComposerDpr)>.005){
        composer.setPixelRatio(nextComposerDpr);
        composerPixelRatio=nextComposerDpr;
      }
      composer.setSize(viewportWidth,viewportHeight);
    }
    invalidated=true;
  }

  function buildPostPipeline(){
    disposePostPipeline();
    if(!settings.postProcessing)return;

    const gl=renderer.getContext();
    const canHdr=renderer.capabilities.isWebGL2&&
      settings.renderTargetType==='half-float'&&
      !!gl.getExtension('EXT_color_buffer_float');
    const targetType=canHdr?THREE.HalfFloatType:THREE.UnsignedByteType;
    rootTarget=new THREE.WebGLRenderTarget(viewportWidth,viewportHeight,{
      type:targetType,
      minFilter:THREE.LinearFilter,
      magFilter:THREE.LinearFilter,
      depthBuffer:true,
      stencilBuffer:false
    });
    const maxSamples=Math.max(0,Math.min(4,Number(renderer.capabilities.maxSamples)||4));
    rootTarget.samples=renderer.capabilities.isWebGL2
      ?Math.max(0,Math.min(maxSamples,Math.trunc(Number(settings.msaaSamples)||0)))
      :0;

    composer=new EffectComposer(renderer,rootTarget);
    renderPass=new RenderPass(scene,camera);
    composer.addPass(renderPass);
    if(settings.bloomEnabled){
      bloomPass=new UnrealBloomPass(
        new THREE.Vector2(viewportWidth,viewportHeight),
        Math.max(0,Number(settings.bloomStrength)||0),
        clamp(Number(settings.bloomRadius)||0,0,1),
        Math.max(0,Number(settings.bloomThreshold)||0)
      );
      composer.addPass(bloomPass);
    }
    outputPass=new OutputPass();
    composer.addPass(outputPass);
    pipelineRebuilds++;
  }

  function applyProfile(force=false){
    if(disposed)return;
    const next=quality.getSettings();
    const profileChanged=next.profile!==activeProfile;
    const topologyChanged=!settings||
      next.postProcessing!==settings.postProcessing||
      next.renderTargetType!==settings.renderTargetType||
      next.msaaSamples!==settings.msaaSamples||
      next.bloomEnabled!==settings.bloomEnabled;

    settings=next;
    activeProfile=next.profile;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=clamp(Number(next.exposure)||1.02,.85,1.2);
    if(force||profileChanged||topologyChanged)buildPostPipeline();
    if(bloomPass){
      bloomPass.strength=Math.max(0,Number(next.bloomStrength)||0);
      bloomPass.radius=clamp(Number(next.bloomRadius)||0,0,1);
      bloomPass.threshold=Math.max(0,Number(next.bloomThreshold)||0);
    }
    applyShadowSettings(next);
    refreshTextureQuality(scene);
    applyRendererResolution();
  }

  function setShadowLight(light){
    if(shadowLight===light){
      applyShadowSettings(settings);
      return;
    }
    if(shadowLight&&shadowLight!==light)shadowLight.castShadow=false;
    shadowLight=light||null;
    applyShadowSettings(settings);
    invalidated=true;
  }

  function render(dt=0,{staticFrame=false,staticReason=null,stamp=now()}={}){
    if(disposed)return false;
    const gpuSample=gpuTimer.poll();
    if(gpuSample!=null)pushSample(gpuSamples,gpuSample);

    if(staticFrame){
      const targetHz=staticReason==='start-screen'?0.5:6;
      const interval=1000/targetHz;
      if(!invalidated&&stamp-lastRenderAt<interval){
        staticFrameSkips++;
        lastStaticReason=staticReason||'static';
        return false;
      }
      staticFramesRendered++;
      lastStaticReason=staticReason||'static';
    }else{
      dynamicFramesRendered++;
      lastStaticReason=null;
    }

    const queryStarted=gpuTimer.begin();
    const started=now();
    if(composer){
      const postStarted=now();
      composer.render(dt);
      pushSample(postSamples,now()-postStarted);
    }else{
      renderer.render(scene,camera);
      pushSample(postSamples,0);
    }
    pushSample(cpuSamples,now()-started);
    if(queryStarted)gpuTimer.end();

    lastRenderAt=stamp;
    invalidated=false;
    return true;
  }

  function resize(nextWidth,nextHeight){
    viewportWidth=Math.max(1,Math.floor(Number(nextWidth)||1));
    viewportHeight=Math.max(1,Math.floor(Number(nextHeight)||1));
    applyRendererResolution();
  }

  function invalidate(){
    invalidated=true;
  }

  function getDiagnostics(){
    const cpu=summarize(cpuSamples);
    const post=summarize(postSamples);
    const gpu=summarize(gpuSamples);
    const dpr=renderer.getPixelRatio();
    const postScale=composer?clamp(Number(settings.postResolutionScale)||1,.5,1):1;
    const managedRenderTargetCount=countManagedRenderTargets();
    return {
      renderPipeline:composer?'composer':'direct',
      postProcessingEnabled:!!composer,
      renderTargetType:composer?targetTypeLabel(rootTarget?.texture?.type):'default-framebuffer',
      renderTargetSamples:composer?(rootTarget?.samples||0):0,
      renderTargetWidth:composer?Math.round(viewportWidth*dpr*postScale):Math.round(viewportWidth*dpr),
      renderTargetHeight:composer?Math.round(viewportHeight*dpr*postScale):Math.round(viewportHeight*dpr),
      managedRenderTargetCount,
      composerPixelRatio:composer?Math.round(composerPixelRatio*1000)/1000:0,
      bloomEnabled:!!bloomPass,
      bloomStrength:bloomPass?bloomPass.strength:0,
      bloomRadius:bloomPass?bloomPass.radius:0,
      bloomThreshold:bloomPass?bloomPass.threshold:null,
      toneMappingExposure:renderer.toneMappingExposure,
      shadowEnabled:!!renderer.shadowMap.enabled,
      shadowMapSize:shadowLight?.castShadow?shadowLight.shadow.mapSize.x:0,
      shadowRadius:shadowLight?.castShadow?Math.abs(shadowLight.shadow.camera.right):0,
      gpuTimerSupported:gpuTimer.supported,
      gpuTimerPending:gpuTimer.pending,
      gpuTimerDisjointCount:gpuTimer.disjointCount,
      renderCpuAverageMs:cpu.average,
      renderCpuP50Ms:cpu.p50,
      renderCpuP95Ms:cpu.p95,
      renderCpuP99Ms:cpu.p99,
      renderCpuMaxMs:cpu.max,
      renderCpuSamples:cpu.samples,
      postProcessCpuAverageMs:post.average,
      postProcessCpuP95Ms:post.p95,
      postProcessCpuP99Ms:post.p99,
      gpuFrameAverageMs:gpu.average,
      gpuFrameP50Ms:gpu.p50,
      gpuFrameP95Ms:gpu.p95,
      gpuFrameP99Ms:gpu.p99,
      gpuFrameMaxMs:gpu.max,
      gpuFrameSamples:gpu.samples,
      rendererPrograms:Array.isArray(renderer.info.programs)?renderer.info.programs.length:null,
      staticFrameSkips,
      staticFramesRendered,
      dynamicFramesRendered,
      lastStaticReason,
      pipelineRebuilds,
      targetDisposals,
      shadowConfigChanges,
      anisotropyRefreshes,
      anisotropyTextures,
      anisotropyRequested:Math.max(1,Math.min(
        Number(renderer.capabilities.getMaxAnisotropy?.())||1,
        Math.round(Number(settings.maxAnisotropy)||1)
      ))
    };
  }

  const unsubscribeQuality=quality.subscribe(()=>applyProfile());
  applyProfile(true);

  function dispose(){
    if(disposed)return;
    disposed=true;
    unsubscribeQuality?.();
    disposePostPipeline();
    gpuTimer.dispose();
    if(shadowLight)shadowLight.castShadow=false;
    renderer.shadowMap.enabled=false;
  }

  return {
    renderer,
    render,
    resize,
    invalidate,
    refreshTextureQuality,
    setShadowLight,
    applyProfile,
    getDiagnostics,
    dispose
  };
}
