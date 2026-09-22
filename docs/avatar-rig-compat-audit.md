# Avatar rig / snowboard compatibility audit

Baseline: `c5691fbd0d9d43a6ff13dbe2b5295ce27f237e8e`

Read-only compatibility audit of the actual `public/model/characters/*.glb` collection. No production GLB was modified.

## Runtime assumptions inspected

- Rider-mode branch `feature/ski-snowboard-rider-mode` @ `20a4ec36f6e4bc05a58ecd407f980ec8be5c5b5f` uses the same alias-based rig mapping, lowers upper arms by about 0.86 rad in ski mode and 0.74 rad in snowboard mode, rotates the imported rider carrier about 1.40 rad sideways, and counter-rotates neck/head.
- Trick branch `feature/ski-tricks-air-style` @ `a7c5e24abb9675e5e0257e11864a8d3e5928f436` is evaluated on the requirement that tricks rotate a visual parent rather than individual skeleton bones.

## Collection summary

- Avatars audited: **206**
- Fully compatible: **204**
- Likely compatible: **0**
- Partial rig: **0**
- Suspicious: **1**
- Unsupported: **1**
- Corrupt/unparseable GLBs: **0**
- Total collection size: **739.38 MiB**
- Mean / median file size: **3.589 / 2.494 MiB**
- Median node / mesh / joint count: **29 / 2.5 / 25**
- Median rest bounds X / Y / Z: **0.883 / 1 / 0.684**

## Explicit problem files

| Avatar | Classification | Why it needs attention |
| --- | --- | --- |
| The Ritualist.glb | UNSUPPORTED | required runtime bone mapping unresolved: hips, leftThigh, rightThigh, leftShin, rightShin, leftFoot, rightFoot; bone aliases are ambiguous/duplicated: hips, spine, chest, neck, head, leftShoulder, leftUpperArm, leftForearm, leftHand, rightShoulder, rightUpperArm, rightForearm, rightHand, leftThigh, leftShin, leftFoot, rightThigh, rightShin, rightFoot |
| The Rocker.glb | SUSPICIOUS | rig maps, but geometry bounds are an extreme collection outlier |

### The Ritualist.glb

- **UNSUPPORTED by the current alias mapper.** It contains two skins and duplicated Mixamo-style bone names. The runtime mapper sees repeated candidates for neck/head/arms/legs/feet and cannot select a unique skeleton without guessing.
- A-pose correction is therefore unsafe to apply through the current mapped-bone controller.
- Snowboard foot placement and neck/head counter-rotation cannot be trusted until the duplicate-skeleton ambiguity is resolved or explicitly selected at runtime.

### The Rocker.glb

- The 19 runtime bone slots map uniquely and its A-pose/snowboard skeletal measurements are otherwise normal.
- Rest bounds are **0.074 × 11.218 × 2.362**, with a maximum dimension **11.218×** the corresponding collection median.
- This makes it the primary camera/clipping/360/backflip manual-test target. The audit does not alter the asset.

## A-pose compatibility

- Structural review flags: **1**.
- **The Ritualist.glb** — missing/ambiguous arm mapping
- Among uniquely mapped rigs, left/right upper-arm direction symmetry did not trigger the conservative reversal/asymmetry thresholds.
- The future branch's ski correction (~49°) is slightly above the requested 35–45° target band; snowboard (~42°) sits inside it. Manual visual testing should still verify shoulder volume, hands and accessories.

## Snowboard stance compatibility

- Structural review flags: **1**.
- **The Ritualist.glb** — missing required lower-body mapping; foot positions unavailable; head counter-rotation chain incomplete
- Foot spacing is normalized against skeletal head-to-feet height so large accessories do not create false 'feet too close' failures.
- For mapped rigs the audit also checks lower-body hierarchy, thigh direction, lateral foot ordering, and the availability of neck/head for downhill counter-rotation.

## Trick-pivot safety

- Structural review flags: **1**.
- **The Rocker.glb** — extreme bounds may amplify visual orbit/clipping
- The visual-parent policy is correct for 360/backflip compatibility because it avoids accumulating rotations on individual rig bones.
- Skeleton-to-mesh offsets are retained as diagnostics, but only same-space origin/bounds and extreme extent evidence are used for automated risk decisions.

## Accessory / extent outliers

- **The Rocker.glb** — X/Y/Z extent 0.074 × 11.218 × 2.362; max dimension / median ratio 11.218×.

## Complexity rankings

### Largest 20 by file size

| # | Avatar | MiB |
| ---: | --- | ---: |
| 1 | The Cybernetic.glb | 17.202 |
| 2 | The Flamescarred.glb | 16.978 |
| 3 | The Vassal.glb | 15.241 |
| 4 | The Archon.glb | 13.458 |
| 5 | The Emaciated.glb | 12.748 |
| 6 | The Gangster.glb | 12.675 |
| 7 | The Armsman.glb | 11.586 |
| 8 | The Aberration.glb | 11.432 |
| 9 | The Test Subject.glb | 10.123 |
| 10 | The AntiPaladin.glb | 9.499 |
| 11 | The Mechanized.glb | 9.451 |
| 12 | The Technician.glb | 9.422 |
| 13 | The Remnant.glb | 9.307 |
| 14 | The Survivor.glb | 9.219 |
| 15 | The Heroic.glb | 8.798 |
| 16 | The Indecisive.glb | 8.596 |
| 17 | The Envoy.glb | 8.169 |
| 18 | The Futurist.glb | 8.113 |
| 19 | The Spectral.glb | 7.862 |
| 20 | The Ancestral.glb | 7.567 |

### Smallest 20 by file size

| # | Avatar | MiB |
| ---: | --- | ---: |
| 1 | The Drownsy.glb | 1.023 |
| 2 | The Doctor.glb | 1.118 |
| 3 | The Royal.glb | 1.121 |
| 4 | The Scorched.glb | 1.129 |
| 5 | The Singed.glb | 1.129 |
| 6 | The Trickster.glb | 1.366 |
| 7 | The Main Caracter.glb | 1.431 |
| 8 | The Jovian.glb | 1.486 |
| 9 | The Hollow.glb | 1.509 |
| 10 | The Arisen.glb | 1.519 |
| 11 | The Firestarter.glb | 1.522 |
| 12 | The Heretic.glb | 1.53 |
| 13 | The Nomad.glb | 1.54 |
| 14 | The Scientist.glb | 1.551 |
| 15 | The Punk.glb | 1.586 |
| 16 | The Fautly.glb | 1.61 |
| 17 | The Ghost Hunter.glb | 1.618 |
| 18 | The Analyst.glb | 1.62 |
| 19 | The Deepweller.glb | 1.661 |
| 20 | The One Who lurks in Shadow.glb | 1.661 |

### Largest 20 by bounds diagonal

| # | Avatar | Diagonal |
| ---: | --- | ---: |
| 1 | The Rocker.glb | 11.464 |
| 2 | The Ranched.glb | 1.735 |
| 3 | The Encased.glb | 1.674 |
| 4 | The Technician.glb | 1.669 |
| 5 | The Spelunker.glb | 1.66 |
| 6 | The Youtfull.glb | 1.647 |
| 7 | The Bored.glb | 1.646 |
| 8 | The Lover.glb | 1.64 |
| 9 | The Pack Leader.glb | 1.635 |
| 10 | The Enameled.glb | 1.627 |
| 11 | The Timeworn.glb | 1.624 |
| 12 | The Gangster.glb | 1.612 |
| 13 | The Ceremonial.glb | 1.611 |
| 14 | The Countryman.glb | 1.61 |
| 15 | The Enraged.glb | 1.61 |
| 16 | The Yeoman.glb | 1.61 |
| 17 | The Attendantr.glb | 1.609 |
| 18 | The Firestarter.glb | 1.596 |
| 19 | The Comedian.glb | 1.593 |
| 20 | The Demon.glb | 1.592 |

### Smallest 20 by bounds diagonal

| # | Avatar | Diagonal |
| ---: | --- | ---: |
| 1 | The Beholder.glb | 0 |
| 2 | The Spectral.glb | 0.015 |
| 3 | The Indecisive.glb | 0.303 |
| 4 | The Left Hand.glb | 0.395 |
| 5 | The Street Fighter.glb | 0.558 |
| 6 | The Rebel.glb | 0.631 |
| 7 | The Almagamation.glb | 0.823 |
| 8 | The Adolescent.glb | 0.825 |
| 9 | The Agitator.glb | 0.84 |
| 10 | The Pioneer.glb | 0.856 |
| 11 | The Angsty.glb | 0.862 |
| 12 | The First Born.glb | 0.862 |
| 13 | The Apologetic.glb | 0.888 |
| 14 | The AntiPaladin.glb | 0.943 |
| 15 | The Professional.glb | 1.041 |
| 16 | The Ancient.glb | 1.086 |
| 17 | The Archon.glb | 1.088 |
| 18 | The VassalCAT.glb | 1.249 |
| 19 | The Vassal.glb | 1.289 |
| 20 | The Mechanized.glb | 1.417 |

### Largest 20 by mesh complexity

| # | Avatar | Vertices |
| ---: | --- | ---: |
| 1 | The Powder Monkey.glb | 112413 |
| 2 | The AntiPaladin.glb | 76453 |
| 3 | The Archon.glb | 62182 |
| 4 | The Imperial.glb | 47841 |
| 5 | The Mutant.glb | 44664 |
| 6 | The Survivor.glb | 41720 |
| 7 | The Technician.glb | 41492 |
| 8 | The Bored.glb | 38887 |
| 9 | The Ancient.glb | 38525 |
| 10 | The Shield Bearer.glb | 37342 |
| 11 | The Bosun.glb | 36128 |
| 12 | The Mercenary.glb | 35686 |
| 13 | The Ancestral.glb | 35657 |
| 14 | The Chemist.glb | 35416 |
| 15 | The Aureate.glb | 35369 |
| 16 | The Chromatic.glb | 35057 |
| 17 | The Technophile.glb | 35051 |
| 18 | The Enameled.glb | 34875 |
| 19 | The Remnant.glb | 34869 |
| 20 | The Demon.glb | 34449 |

### Smallest 20 by mesh complexity

| # | Avatar | Vertices |
| ---: | --- | ---: |
| 1 | The Test Subject.glb | 5767 |
| 2 | The Spectral.glb | 8131 |
| 3 | The Cybernetic.glb | 9537 |
| 4 | The Left Hand.glb | 10849 |
| 5 | The Trickster.glb | 10876 |
| 6 | The Doctor.glb | 11402 |
| 7 | The NightStalker.glb | 11437 |
| 8 | The Vassal.glb | 12110 |
| 9 | The Gangster.glb | 14069 |
| 10 | The Masked.glb | 15715 |
| 11 | The Beholder.glb | 16004 |
| 12 | The Stubborn.glb | 16013 |
| 13 | The Envoy.glb | 16070 |
| 14 | The Scorched.glb | 16506 |
| 15 | The Singed.glb | 16506 |
| 16 | The Drownsy.glb | 16986 |
| 17 | The Royal.glb | 17708 |
| 18 | The Digital.glb | 20284 |
| 19 | The Emaciated.glb | 21754 |
| 20 | The Scientist.glb | 22153 |

### Largest 20 by joint count

| # | Avatar | Joints |
| ---: | --- | ---: |
| 1 | The Rocker.glb | 95 |
| 2 | The Adolescent.glb | 71 |
| 3 | The Agitator.glb | 71 |
| 4 | The Almagamation.glb | 71 |
| 5 | The Analyst.glb | 71 |
| 6 | The Ancestral.glb | 71 |
| 7 | The Ancient.glb | 71 |
| 8 | The Angsty.glb | 71 |
| 9 | The AntiPaladin.glb | 71 |
| 10 | The Apologetic.glb | 71 |
| 11 | The Archon.glb | 71 |
| 12 | The Beholder.glb | 71 |
| 13 | The First Born.glb | 71 |
| 14 | The Heretic.glb | 71 |
| 15 | The Rebel.glb | 71 |
| 16 | The Spectral.glb | 71 |
| 17 | The Street Fighter.glb | 71 |
| 18 | The Bosun.glb | 53 |
| 19 | The Acromatic.glb | 52 |
| 20 | The Arisen.glb | 52 |

### Smallest 20 by joint count

| # | Avatar | Joints |
| ---: | --- | ---: |
| 1 | The Pioneer.glb | 22 |
| 2 | The Vassal.glb | 23 |
| 3 | The Aberration.glb | 25 |
| 4 | The Armsman.glb | 25 |
| 5 | The Automaton.glb | 25 |
| 6 | The Binary.glb | 25 |
| 7 | The Blazing.glb | 25 |
| 8 | The Bonesmith.glb | 25 |
| 9 | The Buddly.glb | 25 |
| 10 | The Captain.glb | 25 |
| 11 | The Ceremonial.glb | 25 |
| 12 | The Chemist.glb | 25 |
| 13 | The Chromatic.glb | 25 |
| 14 | The Colorful.glb | 25 |
| 15 | The Comedian.glb | 25 |
| 16 | The Comrade.glb | 25 |
| 17 | The Concealed.glb | 25 |
| 18 | The Constant Companion.glb | 25 |
| 19 | The Countryman.glb | 25 |
| 20 | The Cultist.glb | 25 |

## Per-avatar data

The complete JSON report contains per-avatar file size, scenes, nodes, meshes, primitives, skins, joints, animations, materials, textures/images, vertex/index counts, bounds, mapped bones, ambiguity/missing-slot evidence, A-pose measurements, snowboard measurements, trick-pivot diagnostics and extent-outlier data.

## Method and limitations

- GLB JSON chunks are parsed directly; production GLBs are never rewritten, optimized, compressed, converted, renamed, deleted, or re-exported.
- Bounds are structural rest-pose bounds from POSITION accessor min/max transformed through node rest transforms; they are not an animated/skinned render sweep.
- Bone matching mirrors the current/future skier alias strategy and requires unique matches; duplicate skeleton aliases are reported as ambiguous rather than guessed.
- A-pose and snowboard findings are conservative structural heuristics and must be confirmed with manual visual smoke tests for flagged avatars.
- Trick-pivot risk uses origin/bounds displacement plus collection-relative extent outliers; skeleton-vs-mesh-space ratios are retained as diagnostics but are not alone treated as failures.

