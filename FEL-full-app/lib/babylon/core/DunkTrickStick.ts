// DunkTrickStick — the trick you throw IN THE AIR, on the right stick, judged on when you threw it.
//
// Owner, 2026-09-16: "add trick dunks triggered by right stick, success upon timing" and "same for contact dunks".
//
// WHAT THIS ADDS THAT HoopsDunks DOES NOT. HoopsDunks picks a dunk from the DRIVE — how fast you got there, the
// angle, whether a body is in the way — and it picks it at the take-off, before you are in the air. That is the
// right model for what a drive earns you, and it is not a mechanic: nothing is asked of the player between the
// take-off and the flush. This is the part you play. Once the feet leave, the right stick stops being the camera
// and becomes the trick stick, and the flick has to land in a window that is short enough to be a real ask.
//
// THE WINDOW IS ON THE FLIGHT CLOCK, not on a wall clock, so it survives the hit-stop and the bump's slow motion —
// the two things that stretch a dunk's real duration by a third and would otherwise silently move the target.
//
// THE TWO WINDOWS, and why they are different:
//   · A CLEAN dunk's window sits after the rise and before the flush: you are up, you have a beat, use it.
//   · A CONTACT dunk's window is centred ON THE BUMP, because that is the whole read — the trick you are throwing
//     is through a body, and the moment to commit is the moment you feel him. It is tighter, and worth more.
//
// Pure: no Babylon, no scene, no clock, so the judging can be tested rather than eyeballed in a flight that lasts
// 550 ms.

/** The tricks the stick can ask for, by the direction you flick it. */
export type StickTrick = 'tomahawk' | 'windmill' | 'cradle' | 'betweenLegs';

export interface TrickSpec {
  /** The registered clip (ClipScope gives both hoops modes the 'dunk' suite — these are already on the rig). */
  clip: string;
  label: string;
  /** What a GREEN trick does to the make chance. A trick is harder than a plain dunk and worth more for it. */
  pctBonus: number;
  /** …and what a mistimed one costs. Throwing a trick you cannot land is a decision with a price. */
  pctPenalty: number;
}

/**
 * UP is the tomahawk, DOWN is between the legs, and LEFT/RIGHT are the two you swing across your body.
 *
 * Read as a direction rather than a gesture: a flick has one dominant axis and the player is doing it in 200 ms in
 * the air, so anything that needs a shape (a half-circle, a hold) is a worse input than a shove.
 */
export const STICK_TRICK: Readonly<Record<StickTrick, TrickSpec>> = {
  tomahawk:    { clip: 'dunk_finish_tomahawk', label: 'TOMAHAWK!',        pctBonus: 0.06, pctPenalty: 0.40 },
  windmill:    { clip: 'dunk_finish_windmill', label: 'WINDMILL!',        pctBonus: 0.08, pctPenalty: 0.46 },
  cradle:      { clip: 'dunk_cradle',          label: 'CRADLE!',          pctBonus: 0.08, pctPenalty: 0.46 },
  betweenLegs: { clip: 'dunk_between_legs',    label: 'BETWEEN THE LEGS!', pctBonus: 0.14, pctPenalty: 0.58 },
};

/**
 * THE PENALTIES WERE TOO SMALL TO MEAN ANYTHING, and the measurement said so rather than a feeling.
 *
 * A drive dunk's base is DUNK_PCT.dunk = 0.92. At the old −0.22 a MISTIMED tomahawk still made 0.70, and the first
 * live run bore that out: five late tricks, four of them went in. A mechanic whose failure state converts 70 % of
 * the time is not a risk, it is a formality — the player never learns the window because missing it barely costs.
 *
 * Priced against the alternative instead of against zero: not throwing a trick at all is 0.92, so a mistimed one
 * has to land clearly below "just dunk it" to be a decision. −0.40 puts a blown tomahawk at 0.52 — worse than a
 * coin flip, better than hopeless — and the hardest trick in the table at 0.34, which is what a between-the-legs
 * you could not land should look like.
 *
 * `MISTIME_MAX_PCT` is the invariant that keeps this honest if either number is ever retuned.
 */
export const MISTIME_MAX_PCT = 0.6;

/** Past this the stick has been pushed, not brushed. Below it nothing is being asked for. */
export const FLICK_MIN = 0.55;

/**
 * Which trick a flick is asking for, or null if the stick is not being pushed.
 *
 * `y` is the raw stick, where UP IS NEGATIVE — the convention the Gamepad API, InputBus and the touch stick all
 * agree on (see LocalInputSource's note). Getting that backwards would put the tomahawk on a down-flick, which is
 * the kind of thing that reads as "the controls are wrong" and is invisible in code review.
 */
export function trickFromFlick(x: number, y: number): StickTrick | null {
  const ax = Math.abs(x), ay = Math.abs(y);
  if (Math.max(ax, ay) < FLICK_MIN) return null;
  if (ay >= ax) return y < 0 ? 'tomahawk' : 'betweenLegs';
  return x > 0 ? 'windmill' : 'cradle';
}

/** The window on the flight clock (0..1) in which a flick lands. */
export interface TrickWindow { from: number; to: number }

/** A clean dunk: after the rise, before the flush. Roughly a fifth of the flight — about 110 ms of a 550 ms dunk. */
export const CLEAN_WINDOW: TrickWindow = { from: 0.30, to: 0.50 };
/** How far either side of the BUMP a contact trick counts. Tighter than the clean window: it is worth more. */
export const CONTACT_HALF_WIDTH = 0.07;

/**
 * The window for this flight. A contact dunk's window rides the bump, because the moment to commit to a trick
 * through a body is the moment you feel him — not some fixed point in a flight whose timing the contact changed.
 */
export function trickWindow(bumpK: number | null): TrickWindow {
  if (bumpK === null || !Number.isFinite(bumpK)) return CLEAN_WINDOW;
  // CLAMP THE CENTRE, NOT THE ENDS. Clamping each end on its own crosses them over when the bump sits near either
  // extreme — a bump at k 0 gave `from 0.12, to 0.07`, a window that no flick can ever be inside and that
  // `judgeFlick` would call 'late' at every k. The window keeps its width and slides into the flight instead.
  //
  // …and the ends are ROUNDED, because `0.92 - 0.07 + 0.07` is 0.9200000000000002 and a window that is two
  // quintillionths past the end of the flight is a bug report waiting to happen. This repo has a standing note
  // about never thresholding on a float sum; this is the same mistake wearing a different hat.
  const r = (v: number) => Math.round(v * 1e6) / 1e6;
  const c = Math.max(0.12 + CONTACT_HALF_WIDTH, Math.min(0.92 - CONTACT_HALF_WIDTH, bumpK));
  return { from: r(c - CONTACT_HALF_WIDTH), to: r(c + CONTACT_HALF_WIDTH) };
}

export type TrickJudge = 'early' | 'green' | 'late';

/** Was it thrown in time? */
export function judgeFlick(k: number, w: TrickWindow): TrickJudge {
  if (k < w.from) return 'early';
  if (k > w.to) return 'late';
  return 'green';
}

/**
 * What the attempt does to the make chance.
 *
 * A green trick is a bonus, a mistimed one is a real penalty, and the penalty is bigger than the bonus on every
 * trick in the table — otherwise the correct play is to mash the stick on every dunk and take the average, which
 * is not a mechanic, it is a tax on players who do not know about it.
 */
export function trickPct(base: number, trick: StickTrick, judge: TrickJudge): number {
  const spec = STICK_TRICK[trick];
  const out = judge === 'green' ? base + spec.pctBonus : base - spec.pctPenalty;
  return Math.max(0.05, Math.min(0.98, out));
}

/** A contact trick that lands is the biggest swing in the game — this is what it is worth on top of the green. */
export const CONTACT_TRICK_BONUS = 0.05;
