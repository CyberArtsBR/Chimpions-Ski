import {SKI_TUNING as T} from './gameplayTuning.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function resolveCourseEdgeContact(state,dt,{limit=T.PLAYER_BOUNDARY_HALF_WIDTH,profile=null}={}){
  state.edgeContactCooldown=Math.max(0,(state.edgeContactCooldown||0)-Math.max(0,dt||0));
  const side=Math.sign(state.x)||Math.sign(state.vx)||1;
  const atEdge=Math.abs(state.x)>=limit-1e-6;
  state.edgeContact=atEdge;

  if(!atEdge||state.vx*side<=0){
    if(Math.abs(state.x)<limit-T.EDGE_CONTACT_RELEASE_MARGIN)state.edgeContactSide=0;
    return null;
  }

  const speed=Math.max(profile?.baseSpeed||T.BASE_SPEED,Number(state.speed)||T.BASE_SPEED);
  const reference=Math.max(.001,speed*T.EDGE_CONTACT_REFERENCE_LATERAL_RATIO);
  const intensity=clamp(Math.abs(state.vx)/reference,.18,1);

  state.x=side*limit;
  const deflection=T.EDGE_CONTACT_DEFLECTION_MIN+
    (T.EDGE_CONTACT_DEFLECTION_MAX-T.EDGE_CONTACT_DEFLECTION_MIN)*intensity;
  state.vx=-side*deflection;
  if(state.heading*side>0)state.heading*=.48;
  if(state.turnRate*side>0)state.turnRate*=.32;

  const minSpeed=(profile?.baseSpeed||T.BASE_SPEED)*.90;
  state.speed=Math.max(minSpeed,state.speed*(1-T.EDGE_CONTACT_SPEED_SCRUB*intensity));
  state.edgeContactSide=side;

  if(state.edgeContactCooldown>0)return null;
  state.edgeContactCooldown=T.EDGE_CONTACT_COOLDOWN;
  const event={
    type:'edgeScrape',
    intensity,
    side:side<0?'left':'right',
    serial:(state.edgeScrapeSerial||0)+1
  };
  state.edgeScrapeSerial=event.serial;
  state.lastEdgeScrape=event;
  return event;
}
