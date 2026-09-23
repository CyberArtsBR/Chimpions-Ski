export const OBSTACLE_TUNING=Object.freeze({
  log:Object.freeze({
    length:2.9,
    capOffset:1.46,
    collisionHalfWidth:1.34,
    visualHalfWidth:1.52,
    radiusZ:.48,
    clearance:.60
  }),
  wideLog:Object.freeze({
    length:6.3,
    snowLength:5.85,
    capOffset:3.17,
    collisionHalfWidth:3.00,
    visualHalfWidth:3.25,
    radiusZ:.58,
    clearance:.82
  }),
  oil:Object.freeze({
    visualScaleX:2.05,
    visualScaleZ:.78,
    sheenScaleX:1.92,
    sheenScaleZ:.70,
    collisionHalfWidth:1.92,
    visualHalfWidth:2.10,
    radiusZ:.74,
    clearance:.10
  })
});

export function obstacleCollisionHalfWidth(kind,fallback=0){
  return OBSTACLE_TUNING[kind]?.collisionHalfWidth??fallback;
}

export function obstacleVisualHalfWidth(kind,fallback=0){
  return OBSTACLE_TUNING[kind]?.visualHalfWidth??fallback;
}

export function obstacleHalfDepth(kind,fallback=.7){
  return OBSTACLE_TUNING[kind]?.radiusZ??fallback;
}
