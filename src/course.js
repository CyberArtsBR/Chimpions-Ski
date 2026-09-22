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

export function getCourseDifficulty(distance=0,speed=12){
  const speedPart=clamp((speed-12)/19,0,1);
  const distancePart=clamp(distance/1200,0,1);
  return clamp(speedPart*.62+distancePart*.38,0,1);
}

export function createCourseDirector({routeCenter,random=Math.random}){
  let lastType='RECOVERY';
  let sectionIndex=0;
  const opening=['OPEN CARVE','GATE','BANANA LINE','RAMP','RECOVERY','FOREST','OPEN CARVE','ROCK SLALOM'];

  const route=(z,offset=0)=>clamp(routeCenter(z)+offset,-5.7,5.7);
  const place=(kind,x,z,safeX,extra={})=>({
    kind,
    x:clamp(x,-7.35,7.35),
    z,
    safeX:clamp(safeX,-6.2,6.2),
    ...extra
  });
  const sidePair=(kind,z,safeX,gap,extra={})=>[
    place(kind,safeX-gap,z,safeX,extra),
    place(kind,safeX+gap,z,safeX,extra)
  ];
  const banana=(z,safeX,offset=0)=>place('banana',safeX+offset,z,safeX);

  function chooseType(difficulty){
    if(sectionIndex<opening.length)return opening[sectionIndex];
    if(lastType==='RAMP'||lastType==='LOG JUMP')return 'RECOVERY';

    const transitions={
      'RECOVERY':['OPEN CARVE','BANANA LINE','FOREST'],
      'OPEN CARVE':['GATE','BANANA LINE','ROCK SLALOM','FOREST'],
      'GATE':['BANANA LINE','OPEN CARVE','RAMP'],
      'BANANA LINE':['RAMP','OPEN CARVE','GATE'],
      'FOREST':['OPEN CARVE','BANANA LINE'],
      'ROCK SLALOM':['OPEN CARVE','RAMP','GATE']
    };
    let options=[...(transitions[lastType]||['OPEN CARVE'])];

    if(difficulty<.30){
      options=options.filter(type=>type!=='ROCK SLALOM');
    }
    if(difficulty>.62&&['OPEN CARVE','GATE','ROCK SLALOM'].includes(lastType)){
      options.push('LOG JUMP');
    }
    if(difficulty>.45&&lastType==='OPEN CARVE')options.push('RAMP');

    return options[Math.floor(random()*options.length)]||'OPEN CARVE';
  }

  function next({startZ,difficulty=0}){
    const type=chooseType(difficulty);
    const placements=[];
    const sectionPhase=sectionIndex*.83;
    let length=30;

    if(type==='OPEN CARVE'){
      length=32;
      const rows=4+Math.round(difficulty*2);
      const spacing=length/(rows+1);
      for(let i=0;i<rows;i++){
        const z=startZ-(i+1)*spacing;
        const safeX=route(z,Math.sin(sectionPhase+i*.78)*1.05);
        placements.push(banana(z,safeX,Math.sin(i*.9)*.28));
        if(i%2===0){
          const side=i%4===0?-1:1;
          placements.push(place(i%4===0?'tree':'rock',safeX+side*(3.8-difficulty*.25),z-.7,safeX));
        }
      }
    }

    if(type==='GATE'){
      length=29;
      const rows=3+Math.round(difficulty*2);
      const spacing=5.9-difficulty*.55;
      for(let i=0;i<rows;i++){
        const z=startZ-4-i*spacing;
        const safeX=route(z,Math.sin(sectionPhase+i*.7)*.8);
        const kind=i%2?'tree':'rock';
        placements.push(...sidePair(kind,z,safeX,3.15-difficulty*.18));
        if(i<rows-1)placements.push(banana(z-2.15,route(z-2.15,Math.sin(sectionPhase+(i+.35)*.7)*.8)));
      }
    }

    if(type==='BANANA LINE'){
      length=30;
      for(let i=0;i<7;i++){
        const z=startZ-3.2-i*3.45;
        const safeX=route(z,Math.sin(sectionPhase+i*.56)*1.18);
        placements.push(banana(z,safeX));
      }
      const firstSafe=route(startZ-8);
      const lastSafe=route(startZ-22);
      placements.push(place('tree',firstSafe-4.15,startZ-8,firstSafe));
      placements.push(place('tree',lastSafe+4.15,startZ-22,lastSafe));
    }

    if(type==='RAMP'){
      length=36;
      const rampZ=startZ-7;
      const safeX=route(rampZ,Math.sin(sectionPhase)*.55);
      placements.push(banana(startZ-3.4,route(startZ-3.4,Math.sin(sectionPhase)*.35)));
      placements.push(place('ramp',safeX,rampZ,safeX,{landingZone:true}));
      placements.push(banana(rampZ-4.4,route(rampZ-4.4,Math.sin(sectionPhase)*.40)));
      placements.push(banana(rampZ-8.6,route(rampZ-8.6,Math.sin(sectionPhase)*.48)));
      placements.push(banana(rampZ-12.8,route(rampZ-12.8,Math.sin(sectionPhase)*.42)));
      placements.push(place('tree',safeX-4.6,rampZ-1.4,safeX));
      placements.push(place('tree',safeX+4.6,rampZ-1.4,safeX));
    }

    if(type==='RECOVERY'){
      length=29;
      for(let i=0;i<4;i++){
        const z=startZ-4-i*5.3;
        const safeX=route(z,Math.sin(sectionPhase+i*.5)*.72);
        placements.push(banana(z,safeX));
      }
      const safeX=route(startZ-25);
      placements.push(place('rock',safeX+(sectionIndex%2?-4.3:4.3),startZ-25,safeX));
    }

    if(type==='FOREST'){
      length=36;
      const rows=5+Math.round(difficulty*2);
      const spacing=5.5-difficulty*.45;
      for(let i=0;i<rows;i++){
        const z=startZ-3.8-i*spacing;
        const safeX=route(z,Math.sin(sectionPhase+i*.66)*1.22);
        placements.push(...sidePair('tree',z,safeX,3.10-difficulty*.10));
        if(i%2===1){
          const outerSide=i%4===1?-1:1;
          placements.push(place('tree',safeX+outerSide*5.2,z-1.4,safeX));
        }
        if(i<rows-1)placements.push(banana(z-2.2,route(z-2.2,Math.sin(sectionPhase+(i+.4)*.66)*1.22)));
      }
    }

    if(type==='ROCK SLALOM'){
      length=34;
      const rows=5+Math.round(difficulty*2);
      const spacing=5.25-difficulty*.42;
      for(let i=0;i<rows;i++){
        const z=startZ-3.5-i*spacing;
        const pathOffset=Math.sin(sectionPhase+i*.72)*1.12;
        const safeX=route(z,pathOffset);
        const side=i%2?-1:1;
        placements.push(place('rock',safeX+side*(2.30-difficulty*.10),z,safeX));
        placements.push(banana(z-1.9,route(z-1.9,pathOffset-side*.52)));
      }
    }

    if(type==='LOG JUMP'){
      length=38;
      const rampZ=startZ-6.2;
      const safeX=route(rampZ,Math.sin(sectionPhase)*.46);
      placements.push(place('ramp',safeX,rampZ,safeX,{landingZone:true}));
      placements.push(banana(rampZ-2.7,safeX));
      placements.push(place('log',route(rampZ-7.4,Math.sin(sectionPhase)*.44),rampZ-7.4,safeX,{jumpTarget:true}));
      placements.push(banana(rampZ-11.8,route(rampZ-11.8,Math.sin(sectionPhase)*.36)));
      placements.push(place('tree',safeX-4.55,rampZ-1.1,safeX));
      placements.push(place('tree',safeX+4.55,rampZ-1.1,safeX));
    }

    for(const placement of placements)placement.section=type;
    lastType=type;
    sectionIndex++;
    return {type,placements,endZ:startZ-length,length};
  }

  return {
    next,
    reset(){lastType='RECOVERY';sectionIndex=0;},
    get lastType(){return lastType;},
    get sectionIndex(){return sectionIndex;}
  };
}
