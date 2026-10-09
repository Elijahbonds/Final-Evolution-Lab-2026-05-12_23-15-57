// CourtSurface — DUNK-VENICE-ENV-2 (eye VE-4: the dunk court's blue "swell art" read as large triangular blotches).
// The paint is drawn on a recording context: every call and every assignment, in order, so two paints can be compared.
import { describe, expect, it } from 'vitest';
import { paintStreetCourt, STREET_COURT_PALETTE, VENICE_DUNK_COURT_PALETTE, type StreetCourtPalette } from './CourtSurface';

const S = 2048;   // the size the court is painted at (the grain passes skip on a headless canvas, so the log stays short)

function paint(palette: StreetCourtPalette): string[] {
  const log: string[] = [];
  const fmt = (v: unknown) => (typeof v === 'number' ? v.toFixed(3) : String(v));
  const grad = { addColorStop: () => undefined };
  const store: Record<string, unknown> = {};
  const ctx = new Proxy(store, {
    get(t, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'getImageData') return undefined;   // a headless canvas: the per-pixel grain passes step aside
      if (k in t) return t[k as string];
      return (...a: unknown[]) => { log.push(`${String(k)}(${a.map(fmt).join(',')})`); };
    },
    set(t, k, v) { log.push(`${String(k)}=${fmt(v)}`); t[k as string] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  paintStreetCourt(ctx, S, 16, 26, palette);
  return log;
}

/** The strokes of a paint: each `beginPath … stroke` span's lineTo points. */
function strokes(log: string[]): Array<Array<[number, number]>> {
  const out: Array<Array<[number, number]>> = [];
  let cur: Array<[number, number]> | null = null;
  for (const l of log) {
    if (l.startsWith('beginPath(')) cur = [];
    else if (cur && l.startsWith('lineTo(')) { const [x, y] = l.slice(7, -1).split(',').map(Number); cur.push([x, y]); }
    else if (cur && l.startsWith('stroke(')) { out.push(cur); cur = null; }
  }
  return out;
}
/** The sharpest KINK along a stroke: the largest change of slope between neighbouring segments (the second difference of y).
 *  A steep smooth curve has none; a polyline whose every vertex jumps has one at every vertex — the facets the eye saw. */
const worstKink = (pts: Array<[number, number]>) => pts.slice(2).reduce((m, p, i) => Math.max(m, Math.abs(p[1] - 2 * pts[i + 1][1] + pts[i][1])), 0);

describe('the Venice dunk court paint (eye VE-4)', () => {
  const smooth = paint(VENICE_DUNK_COURT_PALETTE), jagged = paint({ ...VENICE_DUNK_COURT_PALETTE, smooth: false });

  it('draws the squeegee sweeps and the swell as smooth curves — no jagged kinks to read as facets', () => {
    // 16 sweeps then 22 swell strokes open the paint's stroke list
    const s = strokes(smooth).slice(0, 38), j = strokes(jagged).slice(0, 38);
    expect(Math.max(...s.map(worstKink))).toBeLessThan(1.5);                  // 8 px steps along two gentle sines
    expect(Math.max(...j.slice(0, 16).map(worstKink))).toBeGreaterThan(10);   // what it was: a new amplitude every 60 px
    expect(Math.max(...j.slice(16).map(worstKink))).toBeGreaterThan(3);      // and the swell at 32 px steps
  });

  it('draws them with round joins, and puts the join back for the rulebook markings', () => {
    expect(smooth.filter((l) => l === 'lineJoin=round').length).toBeGreaterThanOrEqual(38);
    expect(smooth.filter((l) => l === 'save()').length).toBe(smooth.filter((l) => l === 'restore()').length);
  });

  it('lays every later stroke exactly where it lay before — the same random draws in the same order', () => {
    const after = (log: string[]) => log.slice(log.findIndex((l) => l.startsWith('strokeStyle=rgba(11,36,50')));   // the cracks, then the keys and the markings
    expect(after(smooth).length).toBeGreaterThan(50);
    expect(after(smooth)).toEqual(after(jagged));
  });

  it('leaves the shared street court alone — 1v1, 3v3, three-point and the carnival paint exactly as before', () => {
    expect(STREET_COURT_PALETTE.smooth).toBeUndefined();
    expect(STREET_COURT_PALETTE.swell).toBeUndefined();
    const street = paint(STREET_COURT_PALETTE);
    expect(street.includes('lineJoin=round')).toBe(false);
    expect(Math.max(...strokes(street).slice(0, 16).map(worstKink))).toBeGreaterThan(10);   // its sweeps are the original ones
  });
});
