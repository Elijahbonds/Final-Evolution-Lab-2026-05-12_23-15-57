// COMBO BREAKER — the rival escapes a long mashed string (COMBAT DIFFICULTY, owner 2026-10-06: "Rival escapes long combos").
//
// Measured (scratchpad combat-difficulty harness): in Showdown and Duel a masher won as often as a decent player, because
// book links chain faster than the rival's hit-stun wears off — the rival under a mashed string never got to act. Naruto
// Storm's answer is the substitution out of a combo, so that is the answer here: when a blow lands on the rival from deep
// inside one UNBROKEN string — the attacker never idle IDLE_GAP_SEC between swings — past a book string's natural length,
// the rival may spend its meter to break out: the stun is gone, it reappears behind you, and your swing in flight finds
// nobody for the substitution's whiff beat.
//
// THE GATE IS THE STRING, NOT THE HITS. Counting hits did not tell the two players apart (a decent player's punish strings
// keep a rival down as long as a masher does); counting LINKS did: of the blows that landed, a decent player's came on
// link 5 or later 2–4 % of the time, a masher's 33–36 %. A book string is three presses (HordeDynamics STRING_MAX), so
// minLinks 5 leaves a link of grace. ROOKIE rarely breaks, ELITE reliably; a cooldown, and the substitution's cost.
// Karate VS and Mixed do not use it: their chains are 1–2 hits for every player measured.
//
// Pure: no scene, no clock of its own — the mode hands it the frame, the swing in flight, the time and the tier.

import type { Tier } from './Difficulty';

export const COMBO_BREAK = {
  /** The attacker's string is unbroken while it is never idle (no swing in flight) this long. */
  idleGapSec: 0.25,
  /** A blow landing on this link of the string, or later, may be broken out of (a book string is 3 presses). */
  minLinks: 5,
  /** No second break inside this. */
  cooldownSec: 5,
  /** After the break the rival's counter window is open this long (RivalFightBrain.openCounter): it escapes AND punishes. */
  counterSec: 0.6,
  /** The chance per qualifying blow, by the OPPONENT pick. */
  chance: { rookie: 0.15, pro: 0.6, elite: 0.95 } as Readonly<Record<Tier, number>>,
} as const;

export class ComboBreaker {
  private links = 0;
  private idleSec = Infinity;
  private last: object | null = null;
  private readySec = -Infinity;

  /** Every frame: the ATTACKER's swing in flight (StrikeController.current), or null. A new swing is a link; one that
   *  starts after the attacker was idle IDLE_GAP_SEC starts a new string. */
  track(dt: number, swing: object | null): void {
    if (swing && swing !== this.last) {
      if (this.idleSec >= COMBO_BREAK.idleGapSec) this.links = 0;
      this.links++;
    }
    this.last = swing;
    this.idleSec = swing ? 0 : this.idleSec + Math.max(0, dt);
  }

  /** A blow LANDED on the rival at `nowSec`. True = it breaks out now (the caller pays and plays it). `affordable` = it has
   *  the meter and somewhere to go. `rng` is the roll (Math.random in a mode). */
  hit(nowSec: number, tier: Tier | null | undefined, affordable: boolean, rng: () => number = Math.random): boolean {
    if (this.links < COMBO_BREAK.minLinks || nowSec < this.readySec || !affordable) return false;
    if (rng() >= COMBO_BREAK.chance[tier ?? 'pro']) return false;
    this.readySec = nowSec + COMBO_BREAK.cooldownSec;
    this.links = 0;
    return true;
  }

  /** Links in the attacker's current string (logs). */
  get string(): number { return this.links; }
  reset(): void { this.links = 0; this.idleSec = Infinity; this.last = null; this.readySec = -Infinity; }
}
