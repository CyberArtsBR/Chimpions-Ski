import * as THREE from 'three';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function terrainHeight(x,z){
  const downhill=-z;

  // Long, periodic alpine rolls give the descent a macro slope rhythm without
  // introducing an unbounded Y drop. Wavelengths are deliberately hundreds of
  // metres so local ski contact and jump surfaces remain smooth.
  const macro=
    Math.sin(downhill*.0075+.90)*.30+
    Math.sin(downhill*.0037-.35)*.16;

  const broad=Math.sin(downhill*.045)*.105+Math.sin(downhill*.017+.65)*.068;
  const crest=Math.sin(downhill*.086+Math.sin(downhill*.012)*.8)*.028;
  const gentleBank=x*.006*Math.sin(downhill*.014+.4);
  const edge01=clamp((Math.abs(x)-8.0)/4.8,0,1);
  const edgeRelief=edge01*edge01*(
    Math.sin(downhill*.027+x*.19)*.14+
    Math.cos(downhill*.014-x*.11)*.07
  );
  return macro+broad+crest+gentleBank+edgeRelief;
}

export function sampleSkiGround(heightFn,x,z,heading=0,halfWidth=.235){
  const halfLength=.68;
  const sin=Math.sin(heading),cos=Math.cos(heading);

  const leftX=x-cos*halfWidth;
  const leftZ=z-sin*halfWidth;
  const rightX=x+cos*halfWidth;
  const rightZ=z+sin*halfWidth;
  const frontX=x+sin*halfLength;
  const frontZ=z-cos*halfLength;
  const backX=x-sin*halfLength;
  const backZ=z+cos*halfLength;

  const leftGround=heightFn(leftX,leftZ);
  const rightGround=heightFn(rightX,rightZ);
  const frontGround=heightFn(frontX,frontZ);
  const backGround=heightFn(backX,backZ);
  const centerGround=heightFn(x,z);

  return {
    centerGround,
    leftGround,
    rightGround,
    frontGround,
    backGround,
    groundRoll:Math.atan2(rightGround-leftGround,halfWidth*2),
    groundPitch:Math.atan2(frontGround-backGround,halfLength*2)
  };
}

export function displaceTerrainChunk(geometry,chunkWorldZ,heightFn=terrainHeight){
  const position=geometry.attributes.position;
  for(let i=0;i<position.count;i++){
    const x=position.getX(i);
    const localWorldZ=-position.getY(i);
    position.setZ(i,heightFn(x,chunkWorldZ+localWorldZ));
  }
  position.needsUpdate=true;
  geometry.computeVertexNormals();
  geometry.attributes.normal.needsUpdate=true;
}

export function dampTerrainContact(target,current,dt){
  const response=10;
  current.groundPitch=THREE.MathUtils.damp(current.groundPitch||0,target.groundPitch,response,dt);
  current.groundRoll=THREE.MathUtils.damp(current.groundRoll||0,target.groundRoll,response,dt);
  current.leftGround=target.leftGround;
  current.rightGround=target.rightGround;
  current.centerGround=target.centerGround;
  return current;
}
