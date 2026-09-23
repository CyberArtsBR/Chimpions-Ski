const METRICS=Object.freeze(['courseTraversal','courseBatchSync','environmentUpdate']);
const WINDOW=180;

function percentile(sorted,p){
  if(!sorted.length)return 0;
  const index=(sorted.length-1)*p;
  const lo=Math.floor(index),hi=Math.ceil(index);
  if(lo===hi)return sorted[lo];
  return sorted[lo]+(sorted[hi]-sorted[lo])*(index-lo);
}
function round(value,digits=4){
  const scale=10**digits;
  return Math.round(value*scale)/scale;
}

export function createPerformanceTelemetry(){
  const buffers=Object.fromEntries(METRICS.map(name=>[name,new Float64Array(WINDOW)]));
  const current=Object.fromEntries(METRICS.map(name=>[name,0]));
  let cursor=0;
  let count=0;
  let frameOpen=false;

  function beginFrame(){
    for(const name of METRICS)current[name]=0;
    frameOpen=true;
  }
  function record(name,durationMs){
    if(!frameOpen||!Object.hasOwn(current,name))return;
    const value=Number(durationMs);
    if(Number.isFinite(value)&&value>=0)current[name]+=value;
  }
  function endFrame(){
    if(!frameOpen)return;
    for(const name of METRICS)buffers[name][cursor]=current[name];
    cursor=(cursor+1)%WINDOW;
    count=Math.min(WINDOW,count+1);
    frameOpen=false;
  }
  function metric(name){
    if(!Object.hasOwn(buffers,name)||count===0)return {averageMs:0,p95Ms:0,maxMs:0,samples:0};
    const values=new Array(count);
    const start=(cursor-count+WINDOW)%WINDOW;
    for(let i=0;i<count;i++)values[i]=buffers[name][(start+i)%WINDOW];
    const sorted=[...values].sort((a,b)=>a-b);
    const average=values.reduce((sum,value)=>sum+value,0)/values.length;
    return {
      averageMs:round(average),
      p95Ms:round(percentile(sorted,.95)),
      maxMs:round(sorted.at(-1)||0),
      samples:count
    };
  }
  function getFlatSnapshot(){
    const result={perfTelemetrySamples:count};
    for(const name of METRICS){
      const stats=metric(name);
      const prefix='perf'+name[0].toUpperCase()+name.slice(1);
      result[prefix+'Ms']=stats.averageMs;
      result[prefix+'P95Ms']=stats.p95Ms;
      result[prefix+'MaxMs']=stats.maxMs;
    }
    return result;
  }
  return {beginFrame,record,endFrame,getFlatSnapshot,metric};
}
