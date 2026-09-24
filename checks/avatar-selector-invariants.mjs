import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {readFileSync} from 'node:fs';
import {
  AVATAR_SELECTOR_INITIAL_RENDER,
  AVATAR_SELECTOR_RENDER_CHUNK,
  buildAvatarSearchIndex,
  filterAvatarSearchIndex,
  getAvatarRenderTarget,
  normalizeAvatarSearch
} from '../src/avatar-selector-model.js';

const catalog=Array.from({length:64},(_,index)=>({
  id:'chimp-'+index,
  name:index===37?'Ártico Alpha':'Chimpion '+String(index).padStart(3,'0'),
  tribe:index%3===0?'Jungle':index%3===1?'Alpine':'Cyber',
  image:'https://example.invalid/'+index+'.png',
  url:'model/'+index+'.glb'
}));

const indexed=buildAvatarSearchIndex(catalog);
assert.equal(indexed.length,64);
assert.equal(getAvatarRenderTarget(indexed.length,0),AVATAR_SELECTOR_INITIAL_RENDER);
assert.equal(AVATAR_SELECTOR_INITIAL_RENDER,36);
assert.equal(AVATAR_SELECTOR_RENDER_CHUNK,24);
assert.equal(getAvatarRenderTarget(indexed.length,36),60);
assert.equal(getAvatarRenderTarget(12,0),12);

assert.equal(normalizeAvatarSearch('ÁRTICO'),'artico');
assert.equal(filterAvatarSearchIndex(indexed,'ártico').length,1);
assert.equal(filterAvatarSearchIndex(indexed,'ALPINE').length,catalog.filter(e=>e.tribe==='Alpine').length);
assert.equal(filterAvatarSearchIndex(indexed,'chimpion 063')[0].entry.id,'chimp-63');
assert.equal(filterAvatarSearchIndex(indexed,'does-not-exist').length,0);

// Search hot path should operate on precomputed normalized text, not rebuild names/tribes.
const started=performance.now();
let checksum=0;
for(let i=0;i<10000;i++){
  const query=i%4===0?'chimpion 1':i%4===1?'jungle':i%4===2?'cyber':'artico';
  checksum+=filterAvatarSearchIndex(indexed,query).length;
}
const searchMs=performance.now()-started;
assert(checksum>0);

const avatarSource=readFileSync(new URL('../src/avatar-system.js',import.meta.url),'utf8');
const mainSource=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
assert(mainSource.includes('initialSelectionFlow=true'),'initial START GAME no longer arms the character-selection flow');
assert(mainSource.includes('selector.open();'),'initial START GAME does not open the character selector');
assert(!/createStartScreen\s*\(\s*\{[\s\S]{0,320}onStart\s*:\s*\(\)\s*=>\s*beginRun\(\)/.test(mainSource),'start screen still launches a random run directly');
assert(mainSource.includes('setTimeout(()=>beginRun(),0)'),'confirmed character/ride selection does not continue into the race');
assert(!avatarSource.includes("cache:'no-store'"),'catalog fetch still forces no-store');
assert(avatarSource.includes("fetch('/avatars.json')"),'catalog fetch should use normal browser caching/revalidation');
assert(avatarSource.includes("image.loading='lazy'"),'card portraits are not lazy loaded');
assert(avatarSource.includes("image.decoding='async'"),'portrait async decoding regressed');
assert(avatarSource.includes("image.fetchPriority='low'"),'card portrait loading priority is not low');
assert(avatarSource.includes("grid.addEventListener('error'"),'delegated failed-image fallback is missing');
assert(avatarSource.includes("grid.addEventListener('click'"),'delegated click handling is missing');
assert(!avatarSource.includes("button.addEventListener('click'"),'per-card click listeners returned');
assert(!avatarSource.includes("button.addEventListener('focus'"),'per-card focus listeners returned');
assert(avatarSource.includes("ensureRenderedThrough(index)"),'virtualized gamepad/keyboard focus guard is missing');
assert(avatarSource.includes("focusCard(selectedIndex>=0?selectedIndex:0)"),'gamepad selected-avatar focus path is missing');
assert(avatarSource.includes("grid.replaceChildren();"),'search/open should discard old card DOM instead of accumulating nodes');
assert(avatarSource.includes('Closed selector owns zero card/image nodes'),'selector eagerly renders cards before first open');
assert(avatarSource.includes('UPLOAD YOUR 3D CHARACTER (GLB)'),'local upload action is missing from selector source');
assert(avatarSource.includes('URL.createObjectURL(file)'),'selector does not create a local object URL');
assert(avatarSource.includes('URL.revokeObjectURL'),'selector does not revoke obsolete local object URLs');
assert(!mainSource.includes('await setAvatar(initialAvatar'),'boot should not eagerly load a built-in GLB');

console.log(JSON.stringify({
  check:'avatar-selector-invariants',
  catalogSize:catalog.length,
  syntheticCatalogCards:catalog.length,
  optimizedInitialCards:AVATAR_SELECTOR_INITIAL_RENDER,
  initialReductionPct:Number(((1-AVATAR_SELECTOR_INITIAL_RENDER/catalog.length)*100).toFixed(1)),
  chunkSize:AVATAR_SELECTOR_RENDER_CHUNK,
  searchBenchmark:{iterations:10000,ms:Number(searchMs.toFixed(2)),checksum}
}));
