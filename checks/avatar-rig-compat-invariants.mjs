import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {runAudit} from '../scripts/audit-avatar-rig-compat.mjs';
import {BUILTIN_AVATAR_NAMES} from '../src/avatarRoster.js';

const report=await runAudit({writeReports:false});
assert.equal(report.totalFiles,10,'character GLB directory must contain exactly 10 files');
assert.equal(report.errors.length,0,'one or more surviving GLBs are corrupt/unparseable');

const expected=BUILTIN_AVATAR_NAMES.map(name=>name+'.glb').sort((a,b)=>a.localeCompare(b));
const filenames=report.avatars.map(a=>a.filename).sort((a,b)=>a.localeCompare(b));
assert.deepEqual(filenames,expected,'rig audit saw a non-canonical GLB set');

const diskFiles=(await readdir(new URL('../public/model/characters/',import.meta.url)))
  .filter(name=>name.toLowerCase().endsWith('.glb'))
  .sort((a,b)=>a.localeCompare(b));
assert.deepEqual(diskFiles,expected,'physical GLB directory drifted');

const catalog=JSON.parse(await readFile(new URL('../public/avatars.json',import.meta.url),'utf8'));
assert.deepEqual(catalog.map(a=>a.name),[...BUILTIN_AVATAR_NAMES]);
assert.equal(new Set(catalog.map(a=>String(a.id))).size,10,'duplicate avatar IDs detected');
assert.equal(new Set(catalog.map(a=>String(a.url))).size,10,'duplicate avatar GLB URLs detected');
console.log(JSON.stringify({check:'avatar-rig-compat-invariants',avatars:report.avatars.length,classifications:report.summary.classifications,errors:report.errors.length}));
