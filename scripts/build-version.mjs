import {execFileSync} from 'node:child_process';import {writeFileSync} from 'node:fs';
const commit=process.env.RENDER_GIT_COMMIT||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(!/^[a-f0-9]{40}$/.test(commit))throw new Error('Build requires a full Git commit identifier');
writeFileSync('dist/version.json',JSON.stringify({commit,builtAt:new Date().toISOString()})+'\n');console.log('Build revision: '+commit);
