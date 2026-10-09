// The Cypher's cue lane, legible on any stage (QA P2-03, 2026-09-27).
//
// The lane was a white/15 bar with the move-family discs drawn straight over the stage, the passed discs at 45 % opacity
// and the gold hit ring at a fixed 80 %: on a bright place (the Studio's mirrors and wooden floor) the discs washed out —
// the QA's "faded pads" — and nothing on the lane moved with the beat. A dark plate sits under the lane now, every disc
// carries a white rim, and the hit ring lights on the beat (hud.beatPulse). Pure numbers here so a test holds the contrast.

/** The plate under the lane: black at this alpha. 0.75 keeps every family colour ≥ 3:1 even over a white stage. */
export const LANE_PLATE_ALPHA = 0.75;
/** A disc that has passed stays readable as passed, not faded to nothing. */
export const PASSED_CUE_OPACITY = 0.7;

const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const lum = ([r, g, b]: [number, number, number]): number => {
  const c = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
};
/** WCAG contrast ratio between two colours. */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
/** The plate's colour as seen over a stage colour (black at LANE_PLATE_ALPHA composited on it). */
export function plateOver(stage: string): string {
  const k = 1 - LANE_PLATE_ALPHA;
  return `#${rgb(stage).map((v) => Math.round(v * k).toString(16).padStart(2, '0')).join('')}`;
}

/** The hit ring: steady at rest, lit on the beat. */
export function hitRingStyle(pulse: number | null): { opacity: number; boxShadow: string } {
  const p = pulse === null ? 0 : Math.max(0, Math.min(1, pulse));
  return { opacity: 0.8 + 0.2 * p, boxShadow: `0 0 ${Math.round(6 + 22 * p)}px rgba(244,197,66,${(0.35 + 0.6 * p).toFixed(2)})` };
}
