import {SKI_TUNING as T,getSpeedProgress} from './gameplayTuning.js';
import {estimateRampFlightEnvelope} from './rampTrajectory.js';
import {createSafeRouteTracker} from './courseSafety.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const lerp=(a,b,t)=>a+(b-a)*t;

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

export const FORMATION_TYPES=[
  'ROW',
  'STAGGER',
  'CLUSTER',
  'ISOLATED',
  'OFFSET_GATE',
  'EDGE_THREAT'
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
  let pendingLanding=null;
  let edgeThreatCountdown=3;
  let lastThreatSide=0;
  const safeRoute=createSafeRouteTracker(0,null);

  // Seven conceptual lanes remain useful for fairness, but formation jitter/stagger
  // prevents the player from seeing a repeated seven-column grid.
  const bands=[-1,-.72,-.36,0,.36,.72,1];
  const obstacleLanes=[-10.65,-7.10,-3.55,0,3.55,7.10,10.65];
  const opening=[
    'OPEN CARVE','BANANA LINE','GATE','FOREST',
    'RAMP','RECOVERY','ROCK SLALOM','OPEN CARVE','GATE','RAMP','RECOVERY'
  ];

  const rand=(min,max)=>min+(max-min)*random();
  const weightedIndex=weights=>{
    let total=weights.reduce((sum,value)=>sum+value,0);
    let roll=random()*total;
    for(let i=0;i<weights.length;i++){
      roll-=weights[i];
      if(roll<=0)return i;
    }
    return weights.length-1;
  };

  function effectiveSpeed(speed,difficulty){
    if(Number.isFinite(speed)&&speed>0)return clamp(speed,T.BASE_SPEED*.9,T.MAX_SPEED);
    // Conservative fallback until main.js passes state.speed: assume at least 18% of speed range.
    return lerp(T.BASE_SPEED,T.MAX_SPEED,clamp(.18+difficulty*.82,0,1));
  }

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

  function desiredSafe(z,base=0,range=3.4){
    const band=contentX(z,pickBand(),.86);
    return clamp(
      band*.48+base*.34+Math.sin(sectionIndex*.77-z*.017)*range,
      -T.SAFE_ROUTE_HALF_WIDTH,
      T.SAFE_ROUTE_HALF_WIDTH
    );
  }

  function safeAt(z,speed,base=0,range=3.4){
    return safeRoute.constrain(desiredSafe(z,base,range),z,speed);
  }

  function chooseFormation(sectionKind='OPEN CARVE'){
    edgeThreatCountdown--;
    if(edgeThreatCountdown<=0){
      edgeThreatCountdown=3+Math.floor(random()*3);
      return 'EDGE_THREAT';
    }

    const weights={
      'OPEN CARVE':[.08,.23,.16,.28,.13,.12],
      'GATE':[.12,.18,.08,.10,.42,.10],
      'FOREST':[.08,.32,.22,.12,.18,.08],
      'ROCK SLALOM':[.08,.34,.18,.18,.14,.08],
      'RECOVERY':[.04,.16,.10,.46,.12,.12],
      'BANANA LINE':[.05,.18,.10,.40,.15,.12]
    }[sectionKind]||[.10,.24,.16,.24,.16,.10];
    return FORMATION_TYPES[weightedIndex(weights)];
  }

  function isOutsideSafeCorridor(x,safeX,gap){
    return Math.abs(x-safeX)>=gap;
  }

  function addFormation(placements,type,z,safeX,{kinds=['tree','rock'],intensity=.5,landingProtected=false}={}){
    const gap=landingProtected?T.LANDING_CORRIDOR_HALF_WIDTH:lerp(3.15,2.85,intensity);
    const kindAt=i=>kinds[(i+sectionIndex)%kinds.length];

    if(type==='ROW'){
      for(let i=0;i<obstacleLanes.length;i++){
        const x=obstacleLanes[i];
        if(!isOutsideSafeCorridor(x,safeX,gap))continue;
        placements.push(place(kindAt(i),x,z,safeX,{formation:type}));
      }
      return;
    }

    if(type==='STAGGER'){
      for(let i=0;i<obstacleLanes.length;i++){
        const x=clamp(obstacleLanes[i]+rand(-.48,.48),-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
        if(!isOutsideSafeCorridor(x,safeX,gap))continue;
        placements.push(place(kindAt(i),x,z+rand(-1.8,1.8),safeX,{formation:type}));
      }
      return;
    }

    if(type==='CLUSTER'){
      const side=safeX>=0?-1:1;
      const center=side*rand(6.8,9.3);
      const count=3+Math.floor(random()*2);
      for(let i=0;i<count;i++){
        const x=clamp(center+rand(-1.2,1.2),-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
        if(!isOutsideSafeCorridor(x,safeX,gap))continue;
        placements.push(place(kindAt(i),x,z+rand(-2.0,2.0),safeX,{formation:type}));
      }
      return;
    }

    if(type==='ISOLATED'){
      const count=random()<.68?1:2;
      for(let i=0;i<count;i++){
        let x=contentX(z+rand(-2,2),pickBand(),.98);
        if(!isOutsideSafeCorridor(x,safeX,gap)){
          const side=x>=safeX?1:-1;
          x=clamp(safeX+side*(gap+rand(.8,2.4)),-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
        }
        placements.push(place(kindAt(i),x,z+rand(-1.2,1.2),safeX,{formation:type}));
      }
      return;
    }

    if(type==='OFFSET_GATE'){
      const leftX=clamp(safeX-gap-rand(.9,2.0),-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
      const rightX=clamp(safeX+gap+rand(.9,2.0),-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
      placements.push(place(kindAt(0),leftX,z-rand(.8,1.9),safeX,{formation:type}));
      placements.push(place(kindAt(1),rightX,z+rand(.8,1.9),safeX,{formation:type}));
      if(intensity>.62){
        const outer=lastThreatSide<=0?T.COURSE_OBJECT_HALF_WIDTH-.55:-(T.COURSE_OBJECT_HALF_WIDTH-.55);
        placements.push(place(kindAt(2),outer,z+rand(-1.4,1.4),safeX,{formation:type}));
      }
      return;
    }

    // EDGE_THREAT: invalidate one edge at a time without blocking the whole course.
    let side;
    if(lastThreatSide===0)side=random()<.5?-1:1;
    else side=random()<.68?-lastThreatSide:lastThreatSide;
    lastThreatSide=side;
    const edgeX=side*rand(9.15,10.72);
    placements.push(place(kindAt(0),edgeX,z+rand(-1.1,1.1),safeX,{formation:type}));
    if(random()<.58){
      const supportX=clamp(side*rand(5.2,7.2),-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
      if(isOutsideSafeCorridor(supportX,safeX,gap)){
        placements.push(place(kindAt(1),supportX,z+rand(-2,2),safeX,{formation:type}));
      }
    }
  }

  function spacing(intense=false){
    return intense
      ?rand(T.COURSE_INTENSE_SPACING_MIN,T.COURSE_INTENSE_SPACING_MAX)
      :rand(T.COURSE_NORMAL_SPACING_MIN,T.COURSE_NORMAL_SPACING_MAX);
  }

  function addBananaEvent(placements,startZ,length,safeHint=0,chance=.64){
    if(random()>chance)return {type:'none',count:0};
    const roll=random();
    const usable=Math.max(24,length-28);
    const firstZ=startZ-rand(15,Math.min(32,usable*.44));

    if(roll<.55){
      const x=clamp(contentX(firstZ,pickBand(),.96),-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
      placements.push(banana(firstZ,x,clamp(safeHint,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH)));
      return {type:'single',count:1};
    }

    if(roll<.90){
      const secondZ=Math.max(startZ-length+12,firstZ-rand(24,34));
      const firstX=clamp(contentX(firstZ,pickBand(),.92),-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
      const secondTarget=Math.abs(firstX)>5?firstX*.28:contentX(secondZ,pickBand(),.82);
      const secondX=clamp(secondTarget,-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
      placements.push(banana(firstZ,firstX,clamp(safeHint,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH)));
      placements.push(banana(secondZ,secondX,clamp(safeHint,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH)));
      return {type:'pair',count:2};
    }

    const direction=Math.abs(safeHint)<2?(random()<.5?-1:1):-Math.sign(safeHint);
    const baitX=clamp(
      safeHint+direction*rand(4.0,6.1),
      -T.COURSE_OBJECT_HALF_WIDTH,
      T.COURSE_OBJECT_HALF_WIDTH
    );
    placements.push(banana(firstZ,baitX,clamp(safeHint,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH)));
    return {type:'movement-bait',count:1};
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
    const options=[...(transitions[lastType]||['OPEN CARVE'])];

    if(difficulty>.42&&lastType==='OPEN CARVE'&&random()<.22)options.push('LOG JUMP');
    if(lastType!=='RECOVERY'&&random()<.12)options.push('RAMP');

    return options[Math.floor(random()*options.length)]||'OPEN CARVE';
  }

  function populateFlight(placements,rampZ,safeX,envelope,sectionKind){
    const startDistance=20;
    const lastDistance=Math.max(startDistance,envelope.flightEndDistance-10);
    let distance=startDistance;
    let index=0;

    while(distance<lastDistance){
      const z=rampZ-distance;
      const protectedTouchdown=
        distance>=envelope.protectedStartDistance&&
        distance<=envelope.protectedEndDistance;
      const formation=protectedTouchdown
        ?'EDGE_THREAT'
        :(index%2===0?'STAGGER':'ISOLATED');
      addFormation(
        placements,
        formation,
        z,
        safeX,
        {
          kinds:sectionKind==='LOG JUMP'?['rock','tree']:['tree','rock'],
          intensity:.46,
          landingProtected:protectedTouchdown
        }
      );
      distance+=rand(24,30);
      index++;
    }

    if(random()<.42){
      const bananaDistance=Math.min(envelope.landingDistance*.48,envelope.protectedStartDistance-8);
      if(bananaDistance>18){
        placements.push(banana(rampZ-bananaDistance,safeX,safeX));
      }
    }
  }

  function next({startZ,difficulty=0,speed}){
    const currentSpeed=effectiveSpeed(speed,difficulty);
    const type=chooseType(difficulty);
    const placements=[];
    const phase=sectionIndex*.73;
    const sectionBand=pickBand();
    const anchor=clamp(contentX(startZ-18,sectionBand,.90),-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
    let length=86;

    if(type==='OPEN CARVE'){
      length=90;
      let z=startZ-20;
      for(let i=0;i<2;i++){
        const safeX=safeAt(z,currentSpeed,anchor,3.8);
        addFormation(placements,chooseFormation(type),z,safeX,{kinds:['tree','rock'],intensity:.35});
        z-=spacing(false);
      }
      addBananaEvent(placements,startZ,length,safeRoute.previousSafeX,.66);
    }

    if(type==='GATE'){
      length=102;
      const rows=3+(difficulty>.78?1:0);
      let z=startZ-18;
      for(let i=0;i<rows;i++){
        const desired=clamp(anchor+Math.sin(phase+i*.86)*4.0,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
        const safeX=safeRoute.constrain(desired,z,currentSpeed);
        const formation=i===0?'OFFSET_GATE':chooseFormation(type);
        addFormation(placements,formation,z,safeX,{kinds:i%2?['tree','rock']:['rock','tree'],intensity:.58});
        z-=spacing(false);
      }
      addBananaEvent(placements,startZ,length,safeRoute.previousSafeX,.58);
    }

    if(type==='BANANA LINE'){
      length=92;
      let z=startZ-22;
      for(let i=0;i<2;i++){
        const safeX=safeAt(z,currentSpeed,anchor,3.2);
        addFormation(placements,i===0?'ISOLATED':chooseFormation(type),z,safeX,{kinds:['rock','tree'],intensity:.38});
        z-=spacing(false);
      }
      addBananaEvent(placements,startZ,length,safeRoute.previousSafeX,.92);
    }

    if(type==='FOREST'){
      length=108;
      const rows=4+(difficulty>.82?1:0);
      let z=startZ-16;
      for(let i=0;i<rows;i++){
        const desired=clamp(anchor+Math.sin(phase+i*.70)*4.1,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
        const safeX=safeRoute.constrain(desired,z,currentSpeed);
        addFormation(placements,chooseFormation(type),z,safeX,{kinds:['tree','tree','rock'],intensity:.72});
        z-=spacing(true);
      }
      addBananaEvent(placements,startZ,length,safeRoute.previousSafeX,.50);
    }

    if(type==='ROCK SLALOM'){
      length=104;
      const rows=4+(difficulty>.84?1:0);
      let z=startZ-16;
      let desired=anchor;
      for(let i=0;i<rows;i++){
        desired=clamp(desired+(i%2?1:-1)*rand(3.1,5.0),-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
        const safeX=safeRoute.constrain(desired,z,currentSpeed);
        addFormation(placements,chooseFormation(type),z,safeX,{kinds:['rock','rock','tree'],intensity:.78});
        z-=spacing(true);
      }
      addBananaEvent(placements,startZ,length,safeRoute.previousSafeX,.54);
    }

    if(type==='RAMP'||type==='LOG JUMP'){
      const rampZ=startZ-34;
      const rampX=clamp(
        contentX(rampZ,pickRampBand(),.99),
        -(T.COURSE_OBJECT_HALF_WIDTH-.25),
        T.COURSE_OBJECT_HALF_WIDTH-.25
      );
      const rampSafe=safeRoute.constrain(
        clamp(rampX,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH),
        rampZ,
        currentSpeed
      );
      const envelope=estimateRampFlightEnvelope(currentSpeed);

      // Readable approach with one formation far enough before the ramp.
      const approachZ=startZ-12;
      const approachSafe=safeRoute.constrain(rampSafe,approachZ,currentSpeed);
      addFormation(placements,'OFFSET_GATE',approachZ,approachSafe,{kinds:['tree','rock'],intensity:.42});
      if(random()<.34)placements.push(banana(startZ-23,rampX,rampSafe));

      placements.push(place('ramp',rampX,rampZ,rampSafe,{
        landingZone:true,
        flightTime:envelope.flightTime,
        landingDistance:envelope.landingDistance
      }));

      if(type==='LOG JUMP'){
        placements.push(place('log',rampX,rampZ-13.5,rampSafe,{jumpTarget:true}));
      }

      // Keep flight visually/gameplay populated outside the protected landing corridor.
      populateFlight(placements,rampZ,rampSafe,envelope,type);

      const touchdownZ=rampZ-envelope.landingDistance;
      const landingEndZ=rampZ-envelope.protectedEndDistance;
      pendingLanding={
        safeX:rampSafe,
        touchdownZ,
        landingEndZ,
        envelope
      };

      // End this section after touchdown protection; RECOVERY begins with landing-aware state.
      length=Math.max(112,Math.abs(startZ-landingEndZ)+18);
    }

    if(type==='RECOVERY'){
      const landing=pendingLanding;
      const recoveryAnchor=landing?.safeX??anchor;
      length=96;
      let z=startZ-24;

      // Keep first recovery decision reachable from the predicted landing route.
      const firstSafe=safeRoute.constrain(recoveryAnchor,z,currentSpeed);
      addFormation(placements,'ISOLATED',z,firstSafe,{kinds:['rock','tree'],intensity:.26});

      z-=spacing(false);
      const secondSafe=safeAt(z,currentSpeed,firstSafe,2.7);
      addFormation(placements,chooseFormation(type),z,secondSafe,{kinds:['tree','rock'],intensity:.38});

      addBananaEvent(placements,startZ,length,secondSafe,.70);
      pendingLanding=null;
    }

    for(const placement of placements)placement.section=type;
    lastType=type;
    sectionIndex++;
    return {
      type,
      placements,
      endZ:startZ-length,
      length,
      speed:currentSpeed,
      pendingLanding:pendingLanding?{
        safeX:pendingLanding.safeX,
        touchdownZ:pendingLanding.touchdownZ,
        landingEndZ:pendingLanding.landingEndZ,
        flightTime:pendingLanding.envelope.flightTime,
        landingDistance:pendingLanding.envelope.landingDistance
      }:null
    };
  }

  return {
    next,
    reset(){
      lastType='RECOVERY';
      sectionIndex=0;
      recentBands=[3];
      pendingLanding=null;
      edgeThreatCountdown=3;
      lastThreatSide=0;
      safeRoute.reset(0,null);
    },
    get lastType(){return lastType;},
    get sectionIndex(){return sectionIndex;},
    get previousSafeX(){return safeRoute.previousSafeX;},
    get previousSafeZ(){return safeRoute.previousSafeZ;},
    get pendingLanding(){return pendingLanding;}
  };
}
