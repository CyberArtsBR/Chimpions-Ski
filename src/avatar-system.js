export async function loadAvatarCatalog(){
  const response=await fetch('/avatars.json',{cache:'no-store'});
  if(!response.ok)throw new Error('Could not load Chimpion catalog');
  const entries=(await response.json()).filter(entry=>entry?.url&&entry.id!=='steamboat-willie'&&entry.id!=='chimpion');
  if(!entries.length)throw new Error('No playable Chimpions in catalog');
  return entries;
}
export function randomAvatar(catalog){return catalog[Math.floor(Math.random()*catalog.length)];}
export function createAvatarSelector({catalog,onSelect}){
  const dialog=document.createElement('dialog');dialog.id='chimpion-selector';dialog.className='selector-dialog';
  dialog.innerHTML=`<form method="dialog" class="selector-shell"><header class="selector-head"><div><small>THE CHIMPIONS</small><h2>Choose your skier</h2></div><button class="selector-close" value="close" aria-label="Close">×</button></header><input id="chimpion-search" class="selector-search" type="search" placeholder="Search Chimpion..." autocomplete="off"><div id="chimpion-grid" class="selector-grid"></div></form>`;
  document.body.append(dialog);const grid=dialog.querySelector('#chimpion-grid'),search=dialog.querySelector('#chimpion-search');
  const render=()=>{const q=search.value.trim().toLowerCase();const filtered=catalog.filter(a=>(a.name+' '+(a.tribe||'')).toLowerCase().includes(q));grid.innerHTML='';
    for(const entry of filtered){const b=document.createElement('button');b.type='button';b.className='chimpion-card';b.innerHTML=`<span class="portrait">${entry.image?`<img src="${entry.image}" alt="" loading="lazy">`:'<span class="portrait-fallback">🐵</span>'}</span><strong>${entry.name}</strong><small>${entry.tribe||'Chimpion'}</small>`;b.onclick=()=>{onSelect(entry);dialog.close();};grid.append(b);}};
  search.addEventListener('input',render);render();return {open(){search.value='';render();dialog.showModal();search.focus();},dialog};
}
