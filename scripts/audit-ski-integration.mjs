import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync,readdirSync,statSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join,relative,dirname} from 'node:path';
import {createHash} from 'node:crypto';

const BASE='c5691fbd0d9d43a6ff13dbe2b5295ce27f237e8e';
const args={};
for(let i=2;i<process.argv.length;i++){
 const token=process.argv[i];
 if(!token.startsWith('--'))continue;
 const key=token.slice(2),next=process.argv[i+1];
 args[key]=next&&!next.startsWith('--')?(i++,next):true;
}
const cwd=resolve(String(args.root||process.cwd()));
const specs={
 base:String(args.base||BASE),
 environment:String(args.environment||'feature/ski-clear-course-horizon'),
 rider:String(args.rider||'feature/ski-snowboard-rider-mode'),
 tricks:String(args.tricks||'feature/ski-tricks-air-style')
};

function git(parts){return spawnSync('git',parts,{cwd,encoding:'utf8'});}
function isDir(spec){try{return statSync(resolve(cwd,spec)).isDirectory();}catch{return false;}}
function refExists(ref){return git(['rev-parse','--verify','--quiet',ref+'^{commit}']).status===0;}
function walk(spec){
 const root=resolve(cwd,spec),out=[];
 function visit(dir){
  for(const name of readdirSync(dir)){
   if(name==='.git'||name==='node_modules')continue;
   const path=join(dir,name),st=statSync(path);
   if(st.isDirectory())visit(path); else out.push(relative(root,path).replaceAll('\\','/'));
  }
 }
 visit(root); return out.sort();
}
function hash(path){return createHash('sha1').update(readFileSync(path)).digest('hex');}
function changedDirs(base,head){
 const b=resolve(cwd,base),h=resolve(cwd,head),files=new Set([...walk(base),...walk(head)]),out=[];
 for(const file of files){
  const bp=join(b,file),hp=join(h,file);
  if(!existsSync(bp)||!existsSync(hp)||hash(bp)!==hash(hp))out.push(file);
 }
 return out.sort();
}
function changed(base,head){
 if(isDir(base)&&isDir(head))return changedDirs(base,head);
 if(!refExists(base)||!refExists(head))return null;
 const r=git(['diff','--name-only',base+'...'+head]);
 return r.status===0?r.stdout.trim().split(/\r?\n/).filter(Boolean):null;
}
function readAt(spec,path){
 if(isDir(spec)){try{return readFileSync(join(resolve(cwd,spec),path),'utf8');}catch{return '';}}
 if(!refExists(spec))return '';
 const r=git(['show',spec+':'+path]);
 return r.status===0?r.stdout:'';
}
function sourceBundle(spec,files){
 return (files||[]).filter(function(p){return /\.(?:m?js|ts)$/.test(p);}).map(function(path){return {path,source:readAt(spec,path)};});
}
function names(source,kind){
 const out=new Set(),patterns=kind==='export'
  ?[/(?:export\s+(?:const|let|var|function|class)\s+)([\w$]+)/g,/export\s*\{([^}]+)\}/g]
  :[/import\s*\{([^}]+)\}\s*from/g];
 for(const re of patterns){
  let m; while((m=re.exec(source))){
   for(const raw of m[1].split(',')){
    const bits=raw.trim().split(/\s+as\s+/),name=kind==='import'?bits[0]:(bits[1]||bits[0]);
    if(name)out.add(name.trim());
   }
  }
 }
 return out;
}
function inspect(spec,files){
 const src=sourceBundle(spec,files),joined=src.map(function(x){return x.source;}).join('\n');
 return {src,joined,exports:new Set(src.flatMap(function(x){return [...names(x.source,'export')];})),imports:new Set(src.flatMap(function(x){return [...names(x.source,'import')];}))};
}
function intersect(a,b){return [...a].filter(function(x){return b.has(x);}).sort();}

const branches=['environment','rider','tricks'],changedSets={},reports={},warnings=[],unavailable=[];
for(const key of branches){
 changedSets[key]=changed(specs.base,specs[key]);
 if(changedSets[key]==null)unavailable.push(key);
 reports[key]=inspect(specs[key],changedSets[key]||[]);
}
for(const [a,b] of [['environment','rider'],['environment','tricks'],['rider','tricks']]){
 const files=intersect(new Set(changedSets[a]||[]),new Set(changedSets[b]||[]));
 if(files.length)warnings.push('Changed-file overlap '+a+' ↔ '+b+': '+files.join(', '));
 const dup=intersect(reports[a].exports,reports[b].exports);
 if(dup.length)warnings.push('Potential duplicate exports '+a+' ↔ '+b+': '+dup.join(', '));
 const imports=intersect(reports[a].imports,reports[b].imports);
 if(imports.length>6)warnings.push('Large shared import surface '+a+' ↔ '+b+': '+imports.join(', '));
}
const mainOwners=branches.filter(function(k){return (changedSets[k]||[]).includes('src/main.js');});
if(mainOwners.length>1)warnings.push('src/main.js overlap across '+mainOwners.join(', ')+'; integrate manually.');

const concepts={
 state:['rideMode','rideProfile','riderMode','sportMode','trickType','trickState','trickProgress','failedTrick','activeRamp','air','jumpSource'],
 input:['keydown','keyup','readPad','navigator.getGamepads','axisY','buttons[0]','edges.pressed'],
 score:['score','combo','clearEvent','trickEvent','trickPoints'],
 visual:['rotation','quaternion','visualPivot','trickPivot','riderPivot'],
 speed:['BASE_SPEED','MAX_SPEED','maxSpeed','160','180','300','5.5556','83.3333']
};
for(const [concept,terms] of Object.entries(concepts)){
 const active=[];
 for(const branch of branches){
  const hit=terms.filter(function(t){return reports[branch].joined.includes(t);});
  if(hit.length)active.push(branch+'['+hit.join('|')+']');
 }
 if(active.length>1)warnings.push(concept+' concepts touched by multiple branches: '+active.join(' ; '));
}
const keyHandlerOwners=branches.filter(function(b){return /addEventListener\(['"]key(?:down|up)['"]/.test(reports[b].joined);});
if(keyHandlerOwners.length>1)warnings.push('Duplicate key-handler risk across '+keyHandlerOwners.join(', '));
const gamepadOwners=branches.filter(function(b){return /readPad|navigator\.getGamepads|buttons\[0\]|axisY/.test(reports[b].joined);});
if(gamepadOwners.length>1)warnings.push('Gamepad handling touched across '+gamepadOwners.join(', '));
if(/\b(?:player|physicsRoot|collisionRoot|camera)\.(?:rotation|quaternion)\s*[.=]/.test(reports.tricks.joined))
 warnings.push('TRICKS appears to rotate player/physics/collision/camera root; tricks must use a visual pivot only.');
if(/snowboard/i.test(reports.rider.joined)&&/(?:\b210\b|\b230\b|58\.3333|63\.8889)/.test(reports.rider.joined))
 warnings.push('RIDER contains legacy 210/230 km/h markers; verify the current shared 300 km/h cap and +20 km/h tier contract.');

const lines=['# Ski Integration Audit','','Base: '+specs.base,'','- environment: '+specs.environment,'- rider: '+specs.rider,'- tricks: '+specs.tricks,'','## Availability',
 unavailable.length?'PENDING refs/snapshots: '+unavailable.join(', '):'All requested refs/snapshots resolved.','','## Changed files'];
for(const key of branches){
 lines.push('### '+key);
 if(changedSets[key]==null)lines.push('- PENDING: ref/snapshot unavailable');
 else if(!changedSets[key].length)lines.push('- No changed files');
 else for(const file of changedSets[key])lines.push('- '+file);
 lines.push('');
}
lines.push('## Overlap and integration warnings');
if(!warnings.length)lines.push('- No heuristic conflicts detected.');
else for(const warning of warnings)lines.push('- WARN: '+warning);
lines.push('','## Manual merge focus',
 '- src/main.js: preserve start screen, score presentation, course streaming/batching, obstacle scoring, audio/gamepad hooks, environment update, resetRunState, and activeRamp lifecycle.',
 '- Rider mode: preserve selected Chimpion, ride profile, equipment switch, and mode-specific speed caps.',
 '- Tricks: keep trick intent/state/scoring isolated from physics/collision/camera root rotation.',
 '- Environment: integrate horizon/boundary framing without reducing course density.',
 '','This audit never auto-merges or edits runtime source.');
const report=lines.join('\n')+'\n';
console.log(report);
if(args.write){
 const out=resolve(cwd,String(args.write===true?'docs/integration-audit-report.md':args.write));
 mkdirSync(dirname(out),{recursive:true}); writeFileSync(out,report); console.log('Wrote '+relative(cwd,out));
}
if(unavailable.length)process.exitCode=2;
