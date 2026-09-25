import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {SSRPass} from 'three/addons/postprocessing/SSRPass.js';

// Normal/depth buffers must not turn translucent snow ribbons, skies or glows
// into solid occluders. The lit scene has already been rendered by the previous pass.
export class AlpineAmbientOcclusionPass extends GTAOPass {
  constructor(scene,camera,settings){
    super(scene,camera,1,1);
    this.resolutionScale=settings.aoResolutionScale??.65;
    this.blendIntensity=.52;
    this.updateGtaoMaterial({radius:.65,thickness:.18,distanceFallOff:1,scale:1,samples:settings.profile==='max'?16:8,screenSpaceRadius:false});
    this.updatePdMaterial({radius:6,samples:8});
    this.hiddenSurfaces=[];
  }
  setSize(width,height){super.setSize(Math.max(1,Math.round(width*(this.resolutionScale??1))),Math.max(1,Math.round(height*(this.resolutionScale??1))));}
  render(renderer,writeBuffer,readBuffer){
    this.scene.traverse(object=>{
      if(!object.isMesh||!object.visible)return;
      const materials=Array.isArray(object.material)?object.material:[object.material];
      if(materials.every(material=>material&&(material.transparent||material.depthWrite===false))){
        this.hiddenSurfaces.push(object);object.visible=false;
      }
    });
    try{super.render(renderer,writeBuffer,readBuffer);}
    finally{for(const object of this.hiddenSurfaces)object.visible=true;this.hiddenSurfaces.length=0;}
  }
}

export function createAlpineReflections({renderer,scene,camera,selects}){
  // Screen-space ray marching, not hardware ray tracing or path tracing.
  // The pass supplies the base scene itself, so it replaces RenderPass.
  const pass=new SSRPass({renderer,scene,camera,width:1,height:1,selects,bouncing:false});
  pass.opacity=.24;pass.maxDistance=18;pass.thickness=.12;
  pass.blur=true;pass.distanceAttenuation=true;pass.fresnel=true;
  return pass;
}
