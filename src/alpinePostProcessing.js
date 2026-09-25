import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';

export function createAlpinePostProcessing({renderer,scene,camera,quality}){
  let composer=null,bloom=null,width=0,height=0,pixelRatio=0;
  const size=new THREE.Vector2();
  function render(){
    const profile=quality.active;
    if(profile==='low'||profile==='medium'){
      if(composer){bloom.dispose();composer.passes.forEach(pass=>{if(pass!==bloom)pass.dispose?.();});composer.dispose();composer=null;}
      renderer.render(scene,camera);return;
    }
    if(!composer){
      composer=new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene,camera));
      // HDR LED cores cross this threshold; ordinary diffuse surfaces do not.
      bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.28,.38,2.6);
      composer.addPass(bloom);composer.addPass(new OutputPass());
      width=height=pixelRatio=0;
    }
    renderer.getSize(size);
    const ratio=renderer.getPixelRatio();
    if(size.x!==width||size.y!==height||ratio!==pixelRatio){
      width=size.x;height=size.y;pixelRatio=ratio;
      composer.setPixelRatio(ratio);composer.setSize(width,height);
    }
    composer.render();
  }
  return {render};
}
