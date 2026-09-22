import assert from 'node:assert/strict';import fs from 'node:fs';
const avatars=JSON.parse(fs.readFileSync('public/avatars.json','utf8'));
assert(avatars.length>180,'Expected the Chimpions collection catalog');
assert(!avatars.some(a=>a.id==='steamboat-willie'||a.id==='chimpion'),'Special guest/default characters must not enter Ski');
assert.equal(new Set(avatars.map(a=>a.id)).size,avatars.length,'Avatar IDs must be unique');
assert(avatars.every(a=>a.name&&a.url),'Every Ski catalog entry must have a name and GLB URL');
console.log('PASS Chimpions Ski catalog:',avatars.length);
process.env.RIG_AUDIT_EMIT_REPORT='1';
await import('./avatar-rig-compat-invariants.mjs');
