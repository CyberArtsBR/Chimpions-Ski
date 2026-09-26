import assert from 'node:assert/strict';
import {createCourseDirector} from '../src/course.js';
import {COURSE_RHYTHM_BEATS,COURSE_RHYTHM_MOTIFS} from '../src/courseRhythmDirector.js';
import {COURSE_SET_PIECE_TAGS} from '../src/courseSetPieceDirector.js';
import {SKI_TUNING as T} from '../src/gameplayTuning.js';
import {JUMP_SECTION_CONTRACT} from '../src/courseSectionContract.js';

const routeCenter=z=>Math.sin((-z)*.035)*2.9+Math.sin((-z)*.011)*1.1;
const PHYSICAL=new Set(['tree','rock','log','wideLog','oil']);

function snapshot(seed,count=28){
  const director=createCourseDirector({routeCenter,seed});
  let z=-12;
  const result=[];
  for(let i=0;i<count;i++){
    const difficulty=Math.min(1,i/20);
    const speed=T.BASE_SPEED+(T.MAX_SPEED-T.BASE_SPEED)*difficulty;
    const section=director.next({
      startZ:z,
      difficulty,
      speed,
      postMaxTime:i>22?(i-22)*4:0,
      runTime:i*9
    });
    result.push({
      type:section.type,
      rhythmBeat:section.rhythmBeat,
      rhythmMotif:section.rhythmMotif,
      setPieceTag:section.setPieceTag,
      setPieceId:section.setPiece.id,
      length:Number(section.length.toFixed(6)),
      placements:section.placements.map(item=>[
        item.kind,
        Number(item.x.toFixed(5)),
        Number(item.z.toFixed(5)),
        Number(item.safeX.toFixed(5))
      ])
    });
    z=section.endZ;
  }
  return result;
}

assert.deepEqual(
  snapshot('rhythm-replay-seed'),
  snapshot('rhythm-replay-seed'),
  'seeded macro course generation is not deterministic'
);

const seeds=[
  'rhythm-01','rhythm-02','rhythm-03','rhythm-04',
  'rhythm-05','rhythm-06','rhythm-07','rhythm-08',
  'rhythm-09','rhythm-10','rhythm-11','rhythm-12',
  'rhythm-13','rhythm-14','rhythm-15','rhythm-16'
];
const sectionsPerSeed=140;
let totalSections=0;
let totalMeters=0;
let ramps=0;
let recoveries=0;
let rewardSections=0;
let rewardBananaSections=0;
let maxPressureBeatStreak=0;
let maxSectionsWithoutRecovery=0;
let minFiniteReadTime=Infinity;
let repairedSections=0;
const beatCounts=Object.fromEntries(COURSE_RHYTHM_BEATS.map(beat=>[beat,0]));
const motifCounts=Object.fromEntries(COURSE_RHYTHM_MOTIFS.map(motif=>[motif,0]));
const setPieceCounts=Object.fromEntries(COURSE_SET_PIECE_TAGS.map(tag=>[tag,0]));

for(const seed of seeds){
  const director=createCourseDirector({routeCenter,seed});
  let z=-12;
  let previousType='RECOVERY';
  let pressureBeatStreak=0;
  let sectionsWithoutRecovery=0;
  let previousSetPieceId=null;
  let activeSetPieceRun=0;
  let activeSetPieceLength=0;

  for(let i=0;i<sectionsPerSeed;i++){
    const speed01=Math.min(1,i/82);
    const difficulty=Math.min(1,i/96);
    const speed=T.BASE_SPEED+(T.MAX_SPEED-T.BASE_SPEED)*speed01;
    const postMaxTime=i>82?Math.min(T.POST_MAX_HAZARD_RAMP_SECONDS,(i-82)*3.2):0;
    const section=director.next({
      startZ:z,
      difficulty,
      speed,
      postMaxTime,
      runTime:i*8.5
    });

    totalSections++;
    totalMeters+=section.length;

    assert(COURSE_RHYTHM_BEATS.includes(section.rhythmBeat),'unknown macro rhythm beat');
    assert(COURSE_RHYTHM_MOTIFS.includes(section.rhythmMotif),'unknown macro rhythm motif');
    assert(COURSE_SET_PIECE_TAGS.includes(section.setPieceTag),'unknown set-piece tag');
    assert.equal(section.setPiece.tag,section.setPieceTag,'set-piece summary drifted from section tag');
    assert(section.semanticEvents.includes('RHYTHM_BEAT:'+section.rhythmBeat),'rhythm semantic event missing');
    assert(section.corridorValidation?.valid===true,'reachable corridor validation failed');

    beatCounts[section.rhythmBeat]++;
    motifCounts[section.rhythmMotif]++;
    setPieceCounts[section.setPieceTag]++;

    const isPressureBeat=section.rhythmBeat==='COMMIT'||section.rhythmBeat==='EXECUTE';
    pressureBeatStreak=isPressureBeat?pressureBeatStreak+1:0;
    maxPressureBeatStreak=Math.max(maxPressureBeatStreak,pressureBeatStreak);

    if(section.type==='RECOVERY'){
      recoveries++;
      sectionsWithoutRecovery=0;
      assert.equal(section.length,JUMP_SECTION_CONTRACT.recoverySectionLength,'recovery duration drifted from section contract');
    }else{
      sectionsWithoutRecovery++;
      maxSectionsWithoutRecovery=Math.max(maxSectionsWithoutRecovery,sectionsWithoutRecovery);
    }

    if(section.rhythmBeat==='RECOVER'){
      assert.equal(section.type,'RECOVERY','RECOVER beat did not create a recovery section');
    }

    if(previousType==='RAMP'||previousType==='LOG JUMP'){
      assert.equal(section.type,'RECOVERY','jump was not followed by protected recovery');
    }

    if(section.type==='RAMP'||section.type==='LOG JUMP'){
      ramps++;
      assert.equal(section.rhythmBeat,'REWARD','jump escaped the authored reward beat');
    }

    if(section.rhythmBeat==='REWARD'){
      rewardSections++;
      if(section.placements.some(item=>item.kind==='banana'))rewardBananaSections++;
    }

    const readTime=section.corridorValidation.firstDecisionReadTime;
    if(Number.isFinite(readTime)&&readTime>0)minFiniteReadTime=Math.min(minFiniteReadTime,readTime);
    if((section.corridorValidation.repairs||0)+(section.corridorValidation.hardRepairs||0)>0)repairedSections++;

    assert(section.setPiece.zoneLength>=2&&section.setPiece.zoneLength<=4,'set-piece zone escaped 2-4 section contract');
    if(section.setPiece.id!==previousSetPieceId){
      assert(section.setPiece.isEntry===true,'new set-piece id did not emit entry metadata');
      if(previousSetPieceId!==null){
        assert(activeSetPieceRun>=2&&activeSetPieceRun<=4,'completed set-piece zone escaped authored duration');
      }
      previousSetPieceId=section.setPiece.id;
      activeSetPieceRun=1;
      activeSetPieceLength=section.setPiece.zoneLength;
    }else{
      assert(section.setPiece.isEntry===false,'set-piece re-entered without changing id');
      activeSetPieceRun++;
      assert.equal(section.setPiece.zoneLength,activeSetPieceLength,'set-piece zone length changed mid-zone');
    }

    for(const placement of section.placements){
      assert.equal(placement.rhythmBeat,section.rhythmBeat,'placement lost rhythm metadata');
      assert.equal(placement.rhythmMotif,section.rhythmMotif,'placement lost rhythm motif metadata');
      assert.equal(placement.setPieceTag,section.setPieceTag,'placement lost set-piece tag');
      assert.equal(placement.setPieceId,section.setPiece.id,'placement lost set-piece id');
      if(PHYSICAL.has(placement.kind)){
        assert(Number.isFinite(placement.x)&&Number.isFinite(placement.z),'non-finite physical hazard');
      }
    }

    previousType=section.type;
    z=section.endZ;
  }

  // The final set-piece can be truncated by the end of this synthetic run.
  assert(activeSetPieceRun>=1&&activeSetPieceRun<=activeSetPieceLength,'active set-piece run exceeded declared zone length');
}

assert(totalMeters/seeds.length>12000,'rhythm stress run covered too little virtual distance per seed');
assert(maxPressureBeatStreak<=3,'macro director created an excessive uninterrupted pressure beat streak');
assert(maxSectionsWithoutRecovery<=7,'macro director left too long a stretch without recovery');
assert(recoveries>totalSections/9,'recovery cadence became too sparse');
assert(ramps>totalSections*.02,'ramp/log-jump cadence became too sparse');
assert(rewardSections>0&&rewardBananaSections/rewardSections>.30,'reward beats do not surface enough collectible reward');
assert(Number.isFinite(minFiniteReadTime)&&minFiniteReadTime>.025,'reaction/read window collapsed below a useful minimum');
assert(Object.values(beatCounts).every(count=>count>0),'one or more macro rhythm beats never appeared');
assert(Object.values(motifCounts).every(count=>count>0),'one or more rhythm motifs never appeared');
assert(Object.values(setPieceCounts).every(count=>count>0),'one or more semantic set-piece tags never appeared');

console.log(JSON.stringify({
  check:'course-rhythm-invariants',
  seeds:seeds.length,
  sections:totalSections,
  virtualKm:Number((totalMeters/1000).toFixed(1)),
  ramps,
  recoveries,
  rewardBananaShare:Number((rewardBananaSections/Math.max(1,rewardSections)).toFixed(3)),
  maxPressureBeatStreak,
  maxSectionsWithoutRecovery,
  minFiniteReadTime:Number(minFiniteReadTime.toFixed(4)),
  repairedSections,
  beatCounts,
  motifCounts,
  setPieceCounts
}));
