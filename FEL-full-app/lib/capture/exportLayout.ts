// exportLayout — 9:16 and 16:9 frames, and where the FEL mark sits.
//
// Pure geometry. The browser compositor (exportVideo.ts) draws this; the tests check the boxes.
// The game or the jump is fitted inside the frame with black bars, never cropped, so a dunk is not
// sliced off to fill a phone screen. The mark is small and sits in the lower left.

export type Aspect = '9:16' | '16:9';

export const EXPORT_SIZE: Record<Aspect, { w: number; h: number }> = {
  '9:16': { w: 720, h: 1280 },
  '16:9': { w: 1280, h: 720 },
};

/** The public site, used when the page has no origin of its own (a file, a worker). */
export const FEL_PUBLIC_ORIGIN = 'https://final-evolution-lab.web.app';

export const FEL_MARK = 'FEL';

export function felAppLink(origin?: string | null): string {
  const raw = origin && /^https?:\/\/[^/]+/i.test(origin) ? origin : FEL_PUBLIC_ORIGIN;
  return raw.replace(/\/+$/, '');
}

/** The host, for the small line under the mark. No scheme, so it fits. */
export function felLinkLabel(origin?: string | null): string {
  try {
    return new URL(felAppLink(origin)).host;
  } catch {
    return 'final-evolution-lab.web.app';
  }
}

export interface Box { x: number; y: number; w: number; h: number }

/** Fit the source inside the frame. Bars, not a crop. */
export function fitRect(srcW: number, srcH: number, dstW: number, dstH: number): Box {
  const sw = Math.max(1, srcW);
  const sh = Math.max(1, srcH);
  const scale = Math.min(dstW / sw, dstH / sh);
  const w = Math.round(sw * scale);
  const h = Math.round(sh * scale);
  return { x: Math.round((dstW - w) / 2), y: Math.round((dstH - h) / 2), w, h };
}

export interface WatermarkBox {
  mark: string;
  link: string;
  x: number;
  y: number;
  markPx: number;
  linkPx: number;
}

/** Lower left, inset by about 3% of the short side. Small on purpose. */
export function watermarkAt(dstW: number, dstH: number, origin?: string | null): WatermarkBox {
  const short = Math.min(dstW, dstH);
  const inset = Math.round(short * 0.035);
  const markPx = Math.max(14, Math.round(short * 0.035));
  const linkPx = Math.max(11, Math.round(markPx * 0.62));
  return {
    mark: FEL_MARK,
    link: felLinkLabel(origin),
    x: inset,
    y: dstH - inset - linkPx - 4,
    markPx,
    linkPx,
  };
}
