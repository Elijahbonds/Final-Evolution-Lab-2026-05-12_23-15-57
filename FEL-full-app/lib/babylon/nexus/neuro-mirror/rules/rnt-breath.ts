// BAND DRILLS + BREATH — personalised correctives from what the Mirror actually measured (2026-09-12).
//
// The drill works by FEEDING the drift rather than cueing against it: a light band pulls the athlete a little further
// the way they are already drifting, and the balance reflex answers by squaring up — nobody has to think about which
// body part to move. Pairing it with a long exhale keeps the drill slow and calm.
//
// SCOPE AND HONESTY. This reads the same ESTIMATED movement signals the rest of neuro-mirror produces — never measured
// muscle activity, never a diagnosis. It prescribes general movement drills from an observed drift, the way a coach
// would from watching a set. It is not medical advice, it names no condition, and every prescription carries the
// caution with it rather than in a footer someone can strip.
//
// MIRROR-COACH P9 (2026-09-30) — REWRITTEN IN FEL'S WORDS, AND TO WHAT THE CAMERA READ, before it is mounted (PLAN item
// 9, rules (c) and (e)). What was wrong with the copy as written on 2026-09-12, measured against the engine that feeds
// it (rules/kinematic-engine.ts:106-178):
//   · It described reads the camera never takes. The press/row engine reads THREE signals from 2-D landmarks: the
//     shoulders' midpoint drifting sideways off the hips' midpoint (:106-116 — ONE number that it writes to BOTH
//     rib_thoracic and lumbo_pelvic), the working elbow's bend and its height against the shoulder line (:141-157 — ONE
//     report written to BOTH posterior_chain and lat_rhomboid), and the working shoulder riding up during the pull
//     (:162-175, upper_traps). The old copy told the athlete the camera saw a "rib flare", an "anterior tilt" of the
//     pelvis, a scapula "sliding into protraction" and hips drifting "away from the hinge". None of those is read — a rib
//     or abdomen read is below what 33 landmarks can see (the phase's HONESTY RULE), and a tilt is invisible from the
//     front. Each drill now names the signal it answers (MIRROR_SIGNAL_READ) and feeds THAT drift.
//   · It double-counted. Two zones share each of the first two signals, so the same drift earned two correctives ("feed
//     the rib flare" AND "feed the pelvic drift" for one sideways number). prescribeCorrectives now prescribes once per
//     signal, under the zone that ranked highest.
//   · It cued body parts ("own the ribs-over-pelvis position", "exhale-driven posterior tilt", "relax the traps") — the
//     phase's external-focus policy (lib/coach/cueLint.ts) wants the floor, the wall, the handle. Every `cue` below is
//     an attention cue about the world or the effect; lib/mirror/correctives.test.ts lints every line with that
//     policy's lintCue.
//   · The method's trade name is gone from the athlete's side: these are FEL's band drills (the owner's Playbook
//     vocabulary — "air out longer than it came in" is its own breath line), not a named system.
//   · Its `avgTempo` is a number of ms per rep; the live SessionSummary's is { pullSec, pressSec } (overlay-compositor.ts
//     :39). lib/mirror/correctives.ts sessionLikeFromSummary is the one adapter; a non-number is read as "no tempo".

import type { ZoneId } from '../patterns/split-stance-press-row';

export interface MirrorSessionLike {
  durationMs: number;
  reps: number;
  /** ms each zone spent estimated-stable. */
  timeInStableMs: Partial<Record<ZoneId, number>>;
  /** transitions INTO an estimated-fault state. */
  faultCounts: Partial<Record<ZoneId, number>>;
  /** average ms per completed rep, if any completed. */
  avgTempo?: number | null;
}

/** The three things the press/row camera actually reads (kinematic-engine.ts). Each zone is read from one of them. */
export type MirrorSignal = 'trunkShift' | 'elbowPath' | 'shoulderRise';

/** Which signal each zone is read from. Two zones share each of the first two — the engine writes one report to both. */
export const ZONE_SIGNAL: Record<ZoneId, MirrorSignal> = {
  rib_thoracic: 'trunkShift',
  lumbo_pelvic: 'trunkShift',
  posterior_chain: 'elbowPath',
  lat_rhomboid: 'elbowPath',
  upper_traps: 'shoulderRise',
};

/** What the camera read, in the athlete's words — the only claim a drill makes about the set. Always "estimated". */
export const MIRROR_SIGNAL_READ: Record<MirrorSignal, string> = {
  trunkShift: 'your shoulders drifting sideways off your hips, seen from the front (estimated)',
  elbowPath: 'the working elbow rising toward the shoulder line or leaving its bend range (estimated)',
  shoulderRise: 'the working shoulder riding up during the pull (estimated)',
};

export interface BreathCue {
  /** What the athlete does with the breath. */
  pattern: string;
  /** When, relative to the movement. */
  timing: string;
  /** Seconds per phase, matched to their own measured tempo where possible. */
  inhaleSec: number;
  exhaleSec: number;
}

/** The band drill itself: what pulls, which way, how hard, and why it works. */
export interface BandFeed {
  feed: string;
  direction: string;
  load: string;
  why: string;
}

export interface Corrective {
  /** The highest-ranked zone of the signal this answers. */
  zone: ZoneId;
  /** The camera signal this answers (a signal is prescribed once, however many zones read it). */
  signal: MirrorSignal;
  /** What the camera read — MIRROR_SIGNAL_READ, said with the drill so the "why" is never a guess. */
  read: string;
  /** Higher = more of this session was spent drifting here. */
  priority: number;
  /** Faults per minute observed — the number the priority came from. */
  faultsPerMin: number;
  /** Share of the session this zone held stable, 0..1. */
  stableShare: number;
  title: string;
  /** Where to stand and what to hold. An instruction, so it names the body where it has to. */
  setup: string;
  /** The one thing to think about during the drill — about the world or the effect, never a body part to squeeze. */
  cue: string;
  /** The band drill: what to feed, and which way. (The field keeps its 2026-09-12 name; nothing shows it.) */
  rnt: BandFeed;
  breath: BreathCue;
  dosage: { sets: number; reps: number; holdSec: number };
  caution: string;
}

/** Below this, a zone is behaving and prescribing for it is noise. */
export const FAULTS_PER_MIN_FLOOR = 1.5;
/** A zone stable this much of the session is not the one to work on today. */
export const STABLE_SHARE_CEILING = 0.9;
/** More than this and it stops being a corrective and becomes a workout nobody will do. */
export const MAX_CORRECTIVES = 3;

export const CORRECTIVE_CAUTION =
  'Estimated from movement observation, not a diagnosis. Stop if anything is painful, and see a clinician for pain, numbness or a known injury.';

export interface BandDrill { title: string; setup: string; cue: string; rnt: BandFeed }

/** One band drill per signal the Mirror reads (FEL's words; MIRROR-COACH P9). */
export const BAND_DRILLS: Record<MirrorSignal, BandDrill> = {
  trunkShift: {
    title: 'Side-pull split stance',
    // the engine reads how FAR the shoulders drift off the hips (Math.abs, kinematic-engine.ts:109), not which way — so
    // the set-up says to find the side, rather than pretending the camera named it
    setup: 'Split stance facing the camera, a light band looped around your hips and tied off to one side. The camera reads how far you drift, not which way, so try a few reps with the pull from each side and keep the side where staying square takes more work.',
    cue: 'Keep your belt buckle pointed at the camera while the band pulls.',
    rnt: {
      feed: 'A light band around the hips, pulling you sideways toward the side you drift to',
      direction: 'Toward the drift — the same direction you are already moving, never against it',
      load: 'Light: enough to notice, never enough to move you. If the set changes shape, the band is too strong.',
      why: 'A pull you can feel gives your balance reflex something to answer, and it squares you up without a word from the coach.',
    },
  },
  elbowPath: {
    title: 'Band-up row',
    setup: 'Split stance, rowing handle in the working hand, a second light band tied high (a door anchor or a tall post) and looped over the same wrist.',
    cue: 'Pull the handle to your back pocket while the band tugs toward the ceiling.',
    rnt: {
      feed: 'A light band from a high anchor, pulling the working wrist up toward the ceiling through the whole row',
      direction: 'Up — the same direction the elbow was drifting',
      load: 'Light to moderate, about what the working set uses.',
      why: 'The upward tug makes the drift easy to notice, and your reflex answers by drawing the handle down and back on its own.',
    },
  },
  shoulderRise: {
    title: 'Band-up shoulder hold',
    setup: 'Split stance, the rowing handle in the working hand, a light band tied high and held in the same hand with it.',
    cue: 'Let the band pull toward the ceiling while you slide the handle down toward the floor.',
    rnt: {
      feed: 'A light band from a high anchor, pulling the working side up the way it rode up in the pull',
      direction: 'Up — with the rise, never against it',
      load: 'Light, and constant through every rep.',
      why: 'Told to stay down, a shoulder usually creeps up anyway. Given a pull to answer, it settles by itself — the reflex does the work.',
    },
  },
};

/** Breath pairing per signal. Phase seconds are derived from their own tempo where one exists. */
export function breathFor(signal: MirrorSignal, tempoSec: number): BreathCue {
  const exhale = clamp(tempoSec * 0.6, 2, 6);
  const inhale = clamp(tempoSec * 0.4, 2, 5);
  switch (signal) {
    case 'trunkShift':
      return { pattern: 'Air out longer than it came in — a slow breath out through pursed lips, as if fogging a mirror', timing: 'Breathe out while the band pulls; breathe in only once you are square to the camera again', inhaleSec: inhale, exhaleSec: Math.max(exhale, 4) };
    case 'shoulderRise':
      return { pattern: 'A quiet breath in through the nose, a long breath out', timing: 'Breathe out as the handle slides toward the floor', inhaleSec: inhale, exhaleSec: exhale };
    case 'elbowPath':
    default:
      return { pattern: 'Breathe out on the pull, in on the return', timing: 'Out as the handle comes home to your pocket; in as it travels away', inhaleSec: inhale, exhaleSec: exhale };
  }
}

/**
 * The correctives this session earns — ranked, capped, ONE PER SIGNAL, and empty when the movement was clean.
 *
 * Prescribing for a zone that behaved is how a coaching tool loses trust: an athlete who did well and is handed three
 * "fixes" learns the tool is not reading them. Prescribing twice for one camera number is the same mistake.
 */
export function prescribeCorrectives(s: MirrorSessionLike): Corrective[] {
  const minutes = Math.max(s.durationMs, 1) / 60_000;
  const tempoSec = clamp((typeof s.avgTempo === 'number' && s.avgTempo > 0 ? s.avgTempo : 4000) / 1000, 2, 8);

  const zones = Object.keys(ZONE_SIGNAL) as ZoneId[];
  const scored = zones.map((zone) => {
    const faults = Math.max(0, finite(s.faultCounts[zone]));
    const faultsPerMin = faults / minutes;
    const stableShare = clamp(finite(s.timeInStableMs[zone]) / Math.max(s.durationMs, 1), 0, 1);
    // drifting often AND not holding it is what earns a corrective
    const priority = faultsPerMin * (1 - stableShare);
    return { zone, signal: ZONE_SIGNAL[zone], faultsPerMin, stableShare, priority };
  });

  const seen = new Set<MirrorSignal>();
  return scored
    .filter((z) => z.faultsPerMin >= FAULTS_PER_MIN_FLOOR && z.stableShare < STABLE_SHARE_CEILING)
    .sort((a, b) => b.priority - a.priority)
    // one per signal: the first (highest-ranked) zone of each carries it
    .filter((z) => {
      if (seen.has(z.signal)) return false;
      seen.add(z.signal);
      return true;
    })
    .slice(0, MAX_CORRECTIVES)
    .map(({ zone, signal, faultsPerMin, stableShare, priority }) => ({
      zone,
      signal,
      read: MIRROR_SIGNAL_READ[signal],
      priority: round2(priority),
      faultsPerMin: round2(faultsPerMin),
      stableShare: round2(stableShare),
      ...BAND_DRILLS[signal],
      breath: breathFor(signal, tempoSec),
      dosage: dosageFor(faultsPerMin),
      caution: CORRECTIVE_CAUTION,
    }));
}

/** More drift earns more exposure, within reason — a corrective is a primer, not the session. */
export function dosageFor(faultsPerMin: number): { sets: number; reps: number; holdSec: number } {
  if (faultsPerMin >= 6) return { sets: 3, reps: 6, holdSec: 5 };
  if (faultsPerMin >= 3) return { sets: 2, reps: 6, holdSec: 4 };
  return { sets: 2, reps: 5, holdSec: 3 };
}

/** Said to an athlete whose session was clean. Praise that is specific, and no invented work. */
export function cleanSessionNote(s: MirrorSessionLike): string {
  const reps = s.reps > 0 ? `${s.reps} rep${s.reps === 1 ? '' : 's'}` : 'that set';
  return `Nothing to correct from ${reps} — every zone held. Add load or tempo before adding correctives.`;
}

const finite = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round2 = (v: number) => Math.round(v * 100) / 100;
