// The device's OS class, from what the browser says (perf-lag 2026-10-24; its own file since PERF-LOAD PRF-07, 2026-10-25, so a
// React host's diagnostics (hostDiag.ts) can read it without perfStats' import of the tier code, which pulls in Babylon).

/** Pure: iPadOS reports a Mac, so a Mac with touch is iOS. */
export function osClass(ua: string, maxTouchPoints: number): 'ios' | 'android' | 'other' {
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'other';
}
