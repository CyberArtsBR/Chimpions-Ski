import {SKI_TUNING as T} from './gameplayTuning.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function getCourseLookahead(speed=T.BASE_SPEED){
  const byTime=(Number(speed)||T.BASE_SPEED)*T.COURSE_LOOKAHEAD_SECONDS;
  return clamp(
    Math.max(T.COURSE_LOOKAHEAD_MIN,byTime),
    T.COURSE_LOOKAHEAD_MIN,
    T.COURSE_LOOKAHEAD_MAX
  );
}
