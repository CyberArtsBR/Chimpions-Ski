import {frameMark,frameSummarySince,pending,round} from './core.mjs';

export async function openSelector(page){
  const mark=await frameMark(page);
  const started=Date.now();
  const opened=await page.evaluate(()=>{
    const button=document.querySelector('#choose');
    if(!button||button.disabled)return {ok:false,reason:'Choose Chimpion control unavailable or disabled'};
    button.click();
    return {ok:true};
  });
  if(!opened.ok)return {status:'PENDING',reason:opened.reason};
  try{
    await page.waitForFunction(()=>document.querySelector('#chimpion-selector')?.open===true,undefined,{timeout:5000,polling:100});
  }catch{
    return pending('Choose control did not open #chimpion-selector');
  }
  const dom=await selectorDomMetrics(page);
  const frames=await frameSummarySince(page,mark);
  return {status:'PASS',openTimeMs:round(Date.now()-started,3),frames,...dom};
}
export async function selectorDomMetrics(page){
  return page.evaluate(()=>{
    const dialog=document.querySelector('#chimpion-selector');
    return {
      selectorOpen:!!dialog?.open,
      selectorDomNodes:dialog?dialog.getElementsByTagName('*').length:0,
      cards:dialog?.querySelectorAll('.chimpion-card').length??0,
      images:dialog?.querySelectorAll('img').length??0,
      totalDomNodes:document.getElementsByTagName('*').length,
      imageUrls:dialog?Array.from(dialog.querySelectorAll('img')).map(img=>img.currentSrc||img.src).filter(Boolean):[]
    };
  });
}
export async function closeSelector(page){
  const state=await page.evaluate(()=>{
    const dialog=document.querySelector('#chimpion-selector');
    if(!dialog?.open)return {closed:true};
    const close=dialog.querySelector('.selector-close');
    if(close){close.click();return {closed:true};}
    dialog.close();
    return {closed:true};
  });
  try{await page.waitForFunction(()=>!document.querySelector('#chimpion-selector')?.open,undefined,{timeout:3000,polling:100});}catch{}
  const after=await selectorDomMetrics(page);
  return {...state,after};
}
export async function benchmarkSearch(page,terms){
  const results=[];
  for(const term of terms){
    const result=await page.evaluate(searchTerm=>{
      const input=document.querySelector('#chimpion-search');
      if(!input)return {status:'PENDING',term:searchTerm,reason:'#chimpion-search unavailable'};
      const started=performance.now();
      input.value=searchTerm;
      input.dispatchEvent(new Event('input',{bubbles:true}));
      const dialog=document.querySelector('#chimpion-selector');
      return {
        status:'PASS',
        term:searchTerm,
        updateTimeMs:performance.now()-started,
        cards:dialog?.querySelectorAll('.chimpion-card').length??0,
        images:dialog?.querySelectorAll('img').length??0,
        totalDomNodes:document.getElementsByTagName('*').length
      };
    },term);
    if(Number.isFinite(result.updateTimeMs))result.updateTimeMs=round(result.updateTimeMs,3);
    results.push(result);
  }
  await page.evaluate(()=>{
    const input=document.querySelector('#chimpion-search');
    if(input){input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));}
  });
  return results;
}
export async function benchmarkRepeatedSelector(page,iterations,portraitUrls){
  if(iterations<=0)return pending('SELECTOR_ITERATIONS=0');
  const cycles=[];
  for(let i=0;i<iterations;i++){
    if(await page.evaluate(()=>document.querySelector('#chimpion-selector')?.open===true))await closeSelector(page);
    const opened=await openSelector(page);
    if(opened.status!=='PASS')return opened;
    for(const url of opened.imageUrls||[])portraitUrls.add(url);
    const closed=await closeSelector(page);
    cycles.push({iteration:i+1,openTimeMs:opened.openTimeMs,cardsOpen:opened.cards,imagesOpen:opened.images,cardsClosed:closed.after.cards,imagesClosed:closed.after.images,totalDomNodesClosed:closed.after.totalDomNodes});
  }
  return {
    status:'PASS',
    iterations:cycles,
    averageOpenTimeMs:round(cycles.reduce((sum,item)=>sum+item.openTimeMs,0)/cycles.length,3),
    maxClosedCards:Math.max(...cycles.map(item=>item.cardsClosed)),
    maxClosedImages:Math.max(...cycles.map(item=>item.imagesClosed))
  };
}

