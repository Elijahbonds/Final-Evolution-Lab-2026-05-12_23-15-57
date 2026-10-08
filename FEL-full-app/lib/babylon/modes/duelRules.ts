// duelRules — the small rules Duel's owner-picked pass added (IMPROVE 2026-10-06). PURE: no Babylon, no DOM, so each is
// tested on its own (DuelMode.improve.test.ts); DuelMode mounts Babylon and only calls these.

import { clampToShape, insideBy, type ArenaShape } from '../combat/arenas';

export type DuelWeapon = 'fists' | 'staff' | 'blade';
export const DUEL_WEAPONS: readonly DuelWeapon[] = ['fists', 'blade', 'staff'];

/** IMPROVE (2026-10-06): ONE static controls line. It left out the X tap / double-tap step and Focus, and the edge
 *  warning overwrote it (the warning has its own HUD field now). */
export const DUEL_HINT = 'Stick orbits your foe · A / B / Y strike · tap X step, double-tap X close in · hold X block — flick TOWARD them at impact for GUARD IMPACT · hold R2 focus · knock them OFF the edge';

/** The beats and windows this pass introduced or moved. The feel ones are TUNED in the commit. */
export const DUEL = {
  roundsToWin: 2,
  /** The round clock (was an invisible 120 s budget; the rule is unchanged: TIME is decided on HP). */
  roundSec: 120,
  /** The round-start beat ("ROUND n", then FIGHT!) — Showdown's value. */
  readySec: 0.9,
  /** The pause after a round's verdict, on the GAME clock (was a 2000 ms setTimeout). */
  roundOverSec: 2,
  /** One-beat animation states, per fighter (Karate VS / Showdown's values). */
  reactSec: 0.3,
  parrySec: 0.3,
  impactSec: 0.24,
  /** A rival substitution: the beat in which a strike already in flight finds nobody (Showdown's 400 ms). */
  subWhiffMs: 400,
  /** The rival's chi dash (was a 12-chi teleport of 2.2 m; CombatMovement's dash covers ~2.1 m in 0.22 s). */
  rivalDashChi: 12,
  /** The footing warning shows this far inside the edge (unchanged 1.1 m), for either fighter now. */
  edgeWarnM: 1.1,
  /** The rival never WALKS closer to a drop than this (only a blow sends it over) — Mixed's rule. */
  rivalHoldM: 0.5,
  /** A substitution never lands the rival closer to a drop than this. */
  subSafeM: 0.8,
  /** The rival's CRITICAL EDGE: a full chi bar rides one heavy; clean, it lands this much harder and further. */
  critMult: 1.5,
  /** COMBAT DIFFICULTY (2026-10-06), TUNED: the rival's power (FightCore.rivalPower) × this, by YOUR weapon. The rival
   *  counter-picks (fists → its blade, blade → its staff, staff → its fists), so one power is three different fights:
   *  measured at the fists' power, a decent player won 3 % with the blade (the staff out-reaches it) and 3 % with the staff
   *  (on its authored chain). Each pick is calibrated to the same PRO target. */
  // (the combo breaker pass: blade 0.6 → 0.58, staff 0.67 → 0.64 — the rival's hit-taken chi and break moved them)
  rivalPowerByWeapon: { fists: 1, blade: 0.58, staff: 0.64 },
} as const;

/** What a strike's outcome pays the ATTACKER's chi: the move's own chiGain for a blow that lands (a hit, a guard it
 *  breaks), nothing else. Duel never paid chi at all, so the rival could never afford a dash or a substitution. */
export function chiForOutcome(outcome: string, chiGain: number): number {
  return (outcome === 'hit' || outcome === 'guardBreak') && chiGain > 0 ? chiGain : 0;
}

/** What beats each weapon — the arsenal's own words: the staff wins the range war over the blade, the blade out-reaches
 *  and out-chains fists, and fists get inside the staff's slow swing. */
export const COUNTER_WEAPON: Readonly<Record<DuelWeapon, DuelWeapon>> = { fists: 'blade', blade: 'staff', staff: 'fists' };

/**
 * The rival's weapon for a round. Round 1 it counter-picks yours; a rival that LOST the last round changes to the weapon
 * that is neither its last nor yours; one that won keeps what worked. (It was the staff, every round, whatever you held.)
 */
export function rivalWeaponFor(round: number, mine: DuelWeapon, prev: DuelWeapon | null, rivalWonLast: boolean): DuelWeapon {
  if (round <= 1 || !prev) return COUNTER_WEAPON[mine];
  if (rivalWonLast) return prev;
  return DUEL_WEAPONS.find((w) => w !== prev && w !== mine) ?? COUNTER_WEAPON[mine];
}

/** The edge call for the HUD's own `edge` field: your back first, then the rival's. '' = nothing to say. */
export function edgeCall(myInside: number, foeInside: number, warnM: number = DUEL.edgeWarnM): '' | 'EDGE BEHIND YOU' | 'RIVAL ON THE EDGE' {
  if (myInside < warnM) return 'EDGE BEHIND YOU';
  if (foeInside < warnM) return 'RIVAL ON THE EDGE';
  return '';
}

/**
 * The rival's OWN step never takes it nearer a drop than `margin` (or nearer than it already stood, when a blow left it
 * closer). A knock slide is not a step: it is applied elsewhere and the ring-out still reads it. Mutates `p`; returns
 * true when it held the body back.
 */
export function holdFromEdge(p: { x: number; z: number }, insideBefore: number, shape: ArenaShape, margin: number = DUEL.rivalHoldM): boolean {
  const now = insideBy(p, shape);
  if (now >= margin || now >= insideBefore) return false;
  return clampToShape(p, shape, Math.max(0, Math.min(margin, insideBefore)));
}

/**
 * Where a substitution puts the rival: behind the player (DefenseSystem's 1.1 m), else to either side of him, else
 * nowhere — a spot past the drop would ring the rival out by its own hand. `facing` is the player's yaw.
 */
export function safeSubstitutionSpot(
  px: number, pz: number, facing: number, edgeIn: (x: number, z: number) => number,
  margin: number = DUEL.subSafeM, behind = 1.1,
): { x: number; z: number } | null {
  const s = Math.sin(facing), c = Math.cos(facing);
  const spots = [
    { x: px - s * behind, z: pz - c * behind },   // behind (DefenseController.substitutionSpot)
    { x: px + c * behind, z: pz - s * behind },   // his right
    { x: px - c * behind, z: pz + s * behind },   // his left
  ];
  for (const q of spots) if (edgeIn(q.x, q.z) >= margin) return q;
  return null;
}

/** The result score (IMPROVE 2026-10-06). The rounds still carry it (×100 won, −40 lost, unchanged); on top, capped so
 *  the match keeps an exact maximum: a ring-out round is worth more than a K.O. or the bell, and each guard impact you
 *  land is the mode's skill, paid. */
export const DUEL_SCORE = { winPts: 100, lossPts: 40, ringOutPts: 25, impactPts: 5, impactCap: 6 } as const;

export interface DuelTally { myWins: number; foeWins: number; ringOutWins: number; guardImpacts: number }

const count = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

export function duelScoreParts(t: DuelTally): { rounds: number; ringOuts: number; impacts: number } {
  const S = DUEL_SCORE, wins = count(t.myWins);
  return {
    rounds: wins * S.winPts - count(t.foeWins) * S.lossPts,
    ringOuts: Math.min(wins, count(t.ringOutWins)) * S.ringOutPts,   // only rounds you WON can pay a ring-out
    impacts: Math.min(S.impactCap, count(t.guardImpacts)) * S.impactPts,
  };
}

export function duelScore(t: DuelTally): number {
  const p = duelScoreParts(t);
  return p.rounds + p.ringOuts + p.impacts;
}

/** The most a match can award: a sweep, every round a ring-out, the guard-impact cap reached. */
export function duelScoreMax(roundsToWin: number = DUEL.roundsToWin): number {
  const S = DUEL_SCORE;
  return roundsToWin * (S.winPts + S.ringOutPts) + S.impactCap * S.impactPts;
}
