const DEFAULT_BUCKET_SIZE=8;

function finite(value,fallback=0){
  const number=Number(value);
  return Number.isFinite(number)?number:fallback;
}

export function createCollisionBroadphase({bucketSize=DEFAULT_BUCKET_SIZE}={}){
  const size=Math.max(2,finite(bucketSize,DEFAULT_BUCKET_SIZE));
  const buckets=new Map();
  const membership=new WeakMap();
  let activeItems=0;
  let queryCount=0;
  let lastCandidateCount=0;
  let maxCandidateCount=0;
  let totalCandidates=0;

  const bucketFor=z=>Math.floor(finite(z)/size);

  function add(item,localZ){
    if(!item||typeof item!=='object')return false;
    remove(item);
    const z=finite(localZ,item?.userData?.courseLocalZ??item?.position?.z??0);
    const index=bucketFor(z);
    let bucket=buckets.get(index);
    if(!bucket){
      bucket=new Set();
      buckets.set(index,bucket);
    }
    bucket.add(item);
    membership.set(item,index);
    if(item.userData)item.userData.courseLocalZ=z;
    activeItems++;
    return true;
  }

  function remove(item){
    if(!item||typeof item!=='object')return false;
    const index=membership.get(item);
    if(index===undefined)return false;
    const bucket=buckets.get(index);
    if(bucket){
      bucket.delete(item);
      if(bucket.size===0)buckets.delete(index);
    }
    membership.delete(item);
    activeItems=Math.max(0,activeItems-1);
    return true;
  }

  function query(centerZ,halfRange=3.5,target=[]){
    target.length=0;
    const center=finite(centerZ);
    const range=Math.max(0,finite(halfRange,3.5));
    const first=bucketFor(center-range);
    const last=bucketFor(center+range);
    for(let index=first;index<=last;index++){
      const bucket=buckets.get(index);
      if(!bucket)continue;
      for(const item of bucket)target.push(item);
    }
    queryCount++;
    lastCandidateCount=target.length;
    maxCandidateCount=Math.max(maxCandidateCount,lastCandidateCount);
    totalCandidates+=lastCandidateCount;
    return target;
  }

  function clear(){
    buckets.clear();
    activeItems=0;
    lastCandidateCount=0;
    maxCandidateCount=0;
    totalCandidates=0;
    queryCount=0;
  }

  function getDiagnostics(){
    let largestBucket=0;
    for(const bucket of buckets.values())largestBucket=Math.max(largestBucket,bucket.size);
    return {
      broadphaseBucketSize:size,
      broadphaseBuckets:buckets.size,
      broadphaseActiveItems:activeItems,
      broadphaseQueries:queryCount,
      nearbyCandidateCount:lastCandidateCount,
      broadphaseMaxCandidates:maxCandidateCount,
      broadphaseAverageCandidates:queryCount?totalCandidates/queryCount:0,
      broadphaseLargestBucket:largestBucket
    };
  }

  return {add,remove,query,clear,getDiagnostics};
}
