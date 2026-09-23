import assert from 'node:assert/strict';
import {stepCarving,updateJumpAssist,tryManualJump,stepAir,launchRamp,progressSpeed} from '../src/skiPhysics.js';
import {SKI_TUNING as T} from '../src/gameplayTuning.js';

function makeState(overrides={}){
  return {
    speed:T.BASE_SPEED,time:0,x:0,vx:0,edge:0,heading:0,turnRate:0,
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
for(const speed of [T.BASE_SPEED,(T.BASE_SPEED+T.MAX_SPEED)/2,T.MAX_SPEED]){
  const s=makeState({speed});
  runCarve(s,1,1/120);
  runCarve(s,-1,12,1/120);
  assert(Math.abs(s.x)<=T.PLAYER_HALF_WIDTH+1e-6,'carving escaped lateral gameplay bounds');
  assert(Math.abs(s.heading)<=Math.max(T.HEADING_LIMIT_LOW,T.HEADING_LIMIT_HIGH)+1e-6,'heading escaped designed carve bounds');
}

// Releasing steering should settle heading/turn rate toward neutral.
{
  const s=makeState({speed:T.BASE_SPEED+5});
  runCarve(s,1,.9);
  const before=Math.abs(s.heading);
  runCarve(s,0,2.2);
  assert(Math.abs(s.heading)<before*.45,'released carve did not substantially recenter');
  assert(Math.abs(s.turnRate)<.18,'released carve retained excessive turn rate');
}

// Opposite input must enter a counter-steer / neutralization phase rather than snapping.
{
  const s=makeState({speed:T.BASE_SPEED+6});
  runCarve(s,1,.8);
  const initialEdge=s.edge;
  stepCarving(s,-1,1/120);
  assert(initialEdge>.2,'test setup failed to build positive edge');
  assert.equal(s.counterSteer,true,'reverse input did not register counter-steer');
  assert(s.edge>-0.2,'edge snapped across neutral in one frame');
}

// High speed should produce at least as much useful carve response as low speed.
{
  const low=makeState({speed:T.BASE_SPEED});
  const high=makeState({speed:T.MAX_SPEED});
  runCarve(low,1,.7);
  runCarve(high,1,.7);
  assert(Math.abs(high.vx)>Math.abs(low.vx)*.78,'high-speed carving response collapsed relative to opening speed');
}

// Air control should preserve strong lateral authority without ground-only friction.
{
  const ground=makeState({speed:T.BASE_SPEED+6,grip:.82,carveLoad:0});
  const air=makeState({speed:T.BASE_SPEED+6,air:true,grounded:false,grip:0,carveLoad:0});
  runCarve(ground,1,.65);
  runCarve(air,1,.65);
  assert(Math.abs(air.vx)>=Math.abs(ground.vx)*.72,'air steering lost too much lateral authority');
  assert(Math.abs(air.vx)<=Math.abs(ground.vx)*1.35,'air steering became excessively stronger than ground');
  assert.equal(air.airControl,true,'air steering path was not activated');
}

// Speed progression must be monotonic and capped.
{
  const dt=1/120;
  const s=makeState({speed:T.BASE_SPEED,time:0});
  let previous=s.speed;
  for(let i=0;i<120*360;i++){
    s.time+=dt;
    progressSpeed(s,dt);
    assert(s.speed>=previous-1e-9,'speed progression moved backwards');
    previous=s.speed;
  }
  assert(s.speed<=T.MAX_SPEED+1e-6,'speed exceeded intended cap');
  assert(s.speedTier>=1,'30-second speed tiers did not advance');
  assert(s.targetSpeed<=T.MAX_SPEED+1e-6,'target speed exceeded intended cap');
}

// Tap-vs-hold manual jump: a <=140 ms release must cut the arc, while
// a longer hold preserves the original 5.9 m/s launch and airtime.
{
  const dt=1/180;
  const simulate=holdSeconds=>{
    const s=makeState({grounded:true,jumpInputHeld:false,jumpHoldTime:0,jumpCutApplied:false,jumpProfile:''});
    updateJumpAssist(s,true,dt,true);
    assert.equal(tryManualJump(s,.12),true,'manual jump failed to launch');
    assert.equal(s.vy,T.MANUAL_JUMP_VELOCITY,'manual jump launch velocity changed');

    let elapsed=0;
    let apex=s.y;
    for(let i=0;i<1000;i++){
      const held=elapsed<holdSeconds;
      updateJumpAssist(s,false,dt,held);
      const result=stepAir(s,dt,.12);
      elapsed+=dt;
      apex=Math.max(apex,s.y);
      if(result.landed)return {elapsed,apex,profile:s.lastJumpProfile,reengage:s.landingReengageTime};
    }
    throw new Error('manual jump never landed');
  };

  const mini=simulate(.06);
  const full=simulate(T.MINI_JUMP_TAP_SECONDS+.06);
  assert.equal(mini.profile,'mini','quick release did not produce mini jump');
  assert.equal(full.profile,'full','held jump was incorrectly cut to mini');
  assert(mini.apex<full.apex*.90,'mini jump apex is not meaningfully lower');
  assert(mini.elapsed<full.elapsed-.08,'mini jump did not land meaningfully earlier');
  assert(mini.reengage<full.reengage,'mini jump did not recover grip earlier');

  const s=makeState({grounded:true,jumpInputHeld:false});
  updateJumpAssist(s,true,dt,true);
  assert(tryManualJump(s,.12));
  updateJumpAssist(s,true,dt,true);
  assert.equal(tryManualJump(s,.12),false,'airborne jump input created a double jump');
}

// Ramp -> air -> landing must complete and produce a landing pulse.
{
  const s=makeState({speed:T.BASE_SPEED+3,y:.12});
  assert.equal(launchRamp(s,0),true,'ramp failed to launch grounded player');
  assert.equal(s.air,true);
  assert.equal(s.jumpProfile,'ramp','ramp launch lost its dedicated jump profile');
  updateJumpAssist(s,false,1/120,false);
  assert(s.vy>T.MINI_JUMP_RELEASE_VELOCITY,'manual jump cut leaked into ramp launch');
  let landed=false;
  for(let i=0;i<1000;i++){
    const result=stepAir(s,1/120,.12);
    if(result.landed){landed=true;break;}
  }
  assert(landed,'airborne player never landed');
  assert.equal(s.air,false);
  assert(s.landingPulse>0,'landing did not generate an impact pulse');
  assert(s.landingReengageTime>0,'landing did not start grip re-engagement window');
}

console.log('Ski physics invariants OK');
