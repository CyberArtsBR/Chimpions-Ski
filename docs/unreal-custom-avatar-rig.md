# Automatic Unreal custom-avatar riding template

The upload loader resolves the skeleton, then selects unreal-humanoid when pelvis and both thigh_l/calf_l/foot_l and thigh_r/calf_r/foot_r chains match. Names are case-insensitive and optional colon-separated namespaces are supported. No filename or Heretic-specific measurements are used.

## Shared template

src/unrealRideProfile.js exports UNREAL_RIDE_TEMPLATE with separate ski and snowboard tuning. Ski uses low, relaxed arms. Snowboard uses a downward A-pose. Dynamic balance and landing responses remain layered on these neutral targets.

Leg lengths and ankle positions are measured at upload. A bounded two-bone solve uses a forward knee pole, keeping knees in their hip-to-ankle planes instead of applying hard-coded inward thigh yaw. Crouch depth scales with measured leg length. Ski contacts can adjust independently; snowboard maintains one shared stance. Airborne poses ignore terrain offsets. Feet retain their authored sole orientation and remove toe-out yaw measured from ball/toe bones. This keeps ski feet parallel and snowboard feet across the deck. Missing toe bones preserve the authored foot heading.

src/rigPoseAxes.js maps procedural torso and leg axes through the untouched bind/rest orientation. The new solve applies after base posing. Mode switches restore calibrated bones and reset smoothing. No GLB bytes, skin weights or inverse bind matrices are changed.

Other rigs retain the legacy path. This profile assumes the existing loader's Y-up, +Z-facing convention and a valid humanoid skeleton. Bone names alone cannot repair incorrect weights, missing chains, arbitrary facing conventions or deliberately non-anatomical rest poses. Additional conventions need separate fixtures.

## Verification

npm run check:visual runs synthetic, rotated-carrier and namespaced skeleton fixtures, forward-knee and stable-pose checks. To include an actual uncompressed avatar: node checks/unreal-rig-axes.mjs <file.glb>. The test also checks toe heading and low arms when those bones exist. The supplied thehereticUR.glb was tested in Ski and Snowboard and rendered through loadSkier with its textures/equipment, from front, side and three-quarter views.

Snowboard placement samples the uploaded foot mesh soles once and maintains clearance above the deck each frame, accounting for board edging. This prevents thick custom boots from sinking through the deck when ankle-based placement is insufficient.
