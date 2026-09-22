import {parseArgs,getRoot,jsSources,read} from '../checks/integration-check-utils.mjs';

const args=parseArgs(),root=getRoot(args),paths=jsSources(root);
const fields=['rideMode','rideProfile','trickType','trickState','trickProgress','trickEvent','trickPoints','failedTrick','activeRamp','air','jumpSource','score','combo','clearEvent'];
const semanticGroups={
 rideMode:['rideMode','sportMode','riderMode','snowMode'],
 rideProfile:['rideProfile','modeProfile','speedProfile'],
 trickState:['trickState','activeTrickState','airTrickState'],
 trickType:['trickType','activeTrick','airTrick'],
 trickProgress:['trickProgress','trickPhase','trickT'],
 failedTrick:['failedTrick','trickFailed','failedLanding','invalidTrick'],
 trickEvent:['trickEvent','airTrickEvent'],
 clearEvent:['clearEvent','hazardClearEvent'],
 jumpSource:['jumpSource','launchSource','airSource']
};
const warnings=[],occurrences={};
for(const field of fields)occurrences[field]=[];
for(const path of paths){
 const source=read(root,path);
 for(const field of fields){
  const re=new RegExp('\\b'+field+'\\b','g'); let m;
  while((m=re.exec(source)))occurrences[field].push({path,index:m.index});
 }
}
for(const [concept,names] of Object.entries(semanticGroups)){
 const used=names.filter(function(name){return paths.some(function(p){return new RegExp('\\b'+name+'\\b').test(read(root,p));});});
 if(used.length>1)warnings.push({type:'semantic-alias',concept,names:used,message:concept+' appears under multiple names: '+used.join(', ')});
}
const combined=paths.map(function(p){return '// '+p+'\n'+read(root,p);}).join('\n');
for(const field of ['trickState','trickType','trickProgress','trickEvent','trickPoints','failedTrick']){
 if(new RegExp('\\b'+field+'\\b').test(combined)){
  const resetRe=new RegExp('(?:reset|restart|beginRun|resetRunState)[\\s\\S]{0,1600}\\b'+field+'\\b','i');
  if(!resetRe.test(combined))warnings.push({type:'missing-reset',field,message:'temporary field '+field+' is present but no reset/restart assignment was found nearby'});
 }
}
if(/rideMode/.test(combined)&&/(?:reset|restart|resetRunState)[\s\S]{0,1200}rideMode\s*=/.test(combined))
 warnings.push({type:'ride-reset',message:'rideMode appears reassigned during run reset; user selection should persist'});
for(const name of ['trickEvent','clearEvent','scoreEvent','scoreEvents']){
 if(new RegExp('\\b'+name+'\\.push\\(').test(combined))warnings.push({type:'event-growth',field:name,message:name+'.push() may accumulate per-run/per-frame events'});
}
for(const field of fields){
 const snippets=[],re=new RegExp('\\b'+field+'\\s*[:=]\\s*([^,;\\n}]+)','g'); let m;
 while((m=re.exec(combined))&&snippets.length<12)snippets.push(m[1].trim().slice(0,80));
 const kinds=new Set(snippets.map(function(v){return /^['"]/.test(v)?'string':/^(true|false)\b/.test(v)?'boolean':/^-?\d/.test(v)?'number':/^null\b/.test(v)?'null':'object/expression';}));
 if(kinds.size>2&&!(kinds.size===3&&kinds.has('null')))warnings.push({type:'incompatible-meaning',field,kinds:[...kinds],samples:snippets,message:field+' has potentially incompatible assignment types: '+[...kinds].join(', ')});
}
console.log('# Runtime state contract audit\nroot: '+root+'\nfiles scanned: '+paths.length+'\nwarnings: '+warnings.length);
for(const w of warnings)console.log('WARN ['+w.type+'] '+w.message);
console.log(JSON.stringify({audit:'runtime-state-contract',root,fields,occurrences:Object.fromEntries(Object.entries(occurrences).map(function(x){return [x[0],x[1].length];})),warnings},null,args.json?2:0));
