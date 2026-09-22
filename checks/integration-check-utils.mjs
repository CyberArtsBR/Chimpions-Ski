import {existsSync,readFileSync,readdirSync,statSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';

export const STATUS=Object.freeze({PASS:'PASS',FAIL:'FAIL',PENDING:'PENDING'});

export function parseArgs(argv=process.argv.slice(2)){
  const out={_:[]};
  for(let i=0;i<argv.length;i++){
    const token=argv[i];
    if(!token.startsWith('--')){out._.push(token);continue;}
    const eq=token.indexOf('=');
    if(eq>2){out[token.slice(2,eq)]=token.slice(eq+1);continue;}
    const key=token.slice(2);
    const next=argv[i+1];
    if(next!=null&&!next.startsWith('--')){out[key]=next;i++;}
    else out[key]=true;
  }
  return out;
}

export function getRoot(args=parseArgs()){
  return resolve(String(args.root||process.cwd()));
}

export function file(root,path){return join(root,path);}
export function exists(root,path){return existsSync(file(root,path));}
export function read(root,path){
  try{return readFileSync(file(root,path),'utf8');}catch{return '';}
}

export function walk(root,subdir='src',filter=()=>true){
  const base=file(root,subdir);
  if(!existsSync(base))return [];
  const out=[];
  const visit=dir=>{
    for(const name of readdirSync(dir)){
      const p=join(dir,name); const st=statSync(p);
      if(st.isDirectory())visit(p);
      else if(filter(p))out.push(relative(root,p).replaceAll('\\','/'));
    }
  };
  visit(base); return out.sort();
}

export function sourceBundle(root,paths){
  return paths.map(path=>`\n// FILE: ${path}\n${read(root,path)}`).join('\n');
}

export function jsSources(root){return walk(root,'src',p=>p.endsWith('.js')||p.endsWith('.mjs'));}
export function normalized(text){return String(text||'').replace(/\s+/g,' ').trim();}
export function near(a,b,tolerance=.08){return Math.abs(Number(a)-Number(b))<=tolerance;}
export function msToKmh(v){return Number(v)*3.6;}
export function numberAfter(source,name){
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=source.match(new RegExp(`${escaped}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`));
  return match?Number(match[1]):null;
}
export function hasAny(source,patterns){return patterns.some(p=>p instanceof RegExp?p.test(source):source.includes(p));}
export function hasAll(source,patterns){return patterns.every(p=>p instanceof RegExp?p.test(source):source.includes(p));}

export function result(name,status,detail='',meta={}){return {name,status,detail,...meta};}

export function finish(check,results,{json=false,extra={}}={}){
  const counts={PASS:0,FAIL:0,PENDING:0};
  for(const r of results)counts[r.status]=(counts[r.status]||0)+1;
  const overall=counts.FAIL?'FAIL':counts.PENDING?'PENDING':'PASS';
  if(!json){
    for(const r of results)console.log(`[${r.status}] ${r.name}${r.detail?` — ${r.detail}`:''}`);
    console.log(`${check}: ${overall} (${counts.PASS} pass, ${counts.FAIL} fail, ${counts.PENDING} pending)`);
  }
  console.log(JSON.stringify({check,overall,counts,results,...extra},null,json?2:0));
  if(counts.FAIL)process.exitCode=1;
  return {overall,counts};
}
