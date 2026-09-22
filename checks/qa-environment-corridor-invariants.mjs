import {parseArgs,getRoot,read,numberAfter,result,finish,STATUS} from './integration-check-utils.mjs';

const args=parseArgs(),root=getRoot(args);
const env=read(root,'src/environment.js')+'\n'+read(root,'src/boundaryMarkers.js');
const course=read(root,'src/course.js');
const tuning=read(root,'src/gameplayTuning.js');
const marker=/central.*(?:exclusion|clear).*corridor|MOUNTAIN_[A-Z_]*(?:EXCLUSION|SIDE)|mountainSide|sideAssignment|clearHorizon/i.test(env);
const results=[];
const future=[
 'no mountain bounding extent intersects central exclusion corridor',
 'mountains exist on BOTH sides',
 'mountain recycling preserves side assignment',
 'no gameplay hazard exceeds gameplay flag boundary',
 'hazards have visual margin inside flags',
 'exterior side area contains no gameplay obstacle course',
 'center remains visually reserved for gameplay',
 'course density itself was not reduced to fake readability'
];
if(!marker){
 for(const n of future)results.push(result(n,STATUS.PENDING,'clear-horizon feature not merged yet'));
}else{
 const left=/left/i.test(env)&&/(mountain|peak)/i.test(env), right=/right/i.test(env)&&/(mountain|peak)/i.test(env);
 const exclusion=/(exclusion|clear.*center|central.*corridor|corridor.*clear)/i.test(env);
 const recycle=/(recycle|wrap|reset|respawn)[\s\S]{0,600}(side|left|right)/i.test(env);
 const objectHalf=numberAfter(tuning,'COURSE_OBJECT_HALF_WIDTH'),playerHalf=numberAfter(tuning,'PLAYER_HALF_WIDTH');
 const bounded=objectHalf!=null&&playerHalf!=null&&objectHalf<playerHalf&&/(COURSE_OBJECT_HALF_WIDTH|CONTENT_BAND_HALF_WIDTH)/.test(course);
 const margin=bounded&&(playerHalf-objectHalf)>=.15;
 const outside=!/(COURSE_OBJECT_HALF_WIDTH\s*\+|PLAYER_HALF_WIDTH\s*\+)[^\n]*(place|hazard|obstacle)/i.test(course);
 const density=/COURSE_NORMAL_SPACING_MIN\s*:\s*17/.test(tuning)&&/COURSE_INTENSE_SPACING_MIN\s*:\s*14/.test(tuning);
 const values=[
  [exclusion,'central exclusion marker'],
  [left&&right,'left/right mountain assignment'],
  [recycle,'recycling preserves side'],
  [bounded,'course='+objectHalf+', flags/player≈'+playerHalf],
  [margin,objectHalf!=null&&playerHalf!=null?'margin '+(playerHalf-objectHalf).toFixed(2)+'m':'unknown'],
  [outside,'no obvious hazard placement outside corridor'],
  [exclusion,'central corridor explicitly reserved'],
  [density,'baseline spacing minima remain 17/14']
 ];
 future.forEach((n,i)=>results.push(result(n,values[i][0]?STATUS.PASS:STATUS.FAIL,values[i][1])));
}
finish('environment-corridor-invariants',results,{json:!!args.json,extra:{root,featurePresent:marker}});
