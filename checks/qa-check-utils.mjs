import fs from 'node:fs';
import path from 'node:path';

export function argValue(name, fallback='.'){
  const index=process.argv.indexOf(name);
  return index>=0&&process.argv[index+1]?process.argv[index+1]:fallback;
}
export const root=path.resolve(argValue('--root', process.env.SKI_QA_ROOT||'.'));
export function file(rel){return path.join(root,rel);}
export function exists(rel){return fs.existsSync(file(rel));}
export function read(rel){return exists(rel)?fs.readFileSync(file(rel),'utf8'):'';}
export function readMany(paths){return paths.map(rel=>`\n/* ${rel} */\n${read(rel)}`).join('\n');}
export function kmh(ms){return Number((ms*3.6).toFixed(1));}
export function approx(actual, expected, tolerance=.2){return Math.abs(actual-expected)<=tolerance;}
export function numberFor(source,key){
  const match=source.match(new RegExp(`\\b${key}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`));
  return match?Number(match[1]):null;
}
export function hasAll(source,patterns){return patterns.every(pattern=>typeof pattern==='string'?source.includes(pattern):pattern.test(source));}
export function reporter(name){
  const results=[];
  const add=(status,label,detail='')=>results.push({status,label,detail});
  return {
    pass:(label,detail='')=>add('PASS',label,detail),
    fail:(label,detail='')=>add('FAIL',label,detail),
    pending:(label,detail='')=>add('PENDING',label,detail),
    warn:(label,detail='')=>add('WARN',label,detail),
    finish(){
      for(const item of results)console.log(`${item.status.padEnd(7)} ${item.label}${item.detail?` — ${item.detail}`:''}`);
      const counts=Object.fromEntries(['PASS','FAIL','PENDING','WARN'].map(status=>[status,results.filter(r=>r.status===status).length]));
      console.log(JSON.stringify({check:name,root,counts,results},null,2));
      if(counts.FAIL)process.exitCode=1;
      return {counts,results};
    }
  };
}
