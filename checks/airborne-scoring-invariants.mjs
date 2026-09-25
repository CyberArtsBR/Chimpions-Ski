import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  resetAirborneScoring,
  resetHazardScoring,
  updateAirborneScoring,
  canScoreAirborneHazard,
  tryScoreAirborneClearance
} from '../src/airborneScoring.js';
import {SKI_TUNING as T} from '../src/gameplayTuning.js';

const playerZ=2.2;
const hazards={
  tree:{clearance:3.70,radiusX:.62,radiusZ:.68},
  rock:{clearance:.78,radiusX:.55,radiusZ:.58},
  log:{clearance:.60,radiusX:1.02,radiusZ:.48},
  wideLog:{clearance:.82,radiusX:2.48,radiusZ:.58},
  oil:{clearance:.10,radiusX:1.48,radiusZ:.74}
};

function makeState({time=0,air=true,y=2,x=0}={}){
  const state={time,air,y,x};
  resetAirborneScoring(state);
  return state;
}
function makeItem(kind){
  const h=hazards[kind];
  return {
    position:{x:0,z:playerZ+.08},
    userData:{kind,clearance:h.clearance,clearScored:false}
  };
}
function attempt(state,item,{previousZ=playerZ-.08,itemGround=0}={}){
  const h=hazards[item.userData.kind];
  return tryScoreAirborneClearance(state,item,{
    previousZ,
    playerZ,
    itemGround,
    radiusX:h.radiusX,
    requiredClearance:h.clearance
  });
}

// A) Grounded crossing: never score.
{
  const state=makeState({air:false,y:5});
  const event=attempt(state,makeItem('rock'));
  assert.equal(event,null);
  assert.equal(state.score,0);
}

// B) Airborne but below the real obstacle clearance: never score.
{
  const state=makeState({air:true,y:.12+hazards.rock.clearance-.01});
  assert.equal(attempt(state,makeItem('rock')),null);
  assert.equal(state.score,0);
}

// C/D) Clean airborne crossing scores once; same pooled activation cannot score twice.
{
  const state=makeState({air:true,y:2});
  const rock=makeItem('rock');
  const first=attempt(state,rock);
  assert.equal(first.points,100);
  assert.equal(first.multiplier,1);
  assert.equal(state.score,100);
  assert.equal(attempt(state,rock),null);
  assert.equal(state.score,100);
}

// E) Distinct hazards inside 1.5s follow 100/150/200/250/300 and cap at x3.
{
  const state=makeState({air:true,y:5});
  const expected=[
    [100,1],
    [150,1.5],
    [200,2],
    [250,2.5],
    [300,3],
    [300,3]
  ];
  for(let i=0;i<expected.length;i++){
    state.time=i*1.0;
    const event=attempt(state,makeItem(i%2?'log':'rock'));
    assert(event,'distinct airborne clearance failed to score');
    assert.equal(event.points,expected[i][0]);
    assert.equal(event.multiplier,expected[i][1]);
    assert.equal(event.combo,i+1);
  }
}

// F) More than 1.5s resets combo.
{
  const state=makeState({air:true,y:5});
  attempt(state,makeItem('rock'));
  state.time=1.5001;
  updateAirborneScoring(state);
  assert.equal(state.combo,0);
  const event=attempt(state,makeItem('log'));
  assert.equal(event.points,100);
  assert.equal(event.combo,1);
  assert.equal(event.multiplier,1);
}

// G) Recycled pooled object explicitly clears per-activation scoring state.
{
  const state=makeState({air:true,y:5});
  const oil=makeItem('oil');
  assert(attempt(state,oil));
  assert.equal(oil.userData.clearScored,true);
  resetHazardScoring(oil);
  assert.equal(oil.userData.clearScored,false);
}

// H) Tree scoring uses the same real ~3.7m threshold as collision.
{
  const tree=makeItem('tree');
  const low=makeState({air:true,y:.12+3.70});
  assert.equal(attempt(low,tree),null,'tree scored at collision-height threshold');
  resetHazardScoring(tree);
  const high=makeState({air:true,y:.12+3.701});
  assert(attempt(high,tree),'tree failed to score above real clearance threshold');
}

// I) Every legitimate physical hazard follows the same crossing/clearance rule.
for(const [kind,h] of Object.entries(hazards)){
  assert(canScoreAirborneHazard(kind),kind+' is missing from airborne scoring');
  const state=makeState({air:true,y:.12+h.clearance+.10});
  const event=attempt(state,makeItem(kind));
  assert(event,kind+' did not score despite a legitimate clearance');
}

// A hazard already behind the player cannot score after the fact.
{
  const state=makeState({air:true,y:5});
  const rock=makeItem('rock');
  rock.position.z=playerZ+.5;
  assert.equal(attempt(state,rock,{previousZ:playerZ+.1}),null);
}

// Crossing detection remains valid even if the crossing spans more than one render-frame distance.
{
  const state=makeState({air:true,y:5});
  const rock=makeItem('rock');
  rock.position.z=playerZ+.35;
  assert(attempt(state,rock,{previousZ:playerZ-.35}));
}

// 180Hz physics substeps are comfortably smaller than the smallest collision Z window.
const maxSubstepTravel=T.MAX_SPEED/180;
const smallestCollisionHalfDepth=Math.min(...Object.values(hazards).map(h=>h.radiusZ))+.20;
assert(
  maxSubstepTravel<smallestCollisionHalfDepth,
  'max-speed 180Hz substep can tunnel through the smallest hazard collision window'
);

// Scoring and collision use strict > clearance agreement: equal means collision/no score.
{
  const state=makeState({air:true,y:.12+hazards.log.clearance});
  assert.equal(attempt(state,makeItem('log')),null);
}

const scoringSource=readFileSync(new URL('../src/airborneScoring.js',import.meta.url),'utf8');
assert(!scoringSource.includes('showLandingFeedback'),'airborne scoring directly owns landing presentation');
assert(!scoringSource.includes('CLEAN LANDING'),'airborne scoring contains presentation copy');

console.log(JSON.stringify({
  check:'airborne-scoring-invariants',
  cases:'A-I + combo progression + high-speed crossing',
  comboWindow:T.CLEAR_COMBO_WINDOW,
  maxMultiplier:T.CLEAR_COMBO_MAX_MULTIPLIER,
  maxSubstepTravel:Number(maxSubstepTravel.toFixed(4)),
  smallestCollisionHalfDepth
}));
