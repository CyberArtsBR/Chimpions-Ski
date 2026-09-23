import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {parseArgs,getRoot,jsSources,sourceBundle,read,result,finish,STATUS} from './integration-check-utils.mjs';

const args=parseArgs(),root=getRoot(args);
const sourcePaths=jsSources(root);
const all=sourceBundle(root,sourcePaths);
const feature=/backflip|\b360\b|snowboard|ride.?mode|trickState|trickType/i.test(all);
const results=[];

results.push(result('existing course architecture retains pooling',
 /coursePool/.test(all)&&/(acquireCourseItem|releaseCourseItem)/.test(all)?STATUS.PASS:STATUS.FAIL,
 'course objects must continue to reuse pools'));
const perFrameAllocation=sourcePaths.some(path=>/function update\([^)]*\)[\s\S]{0,700}(new THREE\.|createElement\(|new Map\(|new Set\()/i.test(read(root,path)));
results.push(result('no obvious object allocation inside per-frame update loop',
 !perFrameAllocation?STATUS.PASS:STATUS.FAIL,
 'inspect frame update for allocations'));

const future=['one reusable trick state','one active rider visual','one active equipment mode','selector listeners bounded across repeated open/close','temporary trick pivots bounded','trick events/timers bounded over ~10 virtual minutes'];
if(!feature){
 for(const n of future)results.push(result(n,STATUS.PENDING,'parallel rider/trick features not merged yet'));
}else{
 const trickPivotSites=(all.match(/\btrickVisualPivot\s*=\s*new THREE\.Group\(\)/g)||[]).length;
 const trickPivotWired=/createTrickSystem\s*\(\s*\{[^}]*visualTarget\s*:\s*trickVisualPivot/s.test(all);
 const listenerSites=(all.match(/addEventListener\(/g)||[]).length;
 const pushes=[...all.matchAll(/([A-Za-z_$][\w$]*(?:Events|events|history|queue|listeners|handlers))\.push\(/g)].map(function(m){return m[1];});
 results.push(result(future[0],/(trickState|trickType|trickProgress)/i.test(all)&&!/trickStates\s*=\s*\[|trickStates\.push/i.test(all)?STATUS.PASS:STATUS.FAIL,'temporary trick state should not be a growing collection'));
 results.push(result(future[1],/(rideMode|rideProfile|snowboard)/i.test(all)&&!/(riderVisuals|skiers|avatars)\.push/i.test(all)?STATUS.PASS:STATUS.FAIL,'reuse selected rider visual'));
 results.push(result(future[2],!/equipment(?:Objects|History|Instances)\.push/i.test(all)?STATUS.PASS:STATUS.FAIL,'only one active equipment mode'));
 results.push(result(future[3],!/(function open|open\s*\()[\s\S]{0,900}addEventListener\(/i.test(all)?STATUS.PASS:STATUS.FAIL,'listener sites='+listenerSites+'; none should be installed per open'));
 results.push(result(future[4],trickPivotSites===1&&trickPivotWired?STATUS.PASS:STATUS.FAIL,'trickVisualPivot construction sites='+trickPivotSites+'; createTrickSystem visualTarget wired='+trickPivotWired));
 results.push(result(future[5],pushes.length?STATUS.FAIL:STATUS.PASS,pushes.length?'potential unbounded pushes: '+[...new Set(pushes)].join(', '):'no obvious event/history arrays growing by push'));
}

if(args.probe){
 try{
  const mod=await import(pathToFileURL(resolve(root,String(args.probe))).href);
  const make=mod.createIntegrationQaProbe||mod.createProbe;
  if(typeof make!=='function')throw new Error('probe must export createIntegrationQaProbe() or createProbe()');
  const probe=await make();
  if(typeof probe.step!=='function'||typeof probe.snapshot!=='function')throw new Error('probe must expose step(dt) and snapshot()');
  const before=await probe.snapshot(),dt=1/60,steps=Math.round(600/dt);
  for(let i=0;i<steps;i++)await probe.step(dt);
  const after=await probe.snapshot();
  for(const key of ['trickEvents','rideHandlers','selectorListeners','trickPivots','equipmentObjects','animations','timers','courseObjects','poolObjects']){
   if(!(key in before)||!(key in after)){results.push(result('10-minute probe: '+key,STATUS.PENDING,'probe snapshot does not expose this counter'));continue;}
   const growth=Number(after[key])-Number(before[key]);
   const allowed=(key==='courseObjects'||key==='poolObjects')?32:0;
   results.push(result('10-minute probe: '+key,growth<=allowed?STATUS.PASS:STATUS.FAIL,'before='+before[key]+' after='+after[key]+' growth='+growth+' allowed='+allowed));
  }
  if(typeof probe.dispose==='function')await probe.dispose();
 }catch(error){results.push(result('10-minute deterministic runtime probe',STATUS.FAIL,String(error&&error.message||error)));}
}else results.push(result('10-minute deterministic runtime probe',STATUS.PENDING,'optional --probe adapter not supplied; static allocation checks ran instead'));

finish('long-run-integration-invariants',results,{json:!!args.json,extra:{root,featurePresent:feature,virtualTargetSeconds:600,probe:args.probe||null}});
