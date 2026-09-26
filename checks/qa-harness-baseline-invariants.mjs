import {spawnSync} from 'node:child_process';
import {parseArgs,getRoot,read,result,finish,STATUS} from './integration-check-utils.mjs';

const BASE='c4d445569584e792981bada3d71689473dfc42d2';
const args=parseArgs(),root=getRoot(args),results=[];
const tuning=read(root,'src/gameplayTuning.js');
const main=read(root,'src/main.js');
const collisionRuntime=read(root,'src/collisionRuntime.js');

const branch=process.env.GITHUB_HEAD_REF||process.env.GITHUB_REF_NAME||spawnSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).stdout.trim();
const qaOnlyBranch=branch==='test/ski-aaa-regression';
const diff=qaOnlyBranch?spawnSync('git',['diff','--name-only',BASE+'...HEAD'],{cwd:root,encoding:'utf8'}):null;
if(!qaOnlyBranch){
 results.push(result('QA-only branch file scope applies only to its QA branch',STATUS.PASS,'branch: '+(branch||'detached checkout')));
}else if(diff.status===0){
 const files=diff.stdout.trim().split(/\r?\n/).filter(Boolean);
 const allowed=function(p){
   return p.startsWith('checks/')||
     p.startsWith('scripts/')||
     p.startsWith('docs/')||
     p==='.github/workflows/ski-aaa-regression.yml'||
     p==='package-lock.json';
 };
 const forbidden=files.filter(function(p){return !allowed(p);});
 results.push(result(
   'QA branch changes only QA/CI/dependency-lock surfaces',
   forbidden.length?STATUS.FAIL:STATUS.PASS,
   forbidden.length?'forbidden: '+forbidden.join(', '):files.length+' QA-owned changed files'
 ));
}else results.push(result('QA branch changes only QA/CI/dependency-lock surfaces',STATUS.PENDING,'git baseline comparison unavailable in this checkout'));

results.push(result('audited SKI 150→300 tuning preserved',
 /BASE_SPEED\s*:\s*41\.6667/.test(tuning)&&
 /MAX_SPEED\s*:\s*83\.3333/.test(tuning)&&
 /SPEED_TIER_SECONDS\s*:\s*30/.test(tuning)&&
 /SPEED_TIER_INCREMENT\s*:\s*2\.7778/.test(tuning)
   ?STATUS.PASS:STATUS.FAIL,
 'expected exact c4d445 audited tuning constants'
));
results.push(result('collision runtime owns activeRamp lifecycle',
 /createCollisionRuntime/.test(main)&&
 /collisionRuntime\.activeRamp/.test(main)&&
 /let activeRamp\s*=\s*null/.test(collisionRuntime)&&
 /function clearRamp\(/.test(collisionRuntime)&&
 /function reset\(\)[\s\S]{0,180}clearRamp\(\)/.test(collisionRuntime)&&
 /get activeRamp\(\)/.test(collisionRuntime)
   ?STATUS.PASS:STATUS.FAIL,
 'active ramp state must stay centralized in collisionRuntime'
));
results.push(result('baseline no CLEAN LANDING text in main/score presentation',
 !/CLEAN LANDING/i.test(main+read(root,'src/scorePresentation.js'))?STATUS.PASS:STATUS.FAIL,
 'core gameplay/score presentation must stay free of legacy CLEAN LANDING copy; dedicated landing UI is checked separately'
));
const musicLines=(read(root,'src/audio.js').match(/music[^\n]*/gi)||[]).join('\n');
results.push(result('baseline local music path retained',!/https?:\/\//.test(musicLines)?STATUS.PASS:STATUS.FAIL,'music runtime should not hotlink another deployment'));
finish('qa-harness-baseline-invariants',results,{json:!!args.json,extra:{root,baseline:BASE}});
