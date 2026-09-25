import {mkdirSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';

const root=process.cwd();
const outDir=resolve(root,process.env.AAA_ARTIFACT_DIR||'artifacts/qa');mkdirSync(outDir,{recursive:true});
const checks=[
  ['course-authoritative','checks/course-invariants.mjs'],
  ['course-stress','checks/aaa-course-stress.mjs'],
  ['course-runtime-performance','checks/course-runtime-performance-invariants.mjs'],
  ['render-collision-parity','checks/aaa-render-collision-parity.mjs'],
  ['physics','checks/physics-invariants.mjs'],
  ['physics-framerate','checks/aaa-physics-framerate.mjs'],
  ['input-collision','checks/input-collision-invariants.mjs'],
  ['input','checks/input-invariants.mjs'],
  ['touch-settings','checks/touch-settings-invariants.mjs'],
  ['camera-first-person','checks/camera-invariants.mjs'],
  ['airborne-scoring','checks/airborne-scoring-invariants.mjs'],
  ['tricks','checks/trick-invariants.mjs'],
  ['trick-balance','checks/trick-balance-invariants.mjs'],
  ['trick-system','checks/trick-system-invariants.mjs'],
  ['ride-mode','checks/ride-mode-invariants.mjs'],
  ['avatar-compatibility','checks/avatar-compatibility-invariants.mjs'],
  ['avatar-selector','checks/avatar-selector-invariants.mjs'],
  ['rider-selector','checks/rider-selector-invariants.mjs'],
  ['rider-pose-equipment','checks/rider-pose-invariants.mjs'],
  ['avatar-rig-compatibility','checks/avatar-rig-compat-invariants.mjs'],
  ['roster-local-glb','checks/roster-bandwidth-invariants.mjs'],
  ['performance-quality','checks/performance-quality-invariants.mjs'],
  ['runtime-benchmark-harness','checks/runtime-benchmark-harness-invariants.mjs'],
  ['qa-harness-baseline','checks/qa-harness-baseline-invariants.mjs'],
  ['weather-quality-soak','checks/aaa-weather-quality-soak.mjs'],
  ['long-run-static','checks/long-run-integration-invariants.mjs']
];
const report={schemaVersion:1,generatedAt:new Date().toISOString(),node:process.version,checks:[],status:'PASS'};
for(const [name,file] of checks){
  const started=performance.now();
  const run=spawnSync(process.execPath,[file],{cwd:root,encoding:'utf8',env:process.env,maxBuffer:8*1024*1024});
  const item={name,file,status:run.status===0?'PASS':'FAIL',exitCode:run.status,durationMs:Math.round(performance.now()-started),stdout:(run.stdout||'').slice(-20000),stderr:(run.stderr||'').slice(-20000)};
  if(item.status==='FAIL')report.status='FAIL';report.checks.push(item);
  process.stdout.write(`[${item.status}] ${name} (${item.durationMs}ms)\n`);
  if(run.stdout)process.stdout.write(run.stdout);if(run.stderr)process.stderr.write(run.stderr);
}
report.completedAt=new Date().toISOString();
const path=resolve(outDir,'aaa-core-report.json');writeFileSync(path,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({check:'aaa-regression-runner',status:report.status,report:path,checks:report.checks.map(x=>({name:x.name,status:x.status,exitCode:x.exitCode,durationMs:x.durationMs}))},null,2));
if(report.status!=='PASS')process.exitCode=1;
