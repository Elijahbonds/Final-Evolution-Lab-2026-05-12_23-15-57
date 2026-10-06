// GolfLoop — the pure reads of the live five-hole loop (GolfMode in modes/precisionModes.ts).
//
// IMPROVE (2026-10-06, docs/IMPROVEMENTS-2026-10-05.md § Golf): the mode's rules that were inline arithmetic, a fixed
// formula, or a zero, pulled out so they are tested and the mode reads them:
//   #1  the stick swing's PATH — lateral drift through the swing is the side error (it was always 0: every stick swing pure);
//   #2  the course — each hole's LENGTH comes from its par, and the layout is seeded per round (it was one formula, every
//       session, with a 30 m par 3 and a 33 m one);
//   #4  the out-of-bounds drop — on the shot's own line, just inside where it left the field (it was always 14 m short of
//       the pin, often a better lie than a decent drive);
//   #10 / #11 one cancellable banner channel and one bag of timers the mode clears on dispose;
//   #12 the rhythm gauge decays on a bad strike instead of emptying;
//   #13 the arrow turned between two exact predictions (rotateAbout);
//   #17 the swing meter's HUD pushed only when a published value changes.

/** Pars of the loop's holes, by length (m from the tee). The field is 60 x 90 and the pin stays inside x ±10, z ≤ 38, so a
 *  par 5 here is ~36 m: par is the hole's difficulty on this course's scale, not a real-golf yardage. */
export const PAR_BANDS: Readonly<Record<3 | 4 | 5, readonly [number, number]>> = { 3: [22, 26], 4: [28, 32], 5: [34, 37.4] };
/** The par a hole of this length plays to: the bands' midpoints split it. */
export function parForDistance(m: number): 3 | 4 | 5 {
  return m < 27 ? 3 : m < 33 ? 4 : 5;
}

/** The tee the loop plays every hole from, and where a pin may go (inside the mown strip, short of the back fence). */
export const LOOP_TEE = { x: 0, z: 0.6 } as const;
export const LOOP_PIN_X_MAX = 10;
export const LOOP_PIN_Z_MAX = 38;

/** A deterministic 0..1 from a seed and a key (an integer hash: same seed, same course). */
export function seeded01(seed: number, key: number): number {
  let h = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul((key | 0) + 0x7f4a7c15, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The round's course seed (a new loop each play; one value, so a probe can pin it). */
export function loopSeed(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000) % 100000;
}

/**
 * Where hole `hole` (1-based) of the loop goes for this seed: its length drawn inside the band of `par`, its line turned
 * a seeded amount off the straight, the pin kept inside x ±LOOP_PIN_X_MAX and z ≤ LOOP_PIN_Z_MAX. parForDistance of the
 * result is always `par` — the card's par and the hole's length agree by construction.
 */
export function loopHole(par: number, seed: number, hole: number): { x: number; z: number; distM: number } {
  const [lo, hi] = PAR_BANDS[(par === 3 || par === 5 ? par : 4) as 3 | 4 | 5];
  const d = lo + (hi - lo) * seeded01(seed, hole * 2);
  const xMax = Math.min(LOOP_PIN_X_MAX, d * 0.35);
  const x = LOOP_TEE.x + (seeded01(seed, hole * 2 + 1) * 2 - 1) * xMax;
  const z = Math.min(LOOP_PIN_Z_MAX, LOOP_TEE.z + Math.sqrt(Math.max(0, d * d - (x - LOOP_TEE.x) ** 2)));   // the band tops out at z 38 straight down the line
  return { x, z, distM: Math.hypot(x - LOOP_TEE.x, z - LOOP_TEE.z) };
}

/** The hole's wind bearing (rad): the old per-hole golden-angle walk, started from a seeded heading. */
export function loopWindAngle(round: number, seed: number): number {
  return (round * 2.399 + seeded01(seed, 997) * Math.PI * 2) % (Math.PI * 2);
}

// ── #1 the stick swing's path ────────────────────────────────────────────────────────────────────────────────────────
/** Lateral stick inside this through the swing is a straight path (pads rest a little off centre, thumbs drift a little). */
export const STICK_PATH_DEAD = 0.2;
/**
 * The side error a stick swing's lateral drift buys: the PEAK sideways deflection from the pull-back to the push-through,
 * past the dead zone, scaled so a stick pushed out to the rim is a full (1) slice to the right / hook to the left —
 * the same ±1 the three-press swing hands strike().
 */
export function stickPathErr(peakX: number): number {
  const a = Math.abs(peakX);
  if (!(a > STICK_PATH_DEAD)) return 0;
  return Math.sign(peakX) * Math.min(1, (a - STICK_PATH_DEAD) / (1 - STICK_PATH_DEAD));
}

// ── #12 rhythm ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** A strike inside this much side error is clean and builds the gauge. */
export const RHYTHM_CLEAN_ERR = 0.2;
export const RHYTHM_CLEAN_GAIN = 35;
/** What a hook / slice keeps of the gauge (it was 0: one drift emptied a full gauge). */
export const RHYTHM_MISS_KEEP = 0.5;
export function rhythmAfter(flow: number, sideErr: number): number {
  return Math.abs(sideErr) <= RHYTHM_CLEAN_ERR ? Math.min(100, flow + RHYTHM_CLEAN_GAIN) : Math.floor(flow * RHYTHM_MISS_KEEP);
}

// ── #4 the out-of-bounds drop ────────────────────────────────────────────────────────────────────────────────────────
export interface LoopBounds { xMax: number; zMin: number; zMax: number }
/** The field's edge (60 x 90 grass; the mode's own OB test). */
export const LOOP_BOUNDS: LoopBounds = { xMax: 28, zMin: -6, zMax: 43 };
export function inBounds(p: { x: number; z: number }, b: LoopBounds = LOOP_BOUNDS): boolean {
  return Math.abs(p.x) <= b.xMax && p.z >= b.zMin && p.z <= b.zMax;
}
/**
 * Where an out-of-bounds ball is dropped: on the line from the lie it was struck from to where it came to rest, `margin`
 * metres back inside from the point that line leaves the field — the nearest in-bounds point on the shot's line. A shot
 * that barely crossed is dropped near where it crossed; it never gains a lie the shot did not reach.
 */
export function obDrop(lie: { x: number; z: number }, rest: { x: number; z: number }, b: LoopBounds = LOOP_BOUNDS, margin = 2): { x: number; z: number } {
  const clampIn = (p: { x: number; z: number }) => ({
    x: Math.max(-(b.xMax - margin), Math.min(b.xMax - margin, p.x)),
    z: Math.max(b.zMin + margin, Math.min(b.zMax - margin, p.z)),
  });
  if (!inBounds(lie, b)) return clampIn(lie);
  const dx = rest.x - lie.x, dz = rest.z - lie.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return clampIn(lie);
  let t = 1;
  if (dx > 0) t = Math.min(t, (b.xMax - lie.x) / dx); else if (dx < 0) t = Math.min(t, (-b.xMax - lie.x) / dx);
  if (dz > 0) t = Math.min(t, (b.zMax - lie.z) / dz); else if (dz < 0) t = Math.min(t, (b.zMin - lie.z) / dz);
  const back = Math.max(0, len * t - margin) / len;
  // on the segment from an in-bounds lie to the crossing, so in bounds already; the clamp only trims float dust
  return {
    x: Math.max(-b.xMax, Math.min(b.xMax, lie.x + dx * back)),
    z: Math.max(b.zMin, Math.min(b.zMax, lie.z + dz * back)),
  };
}

// ── #13 turning a prediction ─────────────────────────────────────────────────────────────────────────────────────────
/** `p` turned by `d` radians of yaw (the mode's yaw: atan2(x, z)) about (cx, cz), written into `out`. */
export function rotateAbout(p: { x: number; z: number }, cx: number, cz: number, d: number, out: { x: number; z: number }): { x: number; z: number } {
  const rx = p.x - cx, rz = p.z - cz, c = Math.cos(d), s = Math.sin(d);
  out.x = cx + rx * c + rz * s; out.z = cz - rx * s + rz * c;
  return out;
}

// ── #10 / #11 timers and the banner ──────────────────────────────────────────────────────────────────────────────────
type TimerId = ReturnType<typeof setTimeout>;
/** Every timeout the mode schedules, so dispose() can clear what is still pending. */
export class TimerBag {
  private ids = new Set<TimerId>();
  later(fn: () => void, ms: number): TimerId {
    const id = setTimeout(() => { this.ids.delete(id); fn(); }, ms);
    this.ids.add(id);
    return id;
  }
  cancel(id: TimerId | null): void { if (id === null) return; clearTimeout(id); this.ids.delete(id); }
  clear(): void { for (const id of this.ids) clearTimeout(id); this.ids.clear(); }
  get pending(): number { return this.ids.size; }
}

/** One banner at a time: a newer banner cancels the older one's pending clear, so a FLICK's clear never wipes a RING. */
export class BannerChannel {
  private clearT: TimerId | null = null;
  constructor(private readonly timers: TimerBag, private readonly push: (text: string) => void) {}
  /** Shown, then cleared after `ms` — unless something newer took the channel first. */
  flash(text: string, ms: number): void {
    this.cancel(); this.push(text);
    this.clearT = this.timers.later(() => { this.clearT = null; this.push(''); }, ms);
  }
  /** A banner some other line is publishing (with its own clear): any pending flash clear is cancelled so it cannot wipe it. */
  cancel(): void { this.timers.cancel(this.clearT); this.clearT = null; }
}

// ── #17 the swing meter's HUD ────────────────────────────────────────────────────────────────────────────────────────
export type MeterHudPatch = Record<string, number | string | null>;
type MeterHudLast = { power?: number; meterT?: number; swingPhase?: string; powerLock?: number | null; meterCarry?: number | null };
/** Remembers what was last published and hands back only what changed (null: nothing to push this frame). */
export class MeterHudGate {
  private last: MeterHudLast = {};
  /** Forget the last push (a new swing publishes everything on its first frame). */
  reset(): void { this.last = {}; }
  next(power: number, meterT: number, swingPhase: string, powerLock: number | null, meterCarry: number | null): MeterHudPatch | null {
    let out: MeterHudPatch | null = null;
    const l = this.last;
    if (!('power' in l) || l.power !== power) { (out ??= {}).power = power; l.power = power; }
    if (!('meterT' in l) || l.meterT !== meterT) { (out ??= {}).meterT = meterT; l.meterT = meterT; }
    if (!('swingPhase' in l) || l.swingPhase !== swingPhase) { (out ??= {}).swingPhase = swingPhase; l.swingPhase = swingPhase; }
    if (!('powerLock' in l) || l.powerLock !== powerLock) { (out ??= {}).powerLock = powerLock; l.powerLock = powerLock; }
    if (!('meterCarry' in l) || l.meterCarry !== meterCarry) { (out ??= {}).meterCarry = meterCarry; l.meterCarry = meterCarry; }
    return out;
  }
}
