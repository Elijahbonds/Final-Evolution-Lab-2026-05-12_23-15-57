// gradeUniform — the per-frame exposure beat without a scene-wide shader re-prepare (perf-lag, 2026-10-24).
//
// The harness's grade writer (ImpactFrame.stepFrameGrade: the impact pulse, the speed vignette, the rig's flash beat) and the
// rig's own flash write `pipeline.imageProcessing.exposure` on every frame a beat runs. That setter is the SCENE's
// ImageProcessingConfiguration.exposure, and every new value notifies onUpdateParameters: every material on the scene marks
// its image-processing defines dirty (so each one re-runs _prepareDefines + _prepareEffect on its next draw), and the image
// processing post-process rebuilds its defines string and looks its effect up again. Exposure is a uniform, bound on every
// frame from the same field (`exposureLinear`, ImageProcessingConfiguration.bind), so none of that changes a pixel.
// Measured on the phone rig (karate_vs at ce122bb7: hits keep the pulse running): 6.4 image-processing dirty marks a frame.
//
// vignetteWeight is a plain field in Babylon (no notify) and is written as before.
import type { ImageProcessingConfiguration } from '@babylonjs/core';

/** Write a grade's exposure for this frame: the same value the setter stores, without the scene-wide notify. */
export function setGradeExposure(pp: { imageProcessingConfiguration: ImageProcessingConfiguration; exposure: number }, v: number): void {
  const c = pp.imageProcessingConfiguration as unknown as { _exposure?: number } | null | undefined;
  if (!c || typeof c._exposure !== 'number' || !Number.isFinite(v)) { pp.exposure = v; return; }
  c._exposure = v;
}
