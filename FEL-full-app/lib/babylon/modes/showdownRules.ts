// showdownRules — the small rules Showdown's owner-picked pass added (IMPROVE 2026-10-06). PURE: no Babylon, no DOM, so
// each is tested on its own (ShowdownMode.improve.test.ts); the mode file mounts Babylon and only calls these.

/** The Storm numbers this pass introduced or moved. Every one is a feel number (TUNED in the commit). */
export const SHOWDOWN = {
  /** The ultimate's reach — the distance the old resolve checked AFTER the 1.1 s cut (ULT_RANGE 2.6 + 1.2). It is checked
   *  before the bar is spent now, so a full bar is never paid for a whiff. Unchanged value. */
  ultReachM: 3.8,
  ultDmg: 38,
  /** The camera cut before the blow lands (unchanged). */
  ultCutSec: 1.1,
  /** The launch: a knock slide AWAY from the attacker. It used to be a 12 m/s velocity toward −Z that nothing integrated
   *  while the rival lay staggered, so it moved nobody. The slide runs at that same 12 m/s. */
  ultLaunchM: 4,
  ultLaunchMps: 12,
  /** During the cut the attacker closes to this stand-off (the lunge), so a knock slide still running at the spend cannot
   *  carry the target out of the blow. */
  ultStandoffM: 1.4,
  ultLungeMps: 8,
  /** L1 held: the CHAKRA CHARGE (Storm's charge) — rooted, open to a punish, on top of the meter's own 3/s regen. */
  chargePerSec: 10,
  /** The round-start beat ("ROUND n", then FIGHT!) and the KO pause, on the game clock. */
  readySec: 0.9,
  roundOverSec: 1.8,
  roundsToWin: 2,
  /** One-beat animation states, per fighter (the values Karate VS plays). */
  reactSec: 0.3,
  ultReactSec: 0.6,
  parrySec: 0.3,
  impactSec: 0.24,
  /** A rival substitution: the beat in which a strike already in flight finds nobody (the player's own is 400 ms). */
  subWhiffMs: 400,
} as const;

/** What a strike's outcome earns the ATTACKER's chakra. The gain used to run before the outcome was known, so a whiff, a
 *  block and a parried swing each paid as a clean hit. Only a blow that lands — a hit, or a guard it breaks — pays now. */
export function attackerChakraGain(outcome: string): 'hitLanded' | null {
  return outcome === 'hit' || outcome === 'guardBreak' ? 'hitLanded' : null;
}

/** The ultimate connects inside its reach. */
export function ultimateReaches(dist: number): boolean {
  return Number.isFinite(dist) && dist <= SHOWDOWN.ultReachM;
}

/** How far the attacker lunges this frame of the cut: toward the stand-off, never past it, never backwards. */
export function ultLungeStep(dist: number, dt: number): number {
  if (!(dt > 0) || !(dist > SHOWDOWN.ultStandoffM)) return 0;
  return Math.min(dist - SHOWDOWN.ultStandoffM, SHOWDOWN.ultLungeMps * dt);
}

/** Does the ultimate's launch — `ultLaunchM` straight away from the attacker — carry the target to the gate at `gateZ`
 *  (it breaks within SHOWDOWN_GATE.breakM, 0.8 m, of it — combat/arenas)? Read on the launch's own line, before an arena
 *  clamps or a cage's ropes bounce the body back. */
export function launchReachesGate(atk: { x: number; z: number }, def: { x: number; z: number }, gateZ: number, breakM = 0.8): boolean {
  const dx = def.x - atk.x, dz = def.z - atk.z, d = Math.hypot(dx, dz);
  if (!(d > 1e-3)) return false;
  return def.z + (dz / d) * SHOWDOWN.ultLaunchM <= gateZ + breakM;
}

/** The fire pits' verdict after a tick: null while both stand; else did the PLAYER win. A double burn-out on one tick goes
 *  to the player (Karate VS's time-out tie rule). */
export function burnVerdict(meHp: number, foeHp: number): boolean | null {
  if (meHp > 0 && foeHp > 0) return null;
  return foeHp <= 0;
}

/** The round-start call. */
export function roundCall(round: number, roundsToWin: number = SHOWDOWN.roundsToWin): string {
  if (round <= 1) return `BEST OF ${roundsToWin * 2 - 1} — ROUND 1`;
  if (round >= roundsToWin * 2 - 1) return 'FINAL ROUND';
  return `ROUND ${round}`;
}

/**
 * The rival's ultimate, armed on ONE swing. Its full bar is spent when its heavy is thrown; the cinematic plays only if
 * that swing lands clean. A block, a parry, a dodge or a substitution answers it, and the bar is gone either way (Storm's
 * rule: the opener must connect). `take` is called once, as the swing resolves; any other swing never carries it.
 */
export class UltimateArm<S extends object = object> {
  private swing: S | null = null;
  arm(swing: S): void { this.swing = swing; }
  /** Is `current` the armed swing? Disarms either way (one resolve per swing). */
  take(current: S | null | undefined): boolean {
    const hit = !!current && current === this.swing;
    this.swing = null;
    return hit;
  }
  /** Drop the arm once the armed swing is no longer the one in flight (cut short, cancelled, a round reset). */
  sync(current: S | null | undefined): void { if (this.swing && current !== this.swing) this.swing = null; }
  get armed(): boolean { return this.swing !== null; }
  clear(): void { this.swing = null; }
}
