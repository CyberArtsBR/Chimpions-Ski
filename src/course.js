import {SKI_TUNING as T,getSpeedProgress} from './gameplayTuning.js';
import {estimateRampFlightEnvelope} from './rampTrajectory.js';
import {createSafeRouteTracker} from './courseSafety.js';
import {
  COURSE_OBJECT_VISUAL_HALF_WIDTH,
  clampGameplayObjectX,
  gameplayObjectCenterLimit
} from './environmentCorridor.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const lerp=(a,b,t)=>a+(b-a)*t;
const PHYSICAL_HAZARDS=new Set(['tree','rock','log','wideLog','oil']);

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
  'STAGGER',
  'CLUSTER',
  'ISOLATED',
  'OFFSET_GATE',
  'EDGE_THREAT',
  'DIAGONAL',
  'SCATTER'
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

  function boundedPlacementX(kind,x,safeX,extra={}){
    let bounded=clampGameplayObjectX(kind,x);
    if(!PHYSICAL_HAZARDS.has(kind)||extra.jumpTarget)return bounded;

    // If boundary fitting pulled an edge hazard inward, preserve a navigable
    // center line by deterministically moving it to the nearest valid side.
    const minGap=(COURSE_OBJECT_VISUAL_HALF_WIDTH[kind]??0)+.36;
    if(Math.abs(bounded-safeX)>minGap)return bounded;

    const limit=gameplayObjectCenterLimit(kind);
    const preferred=bounded>=safeX?1:-1;
    for(const side of [preferred,-preferred]){
      const candidate=clamp(safeX+side*(minGap+.02),-limit,limit);
      if(Math.abs(candidate-safeX)>minGap)return candidate;
    }
    return bounded;
  }

  const place=(kind,x,z,safeX,extra={})=>({
    kind,
    x:boundedPlacementX(kind,x,safeX,extra),
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
      'OPEN CARVE':[.19,.16,.10,.09,.10,.19,.145],
      'GATE':[.17,.08,.05,.23,.08,.225,.16],
      'FOREST':[.24,.22,.04,.06,.07,.22,.15],
      'ROCK SLALOM':[.245,.15,.05,.055,.075,.25,.175],
      'RECOVERY':[.13,.08,.19,.08,.10,.18,.24],
      'BANANA LINE':[.14,.08,.16,.09,.09,.21,.23]
    }[sectionKind]||[.20,.15,.10,.09,.09,.20,.165];
    return FORMATION_TYPES[weightedIndex(weights)];
  }

  function isOutsideSafeCorridor(x,safeX,gap){
    return Math.abs(x-safeX)>=gap;
  }

  function addFormation(placements,type,z,safeX,{kinds=['tree','rock'],intensity=.5,landingProtected=false}={}){
    const gap=landingProtected?T.LANDING_CORRIDOR_HALF_WIDTH:lerp(3.15,2.85,intensity);
    const kindAt=i=>kinds[(i+sectionIndex)%kinds.length];

    if(type==='STAGGER'){
      const phaseOffset=rand(-.7,.7);
      for(let i=0;i<obstacleLanes.length;i++){
        if(random()<.18)continue;
        const x=clamp(obstacleLanes[i]+rand(-.78,.78),-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
        if(!isOutsideSafeCorridor(x,safeX,gap))continue;
        const alternating=(i%2===0?-1:1)*rand(1.25,2.85);
        const localZ=z+phaseOffset+alternating+rand(-.45,.45);
        placements.push(place(kindAt(i),x,localZ,safeX,{formation:type,decisionZ:z,routeDecision:true}));
      }
      return;
    }

    if(type==='CLUSTER'){
      const side=safeX>=0?-1:1;
      const center=side*rand(6.8,9.3);
      const count=3+Math.floor(random()*3);
      for(let i=0;i<count;i++){
        const x=clamp(center+rand(-1.2,1.2),-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
        if(!isOutsideSafeCorridor(x,safeX,gap))continue;
        placements.push(place(kindAt(i),x,z+rand(-2.0,2.0),safeX,{formation:type,decisionZ:z,routeDecision:true}));
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
        placements.push(place(kindAt(i),x,z+rand(-1.2,1.2),safeX,{formation:type,decisionZ:z,routeDecision:true}));
      }
      return;
    }

    if(type==='DIAGONAL'){
      const count=4+Math.floor(random()*2);
      const direction=random()<.5?-1:1;
      const startX=-direction*rand(7.8,9.4);
      for(let i=0;i<count;i++){
        const kind=kindAt(i);
        const x=clamp(startX+direction*i*rand(3.4,4.3)+rand(-.45,.45),-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
        const localZ=z+(i-(count-1)*.5)*rand(3.0,4.2)+rand(-.9,.9);
        if(!isOutsideSafeCorridor(x,safeX,gap))continue;
        placements.push(place(kind,x,localZ,safeX,{formation:type,decisionZ:z,routeDecision:true}));
      }
      return;
    }

    if(type==='SCATTER'){
      const count=4+Math.floor(random()*3);
      const placed=[];
      for(let attempt=0;attempt<18&&placed.length<count;attempt++){
        const kind=kindAt(attempt);
        const x=rand(-T.COURSE_OBJECT_HALF_WIDTH+.25,T.COURSE_OBJECT_HALF_WIDTH-.25);
        const localZ=z+rand(-7.5,7.5);
        if(!isOutsideSafeCorridor(x,safeX,gap))continue;
        if(placed.some(p=>Math.abs(p.x-x)<2.0&&Math.abs(p.z-localZ)<2.9))continue;
        const entry=place(kind,x,localZ,safeX,{formation:type,decisionZ:z,routeDecision:true});
        placements.push(entry);placed.push(entry);
      }
      return;
    }

    if(type==='OFFSET_GATE'){
      const leftX=clamp(safeX-gap-rand(.9,2.0),-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
      const rightX=clamp(safeX+gap+rand(.9,2.0),-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
      if(isOutsideSafeCorridor(leftX,safeX,gap))placements.push(place(kindAt(0),leftX,z-rand(.8,1.9),safeX,{formation:type,decisionZ:z,routeDecision:true}));
      if(isOutsideSafeCorridor(rightX,safeX,gap))placements.push(place(kindAt(1),rightX,z+rand(.8,1.9),safeX,{formation:type,decisionZ:z,routeDecision:true}));
      if(intensity>.62){
        const outer=lastThreatSide<=0?T.COURSE_OBJECT_HALF_WIDTH-.55:-(T.COURSE_OBJECT_HALF_WIDTH-.55);
        if(isOutsideSafeCorridor(outer,safeX,gap))placements.push(place(kindAt(2),outer,z+rand(-1.4,1.4),safeX,{formation:type,decisionZ:z,routeDecision:true}));
      }
      return;
    }

    // EDGE_THREAT: pressure one edge, but never invade the guaranteed safe corridor.
    let side;
    if(lastThreatSide===0)side=random()<.5?-1:1;
    else side=random()<.68?-lastThreatSide:lastThreatSide;
    let edgeX=side*rand(9.15,10.72);
    if(!isOutsideSafeCorridor(edgeX,safeX,gap)){
      side=-side;
      edgeX=side*rand(9.15,10.72);
    }
    lastThreatSide=side;
    if(isOutsideSafeCorridor(edgeX,safeX,gap)){
      placements.push(place(kindAt(0),edgeX,z+rand(-1.1,1.1),safeX,{formation:type,decisionZ:z,routeDecision:true}));
    }
    if(random()<.72){
      const supportX=clamp(side*rand(5.2,7.2),-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
      if(isOutsideSafeCorridor(supportX,safeX,gap)){
        placements.push(place(kindAt(1),supportX,z+rand(-2,2),safeX,{formation:type,decisionZ:z,routeDecision:true}));
      }
    }
  }

  function pruneExcessiveOverlap(placements){
    for(let i=placements.length-1;i>=0;i--){
      const a=placements[i];
      if(!PHYSICAL_HAZARDS.has(a.kind)||a.jumpTarget)continue;
      for(let j=0;j<i;j++){
        const b=placements[j];
        if(!PHYSICAL_HAZARDS.has(b.kind))continue;
        if(Math.abs(a.x-b.x)<.42&&Math.abs(a.z-b.z)<.52){
          placements.splice(i,1);
          break;
        }
      }
    }
  }

  function spacing(intense=false){
    return intense
      ?rand(T.COURSE_INTENSE_SPACING_MIN,T.COURSE_INTENSE_SPACING_MAX)
      :rand(T.COURSE_NORMAL_SPACING_MIN,T.COURSE_NORMAL_SPACING_MAX);
  }

  function addSpecialHazard(placements,startZ,length,safeHint=0,chance=.64){
    if(random()>chance)return false;
    const safe=clamp(safeHint,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
    const roll=random();
    const kind=roll<.50?'oil':roll<.82?'wideLog':'log';
    const extra=kind==='wideLog'?2.0:kind==='oil'?.85:.25;
    const minGap=3.0+extra;

    for(let attempt=0;attempt<18;attempt++){
      const z=startZ-rand(18,Math.max(20,length-12));
      if(placements.some(p=>p.kind!=='banana'&&Math.abs(p.z-z)<8.5))continue;
      let x=rand(-T.COURSE_OBJECT_HALF_WIDTH+.35,T.COURSE_OBJECT_HALF_WIDTH-.35);
      if(kind==='oil'){
        const side=random()<.5?-1:1;
        x=clamp(safe+side*rand(2.8,4.2),-T.COURSE_OBJECT_HALF_WIDTH+.35,T.COURSE_OBJECT_HALF_WIDTH-.35);
      }else{
        if(kind==='wideLog')x=clamp(x,-8.25,8.25);
        if(Math.abs(x-safe)<minGap){
          const side=x>=safe?1:-1;
          x=clamp(safe+side*(minGap+rand(.5,1.8)),-T.COURSE_OBJECT_HALF_WIDTH+.35,T.COURSE_OBJECT_HALF_WIDTH-.35);
        }
        if(Math.abs(x-safe)<minGap)continue;
      }
      placements.push(place(kind,x,z,safe,{formation:'SCATTER',special:true}));
      return true;
    }
    return false;
  }

  function addBananaEvent(placements,startZ,length,safeHint=0,chance=.64){
    if(random()>chance)return {type:'none',count:0};
    const safe=clamp(safeHint,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
    const bananaClear=(x,z)=>!placements.some(p=>
      p.kind!=='banana'&&
      Math.abs(p.z-z)<3.2&&
      Math.abs(p.x-x)<1.45
    );
    const pushClearBanana=(z,preferredX)=>{
      const preferred=clamp(preferredX,-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
      if(bananaClear(preferred,z)){placements.push(banana(z,preferred,safe));return true;}
      if(bananaClear(safe,z)){placements.push(banana(z,safe,safe));return true;}
      return false;
    };

    const roll=random();
    const usable=Math.max(24,length-28);
    const firstZ=startZ-rand(15,Math.min(32,usable*.44));

    if(roll<.55){
      const x=contentX(firstZ,pickBand(),.96);
      const count=pushClearBanana(firstZ,x)?1:0;
      return {type:'single',count};
    }

    if(roll<.90){
      const secondZ=Math.max(startZ-length+12,firstZ-rand(24,34));
      const firstX=clamp(contentX(firstZ,pickBand(),.92),-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
      const secondTarget=Math.abs(firstX)>5?firstX*.28:contentX(secondZ,pickBand(),.82);
      let count=0;
      if(pushClearBanana(firstZ,firstX))count++;
      if(pushClearBanana(secondZ,secondTarget))count++;
      return {type:'pair',count};
    }

    const direction=Math.abs(safe)<2?(random()<.5?-1:1):-Math.sign(safe);
    const baitX=clamp(
      safe+direction*rand(4.0,6.1),
      -T.COURSE_OBJECT_HALF_WIDTH,
      T.COURSE_OBJECT_HALF_WIDTH
    );
    const count=pushClearBanana(firstZ,baitX)?1:0;
    return {type:'movement-bait',count};
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
      const formationStart=placements.length;
      addFormation(
        placements,
        formation,
        z,
        safeX,
        {
          kinds:sectionKind==='LOG JUMP'?['rock','tree','rock']:['tree','rock','tree'],
          intensity:.46,
          landingProtected:protectedTouchdown
        }
      );
      for(let i=placements.length-1;i>=formationStart;i--){
        const placement=placements[i];
        const actualDistance=rampZ-placement.z;
        const invadesTouchdown=
          actualDistance>=envelope.protectedStartDistance&&
          actualDistance<=envelope.protectedEndDistance&&
          Math.abs(placement.x-safeX)<envelope.corridorHalfWidth;
        if(invadesTouchdown)placements.splice(i,1);
      }
      distance+=rand(20,27);
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
      length=96;
      let z=startZ-18;
      for(let i=0;i<4;i++){
        const safeX=safeAt(z,currentSpeed,anchor,3.8);
        addFormation(placements,chooseFormation(type),z,safeX,{kinds:['tree','rock'],intensity:.35});
        z-=spacing(false);
      }
      addSpecialHazard(placements,startZ,length,safeRoute.previousSafeX,.82);
      addBananaEvent(placements,startZ,length,safeRoute.previousSafeX,.70);
    }

    if(type==='GATE'){
      length=110;
      const rows=5;
      let z=startZ-18;
      for(let i=0;i<rows;i++){
        const desired=clamp(anchor+Math.sin(phase+i*.86)*4.0,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
        const safeX=safeRoute.constrain(desired,z,currentSpeed);
        const formation=i===0?'OFFSET_GATE':chooseFormation(type);
        addFormation(placements,formation,z,safeX,{kinds:i%2?['tree','rock']:['rock','tree'],intensity:.58});
        z-=spacing(false);
      }
      addSpecialHazard(placements,startZ,length,safeRoute.previousSafeX,.64);
      addBananaEvent(placements,startZ,length,safeRoute.previousSafeX,.62);
    }

    if(type==='BANANA LINE'){
      length=100;
      let z=startZ-20;
      for(let i=0;i<4;i++){
        const safeX=safeAt(z,currentSpeed,anchor,3.2);
        addFormation(placements,i===0?'ISOLATED':chooseFormation(type),z,safeX,{kinds:['rock','tree'],intensity:.38});
        z-=spacing(false);
      }
      addSpecialHazard(placements,startZ,length,safeRoute.previousSafeX,.58);
      addBananaEvent(placements,startZ,length,safeRoute.previousSafeX,.94);
    }

    if(type==='FOREST'){
      length=120;
      const rows=6;
      let z=startZ-16;
      for(let i=0;i<rows;i++){
        const desired=clamp(anchor+Math.sin(phase+i*.70)*4.1,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
        const safeX=safeRoute.constrain(desired,z,currentSpeed);
        addFormation(placements,chooseFormation(type),z,safeX,{kinds:['tree','tree','rock'],intensity:.72});
        z-=spacing(true);
      }
      addSpecialHazard(placements,startZ,length,safeRoute.previousSafeX,.78);
      addBananaEvent(placements,startZ,length,safeRoute.previousSafeX,.54);
    }

    if(type==='ROCK SLALOM'){
      length=118;
      const rows=6;
      let z=startZ-16;
      let desired=anchor;
      for(let i=0;i<rows;i++){
        desired=clamp(desired+(i%2?1:-1)*rand(3.1,5.0),-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
        const safeX=safeRoute.constrain(desired,z,currentSpeed);
        addFormation(placements,chooseFormation(type),z,safeX,{kinds:['rock','rock','tree'],intensity:.78});
        z-=spacing(true);
      }
      addSpecialHazard(placements,startZ,length,safeRoute.previousSafeX,.72);
      addBananaEvent(placements,startZ,length,safeRoute.previousSafeX,.58);
    }

    if(type==='RAMP'||type==='LOG JUMP'){
      const rampZ=startZ-34;
      const rampX=clamp(
        contentX(rampZ,pickRampBand(),.99),
        -(T.COURSE_OBJECT_HALF_WIDTH-.25),
        T.COURSE_OBJECT_HALF_WIDTH-.25
      );
      const rampTarget=clamp(rampX,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
      const envelope=estimateRampFlightEnvelope(currentSpeed);

      // Track the route in chronological downhill order: approach first, ramp second.
      const approachZ=startZ-12;
      const approachSafe=safeRoute.constrain(rampTarget,approachZ,currentSpeed);
      const rampSafe=safeRoute.constrain(rampTarget,rampZ,currentSpeed);
      addFormation(placements,'OFFSET_GATE',approachZ,approachSafe,{kinds:['tree','rock'],intensity:.42});
      if(random()<.34)placements.push(banana(startZ-23,rampX,rampSafe));

      placements.push(place('ramp',rampX,rampZ,rampSafe,{
        landingZone:true,
        decisionZ:rampZ,
        routeDecision:true,
        flightTime:envelope.flightTime,
        landingDistance:envelope.landingDistance
      }));

      if(type==='LOG JUMP'){
        placements.push(place('log',rampX,rampZ-13.5,rampSafe,{jumpTarget:true}));
      }

      // Keep flight visibly populated outside the landing corridor.
      populateFlight(placements,rampZ,rampSafe,envelope,type);

      const touchdownZ=rampZ-envelope.landingDistance;
      const landingEndZ=rampZ-envelope.protectedEndDistance;

      // Guarantee visible edge pressure at touchdown without invading the protected corridor.
      addFormation(
        placements,
        'EDGE_THREAT',
        touchdownZ,
        rampSafe,
        {kinds:['tree','rock'],intensity:.34,landingProtected:true}
      );

      // Resume real pressure shortly after the protected touchdown envelope.
      const postLandingZ=landingEndZ-16;
      const postLandingSafe=safeRoute.constrain(rampSafe,postLandingZ,currentSpeed);
      addFormation(
        placements,
        'ISOLATED',
        postLandingZ,
        postLandingSafe,
        {kinds:['rock','tree'],intensity:.30}
      );
      if(random()<.38)placements.push(banana(postLandingZ-7,postLandingSafe,postLandingSafe));

      pendingLanding={
        safeX:postLandingSafe,
        touchdownSafeX:rampSafe,
        touchdownZ,
        landingEndZ,
        postLandingZ,
        envelope
      };

      // Keep the section only slightly beyond the first post-landing pressure row.
      length=Math.max(112,Math.abs(startZ-postLandingZ)+12);
    }

    if(type==='RECOVERY'){
      const landing=pendingLanding;
      const recoveryAnchor=landing?.safeX??anchor;
      length=96;
      let z=startZ-16;

      // Keep first recovery decision reachable from the predicted landing route.
      const firstSafe=safeRoute.constrain(recoveryAnchor,z,currentSpeed);
      addFormation(placements,'ISOLATED',z,firstSafe,{kinds:['rock','tree'],intensity:.26});

      z-=spacing(false);
      const secondSafe=safeAt(z,currentSpeed,firstSafe,2.7);
      addFormation(placements,chooseFormation(type),z,secondSafe,{kinds:['tree','rock'],intensity:.38});

      addSpecialHazard(placements,startZ,length,secondSafe,.52);
      addBananaEvent(placements,startZ,length,secondSafe,.74);
      pendingLanding=null;
    }

    pruneExcessiveOverlap(placements);
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
        touchdownSafeX:pendingLanding.touchdownSafeX,
        touchdownZ:pendingLanding.touchdownZ,
        landingEndZ:pendingLanding.landingEndZ,
        postLandingZ:pendingLanding.postLandingZ,
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
