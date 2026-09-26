import {TRICK_TYPE} from './trickSystem.js';

const clamp=(value,min=-1,max=1)=>Math.max(min,Math.min(max,Number(value)||0));

export function createTouchControls({
  onSteer=()=>{},
  onJump=()=>{},
  onTuck=()=>{},
  onBrake=()=>{},
  onTrick=()=>{},
  onPause=()=>{},
  windowRef=globalThis.window,
  documentRef=globalThis.document
}={}){
  const root=documentRef.createElement('div');
  root.id='touch-controls';
  root.className='touch-controls';
  root.setAttribute('aria-label','Touch gameplay controls');
  root.innerHTML=`
    <div class="touch-steer-zone" id="touch-steer-zone" aria-label="Steering touch area">
      <div class="touch-steer-base"><div class="touch-steer-knob" id="touch-steer-knob"></div></div>
      <span>STEER</span>
    </div>
    <div class="touch-action-cluster" aria-label="Jump, trick and style controls">
      <button type="button" class="touch-action touch-trick" data-touch-trick="360" aria-label="360 trick">360</button>
      <button type="button" class="touch-action touch-trick" data-touch-trick="backflip" aria-label="Backflip trick">FLIP</button>
      <button type="button" class="touch-action touch-speed" id="touch-tuck" aria-label="Tuck for speed; hold in air for style">TUCK / STYLE</button>
      <button type="button" class="touch-action touch-speed" id="touch-brake" aria-label="Brake and skid">BRAKE</button>
      <button type="button" class="touch-action touch-jump" id="touch-jump" aria-label="Jump">JUMP</button>
    </div>
    <button type="button" class="touch-pause" id="touch-pause" aria-label="Pause game">Ⅱ</button>
    <div class="touch-orientation-hint" role="status">ROTATE TO LANDSCAPE FOR BETTER CONTROL</div>
  `;
  documentRef.body.append(root);

  const steerZone=root.querySelector('#touch-steer-zone');
  const steerKnob=root.querySelector('#touch-steer-knob');
  const jump=root.querySelector('#touch-jump');
  const tuck=root.querySelector('#touch-tuck');
  const brake=root.querySelector('#touch-brake');
  const pause=root.querySelector('#touch-pause');
  let steerPointer=null;
  const heldPointers=new Map();

  function updateSteer(event){
    const rect=steerZone.getBoundingClientRect();
    const center=rect.left+rect.width*.5;
    const radius=Math.max(36,rect.width*.34);
    const value=clamp((event.clientX-center)/radius);
    steerKnob.style.setProperty('--touch-steer-x',`${Math.round(value*34)}px`);
    onSteer(value);
  }
  function releaseSteer(event){
    if(steerPointer!==event.pointerId)return;
    steerPointer=null;
    try{steerZone.releasePointerCapture(event.pointerId);}catch{}
    steerKnob.style.setProperty('--touch-steer-x','0px');
    onSteer(0);
  }
  steerZone.addEventListener('pointerdown',event=>{
    if(steerPointer!==null)return;
    steerPointer=event.pointerId;
    if(event.isTrusted)steerZone.setPointerCapture?.(event.pointerId);
    updateSteer(event);
    event.preventDefault();
  });
  steerZone.addEventListener('pointermove',event=>{
    if(steerPointer===event.pointerId)updateSteer(event);
  });
  steerZone.addEventListener('pointerup',releaseSteer);
  steerZone.addEventListener('pointercancel',releaseSteer);

  function bindHold(button,onChange){
    button.addEventListener('pointerdown',event=>{
      heldPointers.set(event.pointerId,{button,onChange});
      if(event.isTrusted)button.setPointerCapture?.(event.pointerId);
      button.classList.add('is-held');
      onChange(true);
      event.preventDefault();
    });
    const release=event=>{
      const held=heldPointers.get(event.pointerId);
      if(!held||held.button!==button)return;
      heldPointers.delete(event.pointerId);
      button.classList.remove('is-held');
      try{button.releasePointerCapture(event.pointerId);}catch{}
      onChange(false);
    };
    button.addEventListener('pointerup',release);
    button.addEventListener('pointercancel',release);
    button.addEventListener('lostpointercapture',release);
  }

  bindHold(jump,onJump);
  bindHold(tuck,onTuck);
  bindHold(brake,onBrake);
  for(const button of root.querySelectorAll('[data-touch-trick]')){
    const type=button.dataset.touchTrick==='backflip'?TRICK_TYPE.BACKFLIP:TRICK_TYPE.SPIN_360;
    bindHold(button,pressed=>onTrick(type,pressed));
  }
  pause.addEventListener('pointerdown',event=>{
    onPause();
    event.preventDefault();
  });

  function reset(){
    steerPointer=null;
    heldPointers.clear();
    steerKnob.style.setProperty('--touch-steer-x','0px');
    root.querySelectorAll('.is-held').forEach(element=>element.classList.remove('is-held'));
    onSteer(0);
    onJump(false);
    onTuck(false);
    onBrake(false);
    onTrick(TRICK_TYPE.SPIN_360,false);
    onTrick(TRICK_TYPE.BACKFLIP,false);
  }
  windowRef?.addEventListener?.('blur',reset);
  documentRef?.addEventListener?.('visibilitychange',()=>{if(documentRef.hidden)reset();});

  return {root,reset};
}
