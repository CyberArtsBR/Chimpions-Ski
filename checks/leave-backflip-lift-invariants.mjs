import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const crowd=readFileSync(new URL('../src/startCrowd.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/ui.js',import.meta.url),'utf8');
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const tuning=readFileSync(new URL('../src/gameplayTuning.js',import.meta.url),'utf8');
const startScreen=readFileSync(new URL('../src/startScreen.js',import.meta.url),'utf8');

assert(crowd.includes('export const START_CROWD_COUNT=0'),'real Chimpion start crowd is not disabled');
assert(!crowd.includes('GLTFLoader')&&!crowd.includes('crowdAssetCache'),'disabled crowd still owns character loading code');
assert(main.includes('const startCrowd=createStartCrowd({world,terrainHeight});'),'main crowd compatibility hook changed unexpectedly');

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

console.log(JSON.stringify({check:'leave-backflip-lift-invariants',crowdCount:0,leaveConfirm:true,backflipLift:true}));
