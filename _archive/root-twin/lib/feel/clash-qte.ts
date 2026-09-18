// lib/feel/clash-qte.ts
// FEL Phase 5 — Shared CLASH QTE (fighting-game trade resolver).
//
// When a player strike lands in the SAME instant the AI is mid-attack, the old
// code auto-punished the player ("TRADED — TOO SLOW"). That is a silent, un-fun
// coin-flip. This module turns that moment into a short QUICK-TIME clash: both
// blades lock, a brief window opens, and the player mashes to overpower. Whoever
// wins the clash lands the blow; the loser is staggered.
//
// PURE + deterministic: no RNG inside (difficulty maps to the mash target), no
// side effects beyond mutating the passed state. Imported by BOTH the live
// component and the headless test so the mechanic can never silently fork.
//
// All feel magnitudes // TUNE(elijah).

export interface ClashQTE {
  active: boolean;
  t: number;              // elapsed real seconds inside the window
  window: number;         // total clash window (real seconds)
  mashes: number;         // player taps registered this clash
  need: number;           // taps required to win THIS clash
  resolved: boolean;      // has the outcome been decided?
  playerWon: boolean | null;
}

export const CLASH = {
  WINDOW: 0.70,           // TUNE(elijah) — how long the blades stay locked
  BASE_NEED: 4,          // TUNE(elijah) — taps to win vs a weak opponent
  NEED_PER_POWER: 5,     // TUNE(elijah) — extra taps per unit of AI power (0..1)
  MAX_NEED: 12,          // TUNE(elijah) — never demand an impossible mash
} as const;

export function createClashQTE(): ClashQTE {
  return { active: false, t: 0, window: 0, mashes: 0, need: 0, resolved: false, playerWon: null };
}

// Begin a clash. `aiPower` in 0..1 (higher = stronger opponent = more taps).
export function startClash(s: ClashQTE, aiPower: number): void {
  const p = Math.max(0, Math.min(1, aiPower));
  s.active = true;
  s.t = 0;
  s.window = CLASH.WINDOW;
  s.mashes = 0;
  s.need = Math.min(CLASH.MAX_NEED, Math.round(CLASH.BASE_NEED + CLASH.NEED_PER_POWER * p));
  s.resolved = false;
  s.playerWon = null;
}

// Player tapped the strike button during the clash. Returns true if it counted.
export function registerMash(s: ClashQTE): boolean {
  if (!s.active || s.resolved) return false;
  s.mashes += 1;
  // Early win: reaching the target ends the clash immediately (feels responsive).
  if (s.mashes >= s.need) {
    s.resolved = true;
    s.playerWon = true;
    s.active = false;
  }
  return true;
}

// Advance the clash by real dt. Returns the transition this frame:
//   'none' — still locked (or inactive)
//   'win'  — player overpowered the clash
//   'lose' — window expired without enough mashes
export function updateClashQTE(s: ClashQTE, dt: number): 'none' | 'win' | 'lose' {
  if (!s.active) return 'none';
  s.t += dt;
  if (s.t >= s.window) {
    // Window closed — resolve on mash count.
    s.active = false;
    s.resolved = true;
    s.playerWon = s.mashes >= s.need;
    return s.playerWon ? 'win' : 'lose';
  }
  return 'none';
}

export function clashActive(s: ClashQTE): boolean {
  return s.active;
}

// 0..1 progress of the player toward winning (drives a HUD meter).
export function clashProgress(s: ClashQTE): number {
  if (s.need <= 0) return 0;
  return Math.max(0, Math.min(1, s.mashes / s.need));
}

// 0..1 fraction of the window elapsed (drives a shrinking timer bar).
export function clashTimeLeft01(s: ClashQTE): number {
  if (!s.active || s.window <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - s.t / s.window));
}
