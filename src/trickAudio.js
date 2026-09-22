const TRICK_TYPES=new Set(['360','backflip']);
const MAX_RECENT_EVENT_KEYS=96;

export function normalizeTrickType(type){
  return TRICK_TYPES.has(type)?type:null;
}

function eventKey(phase,type,eventId){
  if(eventId===undefined||eventId===null||eventId==='')return null;
  return phase+':'+type+':'+String(eventId);
}

export function getTrickSuccessProfile(type,combo=1){
  const trick=normalizeTrickType(type);
  if(!trick)return null;
  const level=Math.max(1,Math.min(3,Math.floor(Number(combo)||1)));
  const comboStep=level-1;
  const baseGain=trick==='backflip'?.39:.29;
  const baseRate=trick==='backflip'?1:.99;
  return {
    sound:trick==='backflip'?'trickBackflipSuccess':'trick360Success',
    gain:Math.min(.48,baseGain+comboStep*.035),
    rate:Math.min(1.18,baseRate+comboStep*.07),
    comboLevel:level,
    pan:trick==='360'?.10:0
  };
}

export function getTrickStartProfile(type,generation=0){
  const trick=normalizeTrickType(type);
  if(!trick)return null;
  if(trick==='backflip')return {sound:'trickBackflipStart',gain:.34,rate:1,pan:0};
  return {sound:'trick360Start',gain:.25,rate:1,pan:generation%2===0?-.22:.22};
}

export function getTrickFailProfile(type){
  const trick=normalizeTrickType(type);
  if(!trick)return null;
  return {sound:'trickFail',gain:trick==='backflip'?.40:.31,rate:trick==='backflip'?.93:1.03,pan:0};
}

export function createTrickAudioState(){
  let generation=0;
  let activeType=null;
  let anonymousResultLatch=null;
  const recentKeys=[];
  const recentSet=new Set();

  function remember(key){
    if(!key)return true;
    if(recentSet.has(key))return false;
    recentSet.add(key);
    recentKeys.push(key);
    if(recentKeys.length>MAX_RECENT_EVENT_KEYS){
      recentSet.delete(recentKeys.shift());
    }
    return true;
  }

  function start(type,eventId){
    const trick=normalizeTrickType(type);
    if(!trick)return {play:false,type:null,generation};
    const key=eventKey('start',trick,eventId);
    if(key){
      if(!remember(key))return {play:false,type:trick,generation};
    }else if(activeType===trick){
      return {play:false,type:trick,generation};
    }
    generation++;
    activeType=trick;
    anonymousResultLatch=null;
    return {play:true,type:trick,generation};
  }

  function result(type,outcome,eventId){
    const trick=normalizeTrickType(type);
    if(!trick||(outcome!=='success'&&outcome!=='fail'))return {play:false,type:null,generation};
    const key=eventKey(outcome,trick,eventId);
    if(key){
      if(!remember(key))return {play:false,type:trick,generation};
    }else{
      const anonymousKey=outcome+':'+trick;
      if(anonymousResultLatch===anonymousKey)return {play:false,type:trick,generation};
      anonymousResultLatch=anonymousKey;
    }
    activeType=null;
    return {play:true,type:trick,generation};
  }

  function reset(){
    generation=0;
    activeType=null;
    anonymousResultLatch=null;
    recentKeys.length=0;
    recentSet.clear();
  }

  function diagnostics(){
    return {generation,activeType,recentEventCount:recentKeys.length,anonymousResultLatch};
  }

  return {start,result,reset,diagnostics};
}
