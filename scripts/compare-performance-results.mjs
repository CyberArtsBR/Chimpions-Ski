import {readFile,writeFile} from 'node:fs/promises';

const [baselinePath='benchmark-baseline.json',highPath='benchmark-high.json',lowPath='benchmark-low.json',outputPath='benchmark-comparison.json']=process.argv.slice(2);

async function load(path){return JSON.parse(await readFile(path,'utf8'));}

const REQUIRED_BENCHMARK_PHASES=Object.freeze([
  'E_gameplayFirst30Seconds',
  'F_extendedGameplay',
  'G_repeatedRestart',
  'I_skiMode',
  'J_snowboardMode',
  'K_trickHeavy'
]);

function assertBenchmarkComplete(label,report){
  if(report?.fatal)throw new Error(label+' benchmark reported fatal: '+String(report.fatal.message||report.fatal));
  for(const phaseName of REQUIRED_BENCHMARK_PHASES){
    const status=report?.phases?.[phaseName]?.status;
    if(status!=='PASS'){
      const reason=report?.phases?.[phaseName]?.reason;
      throw new Error(
        label+' benchmark phase '+phaseName+' did not run successfully: '+
        String(status||'MISSING')+(reason?' ('+reason+')':'')
      );
    }
  }
}

function phaseSummary(report,name){
  const phase=report?.phases?.[name];
  const samples=Array.isArray(phase?.samples)?phase.samples:[];
  const median=key=>{
    const values=samples.map(sample=>Number(sample[key])).filter(Number.isFinite).sort((a,b)=>a-b);
    if(!values.length)return null;
    const mid=Math.floor(values.length/2);
    return values.length%2?values[mid]:(values[mid-1]+values[mid])/2;
  };
  return {
    status:phase?.status??'UNAVAILABLE',
    averageFrameMs:phase?.frames?.averageFrameMs??null,
    p50FrameMs:phase?.frames?.p50FrameMs??null,
    p95FrameMs:phase?.frames?.p95FrameMs??null,
    p99FrameMs:phase?.frames?.p99FrameMs??null,
    framesOver33ms:phase?.frames?.framesOver33ms??null,
    longTasks:phase?.frames?.longTasks?.count??null,
    longTaskTotalMs:phase?.frames?.longTasks?.totalDurationMs??null,
    startSequence:{
      timeToPlayingMs:phase?.startSequence?.timeToPlayingMs??null,
      p50FrameMs:phase?.startSequence?.frames?.p50FrameMs??null,
      p95FrameMs:phase?.startSequence?.frames?.p95FrameMs??null,
      p99FrameMs:phase?.startSequence?.frames?.p99FrameMs??null,
      longTasks:phase?.startSequence?.frames?.longTasks?.count??null,
      longTaskTotalMs:phase?.startSequence?.frames?.longTasks?.totalDurationMs??null
    },
    rendererCallsMedian:median('rendererCalls'),
    rendererTrianglesMedian:median('rendererTriangles'),
    courseTraversalMsMedian:median('perfCourseTraversalMs'),
    courseBatchSyncMsMedian:median('perfCourseBatchSyncMs'),
    environmentUpdateMsMedian:median('perfEnvironmentUpdateMs'),
    rendererPixelRatioMedian:median('rendererPixelRatio'),
    environmentShadowMapSizeMedian:median('environmentShadowMapSize'),
    activeDecorativeTreesMedian:median('activeDecorativeTrees'),
    activeSnowLayerParticlesMedian:median('activeSnowLayerParticles'),
    snowParticleMistActiveMedian:median('snowParticleMistActive'),
    snowParticleChunksActiveMedian:median('snowParticleChunksActive'),
    snowSurfaceMoundsActiveMedian:median('snowSurfaceMoundsActive'),
    snowSurfaceRidgesActiveMedian:median('snowSurfaceRidgesActive')
  };
}

function summarize(report){
  const names=['B_startScreenIdle','C_characterSelectorOpening','E_gameplayFirst30Seconds','F_extendedGameplay','G_repeatedRestart','I_skiMode','J_snowboardMode','K_trickHeavy'];
  return {
    generatedAt:report?.generatedAt??null,
    target:report?.target??null,
    phases:Object.fromEntries(names.map(name=>[name,phaseSummary(report,name)])),
    network:report?.network??null,
    memory:report?.memory??null
  };
}

const [baseline,high,low]=await Promise.all([load(baselinePath),load(highPath),load(lowPath)]);
assertBenchmarkComplete('baseline',baseline);
assertBenchmarkComplete('high',high);
assertBenchmarkComplete('low',low);
const comparison={
  schemaVersion:1,
  generatedAt:new Date().toISOString(),
  baseline:summarize(baseline),
  high:summarize(high),
  low:summarize(low)
};
await writeFile(outputPath,JSON.stringify(comparison,null,2)+'\n','utf8');
console.log(JSON.stringify({status:'COMPLETE',outputPath},null,2));
