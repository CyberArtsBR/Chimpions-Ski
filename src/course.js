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
  let recentBands=[3];
  const bands=[-1,-.72,-.36,0,.36,.72,1];
  const obstacleLanes=[-10.65,-7.10,-3.55,0,3.55,7.10,10.65];
  const opening=[
    'OPEN CARVE','GATE','FOREST','BANANA LINE',
    'ROCK SLALOM','RAMP','RECOVERY','GATE','FOREST','RAMP','RECOVERY','ROCK SLALOM'
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
    const weights=[1.28,1.08,.98,.90,.98,1.08,1.28];
    const last=recentBands.at(-1);
    const previous=recentBands.at(-2);
    if(last!=null)weights[last]*=.16;
    if(previous!=null)weights[previous]*=.54;
    const index=weightedIndex(weights);
    recentBands.push(index);
    if(recentBands.length>3)recentBands.shift();
    return index;
  }

  function contentX(z,bandIndex=pickBand(),strength=1){
    const lane=bands[bandIndex]*T.CONTENT_BAND_HALF_WIDTH*strength;
    return clamp(lane+routeCenter(z)*.14,-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
  }

  const place=(kind,x,z,safeX,extra={})=>({
    kind,
    x:clamp(x,-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH),
    z,
    safeX:clamp(safeX,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH),
    ...extra
  });
  const banana=(z,x,safeX=x)=>place('banana',x,z,safeX);

  function movingSafe(z,base=0,range=2.6){
    const band=contentX(z,pickBand(),.90);
    const target=band*.58+base*.42+Math.sin(sectionIndex*.81-z*.021)*range;
    return clamp(target,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
  }

  function hazardRow(z,safeX,{gap=2.55,kinds=['tree','rock'],offset=0}={}){
    const placements=[];
    for(let i=0;i<obstacleLanes.length;i++){
      const raw=obstacleLanes[i]+offset;
      const x=clamp(raw,-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
      if(Math.abs(x-safeX)<gap)continue;
      const kind=kinds[(i+sectionIndex)%kinds.length];
      placements.push(place(kind,x,z,safeX));
    }
    return placements;
  }

  function chooseType(difficulty){
    if(sectionIndex<opening.length)return opening[sectionIndex];
    if(lastType==='RAMP'||lastType==='LOG JUMP')return 'RECOVERY';

    const transitions={
      'RECOVERY':['GATE','OPEN CARVE','FOREST','BANANA LINE'],
      'OPEN CARVE':['GATE','FOREST','ROCK SLALOM','BANANA LINE','RAMP','GATE'],
      'GATE':['FOREST','OPEN CARVE','ROCK SLALOM','BANANA LINE','RAMP'],
      'BANANA LINE':['GATE','FOREST','ROCK SLALOM','RAMP'],
      'FOREST':['GATE','OPEN CARVE','ROCK SLALOM','RAMP'],
      'ROCK SLALOM':['GATE','FOREST','OPEN CARVE','RAMP']
    };
    let options=[...(transitions[lastType]||['GATE'])];

    if(difficulty<.20)options=options.filter(type=>type!=='LOG JUMP');
    if(difficulty>.48&&lastType==='OPEN CARVE'&&random()<.26)options.push('LOG JUMP');
    if(lastType!=='RECOVERY'&&random()<.18)options.push('RAMP');

    return options[Math.floor(random()*options.length)]||'GATE';
  }

  function next({startZ,difficulty=0}){
    const type=chooseType(difficulty);
    const placements=[];
    const phase=sectionIndex*.73;
    const sectionBand=pickBand();
    const anchor=clamp(contentX(startZ-18,sectionBand,.90),-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
    let length=64;

    if(type==='OPEN CARVE'){
      length=66;
      for(let i=0;i<3;i++){
        const z=startZ-16-i*20;
        const safeX=movingSafe(z,anchor,2.7);
        placements.push(...hazardRow(z,safeX,{gap:2.75,kinds:i%2?['rock','tree']:['tree','rock'],offset:i%2?1.0:-.8}));
        if(i===1&&random()<.66)placements.push(banana(z-7,safeX,safeX));
      }
    }

    if(type==='GATE'){
      length=76;
      const rows=4+(difficulty>.55?1:0);
      for(let i=0;i<rows;i++){
        const z=startZ-14-i*15;
        const safeX=clamp(anchor+Math.sin(phase+i*.82)*3.15,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
        placements.push(...hazardRow(z,safeX,{gap:2.55,kinds:i%2?['tree','rock']:['rock','tree'],offset:i%2?.7:-.7}));
      }
      if(random()<.45){
        const z=startZ-45;
        const safeX=movingSafe(z,anchor,2.1);
        placements.push(banana(z,safeX,safeX));
      }
    }

    if(type==='BANANA LINE'){
      length=68;
      const bananaZ=startZ-18;
      const bananaX=clamp(contentX(bananaZ,sectionBand,.92),-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
      placements.push(banana(bananaZ,bananaX,bananaX));
      for(let i=0;i<3;i++){
        const z=startZ-30-i*17;
        const safeX=movingSafe(z,bananaX,2.4);
        placements.push(...hazardRow(z,safeX,{gap:2.65,kinds:['rock','tree'],offset:i%2?.8:-.8}));
      }
    }

    if(type==='RAMP'){
      length=96;
      const rampZ=startZ-27;
      const rampX=clamp(contentX(rampZ,sectionBand,.90),-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
      // Dense approach row forces the skier to line up; everything after the lip stays clear.
      placements.push(...hazardRow(startZ-8,rampX,{gap:3.15,kinds:['tree','rock'],offset:.45}));
      if(random()<.34)placements.push(banana(startZ-16,rampX,rampX));
      placements.push(place('ramp',rampX,rampZ,rampX,{landingZone:true}));
    }

    if(type==='RECOVERY'){
      length=86;
      // Keep the first ~52 m free for monster-jump landing, then immediately restore challenge.
      const firstSafe=movingSafe(startZ-58,anchor,2.2);
      placements.push(...hazardRow(startZ-58,firstSafe,{gap:2.85,kinds:['rock','tree'],offset:-.6}));
      const secondSafe=clamp(firstSafe+Math.sin(phase+1.3)*2.8,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
      placements.push(...hazardRow(startZ-77,secondSafe,{gap:2.65,kinds:['tree','rock'],offset:.7}));
      if(random()<.42)placements.push(banana(startZ-68,secondSafe,secondSafe));
    }

    if(type==='FOREST'){
      length=84;
      const rows=5+(difficulty>.62?1:0);
      for(let i=0;i<rows;i++){
        const z=startZ-12-i*14;
        const safeX=clamp(anchor+Math.sin(phase+i*.66)*3.35,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
        placements.push(...hazardRow(z,safeX,{gap:2.45,kinds:['tree','tree','rock'],offset:i%2?.55:-.55}));
      }
      if(random()<.30){
        const z=startZ-50;
        const x=movingSafe(z,anchor,1.8);
        placements.push(banana(z,x,x));
      }
    }

    if(type==='ROCK SLALOM'){
      length=80;
      const rows=5+(difficulty>.70?1:0);
      let safeX=anchor;
      for(let i=0;i<rows;i++){
        const z=startZ-12-i*13.5;
        safeX=clamp(safeX+(i%2?1:-1)*(1.7+random()*1.25),-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
        placements.push(...hazardRow(z,safeX,{gap:2.35,kinds:['rock','rock','tree'],offset:i%2?.9:-.9}));
      }
      if(random()<.34)placements.push(banana(startZ-56,safeX,safeX));
    }

    if(type==='LOG JUMP'){
      length=100;
      const rampZ=startZ-28;
      const rampX=clamp(contentX(rampZ,sectionBand,.90),-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
      placements.push(...hazardRow(startZ-8,rampX,{gap:3.2,kinds:['tree','rock'],offset:-.45}));
      placements.push(place('ramp',rampX,rampZ,rampX,{landingZone:true}));
      placements.push(place('log',rampX,rampZ-13.5,rampX,{jumpTarget:true}));
      // Monster-jump arc and landing remain clear after the marked log.
    }

    for(const placement of placements)placement.section=type;
    lastType=type;
    sectionIndex++;
    return {type,placements,endZ:startZ-length,length};
  }

  return {
    next,
    reset(){lastType='RECOVERY';sectionIndex=0;recentBands=[3];},
    get lastType(){return lastType;},
    get sectionIndex(){return sectionIndex;}
  };
}
