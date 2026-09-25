# /pose: the pose model and wasm, served from our own hosting

Owner decision (movement play, 2026-09-24): the camera pose pipeline loads nothing from a third party. The browser
fetches these files from our origin, and the camera picture never leaves the page. `lib/pose/assets.ts` resolves every
load: it uses this folder first and falls back to the MediaPipe CDN only when a file here is missing (a 404).

## wasm/ (MediaPipe Tasks Vision 0.10.35)

Copied from `node_modules/@mediapipe/tasks-vision/wasm/` (npm `@mediapipe/tasks-vision@0.10.35`). They have to be the
same build as the JS bundle Next compiles from node_modules, and `lib/pose/assets.test.ts` fails if they drift.
After a package upgrade, re-copy them and bump `VISION_VERSION`:

```sh
cp node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_{,nosimd_}internal.{js,wasm} public/pose/wasm/
```

| File | Bytes | Loaded when |
|---|---|---|
| `vision_wasm_internal.js` / `.wasm` | 322,044 / 11,153,617 | every current browser (wasm SIMD) |
| `vision_wasm_nosimd_internal.js` / `.wasm` | 321,847 / 10,481,398 | a browser without wasm SIMD |

The package's `vision_wasm_module_internal` pair is left out. `FilesetResolver.forVisionTasks(path, true)` is the
only call that loads it, and nothing in the app makes that call. Face scan also loads its wasm from here.

## models/ (Pose Landmarker, float16, version 1)

Downloaded once on 2026-09-24 from Google's MediaPipe model storage. Each file's md5 matched the
`x-goog-hash` Google sent with it:

| File | Bytes | Source |
|---|---|---|
| `pose_landmarker_lite.task` | 5,777,746 | `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task` |
| `pose_landmarker_full.task` | 9,398,198 | `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task` |

These are the model family the app already ran from the CDN (lite), plus full. `PoseService` runs full on a desktop,
lite on a phone or tablet, and drops full to lite when it is over budget. The rules are in `lib/pose/modelChoice.ts`.

## License

- MediaPipe (the Tasks Vision wasm): Apache License 2.0, © Google LLC. https://github.com/google-ai-edge/mediapipe
- Pose Landmarker models: Apache License 2.0, per Google's MediaPipe model card for BlazePose GHUM 3D.
  https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
