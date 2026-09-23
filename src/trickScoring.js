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

export function scoreTrickCompletion(state,{type='',source=''}={}){
  const points=TRICK_POINTS[type]||0;
  if(points)state.score=(state.score||0)+points;
  state.trickType=type||'';
  state.trickPoints=points;
  state.trickSuccess=true;
  state.failedTrick=false;
  const label=type==='BACKFLIP'?'BACKFLIP!':'360!';
  return publish(state,{phase:'complete',type,points,success:true,label,source});
}

export function scoreTrickFailure(state,{type='',source=''}={}){
  state.trickType=type||'';
  state.trickPoints=0;
  state.trickSuccess=false;
  state.failedTrick=true;
  return publish(state,{phase:'fail',type,points:0,success:false,label:'TRICK FAILED',source});
}

// Compatibility helper for callers that still resolve a terminal trick at landing.
export function scoreTrickLanding(state,{type='',success=false,source=''}={}){
  return success
    ?scoreTrickCompletion(state,{type,source})
    :scoreTrickFailure(state,{type,source});
}
