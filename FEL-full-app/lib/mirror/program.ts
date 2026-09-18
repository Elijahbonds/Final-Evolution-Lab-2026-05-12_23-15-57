// THE PROGRAM — what the Mirror prescribes ACROSS sessions, not just at the end of one (2026-09-13).
//
// Owner: "Have the mirror prescribe the workout programs, stretches."
//
// WHAT ALREADY EXISTED, because this builds on it rather than beside it. neuro-mirror already prescribes:
// `prescribeCorrectives` gives RNT work off the drift signals and `prescribePinAndStretch` gives the release
// order from the same signals, both ranked, both capped, both refusing to prescribe for a zone that behaved.
// That layer is good and none of it is duplicated here.
//
// WHAT DID NOT EXIST is anything that spans sessions. Every scan started from nothing, so the tool could say
// "your left hip drifted today" and never "your left hip has drifted in four of your last five, here is the
// week". A single-session corrective is a note. A PROGRAM is the thing an athlete actually follows.
//
// THE RULE THAT SHAPES EVERY LINE OF THIS FILE: this is not clinical. The Mirror's constraint is that all
// output is labelled ESTIMATED ENGAGEMENT and never presented as measurement, diagnosis or assessment. A
// program is where that is easiest to breach — "do these three things for two weeks" sounds like a
// prescription from someone qualified to give one. So: every block says what it is FOR in movement terms,
// never in anatomical-pathology terms; nothing here names a condition; nothing claims a cause; and the
// language tests below assert the absence of clinical vocabulary rather than trusting review.
//
// Pure: no DOM, no storage, no Babylon. The caller persists it to the Shared Profile.

import type { ZoneId } from '../babylon/nexus/neuro-mirror';

/** One session's findings, reduced to what a program needs. The Mirror produces far more; this is the slice. */
export interface SessionFinding {
  /** When it happened. Used only for recency ordering and streaks. */
  at: number;
  /** Zones that drifted this session, with how often. */
  faults: Partial<Record<ZoneId, number>>;
  /** Reps completed, so a session with two reps does not carry the weight of a session with thirty. */
  reps: number;
}

/** How many sessions a program looks back over. Beyond this, old movement is not this athlete any more. */
export const HISTORY_WINDOW = 8;
/** A zone has to show up this often in the window before it earns a place in the program. */
export const PERSISTENCE_THRESHOLD = 0.4;
/** Sessions with fewer reps than this are too thin to conclude anything from. */
export const MIN_REPS_FOR_SIGNAL = 4;
/** Nobody follows a program with nine things in it. */
export const MAX_BLOCKS = 3;

export type BlockKind = 'release' | 'activate' | 'pattern';

export interface ProgramBlock {
  zone: ZoneId;
  kind: BlockKind;
  title: string;
  /** What to do, in plain language. */
  movements: string[];
  /** Days per week. */
  frequency: number;
  /** Minutes per session. */
  minutes: number;
  /**
   * Why this block is in the program — stated as what was OBSERVED and how often, never as a cause.
   * "Showed in 5 of your last 7" is a count. "Your glute is inhibited" is a claim we are not making.
   */
  because: string;
}

export interface MirrorProgram {
  /** Sessions this was built from. Zero means there is no program yet, and the UI says so. */
  sessions: number;
  blocks: ProgramBlock[];
  /** The one line at the top. */
  headline: string;
  /** The label that must accompany every screen this appears on. */
  disclaimer: string;
  /** When to scan again to see whether it moved. */
  retestAfterSessions: number;
}

/**
 * The estimated-engagement label, verbatim.
 *
 * Exported so the UI cannot paraphrase it into something stronger, and asserted by the tests.
 */
export const PROGRAM_DISCLAIMER =
  'Estimated engagement from movement patterns — not a clinical measurement, diagnosis or assessment.';

/** Retest cadence. Long enough for something to change, short enough to stay interesting. */
export const RETEST_AFTER = 4;

// ── THE PLAYBOOK ─────────────────────────────────────────────────────────────────────────────────────────
//
// One entry per zone, per kind. Written in MOVEMENT language: what to do and what it is for. No zone names a
// muscle as "weak", "tight", "inhibited" or "dysfunctional" — those are claims about a body, and what we
// have is a count of how often a pattern drifted on camera.

const PLAYBOOK: Record<ZoneId, Record<BlockKind, { title: string; movements: string[]; minutes: number }>> = {
  rib_thoracic: {
    release: { title: 'Open the ribcage', minutes: 6, movements: ['Foam roller across the mid-back, 8 slow passes', 'Side-lying open book, 6 per side', '360° breathing, 10 breaths'] },
    activate: { title: 'Ask the mid-back to hold', minutes: 8, movements: ['Wall slides with an exhale, 3 x 8', 'Prone Y-raise, 3 x 10', 'Half-kneeling overhead reach, 3 x 6 per side'] },
    pattern: { title: 'Keep the ribs stacked under load', minutes: 10, movements: ['Split-stance press with a slow exhale, 4 x 6 per side', 'Tall-kneeling press, 3 x 8'] },
  },
  lumbo_pelvic: {
    release: { title: 'Settle the hips', minutes: 6, movements: ['Pin the hip flexor, 45s per side', 'Couch stretch with an exhale, 45s per side', '90/90 transitions, 8 per side'] },
    activate: { title: 'Ask the pelvis to stay level', minutes: 8, movements: ['Dead bug with a long exhale, 3 x 6 per side', 'Glute bridge with a 3s hold, 3 x 10', 'Side plank with a reach, 3 x 20s per side'] },
    pattern: { title: 'Hold the stack through a hinge', minutes: 10, movements: ['Hip hinge to a dowel, 4 x 8', 'Split-stance row, 3 x 8 per side'] },
  },
  upper_traps: {
    release: { title: 'Let the shoulders down', minutes: 5, movements: ['Pin the upper trap with a ball, 40s per side', 'Neck side-bend with a long exhale, 30s per side'] },
    activate: { title: 'Ask the lower shoulder to work', minutes: 8, movements: ['Prone T-raise, 3 x 10', 'Scapular pull-up, 3 x 6', 'Bottoms-up carry, 3 x 20s per side'] },
    pattern: { title: 'Press without the shrug', minutes: 9, movements: ['Half-kneeling press at a slow tempo, 4 x 6 per side', 'Landmine press, 3 x 8 per side'] },
  },
  lat_rhomboid: {
    release: { title: 'Free the lat', minutes: 5, movements: ['Pin the lat on a roller, 45s per side', 'Overhead hang with a full exhale, 3 x 20s'] },
    activate: { title: 'Ask the scapula to set and stay', minutes: 8, movements: ['Band pull-apart, 3 x 15', 'Prone W-raise, 3 x 10', 'Half-kneeling row with a 2s hold, 3 x 8 per side'] },
    pattern: { title: 'Row from a set shoulder', minutes: 9, movements: ['Split-stance row, 4 x 8 per side', 'Chest-supported row, 3 x 10'] },
  },
  posterior_chain: {
    release: { title: 'Free the back of the leg', minutes: 6, movements: ['Pin the hamstring, 45s per side', 'Calf and sole release, 40s per side', 'Slow leg lower, 8 per side'] },
    activate: { title: 'Ask the hips to lead the hinge', minutes: 8, movements: ['Hip hinge to a wall, 3 x 10', 'Single-leg bridge, 3 x 8 per side', 'Slow Romanian deadlift with a dowel, 3 x 8'] },
    pattern: { title: 'Hinge without folding forward', minutes: 10, movements: ['Hinge to a target with a band at the hips, 4 x 8', 'Split-stance press from a braced hinge, 3 x 6 per side'] },
  },
};

// ── BUILDING THE PROGRAM ─────────────────────────────────────────────────────────────────────────────────

/** How often each zone showed up, as a fraction of the sessions that were substantial enough to count. */
export function persistence(history: readonly SessionFinding[]): Partial<Record<ZoneId, number>> {
  const usable = history
    .slice()
    .sort((a, b) => b.at - a.at)
    .slice(0, HISTORY_WINDOW)
    .filter((s) => s.reps >= MIN_REPS_FOR_SIGNAL);
  if (!usable.length) return {};
  const out: Partial<Record<ZoneId, number>> = {};
  for (const s of usable) {
    for (const [zone, n] of Object.entries(s.faults) as [ZoneId, number][]) {
      if (n > 0) out[zone] = (out[zone] ?? 0) + 1;
    }
  }
  for (const k of Object.keys(out) as ZoneId[]) out[k] = (out[k] ?? 0) / usable.length;
  return out;
}

/**
 * Which block a zone earns, from how persistent it is.
 *
 * The progression is the point and it runs the way a coach would: something that shows up nearly every
 * session gets RELEASE first, because asking a pattern to change before the tissue will let it is how people
 * end up repeating a corrective for months. As it appears less often the work moves to ACTIVATE and finally
 * to PATTERN, which is loading the thing that was drifting. A program that never graduates is a program
 * nobody finishes.
 */
export function blockFor(rate: number): BlockKind {
  if (rate >= 0.75) return 'release';
  if (rate >= 0.55) return 'activate';
  return 'pattern';
}

/** How many days a week, from how persistent it is. Frequent problems get frequent, SHORT work. */
export function frequencyFor(rate: number): number {
  return rate >= 0.75 ? 5 : rate >= 0.55 ? 3 : 2;
}

/**
 * Build the program.
 *
 * Empty when there is not enough history, and it SAYS so rather than inventing a plan from one scan. The
 * quickest way to lose an athlete is to hand them a fortnight of work on the strength of thirty seconds.
 */
export function buildProgram(history: readonly SessionFinding[]): MirrorProgram {
  const usableCount = history.filter((s) => s.reps >= MIN_REPS_FOR_SIGNAL).length;
  const rates = persistence(history);
  const ranked = (Object.entries(rates) as [ZoneId, number][])
    .filter(([, r]) => r >= PERSISTENCE_THRESHOLD)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_BLOCKS);

  if (usableCount < 2 || !ranked.length) {
    return {
      sessions: usableCount,
      blocks: [],
      headline: usableCount < 2
        ? 'Scan a couple more times and a program will build itself from what shows up.'
        : 'Nothing showed up often enough to program for — keep moving the way you are.',
      disclaimer: PROGRAM_DISCLAIMER,
      retestAfterSessions: RETEST_AFTER,
    };
  }

  const blocks: ProgramBlock[] = ranked.map(([zone, rate]) => {
    const kind = blockFor(rate);
    const entry = PLAYBOOK[zone][kind];
    const seen = Math.round(rate * Math.min(usableCount, HISTORY_WINDOW));
    const outOf = Math.min(usableCount, HISTORY_WINDOW);
    return {
      zone,
      kind,
      title: entry.title,
      movements: entry.movements,
      frequency: frequencyFor(rate),
      minutes: entry.minutes,
      // a COUNT of what was observed. Never a cause, never a condition.
      because: `Showed in ${seen} of your last ${outOf} sessions.`,
    };
  });

  return {
    sessions: usableCount,
    blocks,
    headline: `${blocks.length} thing${blocks.length === 1 ? '' : 's'} to work on, ${totalMinutes(blocks)} minutes a session.`,
    disclaimer: PROGRAM_DISCLAIMER,
    retestAfterSessions: RETEST_AFTER,
  };
}

export function totalMinutes(blocks: readonly ProgramBlock[]): number {
  return blocks.reduce((n, b) => n + b.minutes, 0);
}

/**
 * Did the program move?
 *
 * Compared as persistence BEFORE versus AFTER, so an athlete is told whether the thing they worked on turned
 * up less often — which is the only claim this tool is entitled to make about whether something helped.
 */
export function progressReport(
  before: readonly SessionFinding[], after: readonly SessionFinding[],
): { zone: ZoneId; delta: number; line: string }[] {
  const b = persistence(before);
  const a = persistence(after);
  const zones = new Set<ZoneId>([...Object.keys(b), ...Object.keys(a)] as ZoneId[]);
  return [...zones].map((zone) => {
    const was = b[zone] ?? 0;
    const now = a[zone] ?? 0;
    const delta = now - was;
    const line = delta <= -0.15
      ? 'Showing up less often than it was.'
      : delta >= 0.15
        ? 'Showing up more often than it was.'
        : 'About the same as it was.';
    return { zone, delta, line };
  }).sort((x, y) => x.delta - y.delta);
}
