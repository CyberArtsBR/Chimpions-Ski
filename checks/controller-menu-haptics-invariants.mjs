import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync(new URL('../src/ui.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

assert(ui.includes("classList.add('is-controller-selected')"),'controller selection class is not applied');
assert(ui.includes("classList.remove('is-controller-selected')"),'controller selection class is not cleared');
assert(ui.includes('setControllerSelection(resumeButton)'),'pause menu does not visibly select RESUME');
assert(ui.includes('setControllerSelection(restartResult)'),'game-over menu does not visibly select SKI AGAIN');
assert(ui.includes('haptics?.menuMove?.()'),'gamepad menu movement has no tactile feedback');
assert(ui.includes('haptics?.menuConfirm?.()'),'gamepad menu confirmation has no tactile feedback');
assert(css.includes('.presentation-actions button.is-controller-selected'),'controller-selected button has no visual style');
assert(css.includes('content:"▶"'),'controller selection pointer is missing');
assert(ui.includes("import {createMenuInputRepeat} from './menuInputRepeat.js';"),'UI is not consuming the controller-owned semantic menu repeat layer');
assert(ui.includes('menuInput.update(pad);'),'semantic menu input adapter is not wired into the current UI');
assert(main.includes('haptics.setActiveGamepad?.(pad.activeGamepad)'),'haptics are not targeted at the authoritative active controller');
assert(main.includes('haptics.update?.(dt,{'),'continuous gameplay haptics are not updated from the main loop');
assert(main.includes('haptics.banana?.()'),'banana pickup haptic cue is missing');

console.log(JSON.stringify({
  check:'controller-menu-haptics-invariants',
  pauseHighlight:'pass',
  gameOverHighlight:'pass',
  continuousFeedback:'pass'
}));
