export const TRICK_POINTS=Object.freeze({
  '360':200,
  BACKFLIP:400
});

function publish(state,{phase,type='',points=0,success=null,label='',source=''}={}){
  state.trickEventId=(state.trickEventId||0)+1;
  state.trickEvent={
    id:state.trickEventId,
    phase,
    type,
    points,
    success,
    label,
    source,
    time:state.time||0
  };
  return state.trickEvent;
}

export function resetTrickScoring(state){
  state.trickEventId=0;
  state.trickEvent=null;
  state.trickType='';
  state.trickPoints=0;
  state.trickSuccess=null;
  state.failedTrick=false;
  state.trickCrash=false;
}

export function announceTrickStart(state,type,source=''){
  state.trickType=type||'';
  state.trickPoints=0;
  state.trickSuccess=null;
  state.failedTrick=false;
  return publish(state,{phase:'start',type,success:null,label:'AIR TIME',source});
}

export function scoreTrickLanding(state,{type='',success=false,source=''}={}){
  const points=success?(TRICK_POINTS[type]||0):0;
  if(points)state.score=(state.score||0)+points;
  state.trickType=type||'';
  state.trickPoints=points;
  state.trickSuccess=!!success;
  state.failedTrick=!success;
  const label=success?(type==='BACKFLIP'?'BACKFLIP!':'360!'):'TRICK FAILED';
  return publish(state,{phase:'landing',type,points,success:!!success,label,source});
}
