import {getSpeedProgress,SKI_TUNING as T} from './gameplayTuning.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export const COURSE_SET_PIECE_TAGS=Object.freeze([
  'FOREST_PUSH',
  'LIFT_STATION',
  'GLACIER',
  'COMPETITION',
  'STORM_EXPOSURE',
  'RIDGELINE',
  'POWDER_FIELD'
]);

const BASE_WEIGHTS=Object.freeze([1,1,1,1,1,1,1]);

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

export function createCourseSetPieceDirector({random=Math.random}={}){
  let activeTag=null;
  let activeId=0;
  let sectionsRemaining=0;
  let activeZoneLength=0;
  let recentTags=[];
  let previousTag=null;

  function chooseTag({
    sectionType='OPEN CARVE',
    rhythmBeat='READ',
    difficulty=0,
    speed=T.BASE_SPEED,
    postMaxTime=0
  }={}){
    const weights=[...BASE_WEIGHTS];
    const speed01=getSpeedProgress(speed);
    const hard=clamp(Number(difficulty)||0,0,1);
    const post01=clamp((Number(postMaxTime)||0)/Math.max(1,T.POST_MAX_HAZARD_RAMP_SECONDS),0,1);
    const index=tag=>COURSE_SET_PIECE_TAGS.indexOf(tag);
    const boost=(tag,multiplier)=>{
      const i=index(tag);
      if(i>=0)weights[i]*=multiplier;
    };

    if(sectionType==='FOREST')boost('FOREST_PUSH',2.8);
    if(sectionType==='GATE')boost('COMPETITION',2.1);
    if(sectionType==='RAMP'||sectionType==='LOG JUMP'){
      boost('RIDGELINE',2.2);
      boost('COMPETITION',1.7);
      boost('GLACIER',1.45);
    }
    if(sectionType==='ROCK SLALOM')boost('GLACIER',1.9);
    if(sectionType==='OPEN CARVE'){
      boost('RIDGELINE',1.65);
      boost('POWDER_FIELD',1.6);
    }
    if(sectionType==='BANANA LINE')boost('POWDER_FIELD',2.05);
    if(sectionType==='RECOVERY'){
      boost('LIFT_STATION',1.8);
      boost('POWDER_FIELD',1.8);
    }

    if(rhythmBeat==='READ'){
      boost('LIFT_STATION',1.45);
      boost('RIDGELINE',1.35);
    }else if(rhythmBeat==='COMMIT'){
      boost('COMPETITION',1.45);
      boost('GLACIER',1.25);
    }else if(rhythmBeat==='EXECUTE'){
      boost('FOREST_PUSH',1.32);
      boost('STORM_EXPOSURE',1.25+hard*.55+post01*.55);
    }else if(rhythmBeat==='REWARD'){
      boost('POWDER_FIELD',1.45);
      boost('RIDGELINE',1.4);
      boost('COMPETITION',1.2);
    }else if(rhythmBeat==='RECOVER'){
      boost('LIFT_STATION',1.75);
      boost('POWDER_FIELD',1.55);
    }

    boost('STORM_EXPOSURE',1+post01*1.8+Math.max(0,hard-.58)*.9);
    boost('RIDGELINE',1+speed01*.42);

    const last=recentTags.at(-1);
    const previous=recentTags.at(-2);
    if(last){
      const i=index(last);
      if(i>=0)weights[i]*=.10;
    }
    if(previous){
      const i=index(previous);
      if(i>=0)weights[i]*=.55;
    }

    const tag=COURSE_SET_PIECE_TAGS[weightedIndex(random,weights)]||'POWDER_FIELD';
    recentTags.push(tag);
    if(recentTags.length>4)recentTags.shift();
    return tag;
  }

  function plan(context={}){
    const entering=sectionsRemaining<=0||!activeTag;
    let events=[];

    if(entering){
      previousTag=activeTag;
      activeTag=chooseTag(context);
      activeId++;
      // Two to four sections is long enough for artists to establish a place
      // without making the gameplay track itself deterministic.
      sectionsRemaining=2+Math.floor(random()*3);
      activeZoneLength=sectionsRemaining;
      if(previousTag&&previousTag!==activeTag)events.push(`SET_PIECE_EXIT:${previousTag}`);
      events.push(`SET_PIECE_ENTER:${activeTag}`);
    }

    const zoneLength=activeZoneLength;
    sectionsRemaining=Math.max(0,sectionsRemaining-1);
    const exiting=sectionsRemaining===0;
    events.push(`RHYTHM_BEAT:${context.rhythmBeat||'READ'}`);
    if(exiting)events.push(`SET_PIECE_EXIT_PENDING:${activeTag}`);

    const difficulty=clamp(Number(context.difficulty)||0,0,1);
    const speed01=getSpeedProgress(context.speed??T.BASE_SPEED);
    const post01=clamp((Number(context.postMaxTime)||0)/Math.max(1,T.POST_MAX_HAZARD_RAMP_SECONDS),0,1);

    return {
      tag:activeTag,
      id:`${activeTag}-${activeId}`,
      sequence:activeId,
      isEntry:entering,
      isExit:exiting,
      sectionsRemaining,
      zoneLength,
      presentationIntensity:clamp(.34+difficulty*.26+speed01*.22+post01*.18,0,1),
      semanticEvents:events
    };
  }

  function reset(){
    activeTag=null;
    activeId=0;
    sectionsRemaining=0;
    activeZoneLength=0;
    recentTags=[];
    previousTag=null;
  }

  return {
    plan,
    reset,
    get activeTag(){return activeTag;},
    get activeId(){return activeId;},
    get recentTags(){return [...recentTags];}
  };
}
