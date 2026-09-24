#!/usr/bin/env node
import fs from 'node:fs';

const SOURCE={
  base:'c5691fbd0d9d43a6ff13dbe2b5295ce27f237e8e',
  rider:'20a4ec36f6e4bc05a58ecd407f980ec8be5c5b5f',
  tricks:'a7c5e24abb9675e5e0257e11864a8d3e5928f436'
};

const C=Object.freeze({
  gravity:17.8,
  manualJumpVelocity:5.9,
  manualTakeoffOffset:.045,
  rampJumpBaseVelocity:13.4,
  rampJumpSpeedFactor:.095,
  ski:{baseKmh:160,maxKmh:300,tierSeconds:30,tierKmh:20},
  snowboard:{baseKmh:180,maxKmh:300,tierSeconds:30,tierKmh:20},
  substepHz:180,
  spinDps:620,
  backflipDps:300,
  completionEpsilonDeg:8,
  ramp:{engageMin:.45,engageMax:1.72,lip:-1.42,collisionRadiusZ:1.58,collisionPadZ:.20,pitch:.18,deckBase:.34,deckRise:.11},
  hazards:{rock:.58,oil:.74,log:.48,wideLog:.58,tree:.68},
  clearances:{rock:.78,oil:.10,log:.60,wideLog:.82,tree:3.70},
  lookahead:{min:560,seconds:11,max:720},
  landingCorridorHalfWidth:4.15
});

const skiSpeeds=[160,180,200,220,240,260,280,300];
const snowboardSpeeds=[180,200,220,240,260,280,300];
const allSpeeds=[...new Set([...skiSpeeds,...snowboardSpeeds])].sort((a,b)=>a-b);
const kmhToMps=kmh=>kmh/3.6;
const r=(n,d=3)=>Number(n.toFixed(d));
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

function flight(vy,y0=0){
  const apexTime=vy/C.gravity;
  const airtime=(vy+Math.sqrt(vy*vy+2*C.gravity*y0))/C.gravity;
  return {airtime,apexTime,maxHeight:y0+vy*vy/(2*C.gravity)};
}

function rampDeckHeight(approachDepth){
  return C.ramp.deckBase+C.ramp.deckRise*Math.cos(C.ramp.pitch)-approachDepth*Math.sin(C.ramp.pitch);
}

function courseEnvelope(kmh){
  // Mirrors the current rampTrajectory speed ceiling: the shared 300 km/h maximum.
  const speed=kmhToMps(kmh);
  const safe=clamp(speed,kmhToMps(C.ski.baseKmh)*.9,kmhToMps(C.ski.maxKmh));
  const rampVy=C.rampJumpBaseVelocity+safe*C.rampJumpSpeedFactor;
  const flightTime=2*rampVy/C.gravity;
  const landingDistance=safe*flightTime;
  const safetyMargin=clamp(10+safe*.16,15,20);
  const touchdownHalfWindow=clamp(7+safe*.075,9.5,12);
  return {
    safeSpeedKmh:safe*3.6,
    rampVy,flightTime,landingDistance,safetyMargin,touchdownHalfWindow,
    protectedStartDistance:Math.max(0,landingDistance-touchdownHalfWindow),
    protectedEndDistance:landingDistance+touchdownHalfWindow+safetyMargin*.35,
    flightEndDistance:landingDistance+safetyMargin
  };
}

function speedRow(mode,kmh){
  const mps=kmhToMps(kmh);
  return {mode,kmh,mps:r(mps),distancePerFrame60:r(mps/60),distancePerSubstep:r(mps/C.substepHz),courseConsumptionPerSecond:r(mps)};
}

const speedMatrix=[
  ...skiSpeeds.map(v=>speedRow('SKI',v)),
  ...snowboardSpeeds.map(v=>speedRow('SNOWBOARD',v))
];

const manualBase=flight(C.manualJumpVelocity,C.manualTakeoffOffset);
const manual={
  vy:C.manualJumpVelocity,
  airtime:manualBase.airtime,
  apexTime:manualBase.apexTime,
  maxHeight:manualBase.maxHeight,
  travel:allSpeeds.map(kmh=>({kmh,distance:kmhToMps(kmh)*manualBase.airtime}))
};

function rampRow(kmh){
  const speed=kmhToMps(kmh);
  const vy=C.rampJumpBaseVelocity+speed*C.rampJumpSpeedFactor;
  const maxStep=speed/C.substepHz;
  const exactLipDepth=C.ramp.lip;
  const worstCrossDepth=Math.max(-(C.ramp.collisionRadiusZ+C.ramp.collisionPadZ),C.ramp.lip-maxStep);
  const yNominal=rampDeckHeight(exactLipDepth);
  const yWorst=rampDeckHeight(worstCrossDepth);
  const nominal=flight(vy,yNominal);
  const worst=flight(vy,yWorst);
  const symmetric=flight(vy,0);
  const envelope=courseEnvelope(kmh);
  const touchdownMin=speed*nominal.airtime;
  const touchdownMax=speed*worst.airtime;
  return {
    kmh,speedMps:speed,vy,
    authoredEnvelopeAirtime:symmetric.airtime,
    actualAirtimeMin:nominal.airtime,
    actualAirtimeMax:worst.airtime,
    actualMaxHeightMin:nominal.maxHeight,
    actualMaxHeightMax:worst.maxHeight,
    touchdownMin,touchdownMax,
    courseSafeSpeedKmh:envelope.safeSpeedKmh,
    protectedStart:envelope.protectedStartDistance,
    protectedEnd:envelope.protectedEndDistance,
    rearMargin:envelope.protectedEndDistance-touchdownMax,
    flightFrontier:envelope.flightEndDistance
  };
}
const ramp=allSpeeds.map(rampRow);

const spinFullTime=360/C.spinDps;
const spinAcceptedTime=(360-C.completionEpsilonDeg)/C.spinDps;
const backflipFullTime=360/C.backflipDps;
const backflipAcceptedTime=(360-C.completionEpsilonDeg)/C.backflipDps;

function classifyMargin(seconds){
  if(seconds<0)return 'IMPOSSIBLE';
  if(seconds<.10)return 'MARGINAL';
  return 'SAFE';
}

const secondPressDelays=[0,.1,.2,.3].map(delay=>{
  const available=manual.airtime-delay;
  const margin=available-spinAcceptedTime;
  return {delayMs:delay*1000,available,acceptedMargin:margin,rotationAtTouchdown:Math.max(0,Math.min(360,available*C.spinDps)),classification:classifyMargin(margin)};
});

const spinAnalysis={
  full360Time:spinFullTime,
  acceptedCompletionTime:spinAcceptedTime,
  manual:{acceptedMargin:manual.airtime-spinAcceptedTime,fullMargin:manual.airtime-spinFullTime,classification:classifyMargin(manual.airtime-spinAcceptedTime)},
  secondPressDelays,
  ramp:ramp.map(row=>({kmh:row.kmh,airtimeMin:row.actualAirtimeMin,acceptedMargin:row.actualAirtimeMin-spinAcceptedTime,classification:classifyMargin(row.actualAirtimeMin-spinAcceptedTime)}))
};

const backflipAnalysis={
  full360Time:backflipFullTime,
  acceptedCompletionTime:backflipAcceptedTime,
  manual:{rotationAtTouchdown:manual.airtime*C.backflipDps,acceptedMargin:manual.airtime-backflipAcceptedTime,classification:'INTENTIONAL FAIL'},
  ramp:ramp.map(row=>({kmh:row.kmh,airtimeMin:row.actualAirtimeMin,acceptedMargin:row.actualAirtimeMin-backflipAcceptedTime,classification:classifyMargin(row.actualAirtimeMin-backflipAcceptedTime)}))
};

const landingTolerance={
  successAngleStart:360-C.completionEpsilonDeg,
  successAngleEnd:360,
  spinToleranceSeconds:C.completionEpsilonDeg/C.spinDps,
  backflipToleranceSeconds:C.completionEpsilonDeg/C.backflipDps,
  frames:[30,60,90,120,144].map(fps=>({fps,spinFrames:(C.completionEpsilonDeg/C.spinDps)*fps,backflipFrames:(C.completionEpsilonDeg/C.backflipDps)*fps}))
};

const travel300=kmhToMps(300)/C.substepHz;
const collisionSafety=Object.entries(C.hazards).map(([kind,radiusZ])=>{
  const window=radiusZ+C.ramp.collisionPadZ;
  return {kind,radiusZ,window,travel300,windowToStep:window/travel300,classification:travel300<window?'SAFE':'UNSAFE'};
});
collisionSafety.push({kind:'ramp engagement',window:C.ramp.engageMax-C.ramp.engageMin,travel300,windowToStep:(C.ramp.engageMax-C.ramp.engageMin)/travel300,classification:travel300<(C.ramp.engageMax-C.ramp.engageMin)?'SAFE':'UNSAFE'});
collisionSafety.push({kind:'ramp lip containment',window:(C.ramp.collisionRadiusZ+C.ramp.collisionPadZ)-Math.abs(C.ramp.lip),travel300,windowToStep:((C.ramp.collisionRadiusZ+C.ramp.collisionPadZ)-Math.abs(C.ramp.lip))/travel300,classification:travel300<((C.ramp.collisionRadiusZ+C.ramp.collisionPadZ)-Math.abs(C.ramp.lip))?'MARGINAL':'UNSAFE'});

function lookaheadAt(kmh){
  const speed=kmhToMps(kmh);
  const distance=clamp(Math.max(C.lookahead.min,speed*C.lookahead.seconds),C.lookahead.min,C.lookahead.max);
  return {kmh,distance,secondsAhead:distance/speed};
}
const lookahead=allSpeeds.map(lookaheadAt);

const ramp300=ramp.find(x=>x.kmh===230);
const actionRequired=[];
if(ramp300.courseSafeSpeedKmh<300&&ramp300.rearMargin<1){
  actionRequired.push(`Ramp course envelope clamps 300 km/h ride to ${r(ramp300.courseSafeSpeedKmh,1)} km/h; worst predicted touchdown is only ${r(ramp300.rearMargin,3)} m inside protectedEnd.`);
}
if(secondPressDelays.find(x=>x.delayMs===100)?.acceptedMargin<1/C.substepHz){
  actionRequired.push('Manual second-press 360 at 100 ms has less than one 180 Hz physics substep of accepted timing margin.');
}

const result={
  auditedHeads:SOURCE,
  constants:C,
  speedMatrix,
  manual:{...manual,airtime:r(manual.airtime,6),apexTime:r(manual.apexTime,6),maxHeight:r(manual.maxHeight,6),travel:manual.travel.map(x=>({...x,distance:r(x.distance)}))},
  ramp:ramp.map(x=>Object.fromEntries(Object.entries(x).map(([k,v])=>[k,typeof v==='number'?r(v,6):v]))),
  spin360:{...spinAnalysis,full360Time:r(spinAnalysis.full360Time,6),acceptedCompletionTime:r(spinAnalysis.acceptedCompletionTime,6)},
  backflip:{...backflipAnalysis,full360Time:r(backflipAnalysis.full360Time,6),acceptedCompletionTime:r(backflipAnalysis.acceptedCompletionTime,6)},
  landingTolerance,
  collisionSafety,
  lookahead:lookahead.map(x=>({kmh:x.kmh,distance:r(x.distance),secondsAhead:r(x.secondsAhead)})),
  actionRequired
};

function printTable(title,rows){console.log(`\n${title}`);console.table(rows);}
function printHuman(){
  console.log('Chimpions Ski / Snowboard trick balance simulator');
  console.log(`base=${SOURCE.base} rider=${SOURCE.rider} tricks=${SOURCE.tricks}`);
  printTable('Speed matrix',speedMatrix);
  console.log(`\nManual jump: vy=${C.manualJumpVelocity} m/s, airtime=${r(manual.airtime)} s, apex=${r(manual.apexTime)} s, height=${r(manual.maxHeight)} m`);
  printTable('Manual jump horizontal travel',manual.travel.map(x=>({kmh:x.kmh,distanceM:r(x.distance)})));
  printTable('Ramp trajectory',ramp.map(x=>({kmh:x.kmh,vy:r(x.vy),airtimeMin:r(x.actualAirtimeMin),airtimeMax:r(x.actualAirtimeMax),heightMin:r(x.actualMaxHeightMin),touchdownMin:r(x.touchdownMin),touchdownMax:r(x.touchdownMax),protectedEnd:r(x.protectedEnd),rearMargin:r(x.rearMargin)})));
  console.log(`\n360: full=${r(spinFullTime,4)} s, accepted >=352°=${r(spinAcceptedTime,4)} s, manual accepted margin=${r(spinAnalysis.manual.acceptedMargin*1000,1)} ms`);
  printTable('Second-press 360',secondPressDelays.map(x=>({delayMs:x.delayMs,availableS:r(x.available),rotationDeg:r(x.rotationAtTouchdown,1),marginMs:r(x.acceptedMargin*1000,1),classification:x.classification})));
  console.log(`\nBackflip: full=${r(backflipFullTime,4)} s, accepted >=352°=${r(backflipAcceptedTime,4)} s, manual reaches ${r(backflipAnalysis.manual.rotationAtTouchdown,1)}° (intentional fail)`);
  printTable('Ramp backflip margins',backflipAnalysis.ramp.map(x=>({kmh:x.kmh,marginMs:r(x.acceptedMargin*1000,1),classification:x.classification})));
  printTable('300 km/h collision safety',collisionSafety.map(x=>({kind:x.kind,windowM:r(x.window),stepM:r(x.travel300),ratio:r(x.windowToStep),classification:x.classification})));
  printTable('Course lookahead',lookahead.map(x=>({kmh:x.kmh,lookaheadM:r(x.distance),secondsAhead:r(x.secondsAhead)})));
  if(actionRequired.length){console.log('\nACTION REQUIRED');for(const item of actionRequired)console.log(`- ${item}`);}else console.log('\nNo ACTION REQUIRED findings.');
}

const jsonArg=process.argv.find(arg=>arg==='--json'||arg.startsWith('--json='));
if(jsonArg){
  const payload=JSON.stringify(result,null,2)+'\n';
  if(jsonArg.startsWith('--json=')){
    const path=jsonArg.slice('--json='.length);
    fs.writeFileSync(path,payload);
    console.log(`Wrote ${path}`);
  }else process.stdout.write(payload);
}else printHuman();
