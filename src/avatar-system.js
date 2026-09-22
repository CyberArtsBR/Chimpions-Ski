import {
  AVATAR_SELECTOR_INITIAL_RENDER,
  AVATAR_SELECTOR_RENDER_CHUNK,
  buildAvatarSearchIndex,
  filterAvatarSearchIndex,
  getAvatarRenderTarget
} from './avatar-selector-model.js';
import {RIDE_MODE,normalizeRideMode} from './rideMode.js';

export async function loadAvatarCatalog(){
  // Use the browser's normal HTTP cache/revalidation rules. Deployment/versioned
  // responses can still revalidate via ETag/Last-Modified without forcing a full
  // avatars.json transfer on every load.
  const response=await fetch('/avatars.json');
  if(!response.ok)throw new Error('Could not load Chimpion catalog');
  const entries=(await response.json()).filter(entry=>entry?.url&&entry.id!=='steamboat-willie'&&entry.id!=='chimpion');
  if(!entries.length)throw new Error('No playable Chimpions in catalog');
  return entries;
}

export function randomAvatar(catalog){
  return catalog[Math.floor(Math.random()*catalog.length)];
}

export function disposeAvatarObject(root){
  if(!root)return;
  const geometries=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set();
  root.traverse?.(object=>{
    if(object.geometry?.dispose)geometries.add(object.geometry);
    if(object.skeleton?.dispose)skeletons.add(object.skeleton);
    const list=Array.isArray(object.material)?object.material:[object.material];
    for(const material of list){
      if(!material)continue;
      materials.add(material);
      for(const key of Object.keys(material)){
        const value=material[key];
        if(value?.isTexture&&value.dispose)textures.add(value);
      }
      if(material.uniforms){
        for(const uniform of Object.values(material.uniforms)){
          const value=uniform?.value;
          if(value?.isTexture&&value.dispose)textures.add(value);
        }
      }
    }
  });
  for(const skeleton of skeletons)skeleton.dispose();
  for(const texture of textures)texture.dispose();
  for(const material of materials)material.dispose?.();
  for(const geometry of geometries)geometry.dispose();
}


function createFallback(){
  const fallback=document.createElement('span');
  fallback.className='portrait-fallback';
  fallback.textContent='🐵';
  return fallback;
}

function replaceFailedPortrait(image){
  if(!image?.isConnected)return;
  image.replaceWith(createFallback());
}

function createPortrait(entry,className=''){
  const wrap=document.createElement('span');
  wrap.className=('portrait '+className).trim();
  if(entry?.image){
    const image=document.createElement('img');
    image.src=entry.image;
    image.alt='';
    image.loading='lazy';
    image.decoding='async';
    image.fetchPriority='low';
    image.draggable=false;
    wrap.append(image);
  }else{
    wrap.append(createFallback());
  }
  return wrap;
}

export function createAvatarSelector({catalog,onSelect,selectedId='',selectedRideMode=RIDE_MODE.SKI}) {
  const dialog=document.createElement('dialog');
  dialog.id='chimpion-selector';
  dialog.className='selector-dialog';
  dialog.setAttribute('aria-labelledby','selector-title');
  dialog.innerHTML='<form method="dialog" class="selector-shell"><header class="selector-head"><div><small>THE CHIMPIONS</small><h2 id="selector-title">Choose your Chimpion</h2></div><button class="selector-close" value="close" aria-label="Close Chimpion selector">×</button></header><div class="selector-featured"><span id="selector-preview-portrait" class="selector-preview-portrait">🐵</span><span><small id="selector-step-label">STEP 1 OF 2 · CHIMPION</small><strong id="selector-preview-name">Choose a Chimpion</strong><em id="selector-preview-tribe">The Chimpions</em></span></div><input id="chimpion-search" class="selector-search" type="search" placeholder="Search Chimpion..." autocomplete="off" aria-label="Search Chimpions"><div id="chimpion-grid" class="selector-grid" role="list"></div><section class="ride-mode-step" id="ride-mode-step" hidden aria-label="Choose ride mode"><div class="ride-mode-copy"><small>STEP 2 OF 2</small><strong>Choose Ride</strong><span>Same mountain. Different speed and stance.</span></div><div class="ride-mode-options"><button type="button" class="ride-mode-card" data-ride-mode="ski"><b>⛷</b><strong>SKI</strong><span>160 → 210 km/h</span></button><button type="button" class="ride-mode-card" data-ride-mode="snowboard"><b>🏂</b><strong>SNOWBOARD</strong><span>180 → 230 km/h</span></button></div><button type="button" class="ride-mode-back">BACK TO CHIMPIONS</button></section><div class="selector-help">D-PAD / STICK · Navigate &nbsp; A / ENTER · Select &nbsp; B / ESC · Back</div></form>';
  document.body.append(dialog);

  const grid=dialog.querySelector('#chimpion-grid');
  const search=dialog.querySelector('#chimpion-search');
  const previewPortrait=dialog.querySelector('#selector-preview-portrait');
  const previewName=dialog.querySelector('#selector-preview-name');
  const previewTribe=dialog.querySelector('#selector-preview-tribe');
  const title=dialog.querySelector('#selector-title');
  const stepLabel=dialog.querySelector('#selector-step-label');
  const closeButton=dialog.querySelector('.selector-close');
  const rideStep=dialog.querySelector('#ride-mode-step');
  const rideButtons=Array.from(dialog.querySelectorAll('.ride-mode-card'));
  const rideBack=dialog.querySelector('.ride-mode-back');

  const searchIndex=buildAvatarSearchIndex(catalog);
  const entryById=new Map(searchIndex.map(record=>[record.id,record.entry]));
  let currentSelectedId=String(selectedId||'');
  let currentRideMode=normalizeRideMode(selectedRideMode);
  let pendingEntry=null;
  let step='avatar';
  let loading=false;
  let visibleRecords=searchIndex;
  let renderedCount=0;
  let previewId='';
  let prevButtons=[];
  let axisLatchX=0,axisLatchY=0,padArmed=false;

  const metrics={
    catalogSize:catalog.length,
    filteredCount:catalog.length,
    renderedCardCount:0,
    initialRenderLimit:AVATAR_SELECTOR_INITIAL_RENDER,
    renderChunkSize:AVATAR_SELECTOR_RENDER_CHUNK,
    cardNodesCreated:0,
    lastOpenRenderMs:0,
    lastSearchRenderMs:0
  };

  function getEntry(id){return entryById.get(String(id));}

  function updatePreview(entry){
    if(!entry)return;
    const id=String(entry.id??'');
    if(id===previewId)return;
    previewId=id;
    previewPortrait.replaceChildren();
    if(entry.image){
      const image=document.createElement('img');
      image.src=entry.image;
      image.alt='';
      image.loading='eager';
      image.decoding='async';
      image.fetchPriority='high';
      image.draggable=false;
      image.onerror=()=>replaceFailedPortrait(image);
      previewPortrait.append(image);
    }else previewPortrait.append(createFallback());
    previewName.textContent=entry.name||'Chimpion';
    previewTribe.textContent=entry.tribe||'Chimpion';
  }

  function syncRideButtons(){
    for(const button of rideButtons){
      const selected=button.dataset.rideMode===currentRideMode;
      button.classList.toggle('is-selected',selected);
      button.setAttribute('aria-pressed',String(selected));
    }
  }

  function syncSelectedCards(){
    for(const card of grid.querySelectorAll('.chimpion-card')){
      const selected=String(card.dataset.avatarId)===currentSelectedId;
      card.classList.toggle('is-selected',selected);
      card.setAttribute('aria-pressed',String(selected));
    }
  }

  function setLoading(value){
    loading=!!value;
    dialog.classList.toggle('is-loading',loading);
    dialog.setAttribute('aria-busy',String(loading));
    search.disabled=loading;
    for(const button of grid.querySelectorAll('button'))button.disabled=loading;
    for(const button of rideButtons)button.disabled=loading;
    rideBack.disabled=loading;
    closeButton.disabled=loading;
  }

  function showRideStep(entry){
    if(loading||!entry)return;
    pendingEntry=entry;
    step='ride';
    updatePreview(entry);
    title.textContent='Choose your ride';
    stepLabel.textContent='STEP 2 OF 2 · RIDE';
    search.hidden=true;
    grid.hidden=true;
    rideStep.hidden=false;
    syncRideButtons();
    const preferred=rideButtons.find(button=>button.dataset.rideMode===currentRideMode)||rideButtons[0];
    setTimeout(()=>preferred?.focus(),0);
  }

  function showAvatarStep({focusGrid=true}={}){
    step='avatar';
    title.textContent='Choose your Chimpion';
    stepLabel.textContent='STEP 1 OF 2 · CHIMPION';
    rideStep.hidden=true;
    search.hidden=false;
    grid.hidden=false;
    const entry=pendingEntry||getEntry(currentSelectedId)||visibleRecords[0]?.entry;
    if(entry)updatePreview(entry);
    if(focusGrid){
      const pendingId=String(pendingEntry?.id||currentSelectedId||'');
      const index=visibleRecords.findIndex(record=>record.id===pendingId);
      setTimeout(()=>index>=0?focusCard(index):search.focus(),0);
    }
  }

  async function completeRide(mode){
    if(loading||!pendingEntry)return;
    const nextMode=normalizeRideMode(mode);
    setLoading(true);
    try{
      await onSelect(pendingEntry,nextMode);
      currentSelectedId=String(pendingEntry.id);
      currentRideMode=nextMode;
      syncRideButtons();
      syncSelectedCards();
      updatePreview(pendingEntry);
      dialog.close();
    }catch(error){
      console.warn('Could not load selected Chimpion:',error);
    }finally{
      setLoading(false);
    }
  }

  function cardFor(record,filteredIndex){
    const {entry}=record;
    const button=document.createElement('button');
    button.type='button';
    button.className='chimpion-card';
    button.dataset.avatarId=entry.id;
    button.dataset.filterIndex=String(filteredIndex);
    button.setAttribute('role','listitem');
    const selected=String(entry.id)===currentSelectedId;
    button.setAttribute('aria-pressed',String(selected));
    if(selected)button.classList.add('is-selected');
    if(loading)button.disabled=true;
    button.append(createPortrait(entry));
    const name=document.createElement('strong');name.textContent=entry.name;
    const tribe=document.createElement('small');tribe.textContent=entry.tribe||'Chimpion';
    button.append(name,tribe);
    metrics.cardNodesCreated++;
    return button;
  }

  function appendUntil(targetCount){
    const target=Math.min(targetCount,visibleRecords.length);
    if(target<=renderedCount)return;
    const fragment=document.createDocumentFragment();
    for(let index=renderedCount;index<target;index++)fragment.append(cardFor(visibleRecords[index],index));
    grid.append(fragment);
    renderedCount=target;
    metrics.renderedCardCount=renderedCount;
  }
  function appendNextChunk(){
    appendUntil(getAvatarRenderTarget(visibleRecords.length,renderedCount,AVATAR_SELECTOR_RENDER_CHUNK));
  }
  function applyFilter(reason='search'){
    const started=performance.now();
    visibleRecords=filterAvatarSearchIndex(searchIndex,search.value);
    renderedCount=0;
    grid.replaceChildren();
    grid.scrollTop=0;
    appendUntil(getAvatarRenderTarget(visibleRecords.length,0,AVATAR_SELECTOR_RENDER_CHUNK));
    metrics.filteredCount=visibleRecords.length;
    metrics.renderedCardCount=renderedCount;
    const elapsed=performance.now()-started;
    if(reason==='open')metrics.lastOpenRenderMs=elapsed;
    else metrics.lastSearchRenderMs=elapsed;
    const selected=getEntry(currentSelectedId)||visibleRecords[0]?.entry;
    if(selected)updatePreview(selected);
  }
  function ensureRenderedThrough(index){
    if(index<0)return;
    while(renderedCount<=index&&renderedCount<visibleRecords.length)appendNextChunk();
  }
  function cardAt(index){
    if(index<0||index>=visibleRecords.length)return null;
    ensureRenderedThrough(index);
    return grid.querySelector('.chimpion-card[data-filter-index="'+index+'"]');
  }
  function focusCard(index){
    if(!visibleRecords.length)return;
    const clamped=Math.max(0,Math.min(visibleRecords.length-1,index));
    const card=cardAt(clamped);
    if(!card)return;
    card.focus({preventScroll:true});
    card.scrollIntoView({block:'nearest',inline:'nearest'});
  }
  function activeCardIndex(){
    const active=document.activeElement;
    if(!active?.classList?.contains('chimpion-card'))return -1;
    const index=Number(active.dataset.filterIndex);
    return Number.isFinite(index)?index:-1;
  }
  function columns(){return Math.max(1,Math.floor(grid.clientWidth/155));}

  function keyboardMove(event){
    if(step==='ride'){
      if(event.key==='Escape'){
        event.preventDefault();
        showAvatarStep();
        return;
      }
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
        event.preventDefault();
        const current=Math.max(0,rideButtons.indexOf(document.activeElement));
        const direction=(event.key==='ArrowLeft'||event.key==='ArrowUp')?-1:1;
        rideButtons[(current+direction+rideButtons.length)%rideButtons.length]?.focus();
      }
      return;
    }
    if(!visibleRecords.length)return;
    const active=document.activeElement;
    if(active===search){
      if(event.key==='ArrowDown'){event.preventDefault();focusCard(0);}
      return;
    }
    const index=activeCardIndex();
    if(index<0)return;
    const columnCount=columns();
    let next=index;
    if(event.key==='ArrowRight')next=index+1;
    else if(event.key==='ArrowLeft')next=index-1;
    else if(event.key==='ArrowDown')next=index+columnCount;
    else if(event.key==='ArrowUp'){
      if(index<columnCount){event.preventDefault();search.focus();return;}
      next=index-columnCount;
    }else return;
    event.preventDefault();
    focusCard(next);
  }

  function updateGamepad(pad){
    if(!dialog.open)return;
    const buttons=pad?.buttons||[];
    const neutral=!buttons[0]&&!buttons[1]&&!buttons[9]&&Math.abs(pad?.axis||0)<.35&&Math.abs(pad?.axisY||0)<.35;
    if(!padArmed){
      if(neutral)padArmed=true;
      prevButtons=buttons.slice();
      return;
    }
    const pressed=index=>!!buttons[index]&&!prevButtons[index];

    if(pressed(1)){
      if(!loading){
        if(step==='ride')showAvatarStep();
        else dialog.close();
      }
      prevButtons=buttons.slice();
      return;
    }

    if(pressed(0)){
      if(step==='ride'){
        const active=rideButtons.includes(document.activeElement)?document.activeElement:(rideButtons.find(button=>button.dataset.rideMode===currentRideMode)||rideButtons[0]);
        active?.click();
      }else{
        const active=document.activeElement;
        if(active===search)focusCard(0);
        else if(active?.classList?.contains('chimpion-card'))active.click();
        else{
          const selectedIndex=visibleRecords.findIndex(record=>record.id===currentSelectedId);
          focusCard(selectedIndex>=0?selectedIndex:0);
        }
      }
    }

    const x=pad?.axis||0,y=pad?.axisY||0;
    if(Math.abs(x)<.35)axisLatchX=0;
    if(Math.abs(y)<.35)axisLatchY=0;

    if(step==='ride'){
      const navAxis=Math.abs(x)>.62?x:(Math.abs(y)>.62?y:0);
      const latched=Math.abs(x)>.62?axisLatchX:axisLatchY;
      if(navAxis&&!latched){
        if(Math.abs(x)>.62)axisLatchX=Math.sign(x);else axisLatchY=Math.sign(y);
        const current=Math.max(0,rideButtons.indexOf(document.activeElement));
        rideButtons[(current+Math.sign(navAxis)+rideButtons.length)%rideButtons.length]?.focus();
      }
    }else if(Math.abs(y)>.62&&!axisLatchY){
      axisLatchY=Math.sign(y);
      const index=activeCardIndex();
      const columnCount=columns();
      if(document.activeElement===search&&y>0)focusCard(0);
      else if(index>=0){
        if(y<0&&index<columnCount)search.focus();
        else focusCard(index+Math.sign(y)*columnCount);
      }else focusCard(0);
    }else if(Math.abs(x)>.62&&!axisLatchX){
      axisLatchX=Math.sign(x);
      const index=activeCardIndex();
      focusCard(index<0?0:index+Math.sign(x));
    }
    prevButtons=buttons.slice();
  }

  function open(){
    if(loading)return;
    search.value='';
    pendingEntry=null;
    step='avatar';
    applyFilter('open');
    showAvatarStep({focusGrid:false});
    dialog.showModal();
    padArmed=false;
    prevButtons=[];
    axisLatchX=axisLatchY=0;
    search.focus();
  }

  function setSelected(entryOrId,rideMode=currentRideMode){
    currentSelectedId=String(typeof entryOrId==='object'?entryOrId?.id:entryOrId??'');
    currentRideMode=normalizeRideMode(rideMode);
    const entry=typeof entryOrId==='object'?entryOrId:getEntry(currentSelectedId);
    if(entry){previewId='';updatePreview(entry);}
    syncSelectedCards();
    syncRideButtons();
  }

  function getDiagnostics(){
    return {...metrics,selectorStep:step,rideMode:currentRideMode};
  }

  search.addEventListener('input',()=>applyFilter('search'));
  dialog.addEventListener('keydown',keyboardMove);
  dialog.addEventListener('cancel',event=>{
    if(loading){event.preventDefault();return;}
    if(step==='ride'){event.preventDefault();showAvatarStep();}
  });
  dialog.addEventListener('close',()=>{
    step='avatar';
    pendingEntry=null;
    rideStep.hidden=true;
    search.hidden=false;
    grid.hidden=false;
    padArmed=false;
    prevButtons=[];
    axisLatchX=axisLatchY=0;
  });
  rideBack.addEventListener('click',()=>{if(!loading)showAvatarStep();});
  rideStep.addEventListener('click',event=>{
    const button=event.target.closest?.('.ride-mode-card');
    if(!button||!rideStep.contains(button))return;
    completeRide(button.dataset.rideMode);
  });

  // One delegated listener per interaction type instead of three listeners per card.
  grid.addEventListener('focusin',event=>{
    const button=event.target.closest?.('.chimpion-card');
    if(!button)return;
    const record=visibleRecords[Number(button.dataset.filterIndex)];
    if(record)updatePreview(record.entry);
  });
  grid.addEventListener('pointerover',event=>{
    const button=event.target.closest?.('.chimpion-card');
    if(!button||button.contains(event.relatedTarget))return;
    const record=visibleRecords[Number(button.dataset.filterIndex)];
    if(record)updatePreview(record.entry);
  });
  grid.addEventListener('click',event=>{
    const button=event.target.closest?.('.chimpion-card');
    if(!button||!grid.contains(button))return;
    const record=visibleRecords[Number(button.dataset.filterIndex)];
    if(record)showRideStep(record.entry);
  });
  grid.addEventListener('error',event=>{
    const image=event.target;
    if(image?.tagName==='IMG'&&image.closest('.portrait'))replaceFailedPortrait(image);
  },true);
  grid.addEventListener('scroll',()=>{
    if(renderedCount>=visibleRecords.length)return;
    if(grid.scrollTop+grid.clientHeight>=grid.scrollHeight-240)appendNextChunk();
  },{passive:true});

  // Closed selector owns zero card/image nodes. Cards are materialized only on open.
  metrics.filteredCount=visibleRecords.length;
  metrics.renderedCardCount=0;
  syncRideButtons();

  return {
    open,
    close:()=>dialog.close(),
    dialog,
    updateGamepad,
    setSelected,
    setLoading,
    getDiagnostics,
    getRideMode:()=>currentRideMode
  };
}
