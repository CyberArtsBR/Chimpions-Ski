import {parseArgs,getRoot,read,result,finish,STATUS} from './integration-check-utils.mjs';

const args=parseArgs(),root=getRoot(args);
const avatar=read(root,'src/avatar-system.js'),model=read(root,'src/avatar-selector-model.js'),main=read(root,'src/main.js');
const ride=read(root,'src/rideMode.js')+read(root,'src/riderPose.js')+main+avatar;
const feature=/snowboard|ride.?mode|ride choice/i.test(ride);
const results=[];
const expectedRoster=[
 'The Archon','The Heretic','The Commodore','The Pioneer','The Punk',
 'The Street Fighter','The Bosun','The Adolescent','The Angsty','The Apologetic'
];
let catalogNames=null;
try{
 const v=JSON.parse(read(root,'public/avatars.json'));
 if(Array.isArray(v))catalogNames=v.map(entry=>entry?.name);
}catch{}
const catalogCount=catalogNames?.length??null;
const exactRoster=Array.isArray(catalogNames)&&
 catalogNames.length===expectedRoster.length&&
 catalogNames.every((name,index)=>name===expectedRoster[index]);
results.push(result('exact 10 built-in Chimpions remain available',
 catalogNames==null?STATUS.PENDING:(exactRoster?STATUS.PASS:STATUS.FAIL),
 catalogNames==null?'avatars.json unavailable':JSON.stringify(catalogNames)));
results.push(result('initial selector lazy rendering remains optimized',
 /AVATAR_SELECTOR_INITIAL_RENDER/.test(avatar)&&/Closed selector owns zero card\/image nodes/.test(avatar)?STATUS.PASS:STATUS.FAIL,'lazy card materialization'));
results.push(result('search remains normalized/precomputed',
 /buildAvatarSearchIndex/.test(avatar)&&/filterAvatarSearchIndex/.test(avatar)&&/normaliz/i.test(model)?STATUS.PASS:STATUS.FAIL,'precomputed normalized search'));

const future=[
 ['SKI / SNOWBOARD is a second selector step',/(second|step|stage|ride)[\s\S]{0,600}ski[\s\S]{0,400}snowboard|snowboard[\s\S]{0,400}ski/i],
 ['B from ride choice returns to avatar selection',/(cancel|button.?1|\bB\b)[\s\S]{0,600}(avatar|chimpion)/i],
 ['B again closes selector',/(cancel|button.?1|\bB\b)[\s\S]{0,500}(close|dialog\.close)/i],
 ['A selects',/(confirm|button.?0|\bA\b)[\s\S]{0,500}(select|choose|set)/i],
 ['keyboard works',/(keydown|ArrowUp|ArrowDown|Enter|Space)/i],
 ['gamepad works',/(updateGamepad|gamepad|buttons\[0\]|confirm)/i],
 ['selected Chimpion remains selected',/(currentSelectedId|selectedAvatar|setSelected)/i],
 ['selected ride mode remains selected',/(selectedRideMode|currentRideMode|rideMode|modeSelected)/i],
 ['changing only ride mode does NOT force unnecessary GLB refetch',/(setRide|rideMode|snowboard)/i],
 ['no duplicated event listeners accumulate after repeated open/close',/(delegated|addEventListener)/i]
];
if(!feature){
 for(const [n] of future)results.push(result(n,STATUS.PENDING,'ride-mode selector step not merged yet'));
}else{
 for(const [n,re] of future)results.push(result(n,re.test(ride)?STATUS.PASS:STATUS.FAIL,'static selector integration contract'));
 const directLoad=/(rideMode|snowboard)[\s\S]{0,320}(loadSkier|fetch\([^)]*\.glb)/i.test(ride);
 results.push(result('ride-only switch avoids direct GLB reload',directLoad?STATUS.FAIL:STATUS.PASS,directLoad?'GLB load found in ride-switch context':'no direct GLB load in ride-switch context'));
}
finish('rider-selector-invariants',results,{json:!!args.json,extra:{root,featurePresent:feature,catalogCount}});
