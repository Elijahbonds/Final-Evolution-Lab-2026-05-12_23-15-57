// THE HOOPS LOOK, as numbers (vis-hoops-dunk, AAA visual wave 2, 2026-10-14) — the pure half of the dunk, dunkduel and threepoint
// passes. Everything here is PRESENTATION: how big a ring of light leaves the rim on a make, when the rim catches fire, how a
// duelist's colour tints the room. Nothing in this file (or any file in lib/babylon/hoops/) reads or writes a score, a judge's
// number, a timing window, a difficulty or a pay: the modes pass in what already happened and ask how it should LOOK.
// hoopsWiring.test.ts holds that to the import graph.

/** How a make lands: a soft one (a plain finish), a sweet one, a big one, the money ball. */
export type MakeTier = 'soft' | 'sweet' | 'big' | 'money';

/** Pure: a dunk's tier from the SLAM's accuracy (0..1, the mode's own read at the iron), and whether he hung on the rim. */
export function tierFromAccuracy(accuracy01: number, hang = false): MakeTier {
  const a = Number.isFinite(accuracy01) ? Math.max(0, Math.min(1, accuracy01)) : 0;
  if (a >= 0.85 || (hang && a >= 0.6)) return 'big';
  if (a >= 0.5) return 'sweet';
  return 'soft';
}

/** Pure: a jump shot's tier — the money ball is its own; a perfect release is a big one; the rest are soft. */
export function tierFromShot(o: { perfect: boolean; money: boolean }): MakeTier {
  return o.money ? 'money' : o.perfect ? 'big' : 'soft';
}

export interface MakeLook {
  /** The ring of light's reach, metres (it leaves the iron and thins). */
  ringReach: number;
  ringHex: string;
  /** A second ring a beat behind the first. */
  echo: boolean;
  /** Sparks thrown off the iron (EffectsKit's burst scale; 0 = none). */
  sparks: number;
  /** The sparks' colour (null = EffectsKit's own gold). */
  sparkHex: string | null;
  /** The net's glow, 0..1, and how long it takes to die (seconds). */
  netGlow: number;
  netSec: number;
}

/** How each tier looks. Look numbers: judged on the before/after frames (scratchpad visual3/vis-hoops-dunk/sheets). */
export const MAKE_LOOK: Record<MakeTier, MakeLook> = {
  soft:  { ringReach: 0.9, ringHex: '#ffd9a0', echo: false, sparks: 0,   sparkHex: null,      netGlow: 0.25, netSec: 0.35 },
  sweet: { ringReach: 1.3, ringHex: '#ffd75e', echo: false, sparks: 0.7, sparkHex: null,      netGlow: 0.45, netSec: 0.5 },
  big:   { ringReach: 1.8, ringHex: '#fff1c2', echo: true,  sparks: 1.3, sparkHex: '#ffe08a', netGlow: 0.7,  netSec: 0.7 },
  money: { ringReach: 2.1, ringHex: '#ffd23f', echo: true,  sparks: 1.6, sparkHex: '#ffd23f', netGlow: 0.85, netSec: 0.9 },
};

/** The rim's fire: 0 none, 1 one make short of it (embers at the iron), 2 on fire (flames and a lit net). */
export type FireLevel = 0 | 1 | 2;

/** Pure: the fire level from a make streak and the streak that lights it (the mode's own FIRE_STREAK). */
export function fireLevel(streak: number, fireAt: number): FireLevel {
  if (!(fireAt > 0) || !Number.isFinite(streak) || streak <= 0) return 0;
  if (streak >= fireAt) return 2;
  return streak === fireAt - 1 ? 1 : 0;
}

/** Pure: flame particles a second for a level on a tier (a phone gets half; none at level 0). */
export function flameRate(level: FireLevel, tier: string | undefined): number {
  const per = level === 2 ? 46 : level === 1 ? 10 : 0;
  return tier === 'mobile' ? Math.round(per / 2) : per;
}

/** Pure: how a number eases toward a target at `rate` per second (never overshoots; the same shape the rig's eases use). */
export function easeToward(cur: number, target: number, rate: number, dt: number): number {
  const k = 1 - Math.exp(-Math.max(0, rate) * Math.max(0, dt));
  const next = cur + (target - cur) * k;
  return Math.abs(target - next) < 0.002 ? target : next;
}

/** Pure: a hex colour mixed toward another by `k` (0..1), as a hex string — a duelist's colour into the room's own rim light. */
export function mixHex(a: string, b: string, k: number): string {
  const p = (h: string): [number, number, number] => {
    const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
    if (!m) return [255, 255, 255];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const t = Math.max(0, Math.min(1, Number.isFinite(k) ? k : 0));
  const [ar, ag, ab] = p(a), [br, bg, bb] = p(b);
  const c = (x: number, y: number): string => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`;
}
