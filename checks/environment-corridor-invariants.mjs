import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCourseDirector,FORMATION_TYPES} from '../src/course.js';
import {SKI_TUNING as T} from '../src/gameplayTuning.js';
import {
  COURSE_FLAG_X,
  FLAG_VISUAL_MARGIN,
  COURSE_OBJECT_VISUAL_HALF_WIDTH,
  MAX_GAMEPLAY_OBJECT_CENTER_X,
  MOUNTAIN_CLEARANCE,
  MOUNTAIN_FIELD_LAYOUTS,
  RIDGE_LAYOUTS,
  SCENERY_SIDE_MIN_CENTER_X,
  gameplayObjectCenterLimit,
  mountainCenterForSide,
  mountainVisualHalfWidth,
  sideForIndex
} from '../src/environmentCorridor.js';

function rng(seed){
  let x=seed>>>0;
  return ()=>{
    x=(Math.imul(x,1664525)+1013904223)>>>0;
    return x/4294967296;
  };
}

assert.equal(COURSE_FLAG_X,T.PLAYER_HALF_WIDTH,'flag boundary drifted from player corridor');
assert(COURSE_FLAG_X>=13.5,'wider gameplay corridor regressed');
assert(Math.abs(T.BASE_SPEED*3.6-150)<.001,'150 km/h opening speed regressed');
assert(T.COURSE_LOOKAHEAD_MIN>=560,'560m+ course streaming regressed');
assert(!FORMATION_TYPES.includes('ROW'),'ROW formations returned');

for(const [kind,halfWidth] of Object.entries(COURSE_OBJECT_VISUAL_HALF_WIDTH)){
  const centerLimit=gameplayObjectCenterLimit(kind);
  assert(centerLimit<=T.COURSE_OBJECT_HALF_WIDTH+1e-9,kind+' center escaped authored course bound');
  assert(
    centerLimit+halfWidth+FLAG_VISUAL_MARGIN<=COURSE_FLAG_X+1e-9,
    kind+' visual extent can cross the flag boundary'
  );
}
assert.equal(
  MAX_GAMEPLAY_OBJECT_CENTER_X,
  gameplayObjectCenterLimit('banana'),
  'global gameplay center maximum should be the narrow banana footprint'
);

const mountainProfiles=[
  ['far',18,30],
  ['midFar',16,25],
  ['mid',13,21],
  ['near',11,17]
];
for(const [name,widthMin,widthMax] of mountainProfiles){
  const layout=MOUNTAIN_FIELD_LAYOUTS[name];
  const seen=new Set();
  for(let i=0;i<40;i++){
    const side=sideForIndex(i);
    seen.add(side);
    const t=i/39;
    const width=widthMin+(widthMax-widthMin)*t;
    const rotation=-.22+.44*t;
    const halfWidth=mountainVisualHalfWidth(width,width*.74,rotation);
    const center=mountainCenterForSide({
      side,
      visualHalfWidth:halfWidth,
      exclusionHalfWidth:layout.exclusionHalfWidth,
      outerEdge:layout.outerEdge,
      jitter01:(i*17%39)/39
    });
    assert.equal(Math.sign(center),side,name+' mountain changed assigned side');
    assert(
      Math.abs(center)-halfWidth>=layout.exclusionHalfWidth+MOUNTAIN_CLEARANCE-1e-9,
      name+' mountain extent entered central exclusion zone'
    );
  }
  assert.deepEqual([...seen].sort(),[-1,1],name+' field lost one mountain side');
}

for(const layout of Object.values(RIDGE_LAYOUTS)){
  assert(layout.innerEdge>=MOUNTAIN_FIELD_LAYOUTS.near.exclusionHalfWidth,'ridge entered open center');
  assert(layout.width>0,'ridge side width vanished');
}
assert(SCENERY_SIDE_MIN_CENTER_X>COURSE_FLAG_X+8,'decorative forest shoulder is too narrow');

const routeCenter=z=>Math.sin((-z)*.035)*2.9+Math.sin((-z)*.011)*1.1;
for(const seed of [1,7,19,43,101,31337,0xabcdef,0xdeadbeef]){
  const director=createCourseDirector({routeCenter,random:rng(seed)});
  let z=-12;
  for(let i=0;i<140;i++){
    const difficulty=Math.min(1,i/90);
    const speed=T.BASE_SPEED+(T.MAX_SPEED-T.BASE_SPEED)*difficulty;
    const section=director.next({startZ:z,difficulty,speed});
    for(const placement of section.placements){
      const limit=gameplayObjectCenterLimit(placement.kind);
      assert(
        Math.abs(placement.x)<=limit+1e-9,
        placement.kind+' placement escaped its flag-safe center limit'
      );
    }
    z=section.endZ;
  }
}

const environmentSource=readFileSync(new URL('../src/environment.js',import.meta.url),'utf8');
const boundarySource=readFileSync(new URL('../src/boundaryMarkers.js',import.meta.url),'utf8');
const landscapeSource=readFileSync(new URL('../src/alpineLandscape.js',import.meta.url),'utf8');
assert(
  environmentSource.includes('createAlpineLandscape')&&
  landscapeSource.includes("const side=i%2?-1:1")&&
  landscapeSource.includes('COURSE_FLAG_X+18'),
  'split lateral alpine framing is missing'
);
assert(!environmentSource.includes('valleyGap'),'legacy center-only mountain gap returned');
assert(environmentSource.includes('const side=entry.side??sideForIndex(i)'),'moving bank side ownership is missing');
assert(environmentSource.includes('const side=entry.side??sideForIndex(cluster)'),'moving forest side ownership is missing');
assert(environmentSource.includes('createDayCycle'),'day cycle integration regressed');
assert(environmentSource.includes('scene.fog=new THREE.Fog'),'fog integration regressed');
assert(environmentSource.includes('createSnowParticles'),'snow integration regressed');
assert(boundarySource.includes("limit=COURSE_FLAG_X"),'flags are no longer centralized on corridor tuning');

console.log(JSON.stringify({
  check:'environment-corridor-invariants',
  flagX:COURSE_FLAG_X,
  gameplayMaxCenterX:MAX_GAMEPLAY_OBJECT_CENTER_X,
  flagVisualMargin:FLAG_VISUAL_MARGIN,
  mountainLayouts:MOUNTAIN_FIELD_LAYOUTS,
  ridgeLayouts:RIDGE_LAYOUTS,
  scenerySideMinCenterX:SCENERY_SIDE_MIN_CENTER_X
}));
