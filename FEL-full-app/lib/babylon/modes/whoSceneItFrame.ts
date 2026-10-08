// The Who Scene It stage sits inside GameShell: a header band, then a stage with vertical padding.
// The old host used the viewport minus the header alone, so the canvas ran off the bottom of the frame.

export const WHO_SCENE_FRAME = {
  headerPx: 64,
  padY: 24,
  padXNarrow: 16,
  padXWide: 32,
  maxW: 1200,
  aspect: 16 / 10,
} as const;

export interface WhoSceneItBox {
  width: number;
  height: number;
  /** True when the box sits inside the viewport after the shell's chrome. */
  fits: boolean;
}

/** Pixel box for the live venue. Width follows the stage; height follows 16:10 and clamps to the room under the header. */
export function whoSceneItStageBox(vw: number, vh: number): WhoSceneItBox {
  const padX = vw < 640 ? WHO_SCENE_FRAME.padXNarrow : WHO_SCENE_FRAME.padXWide;
  const availW = Math.max(1, Math.min(WHO_SCENE_FRAME.maxW, vw - padX));
  const availH = Math.max(1, vh - WHO_SCENE_FRAME.headerPx - WHO_SCENE_FRAME.padY);
  let width = availW;
  let height = width / WHO_SCENE_FRAME.aspect;
  if (height > availH) {
    height = availH;
    width = height * WHO_SCENE_FRAME.aspect;
  }
  const fits = width <= availW + 0.5 && height <= availH + 0.5 && width <= vw && height <= vh;
  return { width, height, fits };
}
