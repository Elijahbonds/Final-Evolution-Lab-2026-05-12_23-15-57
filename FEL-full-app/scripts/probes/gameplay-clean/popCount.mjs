// gameplay-clean: the rig's animation pop counter, pure (no browser) — audit.mjs's analyze() and the probes' own scripts share it,
// and scripts/gameplay-clean-pops-tests.ts holds it to its rules.
//
// A POP: one bone's angular speed this frame ≥ 600°/s and ≥ 3.5× its median over ±6 frames (the motion probe's rule); an EVENT is
// every bone that pops within 10 frames of another; a HARD event peaks at ≥ 1500°/s (25° in one frame at 60 fps).
//
// RESET FRAMES ARE CUTS (lane/gameplay-clean-5, 2026-11-10). A mode that RESETS its hero — football after a touchdown or a tackle,
// a drive restarting, a fighter back on his mark — moves the root metres in one frame, and every bone's angle jumps with the new
// pose on that frame. The camera cuts with it: a player sees a cut, not a pop. The counter counted them: football's "48–70° thighs"
// (GAMEPLAY-CLEAN-AUDIT §4e) were all reset frames (the toe 6–15 m in a frame, §4f). A frame whose root moved more than RESET_M
// from the frame before, and the frame after it (the first frame of the new pose against the cut one), are skipped, and left out of
// the median window. A pop on any other frame counts exactly as before — the control in the tests.

/** A root move larger than this (m) in one frame is a reset — a cut, not motion. */
export const RESET_M = 1;
export const POP_DEG_S = 600, POP_RATIO = 3.5, HARD_DEG_S = 1500, EVENT_GAP = 10;

/** The angle (degrees) between two [x, y, z, w] quaternions, or null. */
export const qang = (a, b) => { if (!a || !b) return null; const d = Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])); return 2 * Math.acos(d) * 180 / Math.PI; };
const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(0.5 * (s.length - 1))]; };
const r2 = (x) => Math.round(x * 100) / 100;

/** The frames that are cuts: index i where the root moved more than `resetM` from frame i − 1, and i + 1. */
export function resetFrames(F, resetM = RESET_M) {
  const cut = new Set();
  for (let i = 1; i < F.length; i++) {
    const a = F[i].r, b = F[i - 1].r; if (!a || !b) continue;
    if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > resetM) { cut.add(i); cut.add(i + 1); }
  }
  return cut;
}

/**
 * The pop count of a recording. `F` frames ({ t, ph, q: [[x,y,z,w] per bone], r: [x,y,z], c: clip index }), `clips` the clip-set
 * names, `bones` the bone names (q's order). Only playing frames count. `skipResets` false = the pre-clean-5 count (for comparison).
 */
export function countPops(F, clips, bones, { skipResets = true, dt = 1 / 60 } = {}) {
  const cut = skipResets ? resetFrames(F) : new Set();
  const speeds = F.map((f, i) => (i && f.q && F[i - 1].q ? f.q.map((q, b) => { const a = qang(q, F[i - 1].q[b]); return a === null ? null : a / dt; }) : null));
  const pops = [];
  for (let b = 0; b < bones.length; b++) {
    for (let i = 6; i < F.length - 6; i++) {
      const w = speeds[i]?.[b]; if (w === null || w === undefined || w < POP_DEG_S) continue;
      if (F[i].ph !== 'playing' || F[i - 1].ph !== 'playing') continue;
      if (cut.has(i)) continue;
      const nb = []; for (let k = i - 6; k <= i + 6; k++) if (k !== i && !cut.has(k) && speeds[k]?.[b] != null) nb.push(speeds[k][b]);
      const m = med(nb) ?? 0;
      if (w >= POP_RATIO * Math.max(m, 60)) pops.push({ t: F[i].t, i, bone: bones[b], degS: Math.round(w), clip: clips[F[i].c] ?? '', from: clips[F[Math.max(0, i - 3)].c] ?? '' });
    }
  }
  const byFrame = [...pops].sort((a, b) => a.i - b.i); const events = [];
  for (const p0 of byFrame) {
    const last = events[events.length - 1];
    if (last && p0.i - last.end <= EVENT_GAP) { last.end = p0.i; last.bones.add(p0.bone); last.peak = Math.max(last.peak, p0.degS); }
    else events.push({ t: p0.t, i: p0.i, end: p0.i, bones: new Set([p0.bone]), peak: p0.degS, from: p0.from, to: p0.clip });
  }
  const hard = events.filter((e) => e.peak >= HARD_DEG_S);
  const playN = F.filter((f) => f.ph === 'playing').length;
  return { pops, events, hard, resetFrames: [...cut].filter((i) => i < F.length && F[i].ph === 'playing').length, perMin: (n) => r2(n / Math.max(1e-6, playN / 3600)) };
}
