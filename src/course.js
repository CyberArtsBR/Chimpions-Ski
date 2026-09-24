import {SKI_TUNING as T,getSpeedProgress} from './gameplayTuning.js';
import {OBSTACLE_TUNING,obstacleCollisionHalfWidth,obstacleHalfDepth} from './obstacleTuning.js';
import {estimateRampFlightEnvelope} from './rampTrajectory.js';
import {createSafeRouteTracker,maxHumanReachableLateralDelta,validateReachableCorridor} from './courseSafety.js';
import {createExpertRunDirector} from './courseRunDirector.js';
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
  const distancePart=clamp(distance/2200,0,1);
  // Keep the recent expert-style route pressure, but soften the global
  // difficulty curve slightly so the denser course is a little more forgiving.
  return clamp((speedPart*.64+distancePart*.36)*.95,0,1);
}

export function createCourseDirector({routeCenter,random=Math.random}){
  let lastType='RECOVERY';
  let sectionIndex=0;
  let recentBands=[3];
  let pendingLanding=null;
  let edgeThreatCountdown=2;
  let lastThreatSide=0;
  let routeDecisionSerial=0;
  let recentFormations=[];
  let denseFormationStreak=0;
  const safeRoute=createSafeRouteTracker(0,null);
  const runDirector=createExpertRunDirector({random});

  // Bands guide macro route choices only. Physical hazards themselves are
  // placed continuously so the player cannot memorize a seven-column grid.
  const bands=[-1,-.68,-.34,0,.34,.68,1];
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
  const banana=(z,x,safeX=x,extra={})=>place('banana',x,z,safeX,extra);

  function desiredSafe(z,base=0,range=4.4){
    const band=contentX(z,pickBand(),.86);
    return clamp(
      band*.48+base*.34+Math.sin(sectionIndex*.77-z*.017)*range,
      -T.SAFE_ROUTE_HALF_WIDTH,
      T.SAFE_ROUTE_HALF_WIDTH
    );
  }

  function safeAt(z,speed,base=0,range=4.4){
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
      edgeThreatCountdown=2+Math.floor(random()*2);
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
    const gap=landingProtected?T.LANDING_CORRIDOR_HALF_WIDTH:lerp(2.82,2.28,intensity);
    const kindAt=i=>kinds[(i+sectionIndex)%kinds.length];
    const localPhysical=[];
    const antiAligned=(x,localZ)=>localPhysical.some(p=>
      (Math.abs(p.z-localZ)<1.65&&Math.abs(p.x-x)>1.8)||
      (Math.abs(p.x-x)<1.15&&Math.abs(p.z-localZ)<9.5)
    );
    const pushPhysical=(kind,x,localZ,extra={})=>{
      if(!isOutsideSafeCorridor(x,safeX,gap))return false;
      if(antiAligned(x,localZ))return false;
      const entry=place(kind,x,localZ,safeX,{
        formation:type,
        decisionZ:z,
        routeDecision:true,
        landingProtected,
        decisionSerial,
        ...extra
      });
      placements.push(entry);
      if(PHYSICAL_HAZARDS.has(kind))localPhysical.push(entry);
      return true;
    };

    if(type==='STAGGER'){
      const target=6+Math.floor(intensity*3)+Math.floor(random()*2);
      let added=0;
      for(let attempt=0;attempt<34&&added<target;attempt++){
        const kind=kindAt(attempt);
        const x=rand(-T.COURSE_OBJECT_HALF_WIDTH+.35,T.COURSE_OBJECT_HALF_WIDTH-.35);
        const localZ=z+rand(-8.8,8.8)+(x/T.COURSE_OBJECT_HALF_WIDTH)*rand(-2.3,2.3);
        if(pushPhysical(kind,x,localZ,{brokenField:true}))added++;
      }
      return;
    }

    if(type==='CLUSTER'){
      const side=safeX>=0?-1:1;
      const center=side*rand(7.2,10.7);
      const count=5+Math.floor(random()*3);
      for(let i=0;i<count;i++){
        const kind=kindAt(i);
        const sweep=(i-(count-1)*.5)*1.35;
        const x=clamp(center+rand(-2.15,2.15)+sweep*.22,-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
        const localZ=z+sweep+rand(-2.7,2.7);
        pushPhysical(kind,x,localZ,{brokenCluster:true});
      }
      return;
    }

    if(type==='ISOLATED'){
      const count=2+Math.floor(random()*3);
      let added=0;
      for(let attempt=0;attempt<18&&added<count;attempt++){
        const kind=kindAt(attempt);
        let x=rand(-T.COURSE_OBJECT_HALF_WIDTH+.3,T.COURSE_OBJECT_HALF_WIDTH-.3);
        if(!isOutsideSafeCorridor(x,safeX,gap)){
          const side=random()<.5?-1:1;
          x=clamp(safeX+side*(gap+rand(.55,3.15)),-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
        }
        const localZ=z+rand(-6.4,6.4);
        if(pushPhysical(kind,x,localZ,{irregularIsolated:true}))added++;
      }
      return;
    }

    if(type==='DIAGONAL'){
      const count=6+Math.floor(random()*2);
      const direction=random()<.5?-1:1;
      const startX=-direction*rand(9.2,11.8);
      for(let i=0;i<count;i++){
        const kind=kindAt(i);
        const step=3.0+random()*1.45;
        const x=clamp(startX+direction*i*step+rand(-1.05,1.05),-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
        const curve=Math.sin((i+1)*1.31+sectionIndex*.47)*2.2;
        const localZ=z+(i-(count-1)*.5)*rand(2.25,3.55)+curve+rand(-1.3,1.3);
        pushPhysical(kind,x,localZ,{brokenDiagonal:true});
      }
      return;
    }

    if(type==='SCATTER'){
      const count=8+Math.floor(intensity*4)+Math.floor(random()*2);
      let added=0;
      for(let attempt=0;attempt<46&&added<count;attempt++){
        const kind=kindAt(attempt);
        const x=rand(-T.COURSE_OBJECT_HALF_WIDTH+.25,T.COURSE_OBJECT_HALF_WIDTH-.25);
        const localZ=z+rand(-10.5,10.5);
        if(pushPhysical(kind,x,localZ,{denseScatter:true}))added++;
      }
      return;
    }

    if(type==='OFFSET_GATE'){
      const primarySide=random()<.5?-1:1;
      const nearX=clamp(safeX+primarySide*(gap+rand(.55,1.55)),-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
      const oppositeX=clamp(safeX-primarySide*(gap+rand(1.0,2.65)),-T.COURSE_OBJECT_HALF_WIDTH,T.COURSE_OBJECT_HALF_WIDTH);
      pushPhysical(kindAt(0),nearX,z-rand(2.0,4.8),{brokenGate:true});
      pushPhysical(kindAt(1),oppositeX,z+rand(2.1,5.2),{brokenGate:true});
      const supportCount=intensity>.48?2:1;
      for(let i=0;i<supportCount;i++){
        const side=i%2===0?primarySide:-primarySide;
        const x=clamp(
          safeX+side*(gap+rand(2.4,5.2)),
          -T.COURSE_OBJECT_HALF_WIDTH,
          T.COURSE_OBJECT_HALF_WIDTH
        );
        pushPhysical(kindAt(i+2),x,z+rand(-7.2,7.2),{brokenGate:true});
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
      pushPhysical(kindAt(0),edgeX,z+rand(-4.2,4.2),{edgePressure:true});
    }
    const supportCount=random()<.58?2:1;
    for(let i=0;i<supportCount;i++){
      const supportSide=i===0?side:-side;
      const supportX=clamp(
        supportSide*rand(6.3,10.15),
        -T.COURSE_OBJECT_HALF_WIDTH,
        T.COURSE_OBJECT_HALF_WIDTH
      );
      pushPhysical(kindAt(i+1),supportX,z+rand(-7.0,7.0),{edgePressure:true});
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
      placements.push(place(kind,x,z,safe,{formation:'SCATTER',special:true,safetyOptional:true}));
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
          sidePressure:true,
          safetyOptional:true
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
      pressure<.25?1:pressure<.50?2:pressure<.78?3:4
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
      // At full post-max pressure, allow a smaller longitudinal pocket
      // only when the later lateral-overlap and reachable-corridor guards also
      // accept it. This makes the +300 km/h escalation dependable without
      // forming horizontal walls or weakening the protected route.
      const minimumGap=lerp(9.2,7.4,pressure);
      if(bestIndex<0||bestGap<minimumGap)break;

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
            densityBoost:pressure,
            safetyOptional:true
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

  function addIrregularFieldPressure(placements,startZ,length,progress=0,postMaxPressure=0){
    const p=clamp(progress,0,1);
    const post=clamp(postMaxPressure,0,1);
    const topZ=startZ-10;
    const bottomZ=startZ-length+10;
    if(bottomZ>=topZ)return 0;

    const target=4+Math.floor(p*7)+Math.floor(post*3);
    const physical=()=>placements.filter(item=>PHYSICAL_HAZARDS.has(item.kind));
    const nearestSafe=z=>{
      let best=null;
      let bestDistance=Infinity;
      for(const item of placements){
        if(!Number.isFinite(item.safeX))continue;
        const distance=Math.abs(item.z-z);
        if(distance<bestDistance){
          bestDistance=distance;
          best=item;
        }
      }
      return clamp(best?.safeX??safeRoute.previousSafeX,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
    };

    let added=0;
    for(let attempt=0;attempt<90&&added<target;attempt++){
      const z=rand(bottomZ,topZ);
      const safe=nearestSafe(z);
      const roll=random();
      const kind=roll<.48?'tree':roll<.78?'rock':roll<.90?'log':'oil';
      const limit=placementCenterLimit(kind);
      let x=rand(-limit,limit);
      const routeGap=collisionHalfWidth(kind)+lerp(.72,.34,p);
      if(Math.abs(x-safe)<=routeGap){
        const side=random()<.5?-1:1;
        x=clamp(safe+side*(routeGap+rand(.45,3.4)),-limit,limit);
      }
      if(Math.abs(x-safe)<=routeGap)continue;

      const hazards=physical();
      if(hazards.some(existing=>{
        const dx=Math.abs(existing.x-x);
        const dz=Math.abs(existing.z-z);
        const collisionGap=collisionHalfWidth(existing.kind)+collisionHalfWidth(kind)+.34;
        if(dx<collisionGap&&dz<2.25)return true;
        // Avoid obvious horizontal rows and vertical columns. Nearby hazards
        // should form broken diagonals / offset pockets rather than a grid.
        if(dz<1.75&&dx>2.0)return true;
        if(dx<1.20&&dz<10.0)return true;
        return false;
      }))continue;

      placements.push(place(kind,x,z,safe,{
        formation:'SCATTER',
        irregularField:true,
        densityBoost:p,
        safetyOptional:true
      }));
      added++;
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

  function chooseType(difficulty,runPlan=null){
    if(sectionIndex<opening.length)return opening[sectionIndex];
    if(lastType==='RAMP'||lastType==='LOG JUMP')return 'RECOVERY';
    if(runPlan?.phase==='RECOVERY')return 'RECOVERY';

    const transitions={
      'RECOVERY':['OPEN CARVE','GATE','FOREST','BANANA LINE'],
      'OPEN CARVE':['GATE','FOREST','ROCK SLALOM','BANANA LINE','RAMP'],
      'GATE':['OPEN CARVE','FOREST','ROCK SLALOM','BANANA LINE','RAMP'],
      'BANANA LINE':['OPEN CARVE','GATE','FOREST','RAMP'],
      'FOREST':['OPEN CARVE','GATE','ROCK SLALOM','RAMP'],
      'ROCK SLALOM':['OPEN CARVE','GATE','FOREST','RAMP']
    };
    const options=[...(transitions[lastType]||['OPEN CARVE'])];

    if(difficulty>.42&&lastType==='OPEN CARVE'&&random()<.30)options.push('LOG JUMP');
    if(lastType!=='RECOVERY'&&random()<(.14+difficulty*.10))options.push('RAMP');

    if(runPlan?.preferredSections?.length){
      const repeats=1+Math.floor((runPlan.intensity||0)*2);
      const postPressure=clamp(Number(runPlan.postMaxPressure)||0,0,1);
      const preferred=postPressure>.45
        ?runPlan.preferredSections.filter(type=>type!=='RAMP'&&type!=='LOG JUMP')
        :runPlan.preferredSections;
      for(let repeat=0;repeat<repeats;repeat++)options.push(...(preferred.length?preferred:runPlan.preferredSections));
    }

    if(difficulty>.45)options.push('FOREST','ROCK SLALOM');
    if(difficulty>.62)options.push('FOREST','ROCK SLALOM','RAMP');
    if(difficulty>.78)options.push('LOG JUMP','RAMP','FOREST','ROCK SLALOM');

    if(lastType==='RECOVERY'&&difficulty>.58&&random()<(.46+difficulty*.24)){
      options.push('RAMP','LOG JUMP','RAMP');
    }
    if(runPlan?.phase==='TRICK'&&lastType!=='RAMP'&&lastType!=='LOG JUMP'){
      options.push('RAMP','LOG JUMP');
    }
    if(runPlan?.phase==='EXPERT'){
      const expertPost=clamp(Number(runPlan.postMaxPressure)||0,0,1);
      options.push('ROCK SLALOM','FOREST','GATE');
      if(expertPost<=.45)options.push('LOG JUMP');
    }

    // Sustained top-speed pressure must increase actual playable density, not
    // merely swap the phase label. Bias toward dense non-jump families so the
    // post-300 sparse-gap pass has room to add fair, route-safe hazards.
    const postMaxPressure=clamp(Number(runPlan?.postMaxPressure)||0,0,1);
    if(postMaxPressure>0){
      const repeats=1+Math.floor(postMaxPressure*3);
      for(let i=0;i<repeats;i++){
        options.push('FOREST','ROCK SLALOM','GATE','OPEN CARVE');
      }
    }

    return options[Math.floor(random()*options.length)]||'OPEN CARVE';
  }

  function addExpertPattern(placements,{
    plan,
    startZ,
    length,
    currentSpeed,
    startSafeX=0
  }){
    if(!plan?.pattern||plan.phase==='RECOVERY')return {added:0,bananas:0};

    const before=placements.length;
    let bananaCount=0;
    let rewardCursor={x:startSafeX,z:startZ};
    const patternRoute=createSafeRouteTracker(startSafeX,startZ);
    const gap=lerp(26,22,plan.intensity);
    const shift=plan.routeShift;
    const side=plan.side||1;
    const pattern=plan.pattern;
    const phase=plan.phase;

    const tagNew=(from,extra={})=>{
      for(let i=from;i<placements.length;i++){
        placements[i].expertOverlay=true;
        placements[i].expertPattern=pattern;
        placements[i].runPhase=phase;
        placements[i].safetyOptional=true;
        // Legacy routeDecision metadata describes the single tracked fallback
        // route. Expert overlays are validated by reachable intervals instead.
        placements[i].routeDecision=false;
        Object.assign(placements[i],extra);
      }
    };

    const decision=(target,z,formation,kinds=['tree','rock'],intensity=.56)=>{
      const safeX=patternRoute.constrain(
        clamp(target,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH),
        z,
        currentSpeed
      );
      const from=placements.length;
      addFormation(placements,formation,z,safeX,{kinds,intensity});
      tagNew(from,{commitmentDecision:true});
      return safeX;
    };

    const addRiskBanana=(z,x,safeX,tier=2,extra={})=>{
      const rewardTier=clamp(Math.round(tier),1,3);
      const reach=maxHumanReachableLateralDelta(z-rewardCursor.z,currentSpeed);
      const reachableX=clamp(
        x,
        rewardCursor.x-reach*.92,
        rewardCursor.x+reach*.92
      );
      const clampedX=clamp(
        reachableX,
        -T.COURSE_OBJECT_HALF_WIDTH,
        T.COURSE_OBJECT_HALF_WIDTH
      );
      placements.push(banana(
        z,
        clampedX,
        safeX,
        {
          riskReward:rewardTier,
          rewardPoints:55+rewardTier*35,
          rewardRoute:true,
          rewardRouteStep:bananaCount,
          rewardRouteFromX:rewardCursor.x,
          rewardRouteReach:reach,
          expertPattern:pattern,
          runPhase:phase,
          ...extra
        }
      ));
      rewardCursor={x:clampedX,z};
      bananaCount++;
      return clampedX;
    };

    const pushExpertHazard=(kind,x,z,safeX,extra={})=>{
      const routeGap=collisionHalfWidth(kind)+.58;
      if(Math.abs(x-safeX)<=routeGap)return false;
      if(placements.some(existing=>{
        if(!PHYSICAL_HAZARDS.has(existing.kind))return false;
        const dx=Math.abs(existing.x-x);
        const dz=Math.abs(existing.z-z);
        return (dz<1.75&&dx>1.8)||(dx<1.12&&dz<8.8);
      }))return false;
      placements.push(place(kind,x,z,safeX,{
        expertOverlay:true,
        expertPattern:pattern,
        runPhase:phase,
        safetyOptional:true,
        commitmentDecision:true,
        ...extra
      }));
      return true;
    };

    const z0=startZ-Math.min(27,Math.max(20,length*.22));

    if(pattern==='FUNNEL'){
      decision(startSafeX*.45,z0,'DIAGONAL',['tree','rock'],.40+plan.intensity*.18);
      const exit=decision(side*shift*.82,z0-gap,'OFFSET_GATE',['rock','tree'],.54+plan.intensity*.18);
      addRiskBanana(z0-gap-6,exit+side*1.15,exit,plan.intensity>.74?2:1);
    }

    if(pattern==='CROSS_COURSE'){
      decision(-side*shift*.62,z0,'ISOLATED',['rock','tree'],.42);
      decision(side*shift*.08,z0-gap,'OFFSET_GATE',['tree','rock'],.56);
      const third=decision(side*shift*.84,z0-gap*2,'DIAGONAL',['rock','tree'],.58+plan.intensity*.16);
      if(plan.phase==='RISK_REWARD'||plan.phase==='EXPERT'){
        addRiskBanana(z0-gap*2-5,third+side*.9,third,2);
      }
    }

    if(pattern==='FORK'){
      const easy=patternRoute.constrain(side*shift*.46,z0,currentSpeed);
      const hard=clamp(
        -side*Math.min(T.SAFE_ROUTE_HALF_WIDTH,shift*1.12),
        -T.SAFE_ROUTE_HALF_WIDTH,
        T.SAFE_ROUTE_HALF_WIDTH
      );
      pushExpertHazard('tree',side*.7,z0,easy,{forkDivider:true});
      pushExpertHazard('rock',-side*.8,z0-gap*.28,easy,{forkDivider:true});
      decision(easy,z0-gap,'ISOLATED',['tree','rock'],.42);
      addRiskBanana(z0-gap*.48,hard,hard,2,{forkRoute:true});
      addRiskBanana(z0-gap*1.16,hard+side*.75,hard,plan.intensity>.72?3:2,{forkRoute:true});
      const rejoinX=addRiskBanana(z0-gap*1.78,easy,easy,1,{rewardRejoin:true});
      decision(rejoinX,z0-gap*2.12,'OFFSET_GATE',['rock','tree'],.44);
    }

    if(pattern==='COMMITMENT'){
      const committed=decision(side*shift*.78,z0,'OFFSET_GATE',['oil','rock'],.58);
      decision(side*shift*.88,z0-gap,'ISOLATED',['tree','tree','rock'],.62);
      decision(side*shift*.42,z0-gap*2,'OFFSET_GATE',['rock','tree'],.54);
      addRiskBanana(z0-gap-5,committed+side*.72,committed,2);
    }

    if(pattern==='OFFSET_CHICANE'){
      const amplitude=shift*.62;
      decision(side*amplitude,z0,'OFFSET_GATE',['rock','tree'],.62);
      // Break the visual/decision rhythm through the center of the chicane.
      // This keeps the same pressure and obstacle count without producing a
      // memorisable stack of identical gate formations across section seams.
      const middle=decision(-side*amplitude*.88,z0-gap,'DIAGONAL',['tree','rock'],.66);
      decision(side*amplitude*.78,z0-gap*2,'OFFSET_GATE',['rock','tree'],.68);
      if(plan.intensity>.64)addRiskBanana(z0-gap-4,middle-side*.7,middle,2);
    }

    if(pattern==='EDGE_RISK'){
      const inner=patternRoute.constrain(-side*shift*.28,z0,currentSpeed);
      const edgeX=side*(T.COURSE_OBJECT_HALF_WIDTH-1.05);
      pushExpertHazard('log',side*(T.SIDE_HAZARD_ZONE_START-.65),z0-gap*.25,inner,{edgeRisk:true});
      decision(inner,z0-gap,'DIAGONAL',['rock','tree'],.46);
      addRiskBanana(z0-gap*.62,edgeX,inner,2,{edgeRisk:true});
      addRiskBanana(z0-gap*1.26,edgeX-side*.65,inner,plan.intensity>.68?3:2,{edgeRisk:true});
      const rejoinX=addRiskBanana(z0-gap*1.82,inner+side*1.1,inner,1,{rewardRejoin:true});
      decision(rejoinX,z0-gap*2.14,'ISOLATED',['tree','rock'],.40);
    }

    if(pattern==='BAIT_LINE'){
      const bait1=clamp(startSafeX+side*shift*.34,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
      const bait2=clamp(startSafeX+side*shift*.68,-T.SAFE_ROUTE_HALF_WIDTH,T.SAFE_ROUTE_HALF_WIDTH);
      addRiskBanana(z0,bait1,startSafeX,1,{baitLine:true});
      addRiskBanana(z0-gap*.52,bait2,startSafeX,2,{baitLine:true});
      const rejoinTarget=clamp(
        rewardCursor.x-side*shift*.38,
        -T.SAFE_ROUTE_HALF_WIDTH,
        T.SAFE_ROUTE_HALF_WIDTH
      );
      const rejoinX=addRiskBanana(z0-gap*1.22,rejoinTarget,startSafeX,1,{baitLine:true,rewardRejoin:true});
      const correction=decision(rejoinX,z0-gap*1.62,'DIAGONAL',['rock','rock','tree'],.62);
      if(plan.intensity>.72)addRiskBanana(z0-gap*2.02,correction,correction,2,{baitLine:true});
    }

    return {added:placements.length-before,bananas:bananaCount};
  }

  function pruneExpertAlignment(placements){
    for(let i=placements.length-1;i>=0;i--){
      const candidate=placements[i];
      if(!candidate.expertOverlay||!PHYSICAL_HAZARDS.has(candidate.kind))continue;

      const horizontalPeers=[];
      const verticalPeers=[];
      for(let j=0;j<placements.length;j++){
        if(i===j)continue;
        const other=placements[j];
        if(!PHYSICAL_HAZARDS.has(other.kind))continue;
        if(Math.abs(other.z-candidate.z)<1.55)horizontalPeers.push(other);
        if(Math.abs(other.x-candidate.x)<.92&&Math.abs(other.z-candidate.z)<11.5)verticalPeers.push(other);
      }

      const horizontalXs=[candidate.x,...horizontalPeers.map(item=>item.x)];
      const horizontalSpan=horizontalXs.length>1
        ?Math.max(...horizontalXs)-Math.min(...horizontalXs)
        :0;
      const makesWall=horizontalPeers.length>=2&&horizontalSpan>7.2;
      const makesColumn=verticalPeers.length>=2;
      if(makesWall||makesColumn)placements.splice(i,1);
    }
  }

  function validateAndRepairCorridor(placements,{startZ,endZ,speed,startX}){
    const validate=()=>validateReachableCorridor({
      placements,
      startZ,
      endZ,
      speed,
      startX,
      corridorMin:-(T.PLAYER_HALF_WIDTH-.62),
      corridorMax:T.PLAYER_HALF_WIDTH-.62,
      hazardKinds:PHYSICAL_HAZARDS,
      hazardHalfWidth:kind=>collisionHalfWidth(kind),
      minPassageWidth:.42
    });

    let result=validate();
    let repairs=0;
    while(!result.valid&&repairs<14){
      let candidateIndex=-1;
      let candidateScore=Infinity;
      const failureZ=Number.isFinite(result.failureZ)?result.failureZ:(startZ+endZ)*.5;
      for(let i=0;i<placements.length;i++){
        const placement=placements[i];
        if(!PHYSICAL_HAZARDS.has(placement.kind)||placement.jumpTarget)continue;
        if(!placement.expertOverlay&&!placement.safetyOptional)continue;
        const priority=placement.expertOverlay?0:
          placement.postMaxPressure?1:
          placement.irregularField?2:
          placement.sidePressure?3:4;
        const score=priority*1000+Math.abs(placement.z-failureZ);
        if(score<candidateScore){
          candidateScore=score;
          candidateIndex=i;
        }
      }
      if(candidateIndex<0)break;
      placements.splice(candidateIndex,1);
      repairs++;
      result=validate();
    }

    // Core authored rows normally preserve their tracked route. If an unusual
    // combination still eliminates every human-reachable interval, reject only
    // the blocking member nearest the failure point. This second stage is
    // bounded and deterministic: no unbounded random regeneration and no
    // weakening of collision/perception margins.
    let hardRepairs=0;
    while(!result.valid&&hardRepairs<6){
      const failureZ=Number.isFinite(result.failureZ)?result.failureZ:(startZ+endZ)*.5;
      let candidateIndex=-1;
      let candidateScore=Infinity;
      for(let i=0;i<placements.length;i++){
        const placement=placements[i];
        if(!PHYSICAL_HAZARDS.has(placement.kind)||placement.jumpTarget||placement.landingProtected)continue;
        const distance=Math.abs(placement.z-failureZ);
        const structuralPenalty=placement.commitmentDecision?180:0;
        const score=distance+structuralPenalty;
        if(score<candidateScore){
          candidateScore=score;
          candidateIndex=i;
        }
      }
      if(candidateIndex<0)break;
      placements.splice(candidateIndex,1);
      hardRepairs++;
      result=validate();
    }
    return {...result,repairs,hardRepairs};
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

  function next({startZ,difficulty=0,speed,postMaxTime=0,runTime=0}){
    const currentSpeed=effectiveSpeed(speed,difficulty);
    const sectionStartSafeX=safeRoute.previousSafeX??0;
    const runPlan=runDirector.plan({
      runTime,
      difficulty,
      speed:currentSpeed,
      postMaxTime,
      lastType,
      pendingLanding:!!pendingLanding,
      sectionIndex
    });
    const type=chooseType(difficulty,runPlan);
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
      const sequence=['ISOLATED','DIAGONAL','OFFSET_GATE','ISOLATED','DIAGONAL'];
      for(let i=0;i<sequence.length;i++){
        const desired=clamp(
          anchor+
          Math.sin(phase+i*.92)*5.2+
          Math.sin(phase*.53+i*1.71)*1.25,
          -T.SAFE_ROUTE_HALF_WIDTH,
          T.SAFE_ROUTE_HALF_WIDTH
        );
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
      addSpecialHazard(placements,startZ,length,safeRoute.previousSafeX,.68,hazardProgress,postMaxPressure);
      addSideHazardPressure(placements,startZ,length,safeRoute.previousSafeX,.72,hazardProgress,postMaxPressure);
      addBananaEvent(placements,startZ,length,safeRoute.previousSafeX,.68);
    }

    if(type==='GATE'){
      length=116;
      const rows=7;
      let z=startZ-18;
      for(let i=0;i<rows;i++){
        const direction=i%2===0?1:-1;
        const desired=clamp(
          anchor+direction*(3.0+Math.sin(phase+i*.61)*2.35)+Math.sin(i*1.37+phase)*.85,
          -T.SAFE_ROUTE_HALF_WIDTH,
          T.SAFE_ROUTE_HALF_WIDTH
        );
        const safeX=safeRoute.constrain(desired,z,currentSpeed);
        const gateRhythm=['OFFSET_GATE','ISOLATED','OFFSET_GATE','DIAGONAL','OFFSET_GATE','ISOLATED','OFFSET_GATE'];
        const formation=gateRhythm[i];
        addFormation(
          placements,
          formation,
          z,
          safeX,
          {kinds:progressiveHazardKinds(i%2?['tree','rock']:['rock','tree'],hazardProgress,.78),intensity:.60}
        );
        z-=spacing(currentSpeed,false,.94);
      }
      addSpecialHazard(placements,startZ,length,safeRoute.previousSafeX,.70,hazardProgress,postMaxPressure);
      addSideHazardPressure(placements,startZ,length,safeRoute.previousSafeX,.78,hazardProgress,postMaxPressure);
      addBananaEvent(placements,startZ,length,safeRoute.previousSafeX,.60);
    }

    if(type==='BANANA LINE'){
      length=108;
      let z=startZ-22;
      const sequence=['ISOLATED','DIAGONAL','ISOLATED','SCATTER','OFFSET_GATE'];
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
      addSpecialHazard(placements,startZ,length,safeRoute.previousSafeX,.58,hazardProgress,postMaxPressure);
      addSideHazardPressure(placements,startZ,length,safeRoute.previousSafeX,.64,hazardProgress,postMaxPressure);
      addBananaEvent(placements,startZ,length,safeRoute.previousSafeX,.98);
    }

    if(type==='FOREST'){
      length=132;
      const rows=8;
      let z=startZ-18;
      for(let i=0;i<rows;i++){
        const desired=clamp(
          anchor+Math.sin(phase+i*.86)*5.8+Math.sin(phase*.71+i*1.43)*1.15,
          -T.SAFE_ROUTE_HALF_WIDTH,
          T.SAFE_ROUTE_HALF_WIDTH
        );
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
      addSpecialHazard(placements,startZ,length,safeRoute.previousSafeX,.68,hazardProgress,postMaxPressure);
      addSideHazardPressure(placements,startZ,length,safeRoute.previousSafeX,.88,hazardProgress,postMaxPressure);
      addBananaEvent(placements,startZ,length,safeRoute.previousSafeX,.50);
    }

    if(type==='ROCK SLALOM'){
      length=132;
      const rows=8;
      let z=startZ-18;
      let desired=anchor;
      for(let i=0;i<rows;i++){
        desired=clamp(
          desired+(i%2?1:-1)*rand(4.2,6.1)+rand(-.8,.8),
          -T.SAFE_ROUTE_HALF_WIDTH,
          T.SAFE_ROUTE_HALF_WIDTH
        );
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
      addSpecialHazard(placements,startZ,length,safeRoute.previousSafeX,.64,hazardProgress,postMaxPressure);
      addSideHazardPressure(placements,startZ,length,safeRoute.previousSafeX,.84,hazardProgress,postMaxPressure);
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
      if(random()<.34)placements.push(banana(startZ-23,rampX,rampSafe,{
        riskReward:(runPlan.phase==='TRICK'||runPlan.phase==='RISK_REWARD'||runPlan.phase==='EXPERT')?2:1,
        rewardPoints:runPlan.phase==='EXPERT'?135:90,
        expertPattern:runPlan.pattern,
        runPhase:runPlan.phase
      }));

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
      length=78;
      // Recovery is deliberately hazard-free and brief. It acts as a visual and input
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

    // Add authored route decisions without using a blind density increase.
    if(type!=='RAMP'&&type!=='LOG JUMP'&&type!=='RECOVERY'){
      addExpertPattern(placements,{
        plan:runPlan,
        startZ,
        length,
        currentSpeed,
        startSafeX:sectionStartSafeX
      });
    }else if((type==='RAMP'||type==='LOG JUMP')&&
      (runPlan.phase==='TRICK'||runPlan.phase==='RISK_REWARD'||runPlan.phase==='EXPERT')){
      const ramp=placements.find(item=>item.kind==='ramp');
      if(ramp){
        const airZ=ramp.z-Math.min(34,Math.max(22,(ramp.landingDistance||52)*.42));
        const airX=clamp(
          ramp.safeX+(runPlan.side||1)*Math.min(2.3,1.2+runPlan.intensity*1.2),
          -T.COURSE_OBJECT_HALF_WIDTH,
          T.COURSE_OBJECT_HALF_WIDTH
        );
        placements.push(banana(airZ,airX,ramp.safeX,{
          riskReward:runPlan.phase==='EXPERT'?3:2,
          rewardPoints:runPlan.phase==='EXPERT'?160:115,
          airborneOption:true,
          expertPattern:runPlan.pattern,
          runPhase:runPlan.phase
        }));
      }
    }

    // Fill the whole section with additional irregular hazards at every speed.
    // The helper explicitly rejects obvious horizontal rows / vertical columns
    // and preserves the tracked safe route rather than drawing a visible lane.
    if(type!=='RAMP'&&type!=='LOG JUMP'&&type!=='RECOVERY'){
      addIrregularFieldPressure(
        placements,
        startZ,
        length,
        hazardProgress,
        postMaxPressure
      );

      // Once 300 km/h has been reached, fill remaining sparse longitudinal
      // patches gradually on top of the irregular base field.
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
    // Expert overlays must not accidentally complete a wide horizontal wall
    // or a repeated fixed column with hazards authored by the base section.
    pruneExpertAlignment(placements);

    // Boundary fitting can collapse two formerly separate edge hazards onto the
    // same legal X. Re-prune only those final physical overlaps.
    pruneExcessiveOverlap(placements);

    // Keep reset/high-speed warmup bounded. These first generated sections can
    // otherwise combine authored content + expert overlays + irregular pressure
    // into a large one-frame allocation burst. Remove optional pressure first,
    // then surplus collectibles; structural hazards and jump geometry remain.
    if(sectionIndex<8&&placements.length>26){
      for(let i=placements.length-1;i>=0&&placements.length>26;i--){
        const placement=placements[i];
        if(placement.safetyOptional&&!placement.jumpTarget)placements.splice(i,1);
      }
      for(let i=placements.length-1;i>=0&&placements.length>26;i--){
        if(placements[i].kind==='banana')placements.splice(i,1);
      }
    }

    const corridorValidation=validateAndRepairCorridor(placements,{
      startZ,
      endZ:startZ-length,
      speed:currentSpeed,
      startX:sectionStartSafeX
    });

    for(const placement of placements){
      placement.runPhase=placement.runPhase||runPlan.phase;
      placement.expertPattern=placement.expertPattern||runPlan.pattern||'';
      placement.routePressure=runPlan.expertPressure;
    }

    const physicalKinds=[
      ...new Set(
        placements
          .filter(item=>PHYSICAL_HAZARDS.has(item.kind))
          .map(item=>item.kind)
      )
    ];
    runDirector.noteSection({
      phase:runPlan.phase,
      pattern:runPlan.pattern,
      sectionType:type,
      side:runPlan.side,
      pressure:runPlan.expertPressure,
      obstacleFamily:physicalKinds.join('+')
    });

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
      runPhase:runPlan.phase,
      expertPattern:runPlan.pattern,
      expertPressure:runPlan.expertPressure,
      corridorValidation,
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
      edgeThreatCountdown=2;
      lastThreatSide=0;
      routeDecisionSerial=0;
      recentFormations=[];
      denseFormationStreak=0;
      runDirector.reset();
      safeRoute.reset(0,null);
    },
    get lastType(){return lastType;},
    get sectionIndex(){return sectionIndex;},
    get previousSafeX(){return safeRoute.previousSafeX;},
    get previousSafeZ(){return safeRoute.previousSafeZ;},
    get pendingLanding(){return pendingLanding;},
    get recentRunPhases(){return runDirector.recentPhases;},
    get recentExpertPatterns(){return runDirector.recentPatterns;}
  };
}
