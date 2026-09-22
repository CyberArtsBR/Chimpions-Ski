import {parseArgs,getRoot,read,exists,result,finish,STATUS} from './integration-check-utils.mjs';

const args=parseArgs(); const root=getRoot(args);
const paths=['src/trickSystem.js','src/trickInput.js','src/trickScoring.js'];
const present=paths.filter(p=>exists(root,p));
const results=[];
const requirements=[
  ['normal Jump: no trick',/normal|none|no.?trick|trickType.{0,20}(?:null|none)/i],
  ['DOWN + Jump: 360',/(down|axisY)[\s\S]{0,220}(360|spin)|(360|spin)[\s\S]{0,220}(down|axisY)/i],
  ['second airborne Jump starts 360',/(airborne|air)[\s\S]{0,260}(second|jump)[\s\S]{0,260}(360|spin)|(second|jump)[\s\S]{0,260}(360|spin)/i],
  ['manual 360 can complete',/(manual)[\s\S]{0,220}(360|spin)[\s\S]{0,220}(complete|success|land)/i],
  ['ramp 360 can complete',/(ramp)[\s\S]{0,220}(360|spin)[\s\S]{0,220}(complete|success|land)/i],
  ['manual backflip fails landing',/(manual)[\s\S]{0,260}(backflip|flip)[\s\S]{0,260}(fail|crash|invalid)/i],
  ['ramp backflip succeeds',/(ramp)[\s\S]{0,260}(backflip|flip)[\s\S]{0,260}(success|complete|land)/i],
  ['failed trick = 0 points',/(fail|failed)[\s\S]{0,220}(0|zero)[\s\S]{0,120}(point|score)|(point|score)[\s\S]{0,120}(fail|failed)[\s\S]{0,120}(0|zero)/i],
  ['360 = +200',/(360|spin)[\s\S]{0,140}200|200[\s\S]{0,140}(360|spin)/i],
  ['backflip = +400',/(backflip|flip)[\s\S]{0,140}400|400[\s\S]{0,140}(backflip|flip)/i],
  ['no double-jump',/no.?double|double.?jump|does not.*jump|verticalVelocity|\bvy\b/i],
  ['trick transform isolated from physics/collision/camera root',/(visualPivot|trickPivot|visual.*pivot)[\s\S]{0,500}(rotation|quaternion)/i],
  ['completed trick normalizes visual rotation',/(complete|completed|finish)[\s\S]{0,320}(normalize|identity|set\s*\(\s*0\s*,\s*0\s*,\s*0|rotation)/i],
  ['failed/restart clears trick state',/(fail|restart|reset)[\s\S]{0,420}(trickState|trickType|trickProgress|failedTrick)/i]
];

if(!present.length){
  for(const [name] of requirements)results.push(result(name,STATUS.PENDING,'trick feature files not merged yet'));
  results.push(result('second airborne Jump preserves vertical velocity',STATUS.PENDING,'trick feature files not merged yet'));
}else{
  const source=present.map(p=>`// ${p}\n${read(root,p)}`).join('\n');
  for(const [name,re] of requirements)results.push(result(name,re.test(source)?STATUS.PASS:STATUS.FAIL,`checked ${present.join(', ')}`));
  const secondJumpBlocks=[...source.matchAll(/.{0,260}(?:second|airborne).{0,600}(?:jump|360|spin).{0,260}/gis)].map(m=>m[0]).join('\n');
  const writesVertical=/\b(?:vy|verticalVelocity)\s*=|\b(?:vy|verticalVelocity)\s*\+=/.test(secondJumpBlocks);
  results.push(result('second airborne Jump preserves vertical velocity',writesVertical?STATUS.FAIL:STATUS.PASS,writesVertical?'vertical velocity assignment found near second-airborne-jump logic':'no vertical velocity mutation found near second-airborne-jump logic'));
  const forbiddenRootRotation=/(player|physicsRoot|collisionRoot|camera)\.rotation\s*[.=]|(?:player|physicsRoot|collisionRoot|camera)\.quaternion\s*[.=]/.test(source);
  if(forbiddenRootRotation)results.push(result('trick code never rotates physics/collision/camera root',STATUS.FAIL,'forbidden root rotation assignment found'));
  else results.push(result('trick code never rotates physics/collision/camera root',STATUS.PASS,'no forbidden root transform assignment found'));
}
finish('trick-system-invariants',results,{json:!!args.json,extra:{root,present}});
