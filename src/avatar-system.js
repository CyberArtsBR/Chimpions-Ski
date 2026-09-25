import {
  AVATAR_SELECTOR_INITIAL_RENDER,
  AVATAR_SELECTOR_RENDER_CHUNK,
  buildAvatarSearchIndex,
  filterAvatarSearchIndex,
  getAvatarRenderTarget
} from './avatar-selector-model.js';
import {RIDE_MODE,getRideProfile,normalizeRideMode,speedToKmh} from './rideMode.js';
import {AVATAR_COMPATIBILITY_STATUS,getAvatarCompatibility} from './avatarCompatibility.js';
import {MENU_ACTION,menuActionFromKeyboardEvent} from './menuNavigation.js';
import {BUILTIN_AVATAR_NAMES,canonicalizeBuiltinCatalog} from './avatarRoster.js';
import {UPLOAD_AVATAR_ACTION,createLocalAvatarEntry,isUploadAvatarAction,validateLocalGlbFile} from './localAvatarUpload.js';

export async function loadAvatarCatalog(){
  // Metadata/thumbnails are cheap; GLBs remain lazy and are loaded only after a
  // concrete rider selection.
  const response=await fetch('/avatars.json');
  if(!response.ok)throw new Error('Could not load Chimpion catalog');
  const entries=canonicalizeBuiltinCatalog(await response.json())
    .map(entry=>({...entry,compatibility:getAvatarCompatibility(entry)}));
  if(entries.length!==BUILTIN_AVATAR_NAMES.length)throw new Error('Built-in Chimpion roster is incomplete');
  return entries;
}

export function randomAvatar(catalog){
  return catalog[Math.floor(Math.random()*catalog.length)];
}

export function disposeAvatarObject(root){
  if(!root)return;
  const disposeRiderAnimation=root.userData?.disposeRiderAnimation;
  if(typeof disposeRiderAnimation==='function'){
    root.userData.disposeRiderAnimation=null;
    disposeRiderAnimation();
  }
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

export function createAvatarSelector({catalog,onSelect,onValidateLocalAvatar=async()=>true,selectedId='',selectedRideMode=RIDE_MODE.SKI}) {
  const dialog=document.createElement('dialog');
  dialog.id='chimpion-selector';
  dialog.className='selector-dialog';
  dialog.setAttribute('aria-labelledby','selector-title');
  dialog.innerHTML='<form method="dialog" class="selector-shell"><header class="selector-head"><div><small>THE CHIMPIONS</small><h2 id="selector-title">Choose your Chimpion</h2></div><button class="selector-close" value="close" aria-label="Close Chimpion selector">×</button></header><div class="selector-featured"><span id="selector-preview-portrait" class="selector-preview-portrait">🐵</span><span><small id="selector-step-label">STEP 1 OF 2 · CHIMPION</small><strong id="selector-preview-name">Choose a Chimpion</strong><em id="selector-preview-tribe">The Chimpions</em></span></div><input id="chimpion-search" class="selector-search" type="search" placeholder="Search Chimpion..." autocomplete="off" aria-label="Search Chimpions"><div id="chimpion-grid" class="selector-grid" role="list"></div><input id="local-glb-upload" type="file" accept=".glb,model/gltf-binary" hidden><p id="selector-status" class="selector-status" role="status" aria-live="polite" hidden></p><section class="ride-mode-step" id="ride-mode-step" hidden aria-label="Choose ride mode"><div class="ride-mode-copy"><small>STEP 2 OF 2</small><strong>Choose Ride</strong><span>Same mountain. Different handling and stance.</span></div><div class="ride-mode-options"><button type="button" class="ride-mode-card" data-ride-mode="ski"><b>⛷</b><strong>SKI</strong><span>150 → 300 km/h</span></button><button type="button" class="ride-mode-card" data-ride-mode="snowboard"><b>🏂</b><strong>SNOWBOARD</strong><span>150 → 300 km/h</span></button></div><button type="button" class="ride-mode-back">BACK TO CHIMPIONS</button></section><div class="selector-help">D-PAD / STICK · Navigate &nbsp; A / ENTER · Select &nbsp; B / ESC · Back</div></form>';
  document.body.append(dialog);
  for(const mode of [RIDE_MODE.SKI,RIDE_MODE.SNOWBOARD]){
    const profile=getRideProfile(mode);
    const speedLabel=dialog.querySelector(`[data-ride-mode="${mode}"] span`);
    if(speedLabel)speedLabel.textContent=`${speedToKmh(profile.baseSpeed)} → ${speedToKmh(profile.maxSpeed)} km/h`;
  }

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
  const fileInput=dialog.querySelector('#local-glb-upload');
  const status=dialog.querySelector('#selector-status');

  let customEntry=null;
  let customObjectUrl='';
  function selectorEntries(){return [...catalog,...(customEntry?[customEntry]:[]),UPLOAD_AVATAR_ACTION];}
  let searchIndex=buildAvatarSearchIndex(selectorEntries());
  let entryById=new Map(searchIndex.map(record=>[record.id,record.entry]));
  function rebuildSearchIndex(){
    searchIndex=buildAvatarSearchIndex(selectorEntries());
    entryById=new Map(searchIndex.map(record=>[record.id,record.entry]));
  }
  let currentSelectedId=String(selectedId||'');
  let currentRideMode=normalizeRideMode(selectedRideMode);
  let pendingEntry=null;
  let step='avatar';
  let loading=false;
  let visibleRecords=searchIndex;
  let renderedCount=0;
  let previewId='';
  let openReturnFocus=null;
  let menuSelected=null;

  function markMenuFocus(element){
    if(menuSelected===element)return;
    menuSelected?.classList?.remove('is-menu-selected');
    menuSelected=element?.matches?.('button:not([disabled])')?element:null;
    menuSelected?.classList?.add('is-menu-selected');
  }

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
    const compatibility=entry.compatibility||getAvatarCompatibility(entry);
    previewTribe.textContent=compatibility.status===AVATAR_COMPATIBILITY_STATUS.UNSUPPORTED
      ?`UNSUPPORTED · ${compatibility.reason}`
      :(entry.tribe||'Chimpion');
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
    const compatibility=entry.compatibility||getAvatarCompatibility(entry);
    if(compatibility.status===AVATAR_COMPATIBILITY_STATUS.UNSUPPORTED){updatePreview(entry);return;}
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
    const uploadAction=isUploadAvatarAction(entry);
    const button=document.createElement('button');
    button.type='button';
    button.className='chimpion-card';
    if(uploadAction)button.classList.add('is-upload-avatar');
    const compatibility=uploadAction?null:(entry.compatibility||getAvatarCompatibility(entry));
    if(compatibility?.status===AVATAR_COMPATIBILITY_STATUS.UNSUPPORTED){
      button.classList.add('is-unsupported');
      button.setAttribute('aria-disabled','true');
      button.title=compatibility.reason;
    }
    button.dataset.avatarId=entry.id;
    button.dataset.filterIndex=String(filteredIndex);
    button.setAttribute('role','listitem');
    const selected=!uploadAction&&String(entry.id)===currentSelectedId;
    button.setAttribute('aria-pressed',String(selected));
    if(selected)button.classList.add('is-selected');
    if(loading)button.disabled=true;
    if(uploadAction){
      const portrait=document.createElement('span');
      portrait.className='portrait local-upload-portrait';
      portrait.innerHTML='<span class="portrait-fallback" aria-hidden="true">⬆</span>';
      button.append(portrait);
    }else button.append(createPortrait(entry));
    const name=document.createElement('strong');name.textContent=entry.name;
    const tribe=document.createElement('small');
    tribe.textContent=uploadAction?'LOCAL ONLY · NO UPLOAD':(compatibility?.status===AVATAR_COMPATIBILITY_STATUS.UNSUPPORTED?'UNSUPPORTED · RIG':(entry.tribe||'Chimpion'));
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

  function handleMenuAction(action){
    if(!dialog.open||loading||!action)return false;
    if(action===MENU_ACTION.CANCEL){
      if(step==='ride')showAvatarStep();
      else dialog.close();
      return true;
    }
    if(step==='ride'){
      const active=document.activeElement;
      const currentRideIndex=Math.max(0,rideButtons.indexOf(active));
      if(action===MENU_ACTION.CONFIRM){
        const target=rideButtons.includes(active)?active:(rideButtons.find(button=>button.dataset.rideMode===currentRideMode)||rideButtons[0]);
        target?.click();
        return true;
      }
      if(action===MENU_ACTION.DOWN&&rideButtons.includes(active)){rideBack.focus();return true;}
      if(action===MENU_ACTION.UP&&active===rideBack){
        (rideButtons.find(button=>button.dataset.rideMode===currentRideMode)||rideButtons[0])?.focus();
        return true;
      }
      if([MENU_ACTION.LEFT,MENU_ACTION.RIGHT,MENU_ACTION.UP,MENU_ACTION.DOWN].includes(action)){
        const direction=(action===MENU_ACTION.LEFT||action===MENU_ACTION.UP)?-1:1;
        rideButtons[(currentRideIndex+direction+rideButtons.length)%rideButtons.length]?.focus();
        return true;
      }
      return false;
    }
    if(action===MENU_ACTION.CONFIRM){
      const active=document.activeElement;
      if(active===search){focusCard(0);return true;}
      if(active?.classList?.contains('chimpion-card')){active.click();return true;}
      const selectedIndex=visibleRecords.findIndex(record=>record.id===currentSelectedId);
      focusCard(selectedIndex>=0?selectedIndex:0);
      return true;
    }
    if(!visibleRecords.length)return false;
    const active=document.activeElement;
    if(active===search){
      if(action===MENU_ACTION.DOWN){focusCard(0);return true;}
      return false;
    }
    const index=activeCardIndex();
    if(index<0){focusCard(0);return true;}
    const columnCount=columns();
    let next=index;
    if(action===MENU_ACTION.RIGHT)next=index+1;
    else if(action===MENU_ACTION.LEFT)next=index-1;
    else if(action===MENU_ACTION.DOWN)next=index+columnCount;
    else if(action===MENU_ACTION.UP){
      if(index<columnCount){search.focus();return true;}
      next=index-columnCount;
    }else return false;
    focusCard(next);
    return true;
  }

  function keyboardMove(event){
    const editableSearch=document.activeElement===search;
    const action=menuActionFromKeyboardEvent(event,{allowWASD:!editableSearch,allowSpace:!editableSearch});
    if(!action)return;
    if(handleMenuAction(action)){
      event.preventDefault();
      event.stopPropagation();
    }
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
  dialog.addEventListener('focusin',event=>markMenuFocus(event.target));
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
    menuSelected?.classList?.remove('is-menu-selected');
    menuSelected=null;
    const target=openReturnFocus;
    openReturnFocus=null;
    setTimeout(()=>{if(target?.isConnected&&!target.disabled)target.focus();},0);
  });
  rideBack.addEventListener('click',()=>{if(!loading)showAvatarStep();});
  rideStep.addEventListener('click',event=>{
    const button=event.target.closest?.('.ride-mode-card');
    if(!button||!rideStep.contains(button))return;
    completeRide(button.dataset.rideMode);
  });

  function showStatus(message='',isError=false){
    status.textContent=message;
    status.classList.toggle('is-error',!!isError);
    status.hidden=!message;
  }

  async function handleLocalFile(file){
    if(!file)return;
    setLoading(true);
    showStatus('Checking local GLB…');
    let nextUrl='';
    let nextEntry=null;
    try{
      await validateLocalGlbFile(file);
      nextUrl=URL.createObjectURL(file);
      nextEntry=createLocalAvatarEntry(file,nextUrl);
      await onValidateLocalAvatar(nextEntry);
      const oldUrl=customObjectUrl;
      customEntry=nextEntry;
      customObjectUrl=nextUrl;
      nextUrl='';
      if(oldUrl)URL.revokeObjectURL(oldUrl);
      rebuildSearchIndex();
      search.value='';
      applyFilter('upload');
      showStatus('Local GLB ready. It stays on this device for this session.');
    }catch(error){
      if(nextUrl)URL.revokeObjectURL(nextUrl);
      showStatus(error?.message||'This GLB could not be used.',true);
      nextEntry=null;
    }finally{
      fileInput.value='';
      setLoading(false);
    }
    if(nextEntry)showRideStep(nextEntry);
  }

  fileInput.addEventListener('change',()=>handleLocalFile(fileInput.files?.[0]));

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
    if(!record)return;
    if(isUploadAvatarAction(record.entry)){
      showStatus('Choose a local .glb file (maximum 50 MB).');
      fileInput.click();
      return;
    }
    showRideStep(record.entry);
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

  function open(){
    if(loading)return;
    openReturnFocus=document.activeElement;
    search.value='';
    showStatus('');
    pendingEntry=null;
    step='avatar';
    applyFilter('open');
    showAvatarStep({focusGrid:false});
    dialog.showModal();
    search.focus();
  }

  function dispose(){
    if(customObjectUrl){
      URL.revokeObjectURL(customObjectUrl);
      customObjectUrl='';
    }
    window.removeEventListener('pagehide',dispose);
    dialog.remove();
  }
  window.addEventListener('pagehide',dispose,{once:true});

  return {
    open,
    close:()=>dialog.close(),
    dispose,
    dialog,
    handleMenuAction,
    setSelected,
    setLoading,
    getDiagnostics,
    getRideMode:()=>currentRideMode
  };
}
