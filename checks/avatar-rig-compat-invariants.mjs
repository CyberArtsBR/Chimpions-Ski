import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runAudit} from '../scripts/audit-avatar-rig-compat.mjs';

const report=await runAudit({writeReports:false});
assert(report.totalFiles>=200,'character GLB collection unexpectedly dropped below 200 files');
assert.equal(report.errors.length,0,'one or more GLBs are corrupt/unparseable');

const filenames=report.avatars.map(a=>a.filename.toLowerCase());
assert.equal(new Set(filenames).size,filenames.length,'duplicate character GLB filenames detected');

const catalog=JSON.parse(await readFile(new URL('../public/avatars.json',import.meta.url),'utf8'));
assert.equal(new Set(catalog.map(a=>String(a.id))).size,catalog.length,'duplicate avatar IDs detected');
assert.equal(new Set(catalog.map(a=>String(a.url))).size,catalog.length,'duplicate avatar GLB URLs detected');
const catalogFiles=new Set(catalog.map(a=>decodeURIComponent(String(a.url).split('/').pop()||'').toLowerCase()));
const uncatalogued=filenames.filter(f=>!catalogFiles.has(f));
assert.deepEqual(uncatalogued,[],'GLBs missing from avatar catalog: '+uncatalogued.join(', '));

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
    const b=baseByName.get(a.filename);
    if(!b){
      const m=baseline.summary?.medianBounds||{x:1,y:1,z:1};
      const e=a.bounds?.extent||[0,0,0];
      if(e[0]>Math.max(.001,m.x)*3.5||e[1]>Math.max(.001,m.y)*3.5||e[2]>Math.max(.001,m.z)*3.5)regressions.push(a.filename+': new extreme bounds outlier');
      continue;
    }
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
