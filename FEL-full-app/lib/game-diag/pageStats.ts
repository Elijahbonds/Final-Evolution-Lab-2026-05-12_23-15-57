export const DOM_FPS_WINDOW_MS = 30_000;
export const DOM_LONG_FRAME_MS = 50;
export const DOM_MAX_FRAMES = 4096;

export interface DomFrameSummary {
  n: number;
  fpsP50: number;
  fpsP5: number;
  longPerMin: number;
  worstMs: number;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

function pctSorted(s: number[], p: number): number {
  if (!s.length) return 0;
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(s.length * p) - 1))];
}

export function summarizeDomFrames(intervals: readonly number[]): DomFrameSummary {
  const sorted = intervals.filter((v) => Number.isFinite(v) && v > 0).slice().sort((a, b) => a - b);
  let total = 0, long = 0;
  for (const v of sorted) {
    total += v;
    if (v > DOM_LONG_FRAME_MS) long++;
  }
  const p50 = pctSorted(sorted, 0.5);
  const p95 = pctSorted(sorted, 0.95);
  return {
    n: sorted.length,
    fpsP50: p50 > 0 ? 1000 / p50 : 0,
    fpsP5: p95 > 0 ? 1000 / p95 : 0,
    longPerMin: total > 0 ? long / (total / 60_000) : 0,
    worstMs: sorted.length ? sorted[sorted.length - 1] : 0,
  };
}

export function pageOsClass(ua: string, maxTouchPoints: number): 'ios' | 'android' | 'other' {
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

export interface DomDeviceClass {
  os: string;
  dpr: number;
  px: string;
}

export function domDeviceDetail(d: DomDeviceClass): string {
  return `os=${d.os} dpr=${r1(d.dpr)} px=${d.px}`;
}

export function domTtfpDetail(t: { firstMs: number; pageMs: number; leftMs?: number | null }, d: DomDeviceClass): string {
  const f = (v: number | null | undefined) => (v === null || v === undefined ? '-' : String(Math.round(v)));
  return `surface=dom first=${f(t.firstMs)} page=${f(t.pageMs)}${t.leftMs != null ? ` left=${f(t.leftMs)}` : ''} ${domDeviceDetail(d)}`;
}

export function domFpsDetail(win: number, s: DomFrameSummary, d: DomDeviceClass): string {
  return [
    `surface=dom w=${win} n=${s.n} fps50=${r1(s.fpsP50)} fps5=${r1(s.fpsP5)} long=${r1(s.longPerMin)}/min worst=${Math.round(s.worstMs)}`,
    domDeviceDetail(d),
  ].join(' ');
}
