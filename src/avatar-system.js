import {
  AVATAR_SELECTOR_INITIAL_RENDER,
  AVATAR_SELECTOR_RENDER_CHUNK,
  buildAvatarSearchIndex,
  filterAvatarSearchIndex,
  getAvatarRenderTarget
} from './avatar-selector-model.js';

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

export function createAvatarSelector({catalog,onSelect,selectedId=''}) {
  const dialog=document.createElement('dialog');
  dialog.id='chimpion-selector';
  dialog.className='selector-dialog';
  dialog.setAttribute('aria-labelledby','selector-title');
  dialog.innerHTML='<form method="dialog" class="selector-shell"><header class="selector-head"><div><small>THE CHIMPIONS</small><h2 id="selector-title">Choose your skier</h2></div><button class="selector-close" value="close" aria-label="Close Chimpion selector">×</button></header><div class="selector-featured"><span id="selector-preview-portrait" class="selector-preview-portrait">🐵</span><span><small>READY TO RIDE</small><strong id="selector-preview-name">Choose a Chimpion</strong><em id="selector-preview-tribe">The Chimpions</em></span></div><input id="chimpion-search" class="selector-search" type="search" placeholder="Search Chimpion..." autocomplete="off" aria-label="Search Chimpions"><div id="chimpion-grid" class="selector-grid" role="list"></div><div class="selector-help">D-PAD / STICK · Navigate &nbsp; A · Select &nbsp; B · Back</div></form>';
  document.body.append(dialog);

  const grid=dialog.querySelector('#chimpion-grid');
  const search=dialog.querySelector('#chimpion-search');
  const previewPortrait=dialog.querySelector('#selector-preview-portrait');
  const previewName=dialog.querySelector('#selector-preview-name');
  const previewTribe=dialog.querySelector('#selector-preview-tribe');
  const closeButton=dialog.querySelector('.selector-close');

  const searchIndex=buildAvatarSearchIndex(catalog);
  const entryById=new Map(searchIndex.map(record=>[record.id,record.entry]));
  let currentSelectedId=String(selectedId||'');
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

  function getEntry(id){
    return entryById.get(String(id));
  }

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
    }else{
      previewPortrait.append(createFallback());
    }

    previewName.textContent=entry.name||'Chimpion';
    previewTribe.textContent=entry.tribe||'Chimpion';
  }

  function setLoading(value){
    loading=!!value;
    dialog.classList.toggle('is-loading',loading);
    dialog.setAttribute('aria-busy',String(loading));
    search.disabled=loading;
    for(const button of grid.querySelectorAll('button'))button.disabled=loading;
    closeButton.disabled=loading;
  }

  async function choose(entry,button){
    if(loading||!entry)return;
    setLoading(true);
    button?.classList.add('is-loading-card');
    try{
      await onSelect(entry);
      currentSelectedId=String(entry.id);
      updatePreview(entry);
      dialog.close();
    }catch(error){
      console.warn('Could not load selected Chimpion:',error);
    }finally{
      button?.classList.remove('is-loading-card');
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
    const name=document.createElement('strong');
    name.textContent=entry.name;
    const tribe=document.createElement('small');
    tribe.textContent=entry.tribe||'Chimpion';
    button.append(name,tribe);
    metrics.cardNodesCreated++;
    return button;
  }

  function appendUntil(targetCount){
    const target=Math.min(targetCount,visibleRecords.length);
    if(target<=renderedCount)return;

    const fragment=document.createDocumentFragment();
    for(let index=renderedCount;index<target;index++){
      fragment.append(cardFor(visibleRecords[index],index));
    }
    grid.append(fragment);
    renderedCount=target;
    metrics.renderedCardCount=renderedCount;
  }

  function appendNextChunk(){
    appendUntil(getAvatarRenderTarget(
      visibleRecords.length,
      renderedCount,
      AVATAR_SELECTOR_RENDER_CHUNK
    ));
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

  function columns(){
    return Math.max(1,Math.floor(grid.clientWidth/155));
  }

  function keyboardMove(event){
    if(!visibleRecords.length)return;
    const active=document.activeElement;
    if(active===search){
      if(event.key==='ArrowDown'){
        event.preventDefault();
        focusCard(0);
      }
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
      if(index<columnCount){
        event.preventDefault();
        search.focus();
        return;
      }
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
      if(!loading)dialog.close();
      prevButtons=buttons.slice();
      return;
    }

    if(pressed(0)){
      const active=document.activeElement;
      if(active===search){
        focusCard(0);
      }else if(active?.classList?.contains('chimpion-card')){
        active.click();
      }else{
        const selectedIndex=visibleRecords.findIndex(record=>record.id===currentSelectedId);
        focusCard(selectedIndex>=0?selectedIndex:0);
      }
    }

    const x=pad?.axis||0,y=pad?.axisY||0;
    if(Math.abs(x)<.35)axisLatchX=0;
    if(Math.abs(y)<.35)axisLatchY=0;

    if(Math.abs(y)>.62&&!axisLatchY){
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
    applyFilter('open');
    dialog.showModal();
    padArmed=false;
    prevButtons=[];
    axisLatchX=axisLatchY=0;
    search.focus();
  }

  function setSelected(entryOrId){
    currentSelectedId=String(typeof entryOrId==='object'?entryOrId?.id:entryOrId??'');
    const entry=typeof entryOrId==='object'?entryOrId:getEntry(currentSelectedId);
    if(entry){
      previewId='';
      updatePreview(entry);
    }

    for(const card of grid.querySelectorAll('.chimpion-card')){
      const selected=String(card.dataset.avatarId)===currentSelectedId;
      card.classList.toggle('is-selected',selected);
      card.setAttribute('aria-pressed',String(selected));
    }
  }

  function getDiagnostics(){
    return {...metrics};
  }

  search.addEventListener('input',()=>applyFilter('search'));
  dialog.addEventListener('keydown',keyboardMove);
  dialog.addEventListener('cancel',event=>{if(loading)event.preventDefault();});
  dialog.addEventListener('close',()=>{
    padArmed=false;
    prevButtons=[];
    axisLatchX=axisLatchY=0;
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
    if(record)choose(record.entry,button);
  });
  grid.addEventListener('error',event=>{
    const image=event.target;
    if(image?.tagName==='IMG'&&image.closest('.portrait'))replaceFailedPortrait(image);
  },true);
  grid.addEventListener('scroll',()=>{
    if(renderedCount>=visibleRecords.length)return;
    if(grid.scrollTop+grid.clientHeight>=grid.scrollHeight-240)appendNextChunk();
  },{passive:true});

  // Keep initial DOM light even before the first modal open.
  applyFilter('open');

  return {
    open,
    close:()=>dialog.close(),
    dialog,
    updateGamepad,
    setSelected,
    setLoading,
    getDiagnostics
  };
}
