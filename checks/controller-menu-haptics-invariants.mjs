import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync(new URL('../src/ui.js',import.meta.url),'utf8');
const nav=readFileSync(new URL('../src/menuNavigation.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

assert(ui.includes('createMenuFocusController'),'semantic menu focus controller is not wired');
assert(ui.includes('handleMenuAction(action,selector=null)'),'semantic menu action API is missing');
assert(ui.includes('haptics?.menuMove?.()'),'semantic menu movement has no tactile feedback');
assert(ui.includes('haptics?.menuConfirm?.()'),'semantic menu confirmation has no tactile feedback');
assert(nav.includes("CONFIRM:'confirm'")&&nav.includes("CANCEL:'cancel'"),'semantic confirm/cancel actions are missing');
assert(css.includes('.presentation-actions button.is-menu-selected'),'semantic selected button has no visual style');
assert(css.includes('content:"▶"'),'menu selection pointer is missing');
assert(!ui.includes('navigator.getGamepads'),'UI must not poll controllers directly');
assert(!ui.includes('buttons[0]')&&!ui.includes('buttons[1]'),'UI must not decode raw controller button indices');
assert(ui.includes("import {createMenuInputRepeat} from './menuInputRepeat.js';"),'UI is not consuming the controller-owned semantic menu repeat layer');
assert(ui.includes('menuInput.update(pad)'),'semantic menu repeat adapter is not wired');
assert(main.includes('haptics.setActiveGamepad?.(pad.activeGamepad)'),'haptics are not targeted at the authoritative active controller');
assert(main.includes('haptics.update?.(dt,{'),'continuous gameplay haptics are not updated from the main loop');
assert(main.includes('haptics.banana?.('),'banana pickup haptic cue is missing');

console.log(JSON.stringify({
  check:'controller-menu-haptics-invariants',
  semanticNavigation:'pass',
  normalizedControllerAdapter:'pass',
  continuousFeedback:'pass'
}));
