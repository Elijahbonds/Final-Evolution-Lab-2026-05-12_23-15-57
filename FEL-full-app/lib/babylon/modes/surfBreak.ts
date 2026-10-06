// SURF BREAK RULES — the pure half of the owner-picked surf improvements (IMPROVE 2026-10-06, surf items 10-20).
//
// SurfBreakMode is a closure over a scene, so nothing in it could be tested without a rig. The rules the improvements add
// — the air a press has left, the named grabs, which way a neutral cutback turns, where the rider sits in the pocket, the
// tube's read, the buoy's warning and near-miss, the first wave's trim lesson, the set's call — are numbers in and numbers
// out, so they live here and the mode feeds them. No Babylon, no DOM.

import { SURF_TRICKS, type BoardTrick } from '../core/BoardTricks';
import { airLeftSec, fitsAirLeft } from './gateCrasher';

// ── item 10: THE AIR LEFT ─────────────────────────────────────────────────────────────────────────────────────────────

/** The surf rig's gravity (m/s²): GroundRide's default — SurfBreakMode's buildRig overrides do not touch it. */
export const SURF_GRAVITY = 14;

/**
 * Seconds until a surfer in the air meets the water: `h` metres above the face under him, rising at `vy`, over a face that
 * falls away under him at `faceDrop` m/s (the face's own slope × his drift down it — Gate Crasher's airLeftSec, on a wave).
 */
export function surfAirLeft(h: number, vy: number, faceDrop = 0): number {
  return airLeftSec(h, vy, faceDrop, SURF_GRAVITY);
}

// ── item 18: THE NAMED GRABS ──────────────────────────────────────────────────────────────────────────────────────────

/** The plain X grab on a wave, as a named shape for the trick layer: an indy on a surfboard (TRICK POSE). It pays as
 *  boardCore's TRICKS.grab (90) — unchanged. */
export const SURF_GRAB: BoardTrick = { id: 'surf_grab', label: 'GRAB', discipline: 'surf', kind: 'air', dir: null, btn: 'X', spinDeg: 0, flipDeg: 0, grab: 'indy', difficulty: 1.4, airSec: 0.3, clip: 'board_grab' };

/**
 * X + a held direction: the two grabs a surfer is known for. Across (left / right) reaches for the RAIL; up / down is the
 * SLOB — the front hand to the toe-side rail, the board pulled up into the air. They live here, not in BoardTricks'
 * SURF_TRICKS, whose own test holds that a surf list is mostly ON the wave (five carves to four airs).
 * assumption: the rail grab poses as a melon and the slob as a method — the posture layer's nearest shapes.
 * Points are BoardTricks.basePts (40 × difficulty): 104 and 120, above the plain grab's 90 because they ask for a direction.
 */
export const SURF_GRABS: readonly BoardTrick[] = [
  { id: 'rail_grab', label: 'RAIL GRAB', discipline: 'surf', kind: 'air', dir: 'left', btn: 'X', spinDeg: 0, flipDeg: 0, grab: 'melon', difficulty: 2.6, airSec: 0.35, clip: 'board_grab' },
  { id: 'slob_grab', label: 'SLOB GRAB', discipline: 'surf', kind: 'air', dir: 'up', btn: 'X', spinDeg: 0, flipDeg: 0, grab: 'method', difficulty: 3.0, airSec: 0.45, clip: 'board_grab' },
];

/** The named grab a held direction asks for (null: the plain GRAB). */
export function surfGrabFor(dir: BoardTrick['dir']): BoardTrick | null {
  if (dir === 'left' || dir === 'right') return SURF_GRABS[0];
  if (dir === 'up' || dir === 'down') return SURF_GRABS[1];
  return null;
}

/** Whether a grab can still be held clean in the air that is left (gateCrasher.fitsAirLeft: one clean hold + a frame). */
export function grabFits(t: BoardTrick, airLeft: number): boolean { return fitsAirLeft(t, airLeft); }

/** Every air a surfer can throw: the table's airs and the named grabs (the arena bound counts them as distinct links). */
export const SURF_AIR_MOVES: readonly BoardTrick[] = [...SURF_TRICKS.filter((t) => t.kind === 'air'), ...SURF_GRABS];

// ── item 16: THE NEUTRAL CUTBACK ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Which way a B with the stick centred turns (+1 swings the heading toward +x): BACK TOWARD THE CURL — against the way the
 * board is heading across the wave (its yaw), else against its drift, and from dead straight back toward the middle of the
 * break. It was `stickX >= 0 ? 1 : -1`, so a centred stick always cut right, toward the channel wall half the time.
 */
export function neutralCutSign(yaw: number, velX: number, x: number): 1 | -1 {
  const across = Math.sin(yaw);
  if (Math.abs(across) > 0.2) return across > 0 ? -1 : 1;
  if (Math.abs(velX) > 0.5) return velX > 0 ? -1 : 1;
  return x > 0 ? -1 : 1;
}

// ── item 12: THE POCKET BAR ───────────────────────────────────────────────────────────────────────────────────────────

/** Where the bar starts: the wipe line just behind the crest (SurfBreakMode wipes at u < −0.5). */
export const POCKET_BAR_LIP_U = -0.5;

/**
 * Where the rider is between the lip and the bottom of the face, as the HUD's bar wants it: 0 at the lip (the wipe line),
 * 100 at the bottom of the face (and past it, on the flat), with the scored pocket band's two edges on the same scale.
 * Quantised to `step` % so the bar is sent when it moves, not every frame.
 */
export function pocketBar(u: number, pocket: { min: number; max: number }, faceLen: number, step = 2): { pos: number; lo: number; hi: number } {
  const span = Math.max(1e-6, faceLen - POCKET_BAR_LIP_U);
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - POCKET_BAR_LIP_U) / span) * 100));
  return { pos: Math.round(pct(u) / step) * step, lo: Math.round(pct(pocket.min)), hi: Math.round(pct(pocket.max)) };
}

// ── item 13: THE TUBE ─────────────────────────────────────────────────────────────────────────────────────────────────

/** What a barrel comes to when it closes: too short to count, ridden hands-off (said, pays nothing), or banked. */
export type BarrelVerdict = 'short' | 'unworked' | 'banked';
export function barrelVerdict(barrelSec: number, workedSec: number, holdSec: number, workShare: number): BarrelVerdict {
  if (barrelSec < holdSec) return 'short';
  return workedSec / Math.max(0.001, barrelSec) < workShare ? 'unworked' : 'banked';
}

/** The tube meter: the seconds inside (to a tenth), and whether the rider is WORKING it enough to bank (the share rule). */
export function tubeRead(barrelSec: number, workedSec: number, workShare: number): { tube: number; tubeOk: boolean } {
  return { tube: Math.round(barrelSec * 10) / 10, tubeOk: workedSec / Math.max(0.001, barrelSec) >= workShare };
}

// ── item 14: THE BUOYS ────────────────────────────────────────────────────────────────────────────────────────────────

/** How far down the line a buoy in the rider's lane is called (m), and how wide that lane is beyond contact (m). TUNED. */
export const BUOY_WARN_AHEAD_M = 14;
export const BUOY_WARN_LANE_M = 2;
/** SurfBreakMode's contact rule: a buoy is hit inside its radius + this (m). */
export const BUOY_CONTACT_PAD_M = 0.6;
/** A pass this close (m of clearance past contact) is a NEAR MISS. TUNED (the owner's menu: < 1.5 m). */
export const NEAR_MISS_M = 1.5;
/** What a near miss pays, as a link in the open chain (TrickMachine.link). TUNED. */
export const NEAR_MISS_PTS = 50;
/** One near miss at most this often (s) — the buoys are 20 m+ apart, so only a re-run past the same buoy is held back. */
export const NEAR_MISS_COOLDOWN_SEC = 2;

export interface BuoySpot { x: number; z: number; radius: number }
export interface BuoyEvent { kind: 'warn' | 'nearMiss'; i: number; clear: number }

/**
 * The buoys, watched. Contact was an instant wipeout with nothing before it. Each frame this says which buoy is IN THE LINE
 * ahead (`lit`), calls it once per approach (`warn`), and pays a pass that cleared contact by under NEAR_MISS_M (`nearMiss`)
 * once the buoy is behind. A hit is never a near miss (its clearance went below 0). `reset()` after a respawn.
 */
export class BuoyWatch {
  private st: { warned: boolean; passed: boolean; minClear: number; lit: boolean }[] = [];
  private cool = 0;

  update(dt: number, rx: number, rz: number, buoys: readonly BuoySpot[]): BuoyEvent[] {
    const out: BuoyEvent[] = [];
    this.cool = Math.max(0, this.cool - dt);
    buoys.forEach((b, i) => {
      const s = (this.st[i] ??= { warned: false, passed: false, minClear: Infinity, lit: false });
      const dz = b.z - rz;                                   // + : the buoy is still ahead, down the line
      const clear = Math.hypot(rx - b.x, rz - b.z) - (b.radius + BUOY_CONTACT_PAD_M);
      if (dz > BUOY_WARN_AHEAD_M + 4) { s.warned = false; s.passed = false; s.minClear = Infinity; }   // a fresh approach (a lap wrap)
      const inLane = Math.abs(rx - b.x) < b.radius + BUOY_CONTACT_PAD_M + BUOY_WARN_LANE_M;
      s.lit = dz > 0 && dz <= BUOY_WARN_AHEAD_M && inLane && !s.passed;
      if (s.lit && !s.warned) { s.warned = true; out.push({ kind: 'warn', i, clear }); }
      if (Math.abs(dz) < 3) s.minClear = Math.min(s.minClear, clear);
      if (!s.passed && dz < -1) {
        s.passed = true;
        if (s.minClear >= 0 && s.minClear < NEAR_MISS_M && this.cool <= 0) { this.cool = NEAR_MISS_COOLDOWN_SEC; out.push({ kind: 'nearMiss', i, clear: s.minClear }); }
      }
    });
    return out;
  }

  /** Is buoy `i` in the rider's line ahead right now (the mode lights it)? */
  lit(i: number): boolean { return this.st[i]?.lit ?? false; }

  reset(): void { this.st = []; this.cool = 0; }
}

// ── item 19: THE FIRST WAVE'S LESSON ──────────────────────────────────────────────────────────────────────────────────

export type CoachStep = 'climb' | 'drop' | 'pump' | 'done';
export const COACH_TEXT: Record<CoachStep, string> = {
  climb: 'PULL BACK — CLIMB TOWARD THE LIP',
  drop: 'PUSH FORWARD — DROP DOWN THE FACE',
  pump: 'BACK · FORWARD · BACK, QUICKLY — THAT RHYTHM IS THE PUMP',
  done: '',
};
/** How long a step's stick must be held to count (s), and the lesson's whole life (s) — it is a prompt, not a tutorial gate. */
export const COACH_HOLD_SEC = 0.35;
export const COACH_MAX_SEC = 35;

/**
 * The trim and the pump, taught on the first wave. The hint that explained them was never drawn and the pump was answered on
 * every 3rd stroke only. One prompt at a time: climb (stick back), drop (stick forward), then two pumps — each step advances
 * when the rider does it. `update` answers the prompt to show when it changes (else null); '' clears it.
 */
export class TrimCoach {
  step: CoachStep = 'climb';
  private held = 0;
  private age = 0;
  get text(): string { return COACH_TEXT[this.step]; }

  update(dt: number, stickY: number, pumps: number): string | null {
    if (this.step === 'done') return null;
    this.age += dt;
    if (this.age > COACH_MAX_SEC) return this.finish();
    if (this.step === 'pump') return pumps >= 2 ? this.finish() : null;
    const doing = this.step === 'climb' ? stickY > 0.5 : stickY < -0.5;
    this.held = doing ? this.held + dt : 0;
    if (this.held < COACH_HOLD_SEC) return null;
    this.held = 0;
    this.step = this.step === 'climb' ? 'drop' : 'pump';
    return this.text;
  }

  /** The lesson is over (learned, timed out, or the next wave arrived). '' the first time, null after. */
  finish(): string | null {
    if (this.step === 'done') return null;
    this.step = 'done';
    return '';
  }

  reset(): void { this.step = 'climb'; this.held = 0; this.age = 0; }
}

// ── items 9 / 20: THE SWELL ───────────────────────────────────────────────────────────────────────────────────────────

/** The most any swell is worth (surfLineup WAVE_PROFILES' CAVE) — the arena bound's multiplier on a wave move. */
export const SWELL_WORTH_MAX = 1.8;
/** A swell's worth as the score multiplies it: its own, never below 1 or above the table's biggest. */
export function swellWorth(p: { worth: number } | null | undefined): number {
  const w = p?.worth ?? 1;
  return Number.isFinite(w) ? Math.max(1, Math.min(SWELL_WORTH_MAX, w)) : 1;
}
/** The call when a swell breaks: "SET: CAVE ×1.8". */
export function setCall(p: { label: string; worth: number }): string {
  const w = swellWorth(p);
  return `SET: ${p.label} ×${w.toFixed(2).replace(/0$/, '')}`;
}
/** A ride is judged when it was a ride: a move, any tube, or a few seconds on the face. */
export function rideCounts(moves: number, tubeSec: number, rideSec: number): boolean {
  return moves > 0 || tubeSec > 0 || rideSec >= 3;
}
