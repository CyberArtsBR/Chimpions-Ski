import {SKI_TUNING as T,getSpeedProgress} from './gameplayTuning.js';
import {OBSTACLE_TUNING,obstacleCollisionHalfWidth,obstacleHalfDepth} from './obstacleTuning.js';
import {estimateRampFlightEnvelope} from './rampTrajectory.js';
import {createSafeRouteTracker} from './courseSafety.js';
import {
  COURSE_OBJECT_COLLISION_HALF_WIDTH,
  FLAG_VISUAL_MARGIN,
  clampGameplayObjectX,
  gameplayObjectCenterLimit
} from './environmentCorridor.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const lerp=(a,b,t)=>a+(b-a)*t;
const PHYSICAL_HAZARDS=new Set(['tree','rock','log','wideLog','oil']);
const HAZARD_HALF_DEPTH=Object.freeze({tree:.68,rock:.58,log:.48,wideLog:.58,oil:.74});

function collisionHalfWidth(kind){
  return obstacleCollisionHalfWidth(kind,COURSE_OBJECT_COLLISION_HALF_WIDTH[kind]??0);
}
function collisionHalfDepth(kind){
  return obstacleHalfDepth(kind,HAZARD_HALF_DEPTH[kind]??.7);
}
function placementCenterLimit(kind){
  const base=gameplayObjectCenterLimit(kind);
  const visualHalfWidth=OBSTACLE_TUNING[kind]?.visualHalfWidth;
  if(!Number.isFinite(visualHalfWidth))return base;
  const tuned=Math.max(0,T.PLAYER_HALF_WIDTH-FLAG_VISUAL_MARGIN-visualHalfWidth);
  return Math.min(base,tuned);
}

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
  let routeDecisionSerial=0;
  let recentFormations=[];
  let denseFormationStreak=0;
  const safeRoute=createSafeRouteTracker(0,null);

  // Seven conceptual lanes remain useful for fairness, but formation jitter/stagger
  // prevents the player from seeing a repeated seven-column grid.
  const bands=[-1,-.68,-.34,0,.34,.68,1];
  const obstacleLaneStep=T.CONTENT_BAND_HALF_WIDTH/3;
  const obstacleLanes=[-3,-2,-1,0,1,2,3].map(index=>index*obstacleLaneStep);
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
    // Keep every lane possible, but make center/inner ramps common enough to read
    // as intentional gameplay choices instead of edge-biased scenery.
    return weightedIndex([.78,1.05,1.36,1.82,1.36,1.05,.78]);
  }

  function contentX(z,bandIndex=pickBand(),strength=1){
    const lane=bands[bandIndex]*T.CONTENT_BAND_HALF_WIDTH*strength;
    return clamp(lane+routeCenter(z)*.14,-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
  }

  function boundedPlacementX(kind,x,safeX,extra={}){
    const limit=placementCenterLimit(kind);
    let bounded=clamp(clampGameplayObjectX(kind,x),-limit,limit);
    if(!PHYSICAL_HAZARDS.has(kind)||extra.jumpTarget)return bounded;

    const rawX=Number.isFinite(x)?x:0;

    // If boundary fitting pulled a hazard toward the protected route, preserve
    // the normal navigable gap or the wider ramp touchdown corridor.
    const minGap=extra.landingProtected
      ?T.LANDING_CORRIDOR_HALF_WIDTH
      :collisionHalfWidth(kind)+.36;
    const diversifyEdge=value=>{
      const edgeFloor=T.SIDE_HAZARD_ZONE_START;
      if(!extra.routeDecision||limit<edgeFloor+.18||Math.abs(value)<edgeFloor-.22)return value;
      const serial=Math.max(0,Math.trunc(Number(extra.decisionSerial)||0));
      const fractions=[.05,.38,.70,.95];
      const sign=Math.sign(value||rawX||1);
      for(let offset=0;offset<fractions.length;offset++){
        const fraction=fractions[(serial+offset)%fractions.length];
        const target=sign*Math.min(limit,edgeFloor+(limit-edgeFloor)*fraction);
        if(Math.abs(target-safeX)>minGap)return target;
      }
      return value;
    };
    if(Math.abs(bounded-safeX)>minGap)return diversifyEdge(bounded);

    const preferred=bounded>=safeX?1:-1;
    const spread=extra.routeDecision
      ?.04+((Math.abs(Number(extra.decisionZ)||0)*.031+Math.abs(rawX)*.107)% .42)
      :.02;
    for(const side of [preferred,-preferred]){
      const candidate=clamp(safeX+side*(minGap+spread),-limit,limit);
      if(Math.abs(candidate-safeX)>minGap)return diversifyEdge(candidate);
    }
    return diversifyEdge(bounded);
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

  const DENSE_FORMATIONS=new Set(['STAGGER','CLUSTER','SCATTER']);

  function recordFormation(type){
    denseFormationStreak=DENSE_FORMATIONS.has(type)?denseFormationStreak+1:0;
    recentFormations.push(type);
    if(recentFormations.length>3)recentFormations.shift();
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

    // Preserve each section family's authored vocabulary, but avoid letting
    // late-game pressure read as repeated/noisy copies of the same pattern.
    const last=recentFormations.at(-1);
    const previous=recentFormations.at(-2);
    if(last){
      const index=FORMATION_TYPES.indexOf(last);
      if(index>=0)weights[index]*=.22;
    }
    if(previous){
      const index=FORMATION_TYPES.indexOf(previous);
      if(index>=0)weights[index]*=.62;
    }
    if(denseFormationStreak>=2){
      for(const dense of DENSE_FORMATIONS){
        const index=FORMATION_TYPES.indexOf(dense);
        if(index>=0)weights[index]*=.24;
      }
      for(const release of ['ISOLATED','OFFSET_GATE','DIAGONAL']){
        const index=FORMATION_TYPES.indexOf(release);
        if(index>=0)weights[index]*=1.18;
      }
    }

    return FORMATION_TYPES[weightedIndex(weights)];
  }

  function isOutsideSafeCorridor(x,safeX,gap){
    return Math.abs(x-safeX)>=gap;
  }

  function progressiveHazardKinds(kinds,progress=0,bias=1){
    const p=clamp(progress,0,1);
    if(p<=0)return kinds;
    const treeSwap=lerp(.025,.24,p)*bias;
    const rockSwap=lerp(.01,.075,p)*bias;
    return kinds.map(kind=>{
      const chance=kind==='tree'?treeSwap:kind==='rock'?rockSwap:0;
      if(chance<=0||random()>=chance)return kind;
      const oilBias=lerp(.46,.55,p);
      return random()<oilBias?'oil':'log';
    });
  }

  function addFormation(placements,type,z,safeX,{kinds=['tree','rock'],intensity=.5,landingProtected=false}={}){
    recordFormation(type);
    const decisionSerial=routeDecisionSerial++;
    const gap=landingProtected?T.LANDING_CORRIDOR_HALF_WIDTH:lerp(3.15,2.85,intensity);
    const kindAt=i=>kinds[(i+sectionIndex)%kinds.length];

    if(type==='STAGGER'){
      const phaseOffset=rand(-.7,.7);
      for(let i=0;i<obstacleLanes.length;i++){
        if(random()<.18)continue;
        const x=clamp(obstacleLanes[i]+rand(-.78,.78),-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
        if(!isOutsideSafeCorridor(x,safeX,gap))continue;
        const alternating=(i%2===0?-1:1)*rand(1.25,2.85);
        // Add a gentle lane-wise longitudinal sweep so a filtered STAGGER can
        // never collapse into a wide near-horizontal wall across the course.
        const laneSweep=(i-(obstacleLanes.length-1)*.5)*.55;
        const localZ=z+phaseOffset+alternating+laneSweep+rand(-.45,.45);
        placements.push(place(kindAt(i),x,localZ,safeX,{formation:type,decisionZ:z,routeDecision:true,landingProtected,decisionSerial}));
      }
      return;
    }

    if(type==='CLUSTER'){
      const side=safeX>=0?-1:1;
      const center=side*rand(8.1,11.15);
      const count=3+Math.floor(random()*3);
      for(let i=0;i<count;i++){
        const x=clamp(center+rand(-1.2,1.2),-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
        if(!isOutsideSafeCorridor(x,safeX,gap))continue;
        placements.push(place(kindAt(i),x,z+rand(-2.0,2.0),safeX,{formation:type,decisionZ:z,routeDecision:true,landingProtected,decisionSerial}));
      }
      return;
    }

    if(type==='ISOLATED'){
      const count=random()<.52?1:2;
      for(let i=0;i<count;i++){
        let x=contentX(z+rand(-2,2),pickBand(),.98);
        if(!isOutsideSafeCorridor(x,safeX,gap)){
          const side=x>=safeX?1:-1;
          x=clamp(safeX+side*(gap+rand(.8,2.4)),-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
        }
        placements.push(place(kindAt(i),x,z+rand(-1.2,1.2),safeX,{formation:type,decisionZ:z,routeDecision:true,landingProtected,decisionSerial}));
      }
      return;
    }

    if(type==='DIAGONAL'){
      const count=4+Math.floor(random()*2);
      const direction=random()<.5?-1:1;
      const startX=-direction*rand(9.0,11.65);
      for(let i=0;i<count;i++){
        const kind=kindAt(i);
        const x=clamp(startX+direction*i*rand(3.4,4.3)+rand(-.45,.45),-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
        const localZ=z+(i-(count-1)*.5)*rand(3.0,4.2)+rand(-.9,.9);
        if(!isOutsideSafeCorridor(x,safeX,gap))continue;
        placements.push(place(kind,x,localZ,safeX,{formation:type,decisionZ:z,routeDecision:true,landingProtected,decisionSerial}));
      }
      return;
    }

    if(type==='SCATTER'){
      const count=5+Math.floor(random()*3);
      const placed=[];
      for(let attempt=0;attempt<18&&placed.length<count;attempt++){
        const kind=kindAt(attempt);
        const x=rand(-T.COURSE_OBJECT_HALF_WIDTH+.25,T.COURSE_OBJECT_HALF_WIDTH-.25);
        const localZ=z+rand(-7.5,7.5);
        if(!isOutsideSafeCorridor(x,safeX,gap))continue;
        if(placed.some(p=>Math.abs(p.x-x)<2.0&&Math.abs(p.z-localZ)<2.9))continue;
        const entry=place(kind,x,localZ,safeX,{formation:type,decisionZ:z,routeDecision:true,landingProtected,decisionSerial});
        placements.push(entry);placed.push(entry);
      }
      return;
    }

    if(type==='OFFSET_GATE'){
      const leftX=clamp(safeX-gap-rand(.9,2.0),-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
      const rightX=clamp(safeX+gap+rand(.9,2.0),-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
      if(isOutsideSafeCorridor(leftX,safeX,gap))placements.push(place(kindAt(0),leftX,z-rand(.8,1.9),safeX,{formation:type,decisionZ:z,routeDecision:true,landingProtected,decisionSerial}));
      if(isOutsideSafeCorridor(rightX,safeX,gap))placements.push(place(kindAt(1),rightX,z+rand(.8,1.9),safeX,{formation:type,decisionZ:z,routeDecision:true,landingProtected,decisionSerial}));
      if(intensity>.62){
        const outer=lastThreatSide<=0?T.COURSE_OBJECT_HALF_WIDTH-.55:-(T.COURSE_OBJECT_HALF_WIDTH-.55);
        if(isOutsideSafeCorridor(outer,safeX,gap))placements.push(place(kindAt(2),outer,z+rand(-1.4,1.4),safeX,{formation:type,decisionZ:z,routeDecision:true,landingProtected,decisionSerial}));
      }
      return;
    }

    // EDGE_THREAT: pressure the true outer shoulder, but never invade the
    // guaranteed safe corridor. A staggered inner support keeps the player
    // moving without creating a fence-to-fence wall.
    let side;
    if(lastThreatSide===0)side=random()<.5?-1:1;
    else side=random()<.68?-lastThreatSide:lastThreatSide;
    const edgeMin=T.SIDE_HAZARD_ZONE_START;
    const edgeMax=Math.min(T.COURSE_OBJECT_HALF_WIDTH-.12,edgeMin+2.35);
    let edgeX=side*rand(edgeMin,edgeMax);
    if(!isOutsideSafeCorridor(edgeX,safeX,gap)){
      side=-side;
      edgeX=side*rand(edgeMin,edgeMax);
    }
    lastThreatSide=side;
    if(isOutsideSafeCorridor(edgeX,safeX,gap)){
      placements.push(place(kindAt(0),edgeX,z+rand(-1.1,1.1),safeX,{formation:type,decisionZ:z,routeDecision:true,landingProtected,decisionSerial}));
    }
    if(random()<.76){
      const supportX=clamp(side*rand(6.7,9.25),-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
      if(isOutsideSafeCorridor(supportX,safeX,gap)){
        placements.push(place(kindAt(1),supportX,z+rand(-2.6,2.6),safeX,{formation:type,decisionZ:z,routeDecision:true,landingProtected,decisionSerial}));
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
        const horizontal=Math.max(.42,Math.min(1.35,(collisionHalfWidth(a.kind)+collisionHalfWidth(b.kind))*.42));
        const longitudinal=Math.max(.52,Math.min(.72,(collisionHalfDepth(a.kind)+collisionHalfDepth(b.kind))*.55));
        if(Math.abs(a.x-b.x)<horizontal&&Math.abs(a.z-b.z)<longitudinal){
          placements.splice(i,1);
          break;
        }
      }
    }
  }

  function spacing(speed,intense=false,scale=1){
    const speed01=getSpeedProgress(speed);
    const min=intense?T.COURSE_INTENSE_SPACING_MIN:T.COURSE_NORMAL_SPACING_MIN;
    const max=intense?T.COURSE_INTENSE_SPACING_MAX:T.COURSE_NORMAL_SPACING_MAX;
    // At high speed the same geometric row spacing reads much denser in time.
    // Scale longitudinal breathing room with speed while preserving each
    // section family's authored intensity.
    const speedScale=lerp(.94,1.20,speed01);
    return rand(min,max)*speedScale*scale;
  }

  function addSpecialHazard(placements,startZ,length,safeHint=0,chance=.64,progress=0,postMaxPressure=0){
    const p=clamp(progress,0,1);
    const post=clamp(postMaxPressure,0,1);
    const effectiveChance=clamp(chance+p*.14+post*.08,0,.98);
    if(random()>effectiveChance)return false;
    const safe=clamp(safeHint,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
    const roll=random();
    // Wide horizontal logs are a stronger part of the mix at every speed,
    // then gain a little more weight during the post-300 pressure ramp.
    const oilCut=lerp(.40,.46,p);
    const wideCut=Math.min(.94,oilCut+lerp(.40,.44,clamp(p*.55+post*.45,0,1)));
    const kind=roll<oilCut?'oil':roll<wideCut?'wideLog':'log';
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


  function pickSideHazardKind(progress=0){
    const p=clamp(progress,0,1);
    const roll=random();
    const oilCut=lerp(.20,.32,p);
    const logCut=oilCut+lerp(.30,.35,p);
    const rockCut=logCut+.20;
    return roll<oilCut?'oil':roll<logCut?'log':roll<rockCut?'rock':'tree';
  }

  function addSideHazardPressure(
    placements,
    startZ,
    length,
    safeHint=0,
    chance=T.SIDE_HAZARD_SECTION_CHANCE,
    progress=0,
    postMaxPressure=0
  ){
    const p=clamp(progress,0,1);
    const post=clamp(postMaxPressure,0,1);
    const effectiveChance=clamp(chance+p*.10+post*.12,0,.97);
    if(random()>effectiveChance)return 0;

    const safe=clamp(safeHint,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
    const secondChance=clamp(T.SIDE_HAZARD_SECOND_CHANCE+p*.10+post*.18,0,.72);
    const count=1+(random()<secondChance?1:0);
    const minZ=startZ-length+12;
    const maxZ=startZ-12;
    let side=lastThreatSide===0?(random()<.5?-1:1):(random()<.72?-lastThreatSide:lastThreatSide);
    let previousZ=null;
    let added=0;

    for(let slot=0;slot<count;slot++){
      let placed=false;
      for(let attempt=0;attempt<16&&!placed;attempt++){
        const kind=pickSideHazardKind(p);
        const limit=placementCenterLimit(kind);
        if(limit<T.SIDE_HAZARD_ZONE_START+.12)continue;

        const shoulderMin=Math.max(T.SIDE_HAZARD_ZONE_START,limit-rand(.22,1.08));
        const x=side*rand(shoulderMin,Math.max(shoulderMin,limit-.04));
        let z=startZ-rand(14,Math.max(16,length-14));
        if(previousZ!=null&&Math.abs(z-previousZ)<8){
          z=clamp(previousZ-rand(8,13),minZ,maxZ);
        }

        // Preserve a real steering gap to the tracked safe route and prevent
        // same-depth opposite-edge pairs from becoming a horizontal trap wall.
        const routeGap=collisionHalfWidth(kind)+.72;
        if(Math.abs(x-safe)<=routeGap)continue;
        if(placements.some(existing=>{
          if(!PHYSICAL_HAZARDS.has(existing.kind))return false;
          const dz=Math.abs(existing.z-z);
          if(dz<3.8)return true;
          return Math.sign(existing.x)===side&&Math.abs(existing.x-x)<1.7&&dz<6.5;
        }))continue;

        placements.push(place(kind,x,z,safe,{
          formation:'EDGE_THREAT',
          sidePressure:true
        }));
        previousZ=z;
        lastThreatSide=side;
        if(slot===0&&count>1)side=-side;
        added++;
        placed=true;
      }
    }
    return added;
  }

  function addSparseGapPressure(placements,startZ,length,safeHint=0,postMaxPressure=0){
    const pressure=clamp(postMaxPressure,0,1);
    if(pressure<=0)return 0;

    const chance=clamp(.38+pressure*.62,0,1);
    if(random()>chance)return 0;

    const safe=clamp(safeHint,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
    const maxExtra=Math.max(1,Math.floor(T.POST_MAX_HAZARD_MAX_EXTRA_PER_SECTION||3));
    const target=Math.min(
      maxExtra,
      pressure<.34?1:pressure<.68?2:3
    );
    const topZ=startZ-10;
    const bottomZ=startZ-length+10;
    const occupied=placements
      .filter(p=>PHYSICAL_HAZARDS.has(p.kind)&&p.z<=topZ&&p.z>=bottomZ)
      .map(p=>p.z)
      .sort((a,b)=>b-a);
    occupied.unshift(topZ);
    occupied.push(bottomZ);

    let added=0;
    while(added<target){
      let bestIndex=-1;
      let bestGap=0;
      for(let i=0;i<occupied.length-1;i++){
        const gap=occupied[i]-occupied[i+1];
        if(gap>bestGap){
          bestGap=gap;
          bestIndex=i;
        }
      }
      if(bestIndex<0||bestGap<9.2)break;

      const upper=occupied[bestIndex];
      const lower=occupied[bestIndex+1];
      const z=(upper+lower)*.5+rand(-Math.min(1.4,bestGap*.10),Math.min(1.4,bestGap*.10));

      const roll=random();
      const wideCut=.38+pressure*.18;
      const oilCut=wideCut+.18;
      const logCut=oilCut+.22;
      const preferredKind=roll<wideCut?'wideLog':roll<oilCut?'oil':roll<logCut?'log':'rock';
      const kindOrder=[preferredKind,'wideLog','log','oil','rock'].filter((kind,index,list)=>list.indexOf(kind)===index);
      const preferredSide=(added+sectionIndex)%2===0?-1:1;
      let placed=false;

      for(const kind of kindOrder){
        const limit=placementCenterLimit(kind);
        const routeGap=collisionHalfWidth(kind)+(kind==='wideLog'?1.18:.86);
        for(const side of [preferredSide,-preferredSide]){
          const x=clamp(
            safe+side*(routeGap+rand(.55,2.45)),
            -limit,
            limit
          );
          if(Math.abs(x-safe)<=routeGap)continue;
          if(placements.some(p=>
            PHYSICAL_HAZARDS.has(p.kind)&&
            Math.abs(p.z-z)<6.2&&
            Math.abs(p.x-x)<collisionHalfWidth(p.kind)+collisionHalfWidth(kind)+.55
          ))continue;

          placements.push(place(kind,x,z,safe,{
            formation:'ISOLATED',
            postMaxPressure:true,
            densityBoost:pressure
          }));
          occupied.splice(bestIndex+1,0,z);
          added++;
          placed=true;
          break;
        }
        if(placed)break;
      }

      if(!placed){
        // Mark this gap as unavailable so another iteration tries a different
        // empty patch instead of repeatedly probing the same geometry.
        occupied.splice(bestIndex+1,0,(upper+lower)*.5);
      }
    }

    return added;
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
    // Advanced runs can chain another jump after a genuinely clear recovery
    // section, so the player lands, regains line choice, then sees the next lip.
    if(lastType==='RECOVERY'&&difficulty>.66&&random()<.48){
      options.push('RAMP','LOG JUMP');
    }

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
        const insideTouchdownWindow=
          actualDistance>=envelope.protectedStartDistance&&
          actualDistance<=envelope.protectedEndDistance;
        if(insideTouchdownWindow)placement.landingProtected=true;
        const invadesTouchdown=
          insideTouchdownWindow&&
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

  function next({startZ,difficulty=0,speed,postMaxTime=0}){
    const currentSpeed=effectiveSpeed(speed,difficulty);
    const type=chooseType(difficulty);
    const hazardProgress=clamp(difficulty*.55+getSpeedProgress(currentSpeed)*.45,0,1);
    const elapsedPostMax=Math.max(0,Number(postMaxTime)||0);
    const postMaxPressure=elapsedPostMax>0
      ?clamp(
        T.POST_MAX_HAZARD_START_PRESSURE+
          (elapsedPostMax/Math.max(1,T.POST_MAX_HAZARD_RAMP_SECONDS))*
          (1-T.POST_MAX_HAZARD_START_PRESSURE),
        T.POST_MAX_HAZARD_START_PRESSURE,
        1
      )
      :0;
    const placements=[];
    const phase=sectionIndex*.73;
    const sectionBand=pickBand();
    const anchor=clamp(contentX(startZ-18,sectionBand,.90),-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
    let length=86;

    if(type==='OPEN CARVE'){
      length=112;
      let z=startZ-20;
      const sequence=['ISOLATED','DIAGONAL','ISOLATED','OFFSET_GATE'];
      for(let i=0;i<sequence.length;i++){
        const desired=clamp(anchor+Math.sin(phase+i*.92)*4.6,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
        const safeX=safeRoute.constrain(desired,z,currentSpeed);
        addFormation(
          placements,
          sequence[i],
          z,
          safeX,
          {kinds:progressiveHazardKinds(['tree','rock'],hazardProgress,.62),intensity:.28}
        );
        z-=spacing(currentSpeed,false,1.12);
      }
      addSpecialHazard(placements,startZ,length,safeRoute.previousSafeX,.54,hazardProgress,postMaxPressure);
      addSideHazardPressure(placements,startZ,length,safeRoute.previousSafeX,.58,hazardProgress,postMaxPressure);
      addBananaEvent(placements,startZ,length,safeRoute.previousSafeX,.68);
    }

    if(type==='GATE'){
      length=116;
      const rows=6;
      let z=startZ-18;
      for(let i=0;i<rows;i++){
        const direction=i%2===0?1:-1;
        const desired=clamp(anchor+direction*(2.5+Math.sin(phase+i*.61)*1.8),-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
        const safeX=safeRoute.constrain(desired,z,currentSpeed);
        const formation=i===3?'DIAGONAL':'OFFSET_GATE';
        addFormation(
          placements,
          formation,
          z,
          safeX,
          {kinds:progressiveHazardKinds(i%2?['tree','rock']:['rock','tree'],hazardProgress,.78),intensity:.60}
        );
        z-=spacing(currentSpeed,false,.94);
      }
      addSpecialHazard(placements,startZ,length,safeRoute.previousSafeX,.58,hazardProgress,postMaxPressure);
      addSideHazardPressure(placements,startZ,length,safeRoute.previousSafeX,.66,hazardProgress,postMaxPressure);
      addBananaEvent(placements,startZ,length,safeRoute.previousSafeX,.60);
    }

    if(type==='BANANA LINE'){
      length=108;
      let z=startZ-22;
      const sequence=['ISOLATED','DIAGONAL','ISOLATED','SCATTER'];
      for(let i=0;i<sequence.length;i++){
        const safeX=safeAt(z,currentSpeed,anchor,3.0);
        addFormation(
          placements,
          sequence[i],
          z,
          safeX,
          {kinds:progressiveHazardKinds(['rock','tree'],hazardProgress,.58),intensity:.30}
        );
        z-=spacing(currentSpeed,false,1.08);
      }
      addSpecialHazard(placements,startZ,length,safeRoute.previousSafeX,.44,hazardProgress,postMaxPressure);
      addSideHazardPressure(placements,startZ,length,safeRoute.previousSafeX,.50,hazardProgress,postMaxPressure);
      addBananaEvent(placements,startZ,length,safeRoute.previousSafeX,.98);
    }

    if(type==='FOREST'){
      length=128;
      const rows=7;
      let z=startZ-18;
      for(let i=0;i<rows;i++){
        const desired=clamp(anchor+Math.sin(phase+i*.86)*4.8,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
        const safeX=safeRoute.constrain(desired,z,currentSpeed);
        const formation=i%3===1?'STAGGER':'OFFSET_GATE';
        addFormation(
          placements,
          formation,
          z,
          safeX,
          {kinds:progressiveHazardKinds(['tree','tree','tree','rock'],hazardProgress,.92),intensity:.68}
        );
        z-=spacing(currentSpeed,true,1.02);
      }
      addSpecialHazard(placements,startZ,length,safeRoute.previousSafeX,.54,hazardProgress,postMaxPressure);
      addSideHazardPressure(placements,startZ,length,safeRoute.previousSafeX,.76,hazardProgress,postMaxPressure);
      addBananaEvent(placements,startZ,length,safeRoute.previousSafeX,.50);
    }

    if(type==='ROCK SLALOM'){
      length=126;
      const rows=7;
      let z=startZ-18;
      let desired=anchor;
      for(let i=0;i<rows;i++){
        desired=clamp(desired+(i%2?1:-1)*rand(3.6,5.2),-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
        const safeX=safeRoute.constrain(desired,z,currentSpeed);
        addFormation(
          placements,
          'OFFSET_GATE',
          z,
          safeX,
          {kinds:progressiveHazardKinds(['rock','rock','rock','tree'],hazardProgress,.56),intensity:.84}
        );
        z-=spacing(currentSpeed,true,.98);
      }
      addSpecialHazard(placements,startZ,length,safeRoute.previousSafeX,.50,hazardProgress,postMaxPressure);
      addSideHazardPressure(placements,startZ,length,safeRoute.previousSafeX,.70,hazardProgress,postMaxPressure);
      addBananaEvent(placements,startZ,length,safeRoute.previousSafeX,.56);
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
      length=108;
      // Recovery is deliberately hazard-free. It acts as a visual and input
      // reset after jumps/dense sections while still advancing the safe route.
      let z=startZ-24;
      let safeX=safeRoute.constrain(recoveryAnchor,z,currentSpeed);
      placements.push(banana(z,safeX,safeX));

      z-=spacing(currentSpeed,false,1.18);
      safeX=safeRoute.constrain(recoveryAnchor*.45,z,currentSpeed);
      placements.push(banana(z,safeX,safeX));

      z-=spacing(currentSpeed,false,1.12);
      safeX=safeRoute.constrain(0,z,currentSpeed);
      if(random()<.78)placements.push(banana(z,safeX,safeX));
      pendingLanding=null;
    }

    // Once 300 km/h has been reached, fill otherwise-empty longitudinal
    // patches gradually. Jump sections keep their existing protected flight /
    // landing envelopes and are intentionally excluded from this density pass.
    if(type!=='RAMP'&&type!=='LOG JUMP'&&type!=='RECOVERY'){
      addSparseGapPressure(
        placements,
        startZ,
        length,
        safeRoute.previousSafeX,
        postMaxPressure
      );
    }

    pruneExcessiveOverlap(placements);

    // Preserve the exact procedural generation/pruning result, then fit only the
    // final X coordinate to the flag-safe visual corridor.
    for(const placement of placements){
      placement.x=boundedPlacementX(placement.kind,placement.x,placement.safeX,placement);
      placement.section=type;
    }
    // Boundary fitting can collapse two formerly separate edge hazards onto the
    // same legal X. Re-prune only those final physical overlaps.
    pruneExcessiveOverlap(placements);
    lastType=type;
    sectionIndex++;
    return {
      type,
      placements,
      endZ:startZ-length,
      length,
      speed:currentSpeed,
      hazardProgress,
      postMaxPressure,
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
      routeDecisionSerial=0;
      recentFormations=[];
      denseFormationStreak=0;
      safeRoute.reset(0,null);
    },
    get lastType(){return lastType;},
    get sectionIndex(){return sectionIndex;},
    get previousSafeX(){return safeRoute.previousSafeX;},
    get previousSafeZ(){return safeRoute.previousSafeZ;},
    get pendingLanding(){return pendingLanding;}
  };
}
