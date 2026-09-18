// A MISS SHOULD TELL YOU HOW CLOSE YOU WERE, WITHOUT A NUMBER (2026-09-14).
//
// From the dunk review: "a miss has no spectacle. The rim rattles, and that is it." It did not even do
// that — `missClank` played one impact sound and nothing touched the iron. Every miss looked identical
// whether the player was 40 ms out or half a second out, which throws away the most useful feedback a
// basketball game has: the ball itself.
//
// THE FLAVOUR IS DETERMINISTIC ON YOUR TIMING, NOT ROLLED. A random rattle would be prettier and would be
// a lie — the player would learn nothing from it, and "so close!" that is decided by a dice roll is an
// insult the second time you notice. Here, how far the ball gets IS how close the press was. A player who
// sees an in-and-out knows, without being told a millisecond figure, that they were nearly there.
//
// The ladder, cruellest last:
//   air         — never got there. The press was far out, or there was no press at all.
//   iron        — hit the rim and came straight back out. You were close.
//   in_and_out  — went in, rattled round and came back out. You were almost perfect, and it still did not
//                 count. This is the one that makes people press the button again.
//
// Pure: no Babylon, no randomness, no clock.

export type MissFlavour = 'air' | 'iron' | 'in_and_out';

/** Inside this, the ball went in and spun out. Tight: it has to stay rare or it stops meaning anything. */
export const IN_AND_OUT_MS = 90;
/** Inside this, the ball hit the iron. Beyond it, nothing was ever going to touch. */
export const IRON_MS = 260;

/**
 * How this miss should look.
 *
 * `offsetMs` is the signed timing error from the perfect beat, or null when no slam press registered at
 * all — and null must read as `air`, because a player who never pressed did not nearly make anything.
 */
export function missFlavour(offsetMs: number | null): MissFlavour {
  if (offsetMs === null || !Number.isFinite(offsetMs)) return 'air';
  const d = Math.abs(offsetMs);
  if (d <= IN_AND_OUT_MS) return 'in_and_out';
  if (d <= IRON_MS) return 'iron';
  return 'air';
}

export interface MissBeat {
  flavour: MissFlavour;
  /** Should the rim spring? Only when the ball actually touched it. */
  ringIt: boolean;
  /** 0..1 for feel.impact — an in-and-out is the loudest miss in basketball. */
  punch: number;
  /** Crowd reaction volume: the closer it was, the louder the groan. */
  groan: number;
  /** The one line the bezel prints, so no surface invents its own wording for a near miss. */
  label: string;
}

export function missBeat(offsetMs: number | null): MissBeat {
  const flavour = missFlavour(offsetMs);
  if (flavour === 'in_and_out') return { flavour, ringIt: true, punch: 0.55, groan: 0.75, label: 'IN AND OUT!' };
  if (flavour === 'iron') return { flavour, ringIt: true, punch: 0.4, groan: 0.5, label: 'OFF THE IRON' };
  return { flavour, ringIt: false, punch: 0.25, groan: 0.3, label: 'MISSED' };
}
