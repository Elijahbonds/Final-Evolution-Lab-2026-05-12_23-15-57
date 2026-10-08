// RivalPlay — what the rival goes for, and where his SLAM lands (DUNK MOTION phase 11, 2026-09-24).
//
// Owner: "fix the rivals dunk, it needs to look like one of the users attempts or like another person was playing". The rival's
// turn now runs the player's own attempt pipeline on an AI pad (DunkMode.rivalRound). These are the two decisions that pad makes,
// pure so they can be held to what they mean:
//   · THE DUNK: his nerve's reach (RivalNerve: the judges' 0–10 difficulty he is going for, times his temperament) picks it — a plain
//     one low, HIS signature dunk (DunkRivals) in the middle, a harder one above it, a named chain that opens with it at the top.
//   · THE SLAM: his nerve's execution band places the press against the beat. A clean one can land either side; one that leaks lands
//     LATE — the side the execution curve (DunkSystem.slamExecution) reads linearly — so the card reads the execution he rolled,
//     whatever tax his tricks put on the window.
import { DUNK_TRICKS, SIGNATURE_DUNKS, SLAM_EDGE_EXEC, CUE_BEAT_T, type DunkTrick } from './DunkSystem';
import { trickBeats } from './DunkBeats';

/** Reach bands (the nerve's difficulty × temperament): under PLAIN a straight dunk, under SIGNATURE his own, under HARDER one a
 *  notch harder half the time, above it a named chain that opens with his dunk. */
export const RIVAL_REACH = { plain: 3.4, signature: 5.6, harder: 7 } as const;

/** The dunk a rival goes for at this reach. `signature` is his dunk's LABEL (DunkRivals). */
export function rivalTricksFor(reach: number, signature: string, rand: () => number = Math.random): DunkTrick[] {
  const sig = DUNK_TRICKS.find((t) => t.label === signature) ?? DUNK_TRICKS.find((t) => t.id === 'windmill')!;
  if (reach < RIVAL_REACH.plain) return [];
  if (reach < RIVAL_REACH.signature) return [sig];
  if (reach < RIVAL_REACH.harder) {
    const harder = DUNK_TRICKS.filter((t) => t.difficulty > sig.difficulty && t.difficulty <= sig.difficulty + 1.2);
    return [rand() < 0.5 || !harder.length ? sig : harder[Math.floor(rand() * harder.length)]];
  }
  const pairs = SIGNATURE_DUNKS.filter((d) => !d.runway && d.air.length === 2);
  const his = pairs.filter((d) => d.air[0] === sig.id);
  const pick = his.length ? his[Math.floor(rand() * his.length)] : pairs[Math.floor(rand() * pairs.length)];
  const chain = pick ? pick.air.map((id) => DUNK_TRICKS.find((t) => t.id === id)).filter((t): t is DunkTrick => !!t) : [];
  return chain.length ? chain : [sig];
}

/** Where his SLAM lands against the beat (clip seconds, + = late) for the execution `acc` he rolled, in a window `half` wide either
 *  side. `early` only when the execution is clean enough to be early (≥ the window edge's own execution). */
export function rivalSlamOffset(acc: number, early: boolean, half: number): number {
  const a = Math.max(0, Math.min(1, acc));
  if (early && a >= SLAM_EDGE_EXEC) return -(1 - a) / (1 - SLAM_EDGE_EXEC) * half;
  return (1 - a) * half * 0.98;
}

// ── dunk-next phase 1: THE RIVAL HITS HIS BEATS TOO (core/DunkBeats) ─────────────────────────────────────────────────────
// The flight is a four-beat bar now, and a trick thrown ON a beat pays execution. A rival who could never hit one would be a
// rival the beats quietly beat for you, so his pad decides like a player's: on a clean attempt (his nerve's execution at the
// window's edge or better — the same line that lets his slam land early) he throws each trick on its next beat; otherwise he
// presses the moment he can, which arms it early or fires it off the beat, exactly as every rival did before.

/** How far in front of the beat his press lands (clip seconds): inside the tolerance, so it arms and fires ON the beat. */
export const RIVAL_BEAT_LEAD = 0.02;

/** Is this attempt clean enough to hit the beats? (The line `rivalSlamOffset` already uses for an early slam.) */
export function rivalHitsBeats(acc: number, blew: boolean): boolean {
  return !blew && Number.isFinite(acc) && acc >= SLAM_EDGE_EXEC;
}

/** The clip second his pad throws `trick`, no earlier than `after`: its next beat at or after `after` when he hits beats, else `after`. */
export function rivalPressAt(trick: DunkTrick, after: number, onBeat: boolean, lead: number = RIVAL_BEAT_LEAD): number {
  if (!onBeat) return after;
  for (const b of trickBeats(trick)) { const at = CUE_BEAT_T[b] - lead; if (at >= after) return at; }
  return after;
}
