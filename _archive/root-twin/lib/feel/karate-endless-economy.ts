/**
 * Karate Endless — economy & roguelike-round core (handoff Part 4).
 *
 * PURE module: no React, no three, no DOM. Both the live component
 * (components/games/karate-3d.tsx) and the headless test
 * (scripts/karate-endless-economy-tests.ts) import THIS — never a fork.
 *
 * Handoff Part 4 is written for a 2-player co-op wave survival mode. This is a
 * single-player web build with no multiplayer transport, so the co-op-only
 * fixes are adapted to solo-meaningful equivalents and tagged // SOLO-ADAPT:
 *   - "REVIVE PARTNER" buy item  -> "SECOND WIND" one-time self-revive.
 *   - "Co-op revive" (Fix 5)     -> solo downed state consumes a banked
 *                                   SECOND WIND if owned, else the run ends.
 *   - "both players reach extract" -> solo player holds the zone alone.
 * Every feel/economy number is // TUNE(elijah).
 */

// ------------------------------------------------------------------ currency
export const ECON = {
  BASE_CREDITS: 10,            // TUNE(elijah) — credits for a plain kill on wave 1
  WAVE_CREDIT_GROWTH: 0.15,    // TUNE(elijah) — +15% per wave
  ELITE_CREDIT_MULT: 2,        // TUNE(elijah) — elite (every 5th) kills pay double
  ELITE_KILL_INTERVAL: 5,      // TUNE(elijah) — every 5th kill is an elite / drops a power-up
  DOUBLE_POINTS_MULT: 2,       // TUNE(elijah)
  // Round-10 critical-point spike (Fix 2)
  SPIKE_ROUND: 10,             // TUNE(elijah)
  SPIKE_HP_MULT: 1.4,          // TUNE(elijah) — +40% enemy HP from round 10
  SPIKE_SPEED_MULT: 1.2,       // TUNE(elijah) — +20% enemy speed from round 10
  MYSTERY_BOX_COST: 300,       // TUNE(elijah)
  // Extract (Fix 3)
  EXTRACT_MIN_LC: 50,          // TUNE(elijah)
  EXTRACT_SCORE_DIV: 100,      // TUNE(elijah) — score ÷ 100 = LC
  EXTRACT_HOLD_S: 3,           // TUNE(elijah)
  DOWNED_EXTRACT_RATE: 0.25,   // SOLO-ADAPT — downed share if a run ends while downed
  // Buy menu (Fix 1)
  BUY_MENU_S: 15,              // TUNE(elijah) — between-wave shop window
  // Power-up durations (Fix 4)
  INSTA_KILL_S: 15,            // TUNE(elijah)
  DOUBLE_POINTS_S: 20,         // TUNE(elijah)
  // Co-op revive -> solo second-wind (Fix 5)
  REVIVE_HOLD_S: 3,            // TUNE(elijah)
  DOWNED_TIMEOUT_S: 30,        // TUNE(elijah)
  SECOND_WIND_HP: 50,          // SOLO-ADAPT — HP restored on self-revive
} as const;

/** Credit reward for a single kill. */
export function waveCreditMult(wave: number): number {
  return 1 + Math.max(0, wave - 1) * ECON.WAVE_CREDIT_GROWTH;
}

export function killReward(
  wave: number,
  opts: { elite?: boolean; doublePoints?: boolean } = {},
): number {
  let n = ECON.BASE_CREDITS * waveCreditMult(wave);
  if (opts.elite) n *= ECON.ELITE_CREDIT_MULT;
  if (opts.doublePoints) n *= ECON.DOUBLE_POINTS_MULT;
  return Math.round(n);
}

/** Every Nth kill is an elite kill (drops a power-up, pays the elite bonus). */
export function isEliteKill(totalKills: number): boolean {
  return totalKills > 0 && totalKills % ECON.ELITE_KILL_INTERVAL === 0;
}

// ------------------------------------------------------------ round-10 spike
export function enemyHpMult(wave: number): number {
  return wave >= ECON.SPIKE_ROUND ? ECON.SPIKE_HP_MULT : 1;
}
export function enemySpeedMult(wave: number): number {
  return wave >= ECON.SPIKE_ROUND ? ECON.SPIKE_SPEED_MULT : 1;
}
export function isSpikeRound(wave: number): boolean {
  return wave === ECON.SPIKE_ROUND;
}
/** Extract is unlocked from the critical-point round onward. */
export function extractUnlocked(wave: number): boolean {
  return wave >= ECON.SPIKE_ROUND;
}

// -------------------------------------------------------------------- extract
/** Final banked Lab Credits for a full (standing) extract. */
export function extractLc(score: number): number {
  return Math.max(ECON.EXTRACT_MIN_LC, Math.floor(Math.max(0, score) / ECON.EXTRACT_SCORE_DIV));
}
/** SOLO-ADAPT — reduced payout if the run ends while the player is downed. */
export function downedExtractLc(score: number): number {
  return Math.max(
    Math.round(ECON.EXTRACT_MIN_LC * ECON.DOWNED_EXTRACT_RATE),
    Math.floor((extractLc(score) * ECON.DOWNED_EXTRACT_RATE)),
  );
}

// ------------------------------------------------------------------ buy menu
export type BuyEffect = 'secondWind' | 'upgradeStrike' | 'speedBoost' | 'healthRestore';
export interface BuyItem {
  id: BuyEffect;
  label: string;
  cost: number;
  desc: string;
}
// Fix 1 shop table (REVIVE PARTNER -> SECOND WIND per SOLO-ADAPT).
export const BUY_ITEMS: readonly BuyItem[] = [
  { id: 'secondWind',    label: 'SECOND WIND',    cost: 200, desc: 'Bank a one-time self-revive' }, // TUNE(elijah)
  { id: 'upgradeStrike', label: 'UPGRADE STRIKE', cost: 350, desc: '+15 strike damage (run)' },       // TUNE(elijah)
  { id: 'speedBoost',    label: 'SPEED BOOST',    cost: 150, desc: '30s movement boost' },             // TUNE(elijah)
  { id: 'healthRestore', label: 'HEALTH RESTORE', cost: 100, desc: 'Restore HP to full' },             // TUNE(elijah)
] as const;

export function buyItem(id: BuyEffect): BuyItem | undefined {
  return BUY_ITEMS.find((b) => b.id === id);
}
export function canAfford(credits: number, id: BuyEffect): boolean {
  const it = buyItem(id);
  return !!it && credits >= it.cost;
}

// ---------------------------------------------------------------- power-ups
export type PowerUpKind = 'maxAmmo' | 'instaKill' | 'doublePoints';
export const POWERUP_KINDS: readonly PowerUpKind[] = ['maxAmmo', 'instaKill', 'doublePoints'];

/** Deterministic power-up roll (roll in [0,1) supplied by caller for tests). */
export function rollPowerUp(roll: number): PowerUpKind {
  const i = Math.min(POWERUP_KINDS.length - 1, Math.floor(roll * POWERUP_KINDS.length));
  return POWERUP_KINDS[i];
}

export interface PowerUpTimers {
  instaKillT: number;    // seconds remaining
  doublePointsT: number; // seconds remaining
}
export function createPowerups(): PowerUpTimers {
  return { instaKillT: 0, doublePointsT: 0 };
}
/** Activate a power-up. maxAmmo is instant (returns true = refill special). */
export function activatePowerup(s: PowerUpTimers, kind: PowerUpKind): boolean {
  if (kind === 'instaKill') { s.instaKillT = ECON.INSTA_KILL_S; return false; }
  if (kind === 'doublePoints') { s.doublePointsT = ECON.DOUBLE_POINTS_S; return false; }
  return true; // maxAmmo -> caller refills special meter
}
export function updatePowerups(s: PowerUpTimers, dt: number): void {
  if (s.instaKillT > 0) s.instaKillT = Math.max(0, s.instaKillT - dt);
  if (s.doublePointsT > 0) s.doublePointsT = Math.max(0, s.doublePointsT - dt);
}
export function instaKillActive(s: PowerUpTimers): boolean { return s.instaKillT > 0; }
export function doublePointsActive(s: PowerUpTimers): boolean { return s.doublePointsT > 0; }

// ------------------------------------------------- downed / self-revive (solo)
export interface DownedState {
  downed: boolean;
  timeoutT: number;   // counts DOWN from DOWNED_TIMEOUT_S while downed
  reviveT: number;    // counts UP while REVIVE held; revives at REVIVE_HOLD_S
  secondWinds: number; // banked self-revives bought in the shop
}
export function createDowned(): DownedState {
  return { downed: false, timeoutT: 0, reviveT: 0, secondWinds: 0 };
}
/** Enter downed state (0 HP). */
export function goDown(s: DownedState): void {
  s.downed = true; s.timeoutT = ECON.DOWNED_TIMEOUT_S; s.reviveT = 0;
}
/**
 * Advance a downed player. `holdingRevive` = a banked SECOND WIND is being spent
 * (progress ring). Returns 'revived' | 'expired' | 'downed'.
 */
export function updateDowned(s: DownedState, dt: number, holdingRevive: boolean): 'revived' | 'expired' | 'downed' {
  if (!s.downed) return 'downed';
  if (holdingRevive && s.secondWinds > 0) {
    s.reviveT += dt;
    if (s.reviveT >= ECON.REVIVE_HOLD_S) {
      s.downed = false; s.secondWinds -= 1; s.reviveT = 0; s.timeoutT = 0;
      return 'revived';
    }
  } else {
    s.reviveT = 0;
  }
  s.timeoutT -= dt;
  if (s.timeoutT <= 0) { s.timeoutT = 0; return 'expired'; }
  return 'downed';
}
export function reviveProgress01(s: DownedState): number {
  return Math.max(0, Math.min(1, s.reviveT / ECON.REVIVE_HOLD_S));
}
