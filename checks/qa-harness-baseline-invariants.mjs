import {spawnSync} from 'node:child_process';
import {parseArgs,getRoot,read,result,finish,STATUS} from './integration-check-utils.mjs';

const BASE='c5691fbd0d9d43a6ff13dbe2b5295ce27f237e8e';
const args=parseArgs(),root=getRoot(args),results=[];
const tuning=read(root,'src/gameplayTuning.js'),main=read(root,'src/main.js');

const diff=spawnSync('git',['diff','--name-only',BASE+'...HEAD'],{cwd:root,encoding:'utf8'});
if(diff.status===0){
 const files=diff.stdout.trim().split(/\r?\n/).filter(Boolean);
 const forbidden=files.filter(function(p){return !p.startsWith('checks/')&&!p.startsWith('scripts/')&&!p.startsWith('docs/');});
 results.push(result('QA branch changes only checks/, scripts/, docs/',forbidden.length?STATUS.FAIL:STATUS.PASS,forbidden.length?'forbidden: '+forbidden.join(', '):files.length+' changed files'));
}else results.push(result('QA branch changes only checks/, scripts/, docs/',STATUS.PENDING,'git baseline comparison unavailable in this snapshot'));

results.push(result('baseline SKI 160→210 tuning preserved',
 /BASE_SPEED\s*:\s*44\.4444/.test(tuning)&&/MAX_SPEED\s*:\s*58\.3333/.test(tuning)&&/SPEED_TIER_SECONDS\s*:\s*30/.test(tuning)&&/SPEED_TIER_INCREMENT\s*:\s*2\.7778/.test(tuning)?STATUS.PASS:STATUS.FAIL,
 'expected exact current-main tuning constants'));
results.push(result('baseline activeRamp lifecycle preserved',
 /let activeRamp=null/.test(main)&&/function clearActiveRamp\(/.test(main)&&/resetCourse/.test(main)?STATUS.PASS:STATUS.FAIL,'activeRamp lifecycle markers'));
results.push(result('baseline no CLEAN LANDING text',
 !/CLEAN LANDING/i.test(main+read(root,'src/scorePresentation.js'))?STATUS.PASS:STATUS.FAIL,'presentation text must stay removed'));
const musicLines=(read(root,'src/audio.js').match(/music[^\n]*/gi)||[]).join('\n');
results.push(result('baseline local music path retained',!/https?:\/\//.test(musicLines)?STATUS.PASS:STATUS.FAIL,'music runtime should not hotlink another deployment'));
finish('qa-harness-baseline-invariants',results,{json:!!args.json,extra:{root,baseline:BASE}});
