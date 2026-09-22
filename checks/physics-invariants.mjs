import assert from 'node:assert/strict';
import {stepCarving,stepAir,launchRamp,progressSpeed} from '../src/skiPhysics.js';

function makeState(overrides={}){
  return {
    speed:12,x:0,vx:0,edge:0,heading:0,turnRate:0,
    air:false,y:.12,vy:0,landingPulse:0,rampGrace:0,
    counterSteer:false,
    ...overrides
  };
}
function runCarve(state,input,seconds,dt=1/120){
  const steps=Math.ceil(seconds/dt);
  for(let i=0;i<steps;i++)stepCarving(state,input,dt);
  return state;
}

// Steering must stay inside the gameplay corridor at all supported speeds.
for(const speed of [12,20,31]){
  const s=makeState({speed});
  runCarve(s,1,1/120);
  runCarve(s,-1,12,1/120);
  assert(Math.abs(s.x)<=8.100001,'carving escaped lateral gameplay bounds');
  assert(Math.abs(s.heading)<=0.540001,'heading escaped designed carve bounds');
}

// Releasing steering should settle heading/turn rate toward neutral.
{
  const s=makeState({speed:24});
  runCarve(s,1,.9);
  const before=Math.abs(s.heading);
  runCarve(s,0,2.2);
  assert(Math.abs(s.heading)<before*.45,'released carve did not substantially recenter');
  assert(Math.abs(s.turnRate)<.18,'released carve retained excessive turn rate');
}

// Opposite input must enter a counter-steer / neutralization phase rather than snapping.
{
  const s=makeState({speed:25});
  runCarve(s,1,.8);
  const initialEdge=s.edge;
  stepCarving(s,-1,1/120);
  assert(initialEdge>.2,'test setup failed to build positive edge');
  assert.equal(s.counterSteer,true,'reverse input did not register counter-steer');
  assert(s.edge>-0.2,'edge snapped across neutral in one frame');
}

// High speed should produce at least as much useful carve response as low speed.
{
  const low=makeState({speed:12});
  const high=makeState({speed:31});
  runCarve(low,1,.7);
  runCarve(high,1,.7);
  assert(Math.abs(high.vx)>Math.abs(low.vx)*1.25,'high-speed carving is not materially stronger');
}

// Speed progression must be monotonic and capped.
{
  const s=makeState({speed:12});
  let previous=s.speed;
  for(let i=0;i<20000;i++){
    progressSpeed(s,1/120);
    assert(s.speed>=previous-1e-9,'speed progression moved backwards');
    previous=s.speed;
  }
  assert(s.speed<=31.000001,'speed exceeded intended cap');
}

// Ramp -> air -> landing must complete and produce a landing pulse.
{
  const s=makeState({speed:22,y:.12});
  assert.equal(launchRamp(s,0),true,'ramp failed to launch grounded player');
  assert.equal(s.air,true);
  let landed=false;
  for(let i=0;i<1000;i++){
    const result=stepAir(s,1/120,.12);
    if(result.landed){landed=true;break;}
  }
  assert(landed,'airborne player never landed');
  assert.equal(s.air,false);
  assert(s.landingPulse>0,'landing did not generate an impact pulse');
}

console.log('Ski physics invariants OK');
