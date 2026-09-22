import {SKI_TUNING as T} from './gameplayTuning.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export const COURSE_TYPES=[
  'OPEN CARVE',
  'GATE',
  'BANANA LINE',
  'RAMP',
  'RECOVERY',
  'FOREST',
  'ROCK SLALOM',
  'LOG JUMP'
];

export function getCourseDifficulty(distance=0,speed=T.BASE_SPEED){
  const speedPart=clamp((speed-T.BASE_SPEED)/(T.MAX_SPEED-T.BASE_SPEED),0,1);
  const distancePart=clamp(distance/2200,0,1);
  return clamp(speedPart*.56+distancePart*.44,0,1);
}

export function createCourseDirector({routeCenter,random=Math.random}){
  let lastType='RECOVERY';
  let sectionIndex=0;
  let recentBands=[2];
  const bands=[-1,-.5,0,.5,1];
  const opening=[
    'OPEN CARVE','GATE','OPEN CARVE','BANANA LINE',
    'OPEN CARVE','RAMP','RECOVERY','OPEN CARVE','FOREST','OPEN CARVE','ROCK SLALOM'
  ];

  const weightedIndex=weights=>{
    let total=weights.reduce((sum,value)=>sum+value,0);
    let roll=random()*total;
    for(let i=0;i<weights.length;i++){
      roll-=weights[i];
      if(roll<=0)return i;
    }
    return weights.length-1;
  };

  function pickBand(){
    const weights=[1.12,1,0.92,1,1.12];
    const last=recentBands.at(-1);
    const previous=recentBands.at(-2);
    if(last!=null)weights[last]*=.14;
    if(previous!=null)weights[previous]*=.48;
    const index=weightedIndex(weights);
    recentBands.push(index);
    if(recentBands.length>3)recentBands.shift();
    return index;
  }

  function contentX(z,bandIndex=pickBand(),strength=1){
    const lane=bands[bandIndex]*T.CONTENT_BAND_HALF_WIDTH*strength;
    return clamp(lane+routeCenter(z)*.14,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
  }

  const route=(z,offset=0,limit=T.SAFE_ROUTE_HALF_WIDTH)=>clamp(routeCenter(z)+offset,-limit,limit);
  const place=(kind,x,z,safeX,extra={})=>({
    kind,
    x:clamp(x,-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH),
    z,
    safeX:clamp(safeX,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH),
    ...extra
  });
  const sidePair=(kind,z,safeX,gap,extra={})=>[
    place(kind,safeX-gap,z,safeX,extra),
    place(kind,safeX+gap,z,safeX,extra)
  ];
  const banana=(z,x,safeX=x)=>place('banana',x,z,safeX);

  function chooseType(difficulty){
    if(sectionIndex<opening.length)return opening[sectionIndex];
    if(lastType==='RAMP'||lastType==='LOG JUMP')return 'RECOVERY';

    const transitions={
      'RECOVERY':['OPEN CARVE','OPEN CARVE','BANANA LINE'],
      'OPEN CARVE':['OPEN CARVE','GATE','BANANA LINE','FOREST','ROCK SLALOM','RAMP'],
      'GATE':['OPEN CARVE','OPEN CARVE','BANANA LINE'],
      'BANANA LINE':['OPEN CARVE','GATE','RAMP'],
      'FOREST':['OPEN CARVE','OPEN CARVE','BANANA LINE'],
      'ROCK SLALOM':['OPEN CARVE','OPEN CARVE','GATE']
    };
    let options=[...(transitions[lastType]||['OPEN CARVE'])];

    if(difficulty<.28)options=options.filter(type=>type!=='ROCK SLALOM');
    if(difficulty>.58&&lastType==='OPEN CARVE'&&random()<.20)options.push('LOG JUMP');
    if(lastType==='OPEN CARVE'&&random()<.22)options.push('RAMP');

    return options[Math.floor(random()*options.length)]||'OPEN CARVE';
  }

  function next({startZ,difficulty=0}){
    const type=chooseType(difficulty);
    const placements=[];
    const phase=sectionIndex*.73;
    const sectionBand=pickBand();
    const anchor=contentX(startZ-18,sectionBand);
    let length=60;

    if(type==='OPEN CARVE'){
      length=62;
      if(random()<.58){
        const z=startZ-24-random()*16;
        const x=contentX(z,pickBand());
        placements.push(banana(z,x));
      }
      if(random()<.52){
        const z=startZ-43;
        const hazardX=contentX(z,pickBand());
        const safeX=clamp(-hazardX*.35,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
        placements.push(place(random()<.55?'rock':'tree',hazardX,z,safeX));
      }
    }

    if(type==='GATE'){
      length=64;
      const rows=2+(difficulty>.68?1:0);
      const gateSafe=clamp(anchor*.62,-5.9,5.9);
      for(let i=0;i<rows;i++){
        const z=startZ-16-i*19;
        const safeX=clamp(gateSafe+Math.sin(phase+i*.8)*1.0,-5.9,5.9);
        placements.push(...sidePair(i%2?'tree':'rock',z,safeX,4.15));
      }
      if(random()<.42){
        const z=startZ-52;
        const x=contentX(z,pickBand());
        placements.push(banana(z,x));
      }
    }

    if(type==='BANANA LINE'){
      length=60;
      const z=startZ-26;
      const x=contentX(z,sectionBand);
      placements.push(banana(z,x));
      if(random()<.24){
        const z2=startZ-50;
        const x2=contentX(z2,pickBand());
        placements.push(banana(z2,x2));
      }
    }

    if(type==='RAMP'){
      length=92;
      const rampZ=startZ-18;
      const rampX=contentX(rampZ,sectionBand,.92);
      if(random()<.30){
        const bananaZ=startZ-7;
        const bananaX=contentX(bananaZ,pickBand());
        placements.push(banana(bananaZ,bananaX));
      }
      // Ramp has a completely open approach and a large hazard-free landing corridor.
      placements.push(place('ramp',rampX,rampZ,rampX,{landingZone:true}));
    }

    if(type==='RECOVERY'){
      length=74;
      if(random()<.62){
        const z=startZ-32;
        const x=contentX(z,sectionBand);
        placements.push(banana(z,x));
      }
      // First 58m stays hazard-free after jumps. One optional edge hazard closes the section.
      if(random()<.48){
        const z=startZ-64;
        const hazardX=contentX(z,pickBand());
        const safeX=clamp(-hazardX*.32,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
        placements.push(place('rock',hazardX,z,safeX));
      }
    }

    if(type==='FOREST'){
      length=72;
      const rows=3+(difficulty>.72?1:0);
      const forestSafe=clamp(anchor*.65,-5.8,5.8);
      for(let i=0;i<rows;i++){
        const z=startZ-15-i*17.5;
        const safeX=clamp(forestSafe+Math.sin(phase+i*.72)*1.2,-5.8,5.8);
        placements.push(...sidePair('tree',z,safeX,4.25));
      }
      if(random()<.35){
        const z=startZ-61;
        const x=contentX(z,pickBand());
        placements.push(banana(z,x));
      }
    }

    if(type==='ROCK SLALOM'){
      length=70;
      const rows=3+(difficulty>.74?1:0);
      for(let i=0;i<rows;i++){
        const z=startZ-14-i*16;
        const safeX=clamp(contentX(z,(sectionBand+i+1)%bands.length,.72),-7.2,7.2);
        const side=i%2?-1:1;
        placements.push(place('rock',safeX+side*3.35,z,safeX));
      }
      if(random()<.40){
        const z=startZ-60;
        const x=contentX(z,pickBand());
        placements.push(banana(z,x));
      }
    }

    if(type==='LOG JUMP'){
      length=96;
      const rampZ=startZ-18;
      const rampX=contentX(rampZ,sectionBand,.90);
      placements.push(place('ramp',rampX,rampZ,rampX,{landingZone:true}));
      placements.push(place('log',rampX,rampZ-13.5,rampX,{jumpTarget:true}));
      // No further hazards: monster-jump arc and landing stay completely clear.
    }

    for(const placement of placements)placement.section=type;
    lastType=type;
    sectionIndex++;
    return {type,placements,endZ:startZ-length,length};
  }

  return {
    next,
    reset(){lastType='RECOVERY';sectionIndex=0;recentBands=[2];},
    get lastType(){return lastType;},
    get sectionIndex(){return sectionIndex;}
  };
}
