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
  const distancePart=clamp(distance/2600,0,1);
  return clamp(speedPart*.54+distancePart*.46,0,1);
}

export function createCourseDirector({routeCenter,random=Math.random}){
  let lastType='RECOVERY';
  let sectionIndex=0;
  let recentBands=[3];
  const bands=[-1,-.72,-.36,0,.36,.72,1];
  const obstacleLanes=[-10.65,-7.10,-3.55,0,3.55,7.10,10.65];
  const opening=[
    'OPEN CARVE','BANANA LINE','GATE','FOREST',
    'RAMP','RECOVERY','ROCK SLALOM','GATE','RAMP','RECOVERY'
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
    const weights=[1.24,1.08,.98,.94,.98,1.08,1.24];
    const last=recentBands.at(-1);
    const previous=recentBands.at(-2);
    if(last!=null)weights[last]*=.20;
    if(previous!=null)weights[previous]*=.58;
    const index=weightedIndex(weights);
    recentBands.push(index);
    if(recentBands.length>3)recentBands.shift();
    return index;
  }

  function pickRampBand(){
    return weightedIndex([1.62,1.12,.90,.72,.90,1.12,1.62]);
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

  function movingSafe(z,base=0,range=2.4){
    const band=contentX(z,pickBand(),.88);
    const target=band*.55+base*.45+Math.sin(sectionIndex*.77-z*.019)*range;
    return clamp(target,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
  }

  function hazardRow(z,safeX,{gap=3.05,kinds=['tree','rock'],offset=0}={}){
    const placements=[];
    for(let i=0;i<obstacleLanes.length;i++){
      const x=clamp(obstacleLanes[i]+offset,-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
      if(Math.abs(x-safeX)<gap)continue;
      const kind=kinds[(i+sectionIndex)%kinds.length];
      placements.push(place(kind,x,z,safeX));
    }
    return placements;
  }

  function addBananas(placements,startZ,length,count=2,safeHint=0){
    const used=[];
    for(let i=0;i<count;i++){
      let z=startZ-(18+(i+random()*.7)*(length-32)/Math.max(1,count));
      for(const previous of used)if(Math.abs(z-previous)<15)z-=16;
      used.push(z);
      const x=clamp(contentX(z,pickBand(),.96)+safeHint*.10,-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
      placements.push(banana(z,x,clamp(x,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH)));
    }
  }

  function chooseType(difficulty){
    if(sectionIndex<opening.length)return opening[sectionIndex];
    if(lastType==='RAMP'||lastType==='LOG JUMP')return 'RECOVERY';

    const transitions={
      'RECOVERY':['OPEN CARVE','GATE','FOREST','BANANA LINE'],
      'OPEN CARVE':['GATE','FOREST','ROCK SLALOM','BANANA LINE','RAMP'],
      'GATE':['OPEN CARVE','FOREST','ROCK SLALOM','BANANA LINE','RAMP'],
      'BANANA LINE':['OPEN CARVE','GATE','FOREST','RAMP'],
      'FOREST':['OPEN CARVE','GATE','ROCK SLALOM','RAMP'],
      'ROCK SLALOM':['OPEN CARVE','GATE','FOREST','RAMP']
    };
    let options=[...(transitions[lastType]||['OPEN CARVE'])];

    if(difficulty>.42&&lastType==='OPEN CARVE'&&random()<.22)options.push('LOG JUMP');
    if(lastType!=='RECOVERY'&&random()<.12)options.push('RAMP');

    return options[Math.floor(random()*options.length)]||'OPEN CARVE';
  }

  function next({startZ,difficulty=0}){
    const type=chooseType(difficulty);
    const placements=[];
    const phase=sectionIndex*.73;
    const sectionBand=pickBand();
    const anchor=clamp(contentX(startZ-18,sectionBand,.90),-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
    let length=82;

    if(type==='OPEN CARVE'){
      length=82;
      for(let i=0;i<2;i++){
        const z=startZ-22-i*31;
        const safeX=movingSafe(z,anchor,2.8);
        placements.push(...hazardRow(z,safeX,{gap:3.15,kinds:i%2?['rock','tree']:['tree','rock'],offset:i%2?.7:-.7}));
      }
      if(difficulty>.28&&random()<.36){
        const z=startZ-70;
        const x=contentX(z,pickBand(),.92);
        placements.push(place(random()<.52?'log':'rock',x,z,movingSafe(z,anchor,2.2)));
      }
      addBananas(placements,startZ,length,random()<.62?2:1,anchor);
    }

    if(type==='GATE'){
      length=92;
      const rows=3+(difficulty>.72?1:0);
      for(let i=0;i<rows;i++){
        const z=startZ-18-i*22;
        const safeX=clamp(anchor+Math.sin(phase+i*.86)*3.1,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
        placements.push(...hazardRow(z,safeX,{gap:3.05,kinds:i%2?['tree','rock']:['rock','tree'],offset:i%2?.65:-.65}));
      }
      addBananas(placements,startZ,length,random()<.58?2:1,anchor);
    }

    if(type==='BANANA LINE'){
      length=86;
      const safeA=movingSafe(startZ-28,anchor,2.7);
      const safeB=movingSafe(startZ-62,-anchor*.25,2.7);
      placements.push(...hazardRow(startZ-28,safeA,{gap:3.25,kinds:['rock','tree'],offset:-.55}));
      placements.push(...hazardRow(startZ-62,safeB,{gap:3.15,kinds:['tree','rock'],offset:.55}));
      addBananas(placements,startZ,length,2,anchor);
      if(random()<.35)placements.push(banana(startZ-74,contentX(startZ-74,pickBand(),.96),safeB));
    }

    if(type==='RAMP'){
      length=108;
      const rampZ=startZ-34;
      const rampX=clamp(contentX(rampZ,pickRampBand(),.99),-(T.COURSE_OBJECT_HALF_WIDTH-.35),T.COURSE_OBJECT_HALF_WIDTH-.35);
      const landingSafe=clamp(rampX,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
      placements.push(...hazardRow(startZ-12,landingSafe,{gap:3.45,kinds:['tree','rock'],offset:.45}));
      if(random()<.58)placements.push(banana(startZ-23,rampX,landingSafe));
      placements.push(place('ramp',rampX,rampZ,landingSafe,{landingZone:true}));

      // Keep the course populated after takeoff: visible hazards flank the controllable airborne route.
      placements.push(...hazardRow(rampZ-28,landingSafe,{gap:3.65,kinds:['rock','tree'],offset:-.55}));
      const shiftedSafe=clamp(landingSafe+Math.sin(phase+1.2)*1.8,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
      placements.push(...hazardRow(rampZ-54,shiftedSafe,{gap:3.35,kinds:['tree','rock'],offset:.65}));
      if(random()<.62)placements.push(banana(rampZ-42,shiftedSafe,shiftedSafe));
    }

    if(type==='RECOVERY'){
      length=96;
      // Recovery remains readable, not empty: hazards stay visible with a wider moving landing corridor.
      const safeA=movingSafe(startZ-30,anchor,2.1);
      placements.push(...hazardRow(startZ-30,safeA,{gap:3.65,kinds:['rock','tree'],offset:-.45}));
      const safeB=clamp(safeA+Math.sin(phase+1.45)*2.5,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
      placements.push(...hazardRow(startZ-64,safeB,{gap:3.25,kinds:['tree','rock'],offset:.55}));
      addBananas(placements,startZ,length,random()<.55?2:1,safeB);
    }

    if(type==='FOREST'){
      length=100;
      const rows=4+(difficulty>.78?1:0);
      for(let i=0;i<rows;i++){
        const z=startZ-16-i*21;
        const safeX=clamp(anchor+Math.sin(phase+i*.70)*3.2,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
        placements.push(...hazardRow(z,safeX,{gap:3.05,kinds:['tree','tree','rock'],offset:i%2?.55:-.55}));
      }
      addBananas(placements,startZ,length,random()<.52?2:1,anchor);
    }

    if(type==='ROCK SLALOM'){
      length=94;
      const rows=4;
      let safeX=anchor;
      for(let i=0;i<rows;i++){
        const z=startZ-15-i*21;
        safeX=clamp(safeX+(i%2?1:-1)*(1.9+random()*1.15),-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
        placements.push(...hazardRow(z,safeX,{gap:2.95,kinds:['rock','rock','tree'],offset:i%2?.8:-.8}));
      }
      if(random()<.42){
        const logZ=startZ-84;
        const logX=contentX(logZ,pickBand(),.92);
        placements.push(place('log',logX,logZ,movingSafe(logZ,safeX,2.1)));
      }
      addBananas(placements,startZ,length,random()<.64?2:1,safeX);
    }

    if(type==='LOG JUMP'){
      length=108;
      const rampZ=startZ-34;
      const rampX=clamp(contentX(rampZ,pickRampBand(),.99),-(T.COURSE_OBJECT_HALF_WIDTH-.35),T.COURSE_OBJECT_HALF_WIDTH-.35);
      const landingSafe=clamp(rampX,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
      placements.push(...hazardRow(startZ-12,landingSafe,{gap:3.45,kinds:['tree','rock'],offset:-.45}));
      placements.push(place('ramp',rampX,rampZ,landingSafe,{landingZone:true}));
      placements.push(place('log',rampX,rampZ-13.5,landingSafe,{jumpTarget:true}));
      placements.push(...hazardRow(rampZ-36,landingSafe,{gap:3.7,kinds:['rock','tree'],offset:.55}));
      placements.push(...hazardRow(rampZ-60,landingSafe,{gap:3.35,kinds:['tree','rock'],offset:-.55}));
      if(random()<.60)placements.push(banana(rampZ-48,landingSafe,landingSafe));
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
