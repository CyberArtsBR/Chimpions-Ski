import {getSpeedProgress,SKI_TUNING as T} from './gameplayTuning.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export const COURSE_RHYTHM_BEATS=Object.freeze([
  'READ',
  'COMMIT',
  'EXECUTE',
  'REWARD',
  'RECOVER'
]);

export const COURSE_RHYTHM_MOTIFS=Object.freeze([
  'CARVE_CHAIN',
  'TECHNICAL_GAUNTLET',
  'AIRTIME_BUILD',
  'RISK_ROUTE',
  'SPEED_CORRIDOR'
]);

const MOTIFS=Object.freeze({
  CARVE_CHAIN:Object.freeze({
    beats:Object.freeze(['READ','COMMIT','EXECUTE','REWARD','RECOVER']),
    sectionBias:Object.freeze({
      READ:Object.freeze(['OPEN CARVE','BANANA LINE','GATE']),
      COMMIT:Object.freeze(['GATE','OPEN CARVE','ROCK SLALOM']),
      EXECUTE:Object.freeze(['GATE','ROCK SLALOM','FOREST']),
      REWARD:Object.freeze(['BANANA LINE','OPEN CARVE','RAMP','LOG JUMP']),
      RECOVER:Object.freeze(['RECOVERY'])
    })
  }),
  TECHNICAL_GAUNTLET:Object.freeze({
    beats:Object.freeze(['READ','COMMIT','EXECUTE','EXECUTE','REWARD','RECOVER']),
    sectionBias:Object.freeze({
      READ:Object.freeze(['OPEN CARVE','GATE']),
      COMMIT:Object.freeze(['GATE','ROCK SLALOM']),
      EXECUTE:Object.freeze(['ROCK SLALOM','FOREST','GATE']),
      REWARD:Object.freeze(['BANANA LINE','LOG JUMP','OPEN CARVE']),
      RECOVER:Object.freeze(['RECOVERY'])
    })
  }),
  AIRTIME_BUILD:Object.freeze({
    beats:Object.freeze(['READ','COMMIT','EXECUTE','REWARD','RECOVER']),
    sectionBias:Object.freeze({
      READ:Object.freeze(['OPEN CARVE','BANANA LINE']),
      COMMIT:Object.freeze(['GATE','ROCK SLALOM']),
      EXECUTE:Object.freeze(['GATE','FOREST','ROCK SLALOM']),
      REWARD:Object.freeze(['RAMP','LOG JUMP','BANANA LINE']),
      RECOVER:Object.freeze(['RECOVERY'])
    })
  }),
  RISK_ROUTE:Object.freeze({
    beats:Object.freeze(['READ','COMMIT','EXECUTE','REWARD','RECOVER']),
    sectionBias:Object.freeze({
      READ:Object.freeze(['OPEN CARVE','BANANA LINE']),
      COMMIT:Object.freeze(['GATE','BANANA LINE','ROCK SLALOM']),
      EXECUTE:Object.freeze(['FOREST','ROCK SLALOM','GATE']),
      REWARD:Object.freeze(['BANANA LINE','OPEN CARVE','LOG JUMP']),
      RECOVER:Object.freeze(['RECOVERY'])
    })
  }),
  SPEED_CORRIDOR:Object.freeze({
    beats:Object.freeze(['READ','COMMIT','EXECUTE','EXECUTE','REWARD','RECOVER']),
    sectionBias:Object.freeze({
      READ:Object.freeze(['OPEN CARVE','GATE']),
      COMMIT:Object.freeze(['GATE','OPEN CARVE']),
      EXECUTE:Object.freeze(['OPEN CARVE','GATE','ROCK SLALOM','FOREST']),
      REWARD:Object.freeze(['BANANA LINE','RAMP','LOG JUMP','OPEN CARVE']),
      RECOVER:Object.freeze(['RECOVERY'])
    })
  })
});

const BEAT_PROFILE=Object.freeze({
  READ:Object.freeze({
    intensityScale:.82,
    threatBudgetScale:.80,
    optionalHazardScale:.78,
    routeCommitmentScale:.82,
    reactionSpacingBonus:.06,
    rewardBias:.44
  }),
  COMMIT:Object.freeze({
    intensityScale:.96,
    threatBudgetScale:.94,
    optionalHazardScale:.92,
    routeCommitmentScale:1.08,
    reactionSpacingBonus:.035,
    rewardBias:.50
  }),
  EXECUTE:Object.freeze({
    intensityScale:1.05,
    threatBudgetScale:1.08,
    optionalHazardScale:1.06,
    routeCommitmentScale:1.08,
    reactionSpacingBonus:.02,
    rewardBias:.48
  }),
  REWARD:Object.freeze({
    intensityScale:.88,
    threatBudgetScale:.84,
    optionalHazardScale:.82,
    routeCommitmentScale:.90,
    reactionSpacingBonus:.05,
    rewardBias:.92
  }),
  RECOVER:Object.freeze({
    intensityScale:.58,
    threatBudgetScale:.52,
    optionalHazardScale:.45,
    routeCommitmentScale:.66,
    reactionSpacingBonus:.10,
    rewardBias:.72
  })
});

function weightedIndex(random,weights){
  const safe=weights.map(value=>Math.max(0,Number(value)||0));
  const total=safe.reduce((sum,value)=>sum+value,0);
  if(total<=0)return 0;
  let roll=random()*total;
  for(let i=0;i<safe.length;i++){
    roll-=safe[i];
    if(roll<=0)return i;
  }
  return safe.length-1;
}

export function createCourseRhythmDirector({random=Math.random}={}){
  let currentMotif=null;
  let beatIndex=0;
  let cycleIndex=0;
  let recentMotifs=[];
  let recentBeats=[];
  let sectionsSinceRecovery=0;
  let lastPlan=null;

  function chooseMotif({difficulty=0,speed=T.BASE_SPEED,postMaxTime=0}={}){
    const speed01=getSpeedProgress(speed);
    const post01=clamp((Number(postMaxTime)||0)/Math.max(1,T.POST_MAX_HAZARD_RAMP_SECONDS),0,1);
    const hard=clamp(Number(difficulty)||0,0,1);

    const weights=[
      1.22-hard*.28,
      .64+hard*.78+post01*.26,
      .56+speed01*.38,
      .74+hard*.36,
      .54+speed01*.82+post01*.52
    ];

    const last=recentMotifs.at(-1);
    const previous=recentMotifs.at(-2);
    if(last){
      const index=COURSE_RHYTHM_MOTIFS.indexOf(last);
      if(index>=0)weights[index]*=.12;
    }
    if(previous){
      const index=COURSE_RHYTHM_MOTIFS.indexOf(previous);
      if(index>=0)weights[index]*=.58;
    }

    const motif=COURSE_RHYTHM_MOTIFS[weightedIndex(random,weights)];
    recentMotifs.push(motif);
    if(recentMotifs.length>4)recentMotifs.shift();
    currentMotif=motif;
    beatIndex=0;
    cycleIndex++;
    return motif;
  }

  function plan({
    difficulty=0,
    speed=T.BASE_SPEED,
    postMaxTime=0,
    lastType='RECOVERY',
    pendingLanding=false,
    sectionIndex=0
  }={}){
    if(!currentMotif)chooseMotif({difficulty,speed,postMaxTime});

    const forcedRecovery=
      !!pendingLanding||
      lastType==='RAMP'||
      lastType==='LOG JUMP'||
      sectionsSinceRecovery>=7;

    const motif=MOTIFS[currentMotif]||MOTIFS.CARVE_CHAIN;
    const beat=forcedRecovery?'RECOVER':(motif.beats[beatIndex]||'READ');
    const profile=BEAT_PROFILE[beat]||BEAT_PROFILE.READ;
    const speed01=getSpeedProgress(speed);
    const post01=clamp((Number(postMaxTime)||0)/Math.max(1,T.POST_MAX_HAZARD_RAMP_SECONDS),0,1);

    // High-speed play keeps its pressure ceiling, but READ/REWARD/RECOVER beats
    // deliberately spend less of that budget so difficulty has cadence instead
    // of becoming a continuous wall of density.
    const pressureFloor=post01>.55?.66:.50;
    const threatBudgetScale=Math.max(pressureFloor,profile.threatBudgetScale);
    const intensityScale=Math.max(post01>.55?.72:.55,profile.intensityScale);

    const preferredSections=forcedRecovery
      ?['RECOVERY']
      :[...(motif.sectionBias[beat]||['OPEN CARVE'])];
    const jumpBias=beat==='REWARD'?clamp(.46+speed01*.20+post01*.04,0,1):0;
    const rewardJump=beat==='REWARD'&&random()<jumpBias;
    const rewardJumpType=rewardJump?(random()<.55?'RAMP':'LOG JUMP'):null;

    lastPlan={
      beat,
      motif:currentMotif,
      cycleIndex,
      beatIndex,
      forcedRecovery,
      preferredSections,
      forceType:beat==='RECOVER'?'RECOVERY':rewardJumpType,
      allowJump:beat==='REWARD',
      jumpBias,
      rewardJump,
      intensityScale,
      threatBudgetScale,
      optionalHazardScale:Math.max(post01>.70?.58:.42,profile.optionalHazardScale),
      routeCommitmentScale:profile.routeCommitmentScale,
      reactionSpacingBonus:profile.reactionSpacingBonus,
      rewardBias:profile.rewardBias,
      speed01,
      postMaxPressure:post01,
      sectionIndex
    };
    return {...lastPlan,preferredSections:[...preferredSections]};
  }

  function noteSection({beat=lastPlan?.beat,sectionType=''}={}){
    const normalized=COURSE_RHYTHM_BEATS.includes(beat)?beat:'READ';
    recentBeats.push(normalized);
    if(recentBeats.length>12)recentBeats.shift();

    if(sectionType==='RECOVERY'||normalized==='RECOVER'){
      sectionsSinceRecovery=0;
      // A recovery beat closes the current macro phrase. The next section
      // starts a newly weighted motif instead of looping a fixed track.
      currentMotif=null;
      beatIndex=0;
      return;
    }

    sectionsSinceRecovery++;

    const motif=MOTIFS[currentMotif]||MOTIFS.CARVE_CHAIN;
    if(!lastPlan?.forcedRecovery){
      beatIndex++;
      if(beatIndex>=motif.beats.length){
        currentMotif=null;
        beatIndex=0;
      }
    }
  }

  function reset(){
    currentMotif=null;
    beatIndex=0;
    cycleIndex=0;
    recentMotifs=[];
    recentBeats=[];
    sectionsSinceRecovery=0;
    lastPlan=null;
  }

  return {
    plan,
    noteSection,
    reset,
    get recentBeats(){return [...recentBeats];},
    get recentMotifs(){return [...recentMotifs];},
    get currentMotif(){return currentMotif;},
    get cycleIndex(){return cycleIndex;}
  };
}
