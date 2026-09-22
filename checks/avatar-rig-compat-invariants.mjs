import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runAudit} from '../scripts/audit-avatar-rig-compat.mjs';

const report=await runAudit({writeReports:false});
assert(report.totalFiles>=200,'character GLB collection unexpectedly dropped below 200 files');
assert.equal(report.errors.length,0,'one or more GLBs are corrupt/unparseable');
const names=report.avatars.map(a=>a.filename.toLowerCase());
assert.equal(new Set(names).size,names.length,'duplicate character filenames detected');
assert(report.avatars.every(a=>a.skinCount>0),'zero-skin character detected in rigged avatar collection');
assert(report.avatars.every(a=>a.jointCount>0),'character with empty skin joint set detected');

let baseline=null;
try{baseline=JSON.parse(await readFile(new URL('../docs/avatar-rig-compat-audit.json',import.meta.url),'utf8'))}catch{}
if(baseline){
  const expected=new Set(baseline.avatars.map(a=>a.filename));
  const current=new Set(report.avatars.map(a=>a.filename));
  const missing=[...expected].filter(f=>!current.has(f));
  assert.deepEqual(missing,[],'audited baseline GLBs are missing: '+missing.join(', '));
  const baseByName=new Map(baseline.avatars.map(a=>[a.filename,a]));
  const regressions=[];
  for(const a of report.avatars){
    const b=baseByName.get(a.filename);if(!b)continue;
    if((b.skinCount||0)>0&&a.skinCount===0)regressions.push(a.filename+': skin removed');
    if((b.jointCount||0)>0&&a.jointCount===0)regressions.push(a.filename+': joints removed');
    for(const slot of ['hips','leftThigh','rightThigh','leftShin','rightShin','leftFoot','rightFoot']){
      if(!b.rig?.missing?.includes(slot)&&a.rig?.missing?.includes(slot))regressions.push(a.filename+': missing '+slot);
    }
    const baseDiag=b.bounds?.diagonal||0,diag=a.bounds?.diagonal||0;
    if(baseDiag>0&&diag>baseDiag*2.5)regressions.push(a.filename+': bounds diagonal grew >2.5x');
  }
  assert.deepEqual(regressions,[],'rig compatibility regressions: '+regressions.join('; '));
}
console.log(JSON.stringify({check:'avatar-rig-compat-invariants',avatars:report.avatars.length,classifications:report.summary.classifications,errors:report.errors.length}));
if(process.env.RIG_AUDIT_EMIT_REPORT==='1'){
  const json=JSON.stringify(report);
  for(let i=0;i<json.length;i+=18000){
    console.log('RIG_AUDIT_JSON '+String(i/18000).padStart(4,'0')+' '+JSON.stringify(json.slice(i,i+18000)));
  }
}
