export const SKI_TUNING=Object.freeze({
  // Wider gameplay corridor. Keep the guaranteed route more central than the
  // full carve envelope so the outer shoulders can carry tactical risk.
  PLAYER_HALF_WIDTH:13.8,
  COURSE_OBJECT_HALF_WIDTH:13.45,
  SAFE_ROUTE_HALF_WIDTH:10.35,
  CONTENT_BAND_HALF_WIDTH:13.0,

  // Extreme-side pressure. Obstacles authored beyond this X are deliberately
  // shoulder hazards: dangerous enough to punish fence-hugging, but staggered
  // so they never become an unavoidable horizontal wall.
  SIDE_HAZARD_ZONE_START:10.75,
  SIDE_HAZARD_SECTION_CHANCE:.84,
  SIDE_HAZARD_SECOND_CHANCE:.42,

  // 150 km/h opening pace for both ride modes, +10 km/h every 30 seconds,
  // 300 km/h cap. The slower opening gives the player a clean read before the
  // course begins applying pressure.
  BASE_SPEED:41.6667,
  SPEED_TIER_SECONDS:30,
  SPEED_TIER_INCREMENT:2.7778,
  MAX_SPEED:83.3333,
  SPEED_RESPONSE:2.2,

  // Physics integration stays tightly substepped at all supported frame rates.
  // Collision tests depend on this ceiling rather than generalized CCD.
  PHYSICS_SUBSTEP_SECONDS:1/180,
  COURSE_COLLISION_PADDING_X:.30,
  COURSE_COLLISION_PADDING_Z:.20,

  // Once the rider reaches the 300 km/h cap, speed stops increasing but the
  // mountain keeps escalating. Hazard density ramps toward its maximum over
  // three minutes while the guaranteed navigable route remains unchanged.
  POST_MAX_HAZARD_RAMP_SECONDS:120,
  POST_MAX_HAZARD_START_PRESSURE:.24,
  POST_MAX_HAZARD_MAX_EXTRA_PER_SECTION:4,

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

  // Boundary contact remains non-lethal: a small inward deflection and tiny
  // speed scrub make fence contact legible without turning it into a death wall.
  EDGE_CONTACT_COOLDOWN:.16,
  EDGE_CONTACT_RELEASE_MARGIN:.22,
  EDGE_CONTACT_DEFLECTION_MIN:.34,
  EDGE_CONTACT_DEFLECTION_MAX:1.05,
  EDGE_CONTACT_SPEED_SCRUB:.0035,
  EDGE_CONTACT_REFERENCE_LATERAL_RATIO:.14,

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
  // A ground-triggered backflip needs a visibly higher launch arc than a normal
  // hop so the full rotation reads as an aerial trick rather than a ground spin.
  BACKFLIP_MANUAL_JUMP_VELOCITY:8.6,
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
  COURSE_NORMAL_SPACING_MIN:14.5,
  COURSE_NORMAL_SPACING_MAX:19.5,
  COURSE_INTENSE_SPACING_MIN:11.75,
  COURSE_INTENSE_SPACING_MAX:16.5,
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
