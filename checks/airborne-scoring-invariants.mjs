import assert from 'node:assert/strict';
import {SKI_TUNING as T} from '../src/gameplayTuning.js';
import {getCourseLookahead} from '../src/courseStreaming.js';
import {
  resetAirborneScoring,
  updateAirborneScoring,
  tryScoreAirborneClearance
} from '../src/airborneScoring.js';

const hazard=(kind='rock',x=0,z=2.25,clearScored=false)=>({
  position:{x,z},
  userData:{kind,clearScored}
});
const crossing={
  previousZ:2.0,
  playerZ:2.2,
  itemGround:0,
  radiusX:.55,
  requiredClearance:.78
};

function state(overrides={}){
  const value={air:true,time:0,x:0,y:2,score:0,combo:0,...overrides};
  resetAirborneScoring(value);
  Object.assign(value,overrides);
  return value;
}

// Grounded passes never score.
{
  const s=state({air:false});
  assert.equal(tryScoreAirborneClearance(s,hazard(),crossing),null);
  assert.equal(s.score,0);
}

// Too-low airborne passes never score.
{
  const s=state({y:.7});
  assert.equal(tryScoreAirborneClearance(s,hazard(),crossing),null);
  assert.equal(s.score,0);
}

// First legitimate clearance = 100 and cannot score twice.
{
  const s=state();
  const item=hazard();
  const event=tryScoreAirborneClearance(s,item,crossing);
  assert.equal(event.points,100);
  assert.equal(event.combo,1);
  assert.equal(s.score,100);
  assert.equal(tryScoreAirborneClearance(s,item,crossing),null);
  assert.equal(s.score,100);
}

// Combo progression and x3 cap.
{
  const s=state();
  const expected=[100,150,200,250,300,300];
  for(let i=0;i<expected.length;i++){
    s.time=i*.25;
    const event=tryScoreAirborneClearance(s,hazard('rock',0,2.25),crossing);
    assert.equal(event.points,expected[i]);
    assert.equal(event.combo,i+1);
  }
  assert.equal(s.comboMultiplier,3);
}

// >1.5 sec timeout resets the next clearance to x1.
{
  const s=state();
  tryScoreAirborneClearance(s,hazard(),crossing);
  s.time=1.5001;
  updateAirborneScoring(s);
  assert.equal(s.combo,0);
  const event=tryScoreAirborneClearance(s,hazard('log',0,2.25),{
    ...crossing,
    radiusX:1.02,
    requiredClearance:.60
  });
  assert.equal(event.points,100);
  assert.equal(event.combo,1);
}

// Tree scoring respects the real ~3.7m clearance.
{
  const low=state({y:3.7});
  assert.equal(tryScoreAirborneClearance(low,hazard('tree'),{
    ...crossing,
    radiusX:.62,
    requiredClearance:3.70
  }),null);

  const high=state({y:4.1});
  const event=tryScoreAirborneClearance(high,hazard('tree'),{
    ...crossing,
    radiusX:.62,
    requiredClearance:3.70
  });
  assert.equal(event.points,100);
}

// All supported physical hazard kinds are scoreable when genuinely cleared.
for(const [kind,radiusX,requiredClearance] of [
  ['rock',.55,.78],
  ['log',1.02,.60],
  ['wideLog',2.48,.82],
  ['oil',1.48,.10],
  ['tree',.62,3.70]
]){
  const s=state({y:kind==='tree'?4.1:2});
  const event=tryScoreAirborneClearance(s,hazard(kind),{
    ...crossing,
    radiusX,
    requiredClearance
  });
  assert(event,'Expected score event for '+kind);
}

// Streaming remains beyond the 280m camera far plane at all supported speeds.
for(const speed of [T.BASE_SPEED,(T.BASE_SPEED+T.MAX_SPEED)/2,T.MAX_SPEED]){
  const lookahead=getCourseLookahead(speed);
  assert(lookahead>280,'Course lookahead fell inside camera far plane');
  assert(lookahead>=T.COURSE_LOOKAHEAD_MIN&&lookahead<=T.COURSE_LOOKAHEAD_MAX);
}

console.log('Airborne scoring and course streaming invariants OK');
