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
  const distancePart=clamp(distance/1500,0,1);
  return clamp(speedPart*.58+distancePart*.42,0,1);
}

export function createCourseDirector({routeCenter,random=Math.random}){
  let lastType='RECOVERY';
  let sectionIndex=0;
  const opening=[
    'OPEN CARVE','GATE','OPEN CARVE','BANANA LINE',
    'RAMP','RECOVERY','OPEN CARVE','FOREST','OPEN CARVE','ROCK SLALOM'
  ];

  const route=(z,offset=0)=>clamp(routeCenter(z)+offset,-4.9,4.9);
  const place=(kind,x,z,safeX,extra={})=>({
    kind,
    x:clamp(x,-7.25,7.25),
    z,
    safeX:clamp(safeX,-5.2,5.2),
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
      'RECOVERY':['OPEN CARVE','OPEN CARVE','BANANA LINE'],
      'OPEN CARVE':['GATE','BANANA LINE','FOREST','ROCK SLALOM','OPEN CARVE'],
      'GATE':['OPEN CARVE','BANANA LINE','RAMP'],
      'BANANA LINE':['OPEN CARVE','RAMP','GATE'],
      'FOREST':['OPEN CARVE','OPEN CARVE','BANANA LINE'],
      'ROCK SLALOM':['OPEN CARVE','OPEN CARVE','GATE']
    };
    let options=[...(transitions[lastType]||['OPEN CARVE'])];

    if(difficulty<.32)options=options.filter(type=>type!=='ROCK SLALOM');
    if(difficulty>.62&&lastType==='OPEN CARVE')options.push('LOG JUMP');
    if(difficulty>.48&&lastType==='GATE')options.push('RAMP');

    return options[Math.floor(random()*options.length)]||'OPEN CARVE';
  }

  function next({startZ,difficulty=0}){
    const type=chooseType(difficulty);
    const placements=[];
    const phase=sectionIndex*.79;
    let length=42;

    if(type==='OPEN CARVE'){
      length=46;
      const rows=3+Math.round(difficulty);
      for(let i=0;i<rows;i++){
        const z=startZ-8-i*(10.2-difficulty*.6);
        const safeX=route(z,Math.sin(phase+i*.72)*1.15);
        placements.push(banana(z,safeX,Math.sin(i*.8)*.30));
        if(i===1){
          const side=sectionIndex%2?-1:1;
          placements.push(place('rock',safeX+side*4.25,z-1.1,safeX));
        }
      }
    }

    if(type==='GATE'){
      length=42;
      const rows=3+Math.round(difficulty);
      const spacing=9.2-difficulty*.7;
      for(let i=0;i<rows;i++){
        const z=startZ-7-i*spacing;
        const safeX=route(z,Math.sin(phase+i*.62)*.82);
        placements.push(...sidePair(i%2?'tree':'rock',z,safeX,3.55-difficulty*.08));
        if(i<rows-1)placements.push(banana(z-4.0,route(z-4.0,Math.sin(phase+(i+.45)*.62)*.82)));
      }
    }

    if(type==='BANANA LINE'){
      length=43;
      for(let i=0;i<8;i++){
        const z=startZ-5-i*4.4;
        const safeX=route(z,Math.sin(phase+i*.48)*1.18);
        placements.push(banana(z,safeX));
      }
      const firstSafe=route(startZ-10);
      const lastSafe=route(startZ-31);
      placements.push(place('tree',firstSafe-4.55,startZ-10,firstSafe));
      placements.push(place('tree',lastSafe+4.55,startZ-31,lastSafe));
    }

    if(type==='RAMP'){
      length=50;
      const rampZ=startZ-12;
      const safeX=route(rampZ,Math.sin(phase)*.48);
      placements.push(banana(startZ-5.5,route(startZ-5.5,Math.sin(phase)*.30)));
      placements.push(place('tree',safeX-4.75,rampZ+4.6,safeX));
      placements.push(place('tree',safeX+4.75,rampZ+4.6,safeX));
      placements.push(place('ramp',safeX,rampZ,safeX,{landingZone:true}));
      // Only collectibles occupy the landing corridor; the following section is forced RECOVERY.
      placements.push(banana(rampZ-8.5,route(rampZ-8.5,Math.sin(phase)*.34)));
      placements.push(banana(rampZ-15.0,route(rampZ-15.0,Math.sin(phase)*.28)));
      placements.push(banana(rampZ-22.0,route(rampZ-22.0,Math.sin(phase)*.22)));
    }

    if(type==='RECOVERY'){
      length=44;
      for(let i=0;i<5;i++){
        const z=startZ-6-i*7.0;
        const safeX=route(z,Math.sin(phase+i*.42)*.78);
        placements.push(banana(z,safeX));
      }
      const safeX=route(startZ-38);
      placements.push(place('rock',safeX+(sectionIndex%2?-4.65:4.65),startZ-38,safeX));
    }

    if(type==='FOREST'){
      length=50;
      const rows=4+Math.round(difficulty);
      const spacing=10.0-difficulty*.65;
      for(let i=0;i<rows;i++){
        const z=startZ-7-i*spacing;
        const safeX=route(z,Math.sin(phase+i*.60)*1.10);
        placements.push(...sidePair('tree',z,safeX,3.65-difficulty*.08));
        if(i<rows-1)placements.push(banana(z-4.2,route(z-4.2,Math.sin(phase+(i+.42)*.60)*1.10)));
      }
    }

    if(type==='ROCK SLALOM'){
      length=48;
      const rows=4+Math.round(difficulty);
      const spacing=9.3-difficulty*.6;
      for(let i=0;i<rows;i++){
        const z=startZ-7-i*spacing;
        const pathOffset=Math.sin(phase+i*.68)*1.15;
        const safeX=route(z,pathOffset);
        const side=i%2?-1:1;
        placements.push(place('rock',safeX+side*(2.75-difficulty*.08),z,safeX));
        if(i<rows-1)placements.push(banana(z-4.0,route(z-4.0,pathOffset-side*.48)));
      }
    }

    if(type==='LOG JUMP'){
      length=52;
      const rampZ=startZ-12;
      const safeX=route(rampZ,Math.sin(phase)*.42);
      placements.push(place('ramp',safeX,rampZ,safeX,{landingZone:true}));
      placements.push(banana(rampZ-4.0,safeX));
      placements.push(place('log',route(rampZ-8.6,Math.sin(phase)*.38),rampZ-8.6,safeX,{jumpTarget:true}));
      placements.push(banana(rampZ-16.5,route(rampZ-16.5,Math.sin(phase)*.28)));
      placements.push(banana(rampZ-24.0,route(rampZ-24.0,Math.sin(phase)*.20)));
      placements.push(place('tree',safeX-4.75,rampZ+4.8,safeX));
      placements.push(place('tree',safeX+4.75,rampZ+4.8,safeX));
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
