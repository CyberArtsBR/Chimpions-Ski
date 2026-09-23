export const SKI_TUNING=Object.freeze({
  // Practical ski corridor. Preserve current integrated width.
  PLAYER_HALF_WIDTH:11.3,
  COURSE_OBJECT_HALF_WIDTH:11.05,
  SAFE_ROUTE_HALF_WIDTH:9.7,
  CONTENT_BAND_HALF_WIDTH:10.7,

  // 160 km/h opening pace, +10 km/h every 30 seconds, 300 km/h cap.
  // Preserve the original ramp-up cadence so the opening remains controllable.
  BASE_SPEED:44.4444,
  SPEED_TIER_SECONDS:30,
  SPEED_TIER_INCREMENT:2.7778,
  MAX_SPEED:83.3333,
  SPEED_RESPONSE:2.2,

  // Ground carving.
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

  // Explicit airborne steering. Similar authority to ground without planted-ski friction.
  AIR_TURN_RESPONSE:25,
  AIR_REVERSAL_RESPONSE:37,
  AIR_HEADING_RECENTER:4.8,
  AIR_LATERAL_RESPONSE:23,
  AIR_LATERAL_REVERSAL_RESPONSE:37,
  AIR_LATERAL_SCALE_LOW:.48,
  AIR_LATERAL_SCALE_HIGH:.41,
  LANDING_REENGAGE_TIME:.18,

  // Oil puddles preserve momentum but temporarily reduce ski authority/grip.
  OIL_SLIP_SECONDS:1.05,
  OIL_CONTROL_SCALE:.52,
  OIL_GRIP:.26,

  // Shared jump physics. Preserve manual and monster-ramp strength.
  GRAVITY:17.8,
  MANUAL_JUMP_VELOCITY:5.9,
  // Manual jump is immediate on press. Releasing within 140 ms applies a
  // variable-height jump cut; holding longer preserves the original full arc.
  MINI_JUMP_TAP_SECONDS:.14,
  MINI_JUMP_RELEASE_VELOCITY:3.60,
  MINI_JUMP_LANDING_REENGAGE_TIME:.10,
  RAMP_JUMP_BASE_VELOCITY:13.4,
  RAMP_JUMP_SPEED_FACTOR:.095,
  RAMP_RETRIGGER_GRACE:.85,

  // Course intelligence/rhythm.
  // More pressure without returning to repetitive close-packed rows.
  COURSE_NORMAL_SPACING_MIN:15,
  COURSE_NORMAL_SPACING_MAX:21,
  COURSE_INTENSE_SPACING_MIN:12.5,
  COURSE_INTENSE_SPACING_MAX:18,
  SAFE_ROUTE_ACCELERATION_FACTOR:.72,
  SAFE_ROUTE_BASE_REACH:.75,
  SAFE_ROUTE_MIN_REACH:1.6,
  SAFE_ROUTE_MAX_REACH:6.4,
  LANDING_CORRIDOR_HALF_WIDTH:4.15,

  // Stream pooled course content well beyond the 280m camera far plane.
  COURSE_LOOKAHEAD_MIN:560,
  COURSE_LOOKAHEAD_SECONDS:11,
  COURSE_LOOKAHEAD_MAX:720,

  // Airborne hazard-clear scoring.
  CLEAR_SCORE_BASE:100,
  CLEAR_COMBO_WINDOW:1.5,
  CLEAR_COMBO_STEP:.5,
  CLEAR_COMBO_MAX_MULTIPLIER:3
});

export function getSpeedProgress(speed=SKI_TUNING.BASE_SPEED){
  const range=Math.max(.001,SKI_TUNING.MAX_SPEED-SKI_TUNING.BASE_SPEED);
  return Math.max(0,Math.min(1,(Number(speed)-SKI_TUNING.BASE_SPEED)/range));
}

export function getSpeedFeel(speed=SKI_TUNING.BASE_SPEED){
  // 160 km/h starts intense while still leaving headroom for the 300 km/h cap.
  return .62+getSpeedProgress(speed)*.38;
}
