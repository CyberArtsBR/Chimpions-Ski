import {parseArgs,getRoot,read,exists,jsSources,result,finish,STATUS} from './integration-check-utils.mjs';

const args=parseArgs(),root=getRoot(args);
const named=['src/trickSystem.js','src/trickInput.js','src/trickScoring.js'].filter(function(p){return exists(root,p);});
const strong=/backflip|\b360\b|trickType|trickState|failedTrick/i;
const discovered=jsSources(root).filter(function(p){return strong.test(read(root,p));});
const present=[...new Set([...named,...discovered])].sort();
const results=[];
const requirements=[
 ['normal Jump: no trick',/normal|none|no.?trick|trickType.{0,20}(?:null|none)/i],
 ['UP + Jump: 360',/(up|keyUp|padUp)[\s\S]{0,320}(360|spin)|(360|spin)[\s\S]{0,320}(up|keyUp|padUp)/i],
 ['BACK/DOWN + Jump: backflip',/(back|down|keyDown|padDown)[\s\S]{0,320}backflip|backflip[\s\S]{0,320}(back|down|keyDown|padDown)/i],
 ['second airborne Jump starts 360',/(airborne|air)[\s\S]{0,320}(jump|second)[\s\S]{0,320}(360|spin)/i],
 ['manual 360 can complete',/source='manual'[\s\S]{0,10000}completeActive|completeActive[\s\S]{0,10000}source='manual'/i],
 ['ramp 360 can complete',/armRamp[\s\S]{0,1200}completeActive|completeActive[\s\S]{0,1200}armRamp/i],
 ['manual backflip can complete when started early',/BACKFLIP[\s\S]{0,10000}completeActive|completeActive[\s\S]{0,10000}BACKFLIP/i],
 ['ramp backflip succeeds',/armRamp[\s\S]{0,1800}BACKFLIP|BACKFLIP[\s\S]{0,1800}armRamp/i],
 ['late trick input is rejected without failure',/(late|insufficient)[\s\S]{0,320}(reject|allowed.{0,20}false)[\s\S]{0,320}(no.?fail|normal.?land)|rejectionReason[\s\S]{0,180}insufficient-airtime/i],
 ['remaining airtime uses ballistic prediction',/(remainingAirTime|estimateRemainingAirTime)[\s\S]{0,360}(gravity|discriminant|positive root)/i],
 ['multiple tricks may chain in one airtime',/(tricksThisAir|chain)[\s\S]{0,420}(complete|another|next|multiple)/i],
 ['failed trick = 0 points',/(fail|failed)[\s\S]{0,240}(0|zero)[\s\S]{0,160}(point|score)|(point|score)[\s\S]{0,160}(fail|failed)[\s\S]{0,160}(0|zero)/i],
 ['360 = +200',/(360|spin)[\s\S]{0,180}200|200[\s\S]{0,180}(360|spin)/i],
 ['backflip = +400',/(backflip|flip)[\s\S]{0,180}400|400[\s\S]{0,180}(backflip|flip)/i],
 ['no double-jump',/no.?double|double.?jump|does not.*jump|verticalVelocity|\bvy\b/i],
 ['trick transform isolated from physics/collision/camera root',/(visualPivot|trickPivot|visual.*pivot)[\s\S]{0,600}(rotation|quaternion)/i],
 ['completed trick normalizes visual rotation',/(complete|completed|finish)[\s\S]{0,380}(normalize|identity|set\s*\(\s*0\s*,\s*0\s*,\s*0|rotation)/i],
 ['failed/restart clears trick state',/(fail|restart|reset)[\s\S]{0,520}(trickState|trickType|trickProgress|failedTrick)/i]
];

if(!present.length){
 for(const [name] of requirements)results.push(result(name,STATUS.PENDING,'trick feature not merged yet'));
 results.push(result('second airborne Jump preserves vertical velocity',STATUS.PENDING,'trick feature not merged yet'));
 results.push(result('trick code never rotates physics/collision/camera root',STATUS.PENDING,'trick feature not merged yet'));
}else{
 const source=present.map(function(p){return '// '+p+'\n'+read(root,p);}).join('\n');
 for(const [name,re] of requirements)results.push(result(name,re.test(source)?STATUS.PASS:STATUS.FAIL,'checked '+present.join(', ')));
 const trickInputSource=exists(root,'src/trickInput.js')?read(root,'src/trickInput.js'):'';
 const trickSystemSource=exists(root,'src/trickSystem.js')?read(root,'src/trickSystem.js'):'';
 const exposesFrontFlip=/TRICK_TYPE\.FRONT[_ -]?FLIP|TRICK_TYPE\.FRONTFLIP/i.test(trickInputSource)
   ||/FRONT[_ -]?FLIP\s*:\s*['"]/i.test(trickSystemSource);
 results.push(result('front flip has no normal control mapping',exposesFrontFlip?STATUS.FAIL:STATUS.PASS,exposesFrontFlip?'front-flip executable mapping found':'no front-flip executable mapping found'));
 const backflipUsesForwardSign=/BACKFLIP\?\s*-snapshot\.rotation/.test(trickSystemSource);
 results.push(result('backflip rotates in the backward visual direction',backflipUsesForwardSign?STATUS.FAIL:STATUS.PASS,backflipUsesForwardSign?'legacy negative-X front-flip sign is still present':'backflip uses positive X-axis rotation'));
 const airborneSource=['src/trickSystem.js','src/trickInput.js'].filter(function(p){return exists(root,p);}).map(function(p){return read(root,p);}).join('\n');
 const requestMatch=airborneSource.match(/function requestAirborne[\s\S]{0,1800}?(?=\n  function |\nexport |$)/);
 const second=requestMatch?.[0]||airborneSource;
 const writesVertical=/\b(?:vy|verticalVelocity)\s*(?:=|\+=)/.test(second);
 results.push(result('second airborne Jump preserves vertical velocity',writesVertical?STATUS.FAIL:STATUS.PASS,writesVertical?'vertical velocity assignment found inside airborne trick request path':'airborne trick request path does not mutate vertical velocity'));
 const forbidden=/(player|physicsRoot|collisionRoot|camera)\.(?:rotation|quaternion)\s*(?:[.=]|\+=)/.test(source);
 results.push(result('trick code never rotates physics/collision/camera root',forbidden?STATUS.FAIL:STATUS.PASS,forbidden?'forbidden root transform assignment found':'no forbidden root transform assignment found'));
}
finish('trick-system-invariants',results,{json:!!args.json,extra:{root,present}});
