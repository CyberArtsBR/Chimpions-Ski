export const OBSTACLE_TUNING=Object.freeze({
  log:Object.freeze({
    length:3.8,
    capOffset:1.91,
    collisionHalfWidth:1.86,
    visualHalfWidth:1.98,
    radiusZ:.46,
    clearance:.88
  }),
  wideLog:Object.freeze({
    length:7.2,
    snowLength:6.65,
    capOffset:3.61,
    collisionHalfWidth:3.55,
    visualHalfWidth:3.70,
    radiusZ:.56,
    clearance:1.08
  }),
  oil:Object.freeze({
    visualScaleX:3.20,
    visualScaleZ:1.42,
    sheenScaleX:3.0,
    sheenScaleZ:1.30,
    collisionHalfWidth:3.20,
    visualHalfWidth:3.25,
    radiusZ:1.42,
    clearance:.10
  })
});

// The renderer and narrow collision phase use the same organic silhouette.
export function oilContourRadius(angle){
  return .78+.10*Math.sin(angle+1.3)+.075*Math.sin(angle*3+.6)+.045*Math.sin(angle*5-1.2);
}
export function touchesOil(x,z,paddingX=0,paddingZ=0){
  const nx=x/(OBSTACLE_TUNING.oil.visualScaleX+paddingX),nz=z/(OBSTACLE_TUNING.oil.visualScaleZ+paddingZ);
  return Math.hypot(nx,nz)<=oilContourRadius(Math.atan2(nz,nx));
}

export function obstacleCollisionHalfWidth(kind,fallback=0){
  return OBSTACLE_TUNING[kind]?.collisionHalfWidth??fallback;
}

export function obstacleVisualHalfWidth(kind,fallback=0){
  return OBSTACLE_TUNING[kind]?.visualHalfWidth??fallback;
}

export function obstacleHalfDepth(kind,fallback=.7){
  return OBSTACLE_TUNING[kind]?.radiusZ??fallback;
}
