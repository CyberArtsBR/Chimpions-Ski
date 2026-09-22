import {parseArgs,getRoot,read,exists,jsSources,result,finish,STATUS} from './integration-check-utils.mjs';

const args=parseArgs(),root=getRoot(args);
const named=['src/trickSystem.js','src/trickInput.js','src/trickScoring.js'].filter(function(p){return exists(root,p);});
const strong=/backflip|\b360\b|trickType|trickState|failedTrick/i;
const discovered=jsSources(root).filter(function(p){return strong.test(read(root,p));});
const present=[...new Set([...named,...discovered])].sort();
const results=[];
const requirements=[
 ['normal Jump: no trick',/normal|none|no.?trick|trickType.{0,20}(?:null|none)/i],
 ['DOWN + Jump: 360',/(down|axisY)[\s\S]{0,240}(360|spin)|(360|spin)[\s\S]{0,240}(down|axisY)/i],
 ['second airborne Jump starts 360',/(airborne|air)[\s\S]{0,320}(jump|second)[\s\S]{0,320}(360|spin)/i],
 ['manual 360 can complete',/manual[\s\S]{0,260}(360|spin)[\s\S]{0,260}(complete|success|land)/i],
 ['ramp 360 can complete',/ramp[\s\S]{0,260}(360|spin)[\s\S]{0,260}(complete|success|land)/i],
 ['manual backflip fails landing',/manual[\s\S]{0,300}(backflip|flip)[\s\S]{0,300}(fail|crash|invalid)/i],
 ['ramp backflip succeeds',/ramp[\s\S]{0,300}(backflip|flip)[\s\S]{0,300}(success|complete|land)/i],
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
 const second=[...source.matchAll(/.{0,320}(?:second|airborne).{0,760}(?:jump|360|spin).{0,320}/gis)].map(function(m){return m[0];}).join('\n');
 const writesVertical=/\b(?:vy|verticalVelocity)\s*(?:=|\+=)/.test(second);
 results.push(result('second airborne Jump preserves vertical velocity',writesVertical?STATUS.FAIL:STATUS.PASS,writesVertical?'vertical velocity assignment found near airborne trick logic':'no vertical velocity mutation found near airborne trick logic'));
 const forbidden=/(player|physicsRoot|collisionRoot|camera)\.(?:rotation|quaternion)\s*(?:[.=]|\+=)/.test(source);
 results.push(result('trick code never rotates physics/collision/camera root',forbidden?STATUS.FAIL:STATUS.PASS,forbidden?'forbidden root transform assignment found':'no forbidden root transform assignment found'));
}
finish('trick-system-invariants',results,{json:!!args.json,extra:{root,present}});
