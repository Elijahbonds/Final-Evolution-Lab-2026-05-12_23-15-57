// FlickStick — Mode 3 Phase 4: the Skate 3 analog trick vocabulary.
//
// ONE recognizer, all three disciplines: the RIGHT stick traces gestures;
// each gesture maps to exactly ONE trick (no mash-random). The vocabulary
// is data — new tricks are new rows, not new code.
//
//   Gesture model: the stick is sampled into 8-way direction tokens on
//   ENTRY (crossing the threshold into a cardinal/diagonal). A gesture is
//   a token sequence, matched longest-first with a time budget. Distinct
//   families:
//     flicks  (↓↑, ↓↗, ↖↓↘…)  → flip tricks
//     holds   (→ held)        → grabs (hold-to-keep, release-to-end)
//     circles (←↓→ / →↓←…)    → spins (270/360 by arc length)
//   Every token and match is deterministic — the test suite plays recorded
//   stick traces and asserts exact trick identity.

import type { FelInput } from '../core/InputBus';

export type Dir = 'up' | 'down' | 'left' | 'right' | 'upL' | 'upR' | 'downL' | 'downR';

export interface TrickGesture {
  id: string;
  label: string;
  /** token sequence; holds use the special 'HOLD:<dir>' form */
  pattern: Dir[] | { hold: Dir };
  family: 'flip' | 'grab' | 'spin';
  /** boardCore TRICKS key this maps onto (stats live there) */
  trickKey: string;
  difficulty: number;         // 1..5, feeds scoring/risk
}

export const GESTURES: TrickGesture[] = [
  // flicks
  { id: 'ollie', label: 'OLLIE', pattern: ['down', 'up'], family: 'flip', trickKey: 'pop', difficulty: 1 },
  { id: 'kickflip', label: 'KICKFLIP', pattern: ['down', 'downR', 'right'], family: 'flip', trickKey: 'flipA', difficulty: 2 },
  { id: 'heelflip', label: 'HEELFLIP', pattern: ['down', 'downL', 'left'], family: 'flip', trickKey: 'flipB', difficulty: 2 },
  { id: 'treflip', label: '360 FLIP', pattern: ['downL', 'down', 'downR', 'right'], family: 'flip', trickKey: 'flipA', difficulty: 4 },
  // holds (grabs — matched on entry, held until release)
  { id: 'indy', label: 'INDY', pattern: { hold: 'right' }, family: 'grab', trickKey: 'grab', difficulty: 1 },
  { id: 'melon', label: 'MELON', pattern: { hold: 'left' }, family: 'grab', trickKey: 'grab', difficulty: 1 },
  { id: 'method', label: 'METHOD', pattern: { hold: 'up' }, family: 'grab', trickKey: 'grab', difficulty: 3 },
  // circles (spins)
  { id: 'fs360', label: 'FS 360', pattern: ['right', 'down', 'left', 'up'], family: 'spin', trickKey: 'spin', difficulty: 3 },
  { id: 'bs360', label: 'BS 360', pattern: ['left', 'down', 'right', 'up'], family: 'spin', trickKey: 'spin', difficulty: 3 },
];

const ENTER_THRESH = 0.65;       // entering a direction
const EXIT_THRESH = 0.35;        // back to neutral
const GESTURE_BUDGET_MS = 700;   // sequence must complete inside this
const HOLD_MIN_MS = 120;         // a hold must be HELD (prevents flick-grabs)

interface Sample { d: Dir; at: number }

export class FlickStick {
  private tokens: Sample[] = [];
  private cur: Dir | null = null;
  private holdStart = 0;
  private holdDir: Dir | null = null;
  private holdTrick: TrickGesture | null = null;

  /** Feed a raw input event. Returns a newly-matched flick/spin trick. */
  feed(e: FelInput, now = performance.now()): TrickGesture | null {
    if (e.t !== 'stick' || e.side !== 'R') return null;
    const d = this.toDir(e.x, e.y);
    if (d !== this.cur) {
      if (d) {
        this.tokens.push({ d, at: now });
        this.tokens = this.tokens.filter((t) => now - t.at <= GESTURE_BUDGET_MS);
      }
      // hold detection begins on direction entry
      if (d && !this.holdDir) { this.holdDir = d; this.holdStart = now; }
      if (!d) { this.holdDir = null; this.holdTrick = null; }
      this.cur = d;
    }
    // hold-based grabs
    if (this.holdDir && !this.holdTrick && now - this.holdStart >= HOLD_MIN_MS) {
      const g = GESTURES.find((x) => !Array.isArray(x.pattern) && x.pattern.hold === this.holdDir);
      if (g) { this.holdTrick = g; return g; }
    }
    // sequence-based flicks/spins: longest match on the token tail
    return this.matchTail();
  }

  /** Current held grab (null when released). Modes call endGrab on null. */
  get heldGrab(): TrickGesture | null { return this.holdTrick; }

  private matchTail(): TrickGesture | null {
    let best: TrickGesture | null = null;
    for (const g of GESTURES) {
      if (!Array.isArray(g.pattern)) continue;
      const p = g.pattern;
      if (p.length > this.tokens.length) continue;
      const tail = this.tokens.slice(-p.length).map((t) => t.d);
      if (p.every((d, i) => d === tail[i])) {
        if (!best || p.length > (best.pattern as Dir[]).length) best = g;
      }
    }
    if (best) this.tokens.length = 0;
    return best;
  }

  private toDir(x: number, y: number): Dir | null {
    const mag = Math.hypot(x, y);
    if (mag < EXIT_THRESH) return null;
    if (mag < ENTER_THRESH && this.cur) return this.cur;   // hysteresis
    const a = Math.atan2(y, x);                            // y+ = up-stick
    const oct = Math.round(a / (Math.PI / 4));
    switch (((oct % 8) + 8) % 8) {
      case 0: return 'right'; case 1: return 'upR'; case 2: return 'up';
      case 3: return 'upL'; case 4: return 'left'; case 5: return 'downL';
      case 6: return 'down'; case 7: return 'downR';
    }
    return null;
  }

  reset(): void { this.tokens = []; this.cur = null; this.holdDir = null; this.holdTrick = null; }
}
