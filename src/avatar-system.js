export async function loadAvatarCatalog(){
  const response=await fetch('/avatars.json',{cache:'no-store'});
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

function createPortrait(entry,className=''){
  const wrap=document.createElement('span');
  wrap.className=('portrait '+className).trim();
  if(entry?.image){
    const image=document.createElement('img');
    image.src=entry.image;
    image.alt='';
    image.loading='lazy';
    image.decoding='async';
    wrap.append(image);
  }else{
    const fallback=document.createElement('span');
    fallback.className='portrait-fallback';
    fallback.textContent='🐵';
    wrap.append(fallback);
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
  let currentSelectedId=selectedId||'';
  let loading=false;
  let visibleEntries=[];
  let prevButtons=[];
  let axisLatchX=0,axisLatchY=0,padArmed=false;

  function entryById(id){return catalog.find(entry=>String(entry.id)===String(id));}
  function updatePreview(entry){
    if(!entry)return;
    previewPortrait.replaceChildren();
    if(entry.image){
      const image=document.createElement('img');
      image.src=entry.image;image.alt='';image.decoding='async';
      previewPortrait.append(image);
    }else previewPortrait.textContent='🐵';
    previewName.textContent=entry.name||'Chimpion';
    previewTribe.textContent=entry.tribe||'Chimpion';
  }
  function setLoading(value){
    loading=!!value;
    dialog.classList.toggle('is-loading',loading);
    dialog.setAttribute('aria-busy',String(loading));
    search.disabled=loading;
    for(const button of grid.querySelectorAll('button'))button.disabled=loading;
    const close=dialog.querySelector('.selector-close');
    if(close)close.disabled=loading;
  }
  async function choose(entry,button){
    if(loading||!entry)return;
    setLoading(true);
    button?.classList.add('is-loading-card');
    try{
      await onSelect(entry);
      currentSelectedId=entry.id;
      updatePreview(entry);
      dialog.close();
    }catch(error){
      console.warn('Could not load selected Chimpion:',error);
    }finally{
      button?.classList.remove('is-loading-card');
      setLoading(false);
    }
  }
  function cardFor(entry){
    const button=document.createElement('button');
    button.type='button';
    button.className='chimpion-card';
    button.dataset.avatarId=entry.id;
    button.setAttribute('role','listitem');
    button.setAttribute('aria-pressed',String(String(entry.id)===String(currentSelectedId)));
    if(String(entry.id)===String(currentSelectedId))button.classList.add('is-selected');
    button.append(createPortrait(entry));
    const name=document.createElement('strong');name.textContent=entry.name;
    const tribe=document.createElement('small');tribe.textContent=entry.tribe||'Chimpion';
    button.append(name,tribe);
    button.addEventListener('focus',()=>updatePreview(entry));
    button.addEventListener('pointerenter',()=>updatePreview(entry));
    button.addEventListener('click',()=>choose(entry,button));
    return button;
  }
  function render(){
    const query=search.value.trim().toLowerCase();
    visibleEntries=catalog.filter(entry=>(entry.name+' '+(entry.tribe||'')).toLowerCase().includes(query));
    grid.replaceChildren();
    const fragment=document.createDocumentFragment();
    for(const entry of visibleEntries)fragment.append(cardFor(entry));
    grid.append(fragment);
    const selected=entryById(currentSelectedId)||visibleEntries[0];
    if(selected)updatePreview(selected);
  }
  function cards(){return Array.from(grid.querySelectorAll('.chimpion-card:not([disabled])'));}
  function focusCard(index){
    const list=cards();
    if(!list.length)return;
    const clamped=Math.max(0,Math.min(list.length-1,index));
    list[clamped].focus({preventScroll:true});
    list[clamped].scrollIntoView({block:'nearest',inline:'nearest'});
  }
  function keyboardMove(event){
    const list=cards();
    if(!list.length)return;
    const active=document.activeElement;
    if(active===search){
      if(event.key==='ArrowDown'){
        event.preventDefault();
        focusCard(0);
      }
      return;
    }
    const index=list.indexOf(active);
    if(index<0)return;
    const columns=Math.max(1,Math.floor(grid.clientWidth/155));
    let next=index;
    if(event.key==='ArrowRight')next=index+1;
    else if(event.key==='ArrowLeft')next=index-1;
    else if(event.key==='ArrowDown')next=index+columns;
    else if(event.key==='ArrowUp'){
      if(index<columns){event.preventDefault();search.focus();return;}
      next=index-columns;
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
        const first=cards()[0];
        if(first)first.focus();
      }else if(active?.classList?.contains('chimpion-card'))active.click();
      else{
        const selected=grid.querySelector('.chimpion-card.is-selected')||cards()[0];
        selected?.focus();
      }
    }
    const x=pad?.axis||0,y=pad?.axisY||0;
    if(Math.abs(x)<.35)axisLatchX=0;
    if(Math.abs(y)<.35)axisLatchY=0;
    if(Math.abs(y)>.62&&!axisLatchY){
      axisLatchY=Math.sign(y);
      const list=cards(),active=document.activeElement,index=list.indexOf(active);
      const columns=Math.max(1,Math.floor(grid.clientWidth/155));
      if(active===search&&y>0)focusCard(0);
      else if(index>=0){
        if(y<0&&index<columns)search.focus();
        else focusCard(index+Math.sign(y)*columns);
      }else focusCard(0);
    }else if(Math.abs(x)>.62&&!axisLatchX){
      axisLatchX=Math.sign(x);
      const list=cards(),index=list.indexOf(document.activeElement);
      focusCard(index<0?0:index+Math.sign(x));
    }
    prevButtons=buttons.slice();
  }
  function open(){
    if(loading)return;
    search.value='';
    render();
    dialog.showModal();
    padArmed=false;
    prevButtons=[];
    axisLatchX=axisLatchY=0;
    const selected=grid.querySelector('.chimpion-card.is-selected');
    if(selected)selected.scrollIntoView({block:'center'});
    search.focus();
  }
  function setSelected(entryOrId){
    currentSelectedId=typeof entryOrId==='object'?entryOrId?.id:entryOrId;
    const entry=typeof entryOrId==='object'?entryOrId:entryById(currentSelectedId);
    if(entry)updatePreview(entry);
    for(const card of grid.querySelectorAll('.chimpion-card')){
      const selected=String(card.dataset.avatarId)===String(currentSelectedId);
      card.classList.toggle('is-selected',selected);
      card.setAttribute('aria-pressed',String(selected));
    }
  }

  search.addEventListener('input',render);
  dialog.addEventListener('keydown',keyboardMove);
  dialog.addEventListener('cancel',event=>{if(loading)event.preventDefault();});
  dialog.addEventListener('close',()=>{padArmed=false;prevButtons=[];axisLatchX=axisLatchY=0;});
  render();

  return {open,close:()=>dialog.close(),dialog,updateGamepad,setSelected,setLoading};
}
