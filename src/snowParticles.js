import * as THREE from 'three';
const CAPACITY=256,clamp=THREE.MathUtils.clamp;
const rand=i=>{const x=Math.sin(i*127.1+311.7)*43758.5453;return x-Math.floor(x);};
export function createSnowParticles({scene,densityMultiplier=1}={}){
  const positions=new Float32Array(CAPACITY*3),alphas=new Float32Array(CAPACITY),sizes=new Float32Array(CAPACITY);
  const velocities=new Float32Array(CAPACITY*3),ages=new Float32Array(CAPACITY),lives=new Float32Array(CAPACITY),active=new Uint8Array(CAPACITY);
  const geometry=new THREE.BufferGeometry();
  const positionAttribute=new THREE.BufferAttribute(positions,3),alphaAttribute=new THREE.BufferAttribute(alphas,1),sizeAttribute=new THREE.BufferAttribute(sizes,1);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);alphaAttribute.setUsage(THREE.DynamicDrawUsage);sizeAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position',positionAttribute);geometry.setAttribute('aAlpha',alphaAttribute);geometry.setAttribute('aSize',sizeAttribute);
  const uniforms={tint:{value:new THREE.Color(0xf4fbff)}};
  const material=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,
    vertexShader:`attribute float aAlpha;attribute float aSize;varying float vAlpha;void main(){vAlpha=aAlpha;vec4 mvPosition=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mvPosition;gl_PointSize=aSize*clamp(18.0/max(1.0,-mvPosition.z),.46,2.15);}`,
    fragmentShader:`uniform vec3 tint;varying float vAlpha;void main(){vec2 p=gl_PointCoord-.5;float d=length(p);float soft=1.0-smoothstep(.16,.50,d);float crystalline=1.0-smoothstep(.02,.20,abs(p.x+p.y*.45));float a=vAlpha*soft*(.82+.18*crystalline);if(a<.008)discard;gl_FragColor=vec4(tint,a);#include <tonemapping_fragment>
#include <colorspace_fragment>}`});
  const points=new THREE.Points(geometry,material);points.name='local-snow-vfx';points.frustumCulled=false;points.renderOrder=7;scene?.add(points);
  let cursor=0,serial=0,densityScale=clamp(Number(densityMultiplier)||1,0,1.4),emitBudget=0,speedBudget=0,previousEdge=0,previousLanding=0;
  function spawn(x,y,z,vx,vy,vz,size,life,alpha){const i=cursor++%CAPACITY,k=i*3;active[i]=1;ages[i]=0;lives[i]=Math.max(.12,life);positions[k]=x;positions[k+1]=y;positions[k+2]=z;velocities[k]=vx;velocities[k+1]=vy;velocities[k+2]=vz;sizes[i]=size;alphas[i]=alpha;serial++;return i;}
  function burst(count,x,y,z,edge,speed,rideMode,landing=false){const board=rideMode==='snowboard',dir=Math.sign(edge||previousEdge||1),lateral=(board?2.4:1.7)*(landing?.72:1),spread=board?1.28:.78,strength=clamp(Math.abs(edge),.28,1);for(let n=0;n<count;n++){const r=rand(serial+n*5+13),r2=rand(serial+n*7+29),r3=rand(serial+n*11+3),side=(r-.5)*spread;spawn(x+side,y+.04+r2*.12,z+.22+(r3-.5)*.38,dir*lateral*(.35+r*.85)+(r2-.5)*.55,.45+r2*(landing?2.0:1.25),.35+r3*(1.2+speed*.008),(landing?7.2:5.0)+r*4.2+(board?1.1:0),(landing?.72:.48)+r2*.34,(landing?.38:.24)+strength*.20);}}
  function spray(dt,x,y,z,speed,edge,air,landingPulse,running=true,rideMode='ski'){
    if(!running||densityScale<=.001){previousEdge=edge||0;previousLanding=landingPulse||0;return;}
    const speed01=clamp((speed-35)/50,0,1),carve=clamp(Math.abs(edge),0,1),board=rideMode==='snowboard';
    if(!air&&carve>.08){emitBudget+=dt*(4+speed01*11)*(carve*.78+.16)*densityScale*(board?1.25:1);while(emitBudget>=1){emitBudget-=1;const r=rand(serial+17),r2=rand(serial+31),dir=Math.sign(edge||1),width=board?.78:.46;spawn(x+(r-.5)*width-dir*(board?.16:.10),y+.035+r2*.075,z+.32+(r2-.5)*.18,dir*(board?1.65:1.15)*(carve+.18)+(r-.5)*.35,.28+r2*(.52+carve*.48),.28+speed01*.72+r*.28,3.9+r2*3.1+(board?.8:0),.34+r*.30,.12+carve*.25+speed01*.08);}}else emitBudget=Math.min(emitBudget,.6);
    const reversed=Math.sign(previousEdge)!==0&&Math.sign(edge)!==0&&Math.sign(previousEdge)!==Math.sign(edge)&&Math.abs(previousEdge)>.36&&Math.abs(edge)>.36;
    if(!air&&reversed)burst(Math.round((board?10:7)*densityScale),x,y,z,edge,speed,rideMode,false);
    if(landingPulse>.48&&previousLanding<=.48){const landingStrength=clamp(landingPulse,0,1);burst(Math.round((8+landingStrength*(board?11:8))*densityScale),x,y,z,edge||previousEdge,speed,rideMode,true);}
    if(!air&&speed01>.35){speedBudget+=dt*(speed01-.35)*18*densityScale;while(speedBudget>=1){speedBudget-=1;const r=rand(serial+51),r2=rand(serial+73),side=(r<.5?-1:1)*(1.0+r2*3.2);spawn(x+side,y+.03+r*.18,z-1.0-r2*8.5,-side*.055,.12+r*.28,.9+speed01*2.6,2.0+r*2.2,.22+r2*.24,.08+speed01*.15);}}else speedBudget=Math.min(speedBudget,.5);
    previousEdge=edge||0;previousLanding=landingPulse||0;
  }
  function update(dt,worldSpeed=0){let pd=false,ad=false,sd=false;for(let i=0;i<CAPACITY;i++){if(!active[i])continue;ages[i]+=dt;if(ages[i]>=lives[i]){active[i]=0;alphas[i]=0;ad=true;continue;}const k=i*3;positions[k]+=velocities[k]*dt;positions[k+1]+=velocities[k+1]*dt;positions[k+2]+=(worldSpeed+velocities[k+2])*dt;velocities[k]*=Math.pow(.18,dt);velocities[k+1]-=2.7*dt;velocities[k+2]*=Math.pow(.35,dt);const t=ages[i]/lives[i];alphas[i]*=Math.pow(.11,dt);alphas[i]=Math.min(alphas[i],(1-t)*.46);sizes[i]*=1+dt*.32;if(positions[k+2]>24||positions[k+1]<-1.2){active[i]=0;alphas[i]=0;}pd=ad=sd=true;}if(pd)positionAttribute.needsUpdate=true;if(ad)alphaAttribute.needsUpdate=true;if(sd)sizeAttribute.needsUpdate=true;}
  function reset(){active.fill(0);alphas.fill(0);ages.fill(0);lives.fill(0);emitBudget=speedBudget=0;previousEdge=0;previousLanding=0;alphaAttribute.needsUpdate=true;}
  function setTint(color){uniforms.tint.value.copy(color);}
  function setDensity(value=1){densityScale=clamp(Number(value)||0,0,1.4);points.visible=densityScale>.001;return densityScale;}
  function setEnabled(value=true){points.visible=!!value&&densityScale>.001;return points.visible;}
  function getDiagnostics(){let activeCount=0;for(const value of active)activeCount+=value;return {disabled:false,densityScale,active:activeCount,capacity:CAPACITY};}
  return {spray,update,reset,setTint,setDensity,setEnabled,getDiagnostics,setDensityMultiplier:setDensity,getDensityMultiplier:()=>densityScale};
}
