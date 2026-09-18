// golfHud — the pure readability layer of Golf (A+ mission #5; owner benchmark: Everybody's Golf feel + Wii Sports
// Resort readability). The mode already plays real golf (clubs, three-press swing, wind, par); these are the numbers and
// names the couch-size HUD is drawn from, kept pure so they are tested and shared by the mode and the shared timing host.

/** The three-press swing's accuracy band on the meter wave (mode constants, one source). */
export const ACCURACY_CENTER = 0.28;
export const ACCURACY_HALF = 0.1;

/** Golf's names for strokes against par. */
export function holeName(strokes: number, par: number): string {
  if (strokes <= 0) return '—';
  if (strokes === 1) return 'ACE';
  const rel = strokes - par;
  if (rel <= -3) return 'ALBATROSS';
  if (rel === -2) return 'EAGLE';
  if (rel === -1) return 'BIRDIE';
  if (rel === 0) return 'PAR';
  if (rel === 1) return 'BOGEY';
  if (rel === 2) return 'DOUBLE BOGEY';
  if (rel === 3) return 'TRIPLE BOGEY';
  return `+${rel}`;
}

/** The running card: E, +n, −n. */
export function cardString(overPar: number): string {
  return overPar === 0 ? 'E' : overPar > 0 ? `+${overPar}` : `${overPar}`;
}

/** Wind bearing RELATIVE to the shot line, in degrees: 0 = straight downwind (helping), 180 = into the face,
 *  90 = left-to-right. `wind` and `shotDir` are flat XZ vectors. */
export function windBearingDeg(wind: { x: number; z: number }, shotDir: { x: number; z: number }): number {
  const speed = Math.hypot(wind.x, wind.z);
  if (speed < 1e-6) return 0;
  const a = Math.atan2(wind.x, wind.z) - Math.atan2(shotDir.x, shotDir.z);
  const deg = ((a * 180) / Math.PI + 540) % 360 - 180;     // −180..180
  return Math.round(deg);
}

/** Plain words for the bearing, for the lie panel. */
export function windWord(bearingDeg: number, speed: number): string {
  if (speed < 0.5) return 'CALM';
  const a = Math.abs(bearingDeg);
  if (a <= 30) return 'HELPING';
  if (a >= 150) return 'INTO';
  return bearingDeg > 0 ? 'LEFT → RIGHT' : 'RIGHT → LEFT';
}

export interface HoleResult { hole: number; par: number; strokes: number; pickedUp?: boolean }

/** Scorecard rows in HudScoreCard shape: name = the hole, score = strokes, line = par + the name. */
export function holeBoard(results: readonly HoleResult[], totalHoles: number): { name: string; score: number | string; line: string }[] {
  const rows: { name: string; score: number | string; line: string }[] = [];
  for (let h = 1; h <= totalHoles; h++) {
    const r = results.find((x) => x.hole === h);
    rows.push(r
      ? { name: `HOLE ${h}`, score: r.strokes, line: `PAR ${r.par} · ${r.pickedUp ? 'PICKED UP' : holeName(r.strokes, r.par)}` }
      : { name: `HOLE ${h}`, score: '—', line: '' });
  }
  const played = results.filter((r) => r.strokes > 0);
  const over = played.reduce((s, r) => s + (r.strokes - r.par), 0);
  rows.push({ name: 'CARD', score: played.reduce((s, r) => s + r.strokes, 0), line: played.length ? cardString(over) : '' });
  return rows;
}
