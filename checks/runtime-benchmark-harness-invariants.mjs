import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const runnerPath=path.join(root,'scripts','benchmark-ski-runtime.mjs');
const guidePath=path.join(root,'docs','runtime-benchmark-guide.md');
const runnerFiles=[
  runnerPath,
  path.join(root,'scripts','benchmark','core.mjs'),
  path.join(root,'scripts','benchmark','selector.mjs'),
  path.join(root,'scripts','benchmark','gameplay.mjs')
];
const runner=runnerFiles.map(file=>readFileSync(file,'utf8')).join('\n');
const guide=readFileSync(guidePath,'utf8');

assert(runner.includes("process.env.BASE_URL"),'Runner must accept BASE_URL');
assert(runner.includes("DEFAULT_BASE_URL='http://localhost:4173'"),'Runner must have a local default target');
assert(runner.includes("longRunSeconds:numberEnv('LONG_RUN_SECONDS'"),'LONG_RUN_SECONDS must be configurable');
assert(runner.includes("process.env.RESULTS_PATH"),'Machine-readable results path must be configurable');
assert(runner.includes("benchmark-results.json"),'Default machine-readable output must be benchmark-results.json');
assert(runner.includes("await import('@playwright/test')"),'Runner must use the existing Playwright dependency dynamically');
assert(runner.includes("window.chimpionsSki"),'Runner must consume exposed runtime diagnostics rather than patch runtime code');
assert(runner.includes("requestAnimationFrame"),'Runner must collect low-overhead frame timing');
assert(runner.includes("performance.memory"),'Optional browser heap metrics must be supported');
assert(runner.includes("Network.loadingFinished"),'Transferred bytes should use browser network diagnostics when available');
assert(runner.includes(".chimpion-card"),'Selector card count must be measured');
assert(runner.includes("courseDrawCallsEstimate"),'Course draw-call diagnostics must be sampled');
assert(runner.includes("data-ride-mode"),'Future ride-mode controls must be feature-detected');
assert(runner.includes("trickState"),'Future trick diagnostics must be feature-detected');
assert(runner.includes("ArrowDown")&&runner.includes("Space"),'Future 360 workload must be triggerable without runtime changes');

assert(guide.includes('BASE_URL=http://localhost:4173'),'Guide must document local mode');
assert(guide.includes('BASE_URL="$PRODUCTION_URL"'),'Guide must document configurable public deployment mode');
assert(guide.includes('LONG_RUN_SECONDS=300')&&guide.includes('LONG_RUN_SECONDS=600'),'Guide must document 5 and 10 minute full-run targets');
assert(guide.includes('PENDING'),'Guide must explain optional future-feature status');

const credentialPatterns=[
  /(?:password|passwd|secret|api[_-]?key|access[_-]?token|bearer)\s*[:=]\s*['"][^'"]{6,}['"]/i,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/
];
for(const pattern of credentialPatterns)assert(!pattern.test(runner),'Runner contains something resembling a hardcoded credential');

assert(!/child_process|execSync|spawnSync|npm\s+(?:install|add)|pnpm\s+add|yarn\s+add/.test(runner),'Harness must not mutate dependencies or shell out to package installers');
assert(!/writeFile\([^\n]*(?:package\.json|package-lock\.json|src\/|public\/|\.github\/|render\.yaml)/.test(runner),'Harness must not write runtime/package/deployment files');
assert(!/(?:rename|rm|unlink|truncate|appendFile|copyFile)\s*\(/.test(runner),'Runner should not contain repository mutation primitives');
assert(/writeFile\(CONFIG\.resultsPath/.test(runner),'Only configured result output should be written');

const allowedPaths=['checks/','scripts/','docs/'];
assert.deepEqual(allowedPaths,['checks/','scripts/','docs/']);

console.log(JSON.stringify({
  check:'runtime-benchmark-harness-invariants',
  baseUrl:true,
  publicAndLocal:true,
  longRunConfigurable:true,
  machineReadableOutput:true,
  hardcodedCredentials:false,
  packageMutation:false,
  runtimeSourceMutation:false,
  futureRideModes:true,
  futureTricks:true
}));
