# Chimpions Ski asset pipeline

This branch adds a reproducible production pipeline for the 10 built-in Chimpion GLBs without changing gameplay, physics, course generation, scoring, rider-control semantics, or camera behavior.

## Commands

```sh
npm install
npm run assets:audit
npm run assets:optimize
npm run assets:verify
```

`assets:audit` inspects every built-in GLB and writes `reports/assets/asset-audit.json` plus `asset-manifest.json`. The audit records transfer bytes/SHA-256, mesh and skinned-mesh counts, vertices, triangles, materials, textures, maximum texture dimensions, skeleton joints, animation clips, estimated decoded geometry/texture memory, texture semantic/color-space intent, and compression extensions.

`assets:optimize` creates temporary Meshopt candidates with the pinned glTF Transform CLI. A candidate is accepted only when the structural/rig fingerprint is unchanged, skinned-mesh/bone/animation counts stay unchanged, and transfer size clears the configured savings threshold. Accepted candidates replace production GLBs only after validation. It then regenerates measured budgets and reports.

`assets:verify` enforces the canonical 10-avatar roster, total/per-avatar byte budgets, geometry/material/texture/animation/bone ceilings, texture dimensions, supported compression extensions, required Meshopt extensions, skinned meshes, skeleton presence, and committed manifest hashes.

## Compression decision

**Adopted: Meshopt.** It compresses geometry and animation payloads while Three.js provides a compatible runtime decoder. The loader registers `MeshoptDecoder` but still accepts ordinary uncompressed GLBs, preserving local user uploads.

**Not adopted: Draco.** Running Draco alongside Meshopt adds a second decoder path and runtime complexity without a demonstrated need for this roster.

**Deferred: KTX2/Basis.** KTX2 can reduce texture transfer/GPU memory, but requires KTX2Loader renderer support detection, Basis transcoder deployment, browser fallback validation, and visual inspection of faces, alpha, normals, roughness/metalness and emissive content. No blind KTX2 conversion is performed in this pass.

**No blanket texture resizing.** Base-color/emissive textures remain sRGB; normal/roughness/metalness/AO remain linear. The audit records semantic usage and dimensions, but this pass does not automatically force all textures to 1024/2048 or apply lossy recompression.

## Runtime behavior preserved

Built-in GLBs remain lazy: startup loads only metadata/portraits and the procedural fallback rider. Character fetches keep browser `force-cache` behavior. Selection retains AbortController plus request-generation race protection. Replaced avatars continue to dispose geometries, materials, textures and skeletons. Local GLBs continue through the ordinary GLTFLoader path and are not forced through production optimization.

## Source safety and reproducibility

`config/asset-source.json` pins the audited source commit (`c4d445569584e792981bada3d71689473dfc42d2`) and the expected byte size of every original GLB. `assets:optimize` materializes those exact source files with `git show`, builds temporary candidates, validates them, and only then writes production GLBs. This keeps the high-quality source immutable in Git history without deploying a duplicate 42+ MB raw roster under `public/`.

The optimizer requires the pinned commit to be available locally. CI uses `actions/checkout` with `fetch-depth: 0`; a shallow local clone should fetch the pinned commit before running `npm run assets:optimize`. Source byte totals are verified before any production output is accepted.

The asset workflow runs the optimizer, verification, the repository check/build suite, the canonical roster test, a local browser production smoke, a 20-case built-in browser matrix covering all 10 Chimpions in SKI and SNOWBOARD, and an additional standard local-GLB upload/load case. The workflow commits only measured optimized assets, budgets, and reports back to `perf/ski-asset-pipeline`; it never merges to `main`.

## Manual visual sign-off

Automated structural tests cannot prove appearance. Before merge, inspect all 10 Chimpions at gameplay camera distance in both ride modes and check face/detail sharpness, alpha edges, normals/tangents, skin deformation, material/emissive response, ski/snowboard placement and first-person body visibility. Texture conversion should only be added later with measured browser/GPU-memory benefit and side-by-side visual evidence.
