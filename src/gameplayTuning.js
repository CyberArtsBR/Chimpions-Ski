export const SKI_TUNING=Object.freeze({
  // Practical ski corridor: ±11.3 versus the previous ±8.1 (~39.5% wider).
  PLAYER_HALF_WIDTH:11.3,
  COURSE_OBJECT_HALF_WIDTH:11.05,
  SAFE_ROUTE_HALF_WIDTH:9.7,
  CONTENT_BAND_HALF_WIDTH:10.7,

  // 120 km/h opening pace, then +10 km/h every 30 seconds to a 210 km/h cap.
  BASE_SPEED:33.3333,
  SPEED_TIER_SECONDS:30,
  SPEED_TIER_INCREMENT:2.7778,
  MAX_SPEED:58.3333,
  SPEED_RESPONSE:2.2,

  // Responsive arcade carving, deliberately calmer than the previous hyper-reactive pass.
  INPUT_DEADZONE:.022,
  CONTROLLER_DEADZONE:.14,
  EDGE_RESPONSE:40,
  EDGE_RELEASE:20,
  EDGE_REVERSAL:58,
  CARVE_LOAD_RESPONSE:22,
  TURN_RATE_BASE:3.8,
  TURN_RATE_SPEED_BONUS:.30,
  TURN_INPUT_ASSIST:.68,
  TURN_RESPONSE:25,
  TURN_REVERSAL_RESPONSE:40,
  COUNTER_HEADING_RESPONSE:17,
  HEADING_LIMIT_LOW:.46,
  HEADING_LIMIT_HIGH:.40,
  HEADING_RECENTER:6.4,
  TURN_RECENTER:11.5,
  LATERAL_SCALE_LOW:.48,
  LATERAL_SCALE_HIGH:.40,
  LATERAL_RESPONSE:23,
  LATERAL_REVERSAL_RESPONSE:40,
  PLAYER_YAW_RESPONSE:10.5,
  PLAYER_BANK_RESPONSE:13,
  POSE_CARVE_BLEND:.20,
  POSE_REVERSAL_BLEND:.30,

  // Manual jump remains small; ramps produce the requested monster jump.
  MANUAL_JUMP_VELOCITY:5.9,
  RAMP_JUMP_BASE_VELOCITY:13.4,
  RAMP_JUMP_SPEED_FACTOR:.095,
  RAMP_RETRIGGER_GRACE:.85
});


export function getSpeedProgress(speed=SKI_TUNING.BASE_SPEED){
  const range=Math.max(.001,SKI_TUNING.MAX_SPEED-SKI_TUNING.BASE_SPEED);
  return Math.max(0,Math.min(1,(Number(speed)-SKI_TUNING.BASE_SPEED)/range));
}

export function getSpeedFeel(speed=SKI_TUNING.BASE_SPEED){
  // 120 km/h already feels fast, while later tiers still have room to build intensity.
  return .56+getSpeedProgress(speed)*.44;
}
