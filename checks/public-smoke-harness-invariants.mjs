import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../scripts/smoke-ski-production.mjs',import.meta.url),'utf8');
const has=(text,message)=>assert(source.includes(text),message);

has('process.env.BASE_URL','smoke runner must support BASE_URL');
has('process.env.STRICT','smoke runner must support STRICT');
has('process.env.SMOKE_JSON','smoke runner must support SMOKE_JSON');
has('process.env.SMOKE_SCREENSHOT','smoke runner must support optional screenshots');
has('https://chimpions-ski.onrender.com/','default public target is missing');
has('https://chimp-jump.onrender.com/','game-selection URL invariant is missing');
has('music-full.mp3','local music network check is missing');
has('chimp-jump.onrender.com\\/audio\\/music-full.mp3','external music hotlink guard is missing');
has('#chimpion-selector','selector smoke coverage is missing');
has('SELECTOR SEARCH','selector search coverage is missing');
has('data-ride-mode','ride selection coverage is missing');
has('SNOWBOARD MODE','snowboard coverage is missing');
has('SKI MODE','ski coverage is missing');
has('ArrowDown','DOWN + SPACE trick coverage is missing');
has('ArrowUp','UP + SPACE trick coverage is missing');
has('SECOND SPACE','second-airborne-jump coverage is missing');
has('courseAhead','course streaming coverage is missing');
has('courseDrawCallsEstimate','course rendering coverage is missing');
has('activeRamp','restart stale-ramp coverage is missing');
has('CLEAN LANDING','legacy landing presentation guard is missing');
has('NETWORK ERROR SUMMARY','network summary is missing');

assert(!/gh[pousr]_[A-Za-z0-9_]{20,}/.test(source),'hardcoded GitHub-like credential detected');
assert(!/AKIA[0-9A-Z]{16}/.test(source),'hardcoded AWS access key pattern detected');
assert(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source),'hardcoded private key detected');
assert(!/from\s+['"]node:child_process['"]/.test(source),'smoke runner must not spawn repo/deploy commands');
assert(!/\bgit\s+(?:push|merge|commit|checkout|reset|clean)\b/i.test(source),'smoke runner must not mutate Git state');
assert(!/\brender\s+(?:deploy|services|blueprints)\b/i.test(source),'smoke runner must not deploy');
assert(!/mcp__GitHub__merge_pull_request/.test(source),'smoke runner must not merge');

console.log(JSON.stringify({
  check:'public-smoke-harness-invariants',
  supports:{baseUrl:true,strict:true,json:true,screenshot:true},
  coverage:{page:true,startScreen:true,selector:true,rideModes:true,tricks:true,audio:true,course:true,restart:true},
  safe:{credentials:false,repoMutation:false,deploy:false,merge:false}
}));
