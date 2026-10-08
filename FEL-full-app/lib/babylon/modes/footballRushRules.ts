// footballRushRules — IMPROVE (2026-10-06): the pure rules behind the owner-picked Football Rush improvements.
//
// FootballRushMode draws; everything here is arithmetic or bookkeeping, so it is tested without a scene:
//   · GAME TIMERS — the mode's delayed beats (a defender's snap reaction, the tackle reset, the next drive) on the MODE
//     clock instead of real-time setTimeouts: they hold through a pause and a hit-stop, and a tag clears them on a tackle
//     or a new drive (a pursuit timer from the last down used to fire into the next one);
//   · THE KICK'S LANDING — the ball comes down somewhere in front of the returner, not always on x = 0, and the catch is
//     graded on positioning as well as the press;
//   · THE DEFENSE'S ARC — the snap read and the busts tighten drive by drive;
//   · THE COIN LINES — laid over the ramps, along the rail and under the bench, so the coins pay the lanes;
//   · THE CONTEXT PROMPTS — "B VAULT", "A CATAPULT", "R1 ARM" when each read is live;
//   · THE SESSION TARGET — a medal ladder per session and the viewer's best, kept in guarded localStorage;
//   · THE HUD GATE — discrete fields go on change, the continuous fills at FB_HUD_HZ.
//
// Arena: Breakaway is staked (lib/arena-score-integrity.ts footballBound). Nothing here writes the score; the coin layout
// keeps every group at or under FB_COIN_GROUP_MAX coins so the bound's per-frame coin term (8 × 5) still holds.

import { LANES } from '../core/KickoffReturn';
import type { TierProfile } from '../core/Difficulty';

// ── game timers ──────────────────────────────────────────────────────────────

/** Delayed calls on a clock the caller owns (seconds). Tiny on purpose: a handful live at once. */
export class GameTimers {
  private list: { at: number; fn: () => void; tag: string }[] = [];
  /** Run `fn` once the clock reaches `now + sec`. */
  later(now: number, sec: number, fn: () => void, tag = ''): void { this.list.push({ at: now + Math.max(0, sec), fn, tag }); }
  /** Drop every pending call (no tag) or only those with `tag`. */
  clear(tag?: string): void { this.list = tag === undefined ? [] : this.list.filter((t) => t.tag !== tag); }
  /** Fire what is due, earliest first, one at a time — a call that clears or schedules is seen by the rest of the tick. */
  tick(now: number): void {
    for (;;) {
      let k = -1;
      for (let i = 0; i < this.list.length; i++) if (this.list[i].at <= now && (k < 0 || this.list[i].at < this.list[k].at)) k = i;
      if (k < 0) return;
      const t = this.list[k];
      this.list.splice(k, 1);
      t.fn();
    }
  }
  get size(): number { return this.list.length; }
  pending(tag: string): number { return this.list.reduce((n, t) => n + (t.tag === tag ? 1 : 0), 0); }
}

// ── the kick's landing ───────────────────────────────────────────────────────

/** Where the kick may come down: x across the middle third, z a stride either side of the returner's spot. // TUNE(elijah) */
export const KICK_LAND = { halfX: 4.5, zMin: -1, zMax: 2.5 } as const;
/** The returner's positioning speed while the kick hangs (m/s) and its rate (1 − e^(−k·dt)). // TUNE(elijah) */
export const KICK_MOVE = { speed: 4.5, rate: 9 } as const;
/** Under the ball (≤ fullM) the press keeps its grade; a stretch (≤ stretchM) costs one grade; further is a bobble. // TUNE(elijah) */
export const CATCH_REACH = { fullM: 1.5, stretchM: 3 } as const;

/** A landing spot from two uniform rolls in [0, 1). */
export function kickLanding(rollX = Math.random(), rollZ = Math.random()): { x: number; z: number } {
  return { x: (rollX * 2 - 1) * KICK_LAND.halfX, z: KICK_LAND.zMin + rollZ * (KICK_LAND.zMax - KICK_LAND.zMin) };
}

export type KickGrade = 'perfect' | 'good' | 'early' | 'late';
/** The press's grade, read against how far the returner stood from where the ball came down. */
export function positionedCatch(grade: KickGrade, distM: number): KickGrade {
  if (!(distM <= CATCH_REACH.stretchM)) return 'late';
  if (distM <= CATCH_REACH.fullM) return grade;
  return grade === 'perfect' ? 'good' : grade === 'good' ? 'early' : grade;
}

/** One frame of the returner's positioning run: a rate toward the stick's velocity (stick y −1 = upfield). */
export function kickMoveStep(v: { vx: number; vz: number }, stickX: number, stickY: number, dt: number): { vx: number; vz: number } {
  const k = 1 - Math.exp(-KICK_MOVE.rate * Math.max(0, dt));
  const sx = Math.max(-1, Math.min(1, stickX)), sz = Math.max(-1, Math.min(1, -stickY));
  const n = Math.hypot(sx, sz), s = n > 1 ? 1 / n : 1;
  return { vx: v.vx + (sx * s * KICK_MOVE.speed - v.vx) * k, vz: v.vz + (sz * s * KICK_MOVE.speed - v.vz) * k };
}

// ── the defense's arc ────────────────────────────────────────────────────────

/** Per drive past the first, the snap reaction shrinks by this share, never under the floor. // TUNE(elijah) */
export const DEFENSE_RAMP = { reactionStep: 0.06, reactionFloor: 0.76, mistakeStep: 0.15, mistakeFloor: 0.4 } as const;

/** The picked tier, tightened for drive `drive` (1-based): a quicker read off the snap and fewer busts. Drive 1 is the tier. */
export function rampTier(tier: TierProfile, drive: number): TierProfile {
  const d = Math.max(0, Math.floor(drive) - 1);
  const r = Math.max(DEFENSE_RAMP.reactionFloor, 1 - DEFENSE_RAMP.reactionStep * d);
  const m = Math.max(DEFENSE_RAMP.mistakeFloor, 1 - DEFENSE_RAMP.mistakeStep * d);
  return { ...tier, reactionMs: Math.round(tier.reactionMs * r), mistakeRate: tier.mistakeRate * m };
}

// ── the coin lines ───────────────────────────────────────────────────────────

/** The most coins in one group (the arena bound's coin term is 8 coins × 5 in a frame). */
export const FB_COIN_GROUP_MAX = 8;
export interface CoinGroup { lane: 'ramp' | 'rail' | 'tunnel'; points: [number, number, number][] }

/** Coin height over whatever the runner is standing on (the old straight line's 0.4). */
const COIN_Y = 0.4;
/** How far a ramp launch carries (≈ rampAirSec × a boosted run), metres. */
const RAMP_CARRY_M = 5;

/**
 * The drive's coins: an arc over each ramp along the flight a launch takes — only the inner points, all of them at least
 * 1.3 m up, so only a runner IN the air passes through them; a run up one side's rail at rail height; and a line under
 * that side's bench (only a slide gets there). The side alternates by drive, so a session visits both walls and both
 * tunnels. Every group is at most FB_COIN_GROUP_MAX coins.
 */
export function coinLayout(drive: number): CoinGroup[] {
  const side: 1 | -1 = drive % 2 === 1 ? 1 : -1;
  const out: CoinGroup[] = [];
  for (const r of LANES.ramps) {
    // the air lane starts where the runner meets the ramp (its near edge) and arcs rampUp high over the carry
    const z0 = r.z - r.halfZ;
    const points: [number, number, number][] = [0.25, 0.5, 0.75].map((t) => [r.x, COIN_Y + Math.sin(t * Math.PI) * LANES.rampUp, z0 + t * RAMP_CARRY_M]);
    out.push({ lane: 'ramp', points });
  }
  const railX = side * (LANES.railX - 0.25), railY = LANES.railY + COIN_Y;
  out.push({ lane: 'rail', points: [0, 1, 2, 3].map((i) => [railX, railY, 8 + i * 3.3]) });
  const t = LANES.tunnels.find((x) => Math.sign(x.x) === side) ?? LANES.tunnels[0];
  const len = t.z1 - t.z0 - 3;
  out.push({ lane: 'tunnel', points: [0, 1, 2, 3].map((i) => [t.x, COIN_Y, t.z0 + 1.5 + (i / 3) * len]) });
  return out;
}

// ── the context prompts ──────────────────────────────────────────────────────

/** The live reads as chips, in button order; '' when none is live. */
export function contextPrompts(live: { vault: boolean; catapult: boolean; arm: boolean }): string {
  const out: string[] = [];
  if (live.vault) out.push('B VAULT');
  if (live.catapult) out.push('A CATAPULT');
  if (live.arm) out.push('R1 ARM');
  return out.join(' · ');
}

/** The truck's readiness 0..1 (1 = ready), in 5 % steps so the HUD only hears a visible change. */
export function truckReady01(cooldownSec: number, totalSec: number): number {
  if (!(totalSec > 0) || !(cooldownSec > 0)) return 1;
  return Math.round(Math.max(0, Math.min(1, 1 - cooldownSec / totalSec)) * 20) / 20;
}

/** The hurdle's hop: a half-sine over the move, metres off the turf. // TUNE(elijah) */
export const HURDLE_HOP_M = 0.45;
export function hopY(t: number, sec: number, h = HURDLE_HOP_M): number {
  if (!(sec > 0) || t <= 0 || t >= sec) return 0;
  return Math.sin((t / sec) * Math.PI) * h;
}

// ── the session target ───────────────────────────────────────────────────────

/** The medal ladder for a five-drive session. // TUNE(elijah) */
export const FB_MEDALS = [
  { name: 'BRONZE', at: 350 },
  { name: 'SILVER', at: 700 },
  { name: 'GOLD', at: 1100 },
] as const;

/** 0 none, 1 bronze, 2 silver, 3 gold. */
export function medalFor(score: number): number {
  let m = 0;
  for (let i = 0; i < FB_MEDALS.length; i++) if (score >= FB_MEDALS[i].at) m = i + 1;
  return m;
}
export function medalName(medal: number): string { return medal >= 1 && medal <= FB_MEDALS.length ? FB_MEDALS[medal - 1].name : ''; }

/** The chase line: "SILVER AT 700 · 230 TO GO", or "GOLD ✓" at the top. */
export function parLine(score: number, best: number | null = null): string {
  const m = medalFor(score);
  const pb = best && best > 0 ? ` · BEST ${best}` : '';
  if (m >= FB_MEDALS.length) return `${FB_MEDALS[FB_MEDALS.length - 1].name} ✓${pb}`;
  const next = FB_MEDALS[m];
  return `${next.name} AT ${next.at} · ${next.at - Math.max(0, Math.floor(score))} TO GO${pb}`;
}

/** The index of the longest drive (first on a tie), -1 for none. */
export function bestDriveIndex(rows: readonly { score: number | string }[]): number {
  let k = -1, best = -Infinity;
  for (let i = 0; i < rows.length; i++) { const y = Number(rows[i].score); if (Number.isFinite(y) && y > best) { best = y; k = i; } }
  return k;
}

export const FB_BEST_KEY = 'fel-football-best-v1';
interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }
function storage(): StorageLike | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
export function loadFootballBest(store: StorageLike | null = storage()): number | null {
  if (!store) return null;
  try { const v = Number(store.getItem(FB_BEST_KEY)); return Number.isFinite(v) && v > 0 ? Math.floor(v) : null; } catch { return null; }
}
/** Keep the session if it beats the best (only a finished session is offered). */
export function saveFootballBestIfHigher(score: number, store: StorageLike | null = storage()): { improved: boolean; previous: number | null } {
  const previous = loadFootballBest(store);
  if (!(score > 0) || (previous !== null && previous >= score)) return { improved: false, previous };
  if (store) { try { store.setItem(FB_BEST_KEY, String(Math.floor(score))); } catch { /* full or blocked */ } }
  return { improved: true, previous };
}

// ── the HUD gate ─────────────────────────────────────────────────────────────

/** The continuous fills (breakaway, truck) are sent this often; a discrete field goes the frame it changes. */
export const FB_HUD_HZ = 10;

/**
 * The fields of `next` that differ from what was last sent, written into `sent`; null when nothing changed. `continuous`
 * fields only count when `gateOpen` (the 10 Hz tick) — a discrete change never waits for it.
 */
export function hudChanges<T extends Record<string, string | number | boolean>>(sent: Partial<T>, next: T, continuous: ReadonlySet<string>, gateOpen: boolean): Partial<T> | null {
  let out: Partial<T> | null = null;
  for (const k in next) {
    if (next[k] === sent[k]) continue;
    if (!gateOpen && continuous.has(k) && k in sent) continue;
    (out ??= {} as Partial<T>)[k] = next[k];
    sent[k] = next[k];
  }
  return out;
}
