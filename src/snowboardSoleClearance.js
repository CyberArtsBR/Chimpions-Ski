import * as THREE from 'three';

// Measure actual foot geometry once; ankle height alone cannot describe thick
// or short boots. Runtime checks use a bounded set of foot-local sole samples.
export function createSnowboardSoleClearance(model,rig,board){
  model.updateWorldMatrix(true,true);
  const candidates={left:[],right:[]};
  const point=new THREE.Vector3();
  const belongs=(bone,foot)=>{for(let b=bone;b;b=b.parent)if(b===foot)return true;return false;};
  model.traverse(mesh=>{
    if(!mesh.isSkinnedMesh)return;
    const joints=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight');
    if(!joints||!weights)return;
    mesh.skeleton.update();
    for(const side of ['left','right']){
      const foot=rig[side+'Foot'];
      const indices=new Set(mesh.skeleton.bones.map((bone,index)=>belongs(bone,foot)?index:-1).filter(i=>i>=0));
      for(let i=0;i<joints.count;i++){
        let weight=0;for(let k=0;k<4;k++)if(indices.has(joints.getComponent(i,k)))weight+=weights.getComponent(i,k);
        if(weight<.5)continue;
        mesh.getVertexPosition(i,point);mesh.localToWorld(point);
        const y=point.y;
        candidates[side].push({foot,point:foot.worldToLocal(point.clone()),y});
      }
    }
  });
  const samples=Object.values(candidates).flatMap(list=>list.sort((a,b)=>a.y-b.y).slice(0,12));
  const probe=new THREE.Vector3(),parentY=new THREE.Vector3(),inverseQ=new THREE.Quaternion();
  const desired=(board.userData.deckTopOffset||.064)+.008;
  function update(){
    if(!samples.length)return;
    board.updateWorldMatrix(true,false);
    let lowest=Infinity;
    for(const sample of samples){probe.copy(sample.point);sample.foot.localToWorld(probe);board.worldToLocal(probe);lowest=Math.min(lowest,probe.y);}
    // Account for the current edge/pitch rotation when moving along parent Y.
    if(lowest<desired){
      parentY.set(0,1,0).applyQuaternion(inverseQ.copy(board.quaternion).invert());
      board.position.y-=(desired-lowest)/Math.max(.5,parentY.y);
      board.updateWorldMatrix(false,false);
    }
    board.userData.soleClearance=Math.max(lowest,desired)-(board.userData.deckTopOffset||.064);
    board.userData.soleSampleCount=samples.length;
  }
  return {update,sampleCount:samples.length};
}
