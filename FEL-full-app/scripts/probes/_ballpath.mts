// _ballpath — does the ball go where the RESULT says (2026-09-17)? From the smoothness recorder's per-frame ball
// positions and the mode's own outcome lines ([X-RIM] misses, [X-NET] makes), each flight is found (the ball climbing
// past FLIGHT_Y and coming back down through the rim's height), its crossing of the rim plane is measured against the
// ring, and the verdict is checked against the outcome: a make must pass INSIDE the ring and drop through the net; a
// miss must NOT, and its side (front / back / left / right of the ring) should agree with the label. Continuity too:
// the biggest per-frame step in the air (a pop is > 0.5 m).
export interface BallRow { t: number; ball: number[] | null; h?: (number[] | null)[] }
export interface Outcome { t: number; kind: 'make' | 'miss'; label: string }
export interface ShotVerdict { t: number; outcome: string; path: string; offsetM: number; side: string; maxStepM: number; throughNet: boolean; ok: boolean }

export const RIM = { x: 0, y: 3.05, z: -0.6 };
const FLIGHT_Y = 2.2, RING_R = 0.225, THROUGH_R = 0.2;

/** The ball within a hand's reach of the hero's palm is IN HAND — a double clutch dips it below the rim plane and back up; that is not a crossing. */
const inHand = (r: BallRow): boolean => !!r.ball && !!r.h && [1, 2].some((q) => { const p = r.h![q]; return !!p && Math.hypot(p[0] - r.ball![0], p[1] - r.ball![1], p[2] - r.ball![2]) < 0.3; });
export function analyseBallPath(rows: BallRow[], outcomes: Outcome[], rim = RIM): ShotVerdict[] {
  const out: ShotVerdict[] = [];
  let i = 0;
  while (i < rows.length) {
    // a flight: the ball climbs above FLIGHT_Y…
    if (!rows[i].ball || rows[i].ball![1] < FLIGHT_Y || inHand(rows[i])) { i++; continue; }
    const start = i; let maxStep = 0, cross = -1;
    let j = i;
    for (; j < rows.length && rows[j].ball; j++) {
      if (j > start) { const a = rows[j - 1].ball!, b = rows[j].ball!; const dt = rows[j].t - rows[j - 1].t; const step = dt < 100 ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : 0;
        if (step > 1.0) break;   // a teleport (a reset, a hidden ball re-placed) ends the flight — it is not a pass through the rim
        maxStep = Math.max(maxStep, step); }
      // …and comes back DOWN to the rim's height: the first descending frame at or under rim.y + 3 cm (an arc that ends exactly
      // at the iron touches 3.05 and never goes under it before the bounce)
      if (cross < 0 && j > start && !inHand(rows[j]) && rows[j].ball![1] <= rim.y + 0.03 && rows[j].ball![1] < rows[j - 1].ball![1]) cross = j;
      if (cross >= 0 && rows[j].t - rows[cross].t > 900) break;
      if (cross < 0 && rows[j].ball![1] < FLIGHT_Y - 0.6 && j > start + 3) break;   // came down without reaching the rim plane going down? (a short miss off the front)
    }
    if (cross >= 0 && Math.hypot(rows[cross].ball![0] - rim.x, rows[cross].ball![2] - rim.z) < 2.5) {   // a descent 2.5 m from the ring is not a shot at it
      const b = rows[cross].ball!; const dx = b[0] - rim.x, dz = b[2] - rim.z; const off = Math.hypot(dx, dz);
      // the shooter's side: from the hero's root at the flight's start (front = toward the shooter)
      const h = rows[start].h?.[0] ?? null; const sx = h ? h[0] - rim.x : 0, sz = h ? h[2] - rim.z : 1; const sl = Math.hypot(sx, sz) || 1;
      const along = (dx * sx + dz * sz) / sl, across = (dx * sz - dz * sx) / sl;
      const side = off < THROUGH_R ? 'through' : Math.abs(along) >= Math.abs(across) ? (along > 0 ? 'front' : 'back') : (across > 0 ? 'right' : 'left');
      const path = off < THROUGH_R ? 'through' : 'iron';
      // through the net: below rim.y − 0.45 within 0.7 s of the crossing
      let throughNet = false; for (let k = cross; k < rows.length && rows[k].ball && rows[k].t - rows[cross].t < 700; k++) if (rows[k].ball![1] < rim.y - 0.45 && Math.hypot(rows[k].ball![0] - rim.x, rows[k].ball![2] - rim.z) < 0.35) { throughNet = true; break; }
      const near = outcomes.filter((o) => Math.abs(o.t - rows[cross].t) < 900).sort((a, c) => Math.abs(a.t - rows[cross].t) - Math.abs(c.t - rows[cross].t))[0];
      const outcome = near ? `${near.kind} ${near.label}` : 'unlogged';
      const ok = !near ? false : near.kind === 'make' ? (path === 'through' && throughNet) : (path === 'iron' && !throughNet);
      out.push({ t: rows[cross].t, outcome, path, offsetM: +off.toFixed(2), side, maxStepM: +maxStep.toFixed(2), throughNet, ok });
    }
    i = Math.max(j, start + 1);
  }
  return out;
}
export function printVerdicts(tag: string, v: ShotVerdict[]): void {
  const ok = v.filter((x) => x.ok).length;
  console.log(`BALLPATH ${tag}: ${v.length} flights, ${ok} agree with the result, ${v.filter((x) => x.maxStepM > 0.5).length} with a pop in the air`);
  for (const x of v) console.log(`  ${x.ok ? 'ok ' : 'XX '} @${x.t}ms ${x.outcome.padEnd(28)} path ${x.path} off ${x.offsetM} m ${x.side.padEnd(7)} net ${x.throughNet ? 'yes' : 'no '} maxStep ${x.maxStepM} m`);
}
