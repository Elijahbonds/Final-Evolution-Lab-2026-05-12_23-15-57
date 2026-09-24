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
import { DUNK_TRICKS, SIGNATURE_DUNKS, SLAM_EDGE_EXEC, type DunkTrick } from './DunkSystem';

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
