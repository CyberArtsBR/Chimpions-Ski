const TIMING_METRICS=Object.freeze([
  'frameTotal',
  'physics',
  'collisionBroadphase',
  'courseTraversal',
  'courseGeneration',
  'courseBatchSync',
  'environmentUpdate'
]);
const COUNTER_METRICS=Object.freeze(['collisionCandidates','collisionChecks']);
const WINDOW=240;
const LONG_FRAME_MS=25;

const now=()=>globalThis.performance?.now?.()??Date.now();

function percentile(sorted,p){
  if(!sorted.length)return 0;
  const index=(sorted.length-1)*p;
  const lo=Math.floor(index),hi=Math.ceil(index);
  if(lo===hi)return sorted[lo];
  return sorted[lo]+(sorted[hi]-sorted[lo])*(index-lo);
}
function round(value,digits=4){
  const scale=10**digits;
  return Math.round((Number(value)||0)*scale)/scale;
}
function makeBuffer(){
  return new Float64Array(WINDOW);
}

export function createPerformanceTelemetry(){
  const timings=Object.fromEntries(TIMING_METRICS.map(name=>[name,makeBuffer()]));
  const counters=Object.fromEntries(COUNTER_METRICS.map(name=>[name,makeBuffer()]));
  const currentTimings=Object.fromEntries(TIMING_METRICS.map(name=>[name,0]));
  const currentCounters=Object.fromEntries(COUNTER_METRICS.map(name=>[name,0]));
  const avatarLoads=makeBuffer();
  let avatarCursor=0;
  let avatarCount=0;
  let cursor=0;
  let count=0;
  let frameOpen=false;
  let frameStartedAt=0;
  let longFrameCount=0;
  let lastFrame={frameTotal:0,collisionCandidates:0,collisionChecks:0};

  function beginFrame(frameIntervalMs=0){
    for(const name of TIMING_METRICS)currentTimings[name]=0;
    for(const name of COUNTER_METRICS)currentCounters[name]=0;
    const interval=Number(frameIntervalMs);
    if(Number.isFinite(interval)&&interval>=0)currentTimings.frameTotal=interval;
    frameStartedAt=now();
    frameOpen=true;
  }
  function record(name,durationMs){
    if(!frameOpen||!Object.hasOwn(currentTimings,name))return;
    const value=Number(durationMs);
    if(Number.isFinite(value)&&value>=0)currentTimings[name]+=value;
  }
  function increment(name,value=1){
    if(!frameOpen||!Object.hasOwn(currentCounters,name))return;
    const amount=Number(value);
    if(Number.isFinite(amount))currentCounters[name]+=amount;
  }
  function endFrame(){
    if(!frameOpen)return;
    if(currentTimings.frameTotal<=0)currentTimings.frameTotal=Math.max(0,now()-frameStartedAt);
    for(const name of TIMING_METRICS)timings[name][cursor]=currentTimings[name];
    for(const name of COUNTER_METRICS)counters[name][cursor]=currentCounters[name];
    if(currentTimings.frameTotal>=LONG_FRAME_MS)longFrameCount++;
    lastFrame={
      frameTotal:currentTimings.frameTotal,
      collisionCandidates:currentCounters.collisionCandidates,
      collisionChecks:currentCounters.collisionChecks
    };
    cursor=(cursor+1)%WINDOW;
    count=Math.min(WINDOW,count+1);
    frameOpen=false;
  }
  function valuesFor(buffer,sampleCount=count,sampleCursor=cursor){
    if(sampleCount===0)return [];
    const values=new Array(sampleCount);
    const start=(sampleCursor-sampleCount+WINDOW)%WINDOW;
    for(let i=0;i<sampleCount;i++)values[i]=buffer[(start+i)%WINDOW];
    return values;
  }
  function statsFor(buffer,sampleCount=count,sampleCursor=cursor){
    const values=valuesFor(buffer,sampleCount,sampleCursor);
    if(!values.length)return {average:0,p50:0,p95:0,p99:0,max:0,samples:0};
    const sorted=[...values].sort((a,b)=>a-b);
    return {
      average:round(values.reduce((sum,value)=>sum+value,0)/values.length),
      p50:round(percentile(sorted,.50)),
      p95:round(percentile(sorted,.95)),
      p99:round(percentile(sorted,.99)),
      max:round(sorted.at(-1)||0),
      samples:values.length
    };
  }
  function metric(name){
    if(Object.hasOwn(timings,name)){
      const stats=statsFor(timings[name]);
      return {averageMs:stats.average,p50Ms:stats.p50,p95Ms:stats.p95,p99Ms:stats.p99,maxMs:stats.max,samples:stats.samples};
    }
    if(Object.hasOwn(counters,name)){
      const stats=statsFor(counters[name]);
      return {average:stats.average,p50:stats.p50,p95:stats.p95,p99:stats.p99,max:stats.max,samples:stats.samples};
    }
    return {averageMs:0,p50Ms:0,p95Ms:0,p99Ms:0,maxMs:0,samples:0};
  }
  function recordAvatarLoad(durationMs){
    const value=Number(durationMs);
    if(!Number.isFinite(value)||value<0)return;
    avatarLoads[avatarCursor]=value;
    avatarCursor=(avatarCursor+1)%WINDOW;
    avatarCount=Math.min(WINDOW,avatarCount+1);
  }
  function avatarStats(){
    return statsFor(avatarLoads,avatarCount,avatarCursor);
  }
  function getFlatSnapshot(){
    const result={
      perfTelemetrySamples:count,
      longFrameCount,
      collisionCandidates:round(lastFrame.collisionCandidates,0),
      collisionChecks:round(lastFrame.collisionChecks,0)
    };
    for(const name of TIMING_METRICS){
      const stats=statsFor(timings[name]);
      const prefix='perf'+name[0].toUpperCase()+name.slice(1);
      result[prefix+'Ms']=stats.average;
      result[prefix+'P50Ms']=stats.p50;
      result[prefix+'P95Ms']=stats.p95;
      result[prefix+'P99Ms']=stats.p99;
      result[prefix+'MaxMs']=stats.max;
    }
    for(const name of COUNTER_METRICS){
      const stats=statsFor(counters[name]);
      const prefix='perf'+name[0].toUpperCase()+name.slice(1);
      result[prefix+'Avg']=stats.average;
      result[prefix+'P95']=stats.p95;
      result[prefix+'Max']=stats.max;
    }
    const frame=statsFor(timings.frameTotal);
    result.frameTimeP50Ms=frame.p50;
    result.frameTimeP95Ms=frame.p95;
    result.frameTimeP99Ms=frame.p99;
    const avatar=avatarStats();
    result.avatarLoadSamples=avatar.samples;
    result.avatarLoadAverageMs=avatar.average;
    result.avatarLoadP95Ms=avatar.p95;
    result.avatarLoadMaxMs=avatar.max;
    return result;
  }
  return {beginFrame,record,increment,endFrame,recordAvatarLoad,getFlatSnapshot,metric};
}
