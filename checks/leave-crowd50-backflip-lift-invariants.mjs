import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const crowd=readFileSync(new URL('../src/startCrowd.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/ui.js',import.meta.url),'utf8');
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const tuning=readFileSync(new URL('../src/gameplayTuning.js',import.meta.url),'utf8');
const startScreen=readFileSync(new URL('../src/startScreen.js',import.meta.url),'utf8');

assert(crowd.includes('export const START_CROWD_COUNT=50'),'start crowd is not configured for 50 Chimpions');
assert(crowd.includes('const SOURCE_MODEL_COUNT=START_CROWD_COUNT'),'crowd does not request one unique source per actor');
assert(crowd.includes('const CROWD_LIGHTWEIGHT_IDS=new Set(['),'crowd is not constrained to the lightweight unique GLB pool');
assert(crowd.includes('maxSpectators=START_CROWD_COUNT'),'production crowd default is not the full 50');
assert(main.includes('maxSpectators:smokeTestMode?4:undefined'),'browser smoke override is not isolated from production crowd count');
assert(ui.includes('Loading 50 unique Chimpions'),'production crowd preparation state is not communicated to the player');
assert(crowd.includes('const seen=new Set()'),'crowd source selection does not deduplicate catalog entries');
assert(!crowd.includes('templates[index%templates.length]'),'crowd still repeats source templates');
assert(!crowd.includes('cloneSkeleton'),'crowd still clones repeated source models');
assert(crowd.includes('const armOutwardSigns=new Map()'),'crowd cheering pose does not derive authored arm direction');
assert(crowd.includes('model.worldToLocal(sideProbe)'),'crowd arm side is not derived from GLB rest pose');
assert(crowd.includes('authoredOutSign'),'crowd cheering arm target does not use authored outward sign');

assert(ui.includes('GIVE UP AND LEAVE TO GAME SELECTION'),'give-up option missing from pause/game-over UI');
assert((ui.match(/GIVE UP AND LEAVE TO GAME SELECTION/g)||[]).length===2,'give-up option must exist in both pause and game-over menus');
assert(ui.includes('Do you really want to leave the game?'),'leave confirmation message is missing');
assert(ui.includes('id="leave-confirm-yes"')&&ui.includes('id="leave-confirm-no"'),'Yes/No confirmation buttons are missing');
assert(ui.includes('if(!leaveConfirm.hidden)return leaveConfirm'),'controller navigation does not prioritize leave confirmation');
assert(main.includes('window.location.assign(startScreen.gameSelectionUrl)'),'confirmed give-up does not navigate to game selection');
assert(startScreen.includes("GAME_SELECTION_URL='https://chimp-jump.onrender.com/'"),'game selection destination changed unexpectedly');

assert(tuning.includes('BACKFLIP_MANUAL_JUMP_VELOCITY:8.6'),'backflip launch velocity tuning is missing');
assert(main.includes("if(trickIntent==='BACKFLIP')"),'ground backflip does not receive dedicated takeoff handling');
assert(main.includes('state.jumpCutApplied=true'),'backflip takeoff can still collapse into a mini-hop');
assert(main.includes("state.jumpProfile='backflip'"),'backflip launch profile is not marked as aerial');
assert(main.includes('state.vy=Math.max(state.vy,SKI_TUNING.BACKFLIP_MANUAL_JUMP_VELOCITY)'),'backflip does not raise vertical velocity');

console.log(JSON.stringify({
  check:'leave-crowd50-backflip-lift-invariants',
  crowdCount:50,
  uniqueCrowd:true,
  leaveConfirm:true,
  backflipLift:true
}));
