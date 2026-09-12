// RNT + BREATH — personalised correctives from what the Mirror actually measured (2026-09-12).
//
// Reactive Neuromuscular Training works by FEEDING the fault rather than cueing against it: load or
// pull in the direction the body is already drifting, and the athlete reflexively organises away
// from it. Verbal correction asks the brain to think; RNT lets the reflex do the work. Pairing it
// with breath matters because the diaphragm is a postural muscle — a rib that will not depress and
// a pelvis that will not posteriorly tilt are usually a breathing pattern before they are a
// strength problem.
//
// SCOPE AND HONESTY. This reads the same ESTIMATED / INFERRED movement-quality signals the rest of
// neuro-mirror produces — never measured muscle activation, never a diagnosis. It prescribes
// general movement correctives from an observed drift pattern, the way a coach would from watching
// a set. It is not medical advice, it does not name pathologies, and every prescription carries the
// caution with it rather than in a footer someone can strip.

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

export interface BreathCue {
  /** What the athlete does with the breath. */
  pattern: string;
  /** When, relative to the movement. */
  timing: string;
  /** Seconds per phase, matched to their own measured tempo where possible. */
  inhaleSec: number;
  exhaleSec: number;
}

export interface Corrective {
  zone: ZoneId;
  /** Higher = more of this session was spent drifting here. */
  priority: number;
  /** Faults per minute observed — the number the priority came from. */
  faultsPerMin: number;
  /** Share of the session this zone held stable, 0..1. */
  stableShare: number;
  title: string;
  /** The RNT itself: what to feed, and which way. */
  rnt: { feed: string; direction: string; load: string; why: string };
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

const CAUTION =
  'Estimated from movement observation, not a diagnosis. Stop if anything is painful, and see a clinician for pain, numbness or a known injury.';

/** One RNT + breath pairing per zone the Mirror can observe. */
const PLAYBOOK: Record<ZoneId, Omit<Corrective, 'zone' | 'priority' | 'faultsPerMin' | 'stableShare' | 'breath' | 'dosage' | 'caution'>> = {
  lumbo_pelvic: {
    title: 'Feed the pelvic drift, exhale to own the ribs-over-pelvis position',
    rnt: {
      feed: 'Band or cable pulling the pelvis INTO the anterior tilt you are already drifting toward',
      direction: 'Anterior — same direction as the drift, never against it',
      load: 'Light. Enough to be felt, never enough to win. If it changes the movement, it is too heavy.',
      why: 'Feeding the tilt makes the drift obvious to the reflex, and the body organises out of it without being told to.',
    },
  },
  rib_thoracic: {
    title: 'Feed the rib flare, exhale fully to bring the ribcage down',
    rnt: {
      feed: 'Light band across the lower ribs pulling them UP and open, the way they are already flaring',
      direction: 'Into extension — the drift itself',
      load: 'Very light. This is a proprioceptive cue, not a stretch.',
      why: 'A flared rib is usually an exhale that never finishes. Feeding the flare makes the end of the exhale findable.',
    },
  },
  upper_traps: {
    title: 'Feed the shrug so the shoulder can find the down-and-back',
    rnt: {
      feed: 'Band pulling the shoulder UP toward the ear, into the shrug pattern being used',
      direction: 'Superior — with the compensation',
      load: 'Light, and constant through the rep.',
      why: 'Cueing "relax the traps" asks for a muscle to be quiet. Feeding the shrug lets the depressors answer on their own.',
    },
  },
  lat_rhomboid: {
    title: 'Feed the scapular drift, exhale on the pull to keep it set',
    rnt: {
      feed: 'Band pulling the scapula into protraction — the way it is sliding under load',
      direction: 'Forward and around the ribcage',
      load: 'Light to moderate, matched to the working set.',
      why: 'A scapula that will not set is often one that was never asked to resist anything. Give it something to resist.',
    },
  },
  posterior_chain: {
    title: 'Feed the forward drift so the hinge can re-find the hips',
    rnt: {
      feed: 'Band at the hips pulling FORWARD, into the drift away from the hinge',
      direction: 'Anterior at the pelvis',
      load: 'Moderate — this one needs enough to react against.',
      why: 'Pulling the hips forward makes the posterior chain answer to hold the hinge, which no verbal cue reliably achieves.',
    },
  },
};

/** Breath pairing per zone. Phase seconds are derived from their own tempo where one exists. */
function breathFor(zone: ZoneId, tempoSec: number): BreathCue {
  const exhale = clamp(tempoSec * 0.6, 2, 6);
  const inhale = clamp(tempoSec * 0.4, 2, 5);
  switch (zone) {
    case 'rib_thoracic':
      return { pattern: '360° breath — ribs wide, then a full exhale to empty', timing: 'Exhale through the whole corrective; pause 2s at empty before the next inhale', inhaleSec: inhale, exhaleSec: Math.max(exhale, 4) };
    case 'lumbo_pelvic':
      return { pattern: 'Exhale-driven posterior tilt, ribs stacked over pelvis', timing: 'Exhale as you resist the band; inhale only once the position is held', inhaleSec: inhale, exhaleSec: Math.max(exhale, 4) };
    case 'upper_traps':
      return { pattern: 'Quiet nasal inhale, long exhale as the shoulder settles', timing: 'Exhale on the descent out of the shrug', inhaleSec: inhale, exhaleSec: exhale };
    case 'lat_rhomboid':
      return { pattern: 'Exhale on the pull, hold the set position through the inhale', timing: 'Exhale on effort; keep the scapula set while breathing in', inhaleSec: inhale, exhaleSec: exhale };
    case 'posterior_chain':
    default:
      return { pattern: 'Inhale at the top, exhale through the hinge', timing: 'Exhale as the hips load; inhale on the return', inhaleSec: inhale, exhaleSec: exhale };
  }
}

/**
 * The correctives this session earns — ranked, capped, and empty when the movement was clean.
 *
 * Prescribing for a zone that behaved is how a coaching tool loses trust: an athlete who did well
 * and is handed three "fixes" learns the tool is not reading them.
 */
export function prescribeCorrectives(s: MirrorSessionLike): Corrective[] {
  const minutes = Math.max(s.durationMs, 1) / 60_000;
  const tempoSec = clamp((s.avgTempo ?? 4000) / 1000, 2, 8);

  const zones = Object.keys(PLAYBOOK) as ZoneId[];
  const scored = zones.map((zone) => {
    const faults = Math.max(0, s.faultCounts[zone] ?? 0);
    const faultsPerMin = faults / minutes;
    const stableShare = clamp((s.timeInStableMs[zone] ?? 0) / Math.max(s.durationMs, 1), 0, 1);
    // drifting often AND not holding it is what earns a corrective
    const priority = faultsPerMin * (1 - stableShare);
    return { zone, faults, faultsPerMin, stableShare, priority };
  });

  return scored
    .filter((z) => z.faultsPerMin >= FAULTS_PER_MIN_FLOOR && z.stableShare < STABLE_SHARE_CEILING)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, MAX_CORRECTIVES)
    .map(({ zone, faultsPerMin, stableShare, priority }) => ({
      zone,
      priority: round2(priority),
      faultsPerMin: round2(faultsPerMin),
      stableShare: round2(stableShare),
      ...PLAYBOOK[zone],
      breath: breathFor(zone, tempoSec),
      dosage: dosageFor(faultsPerMin),
      caution: CAUTION,
    }));
}

/** More drift earns more exposure, within reason — a corrective is a primer, not the session. */
function dosageFor(faultsPerMin: number): { sets: number; reps: number; holdSec: number } {
  if (faultsPerMin >= 6) return { sets: 3, reps: 6, holdSec: 5 };
  if (faultsPerMin >= 3) return { sets: 2, reps: 6, holdSec: 4 };
  return { sets: 2, reps: 5, holdSec: 3 };
}

/** Said to an athlete whose session was clean. Praise that is specific, and no invented work. */
export function cleanSessionNote(s: MirrorSessionLike): string {
  const reps = s.reps > 0 ? `${s.reps} rep${s.reps === 1 ? '' : 's'}` : 'that set';
  return `Nothing to correct from ${reps} — every zone held. Add load or tempo before adding correctives.`;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round2 = (v: number) => Math.round(v * 100) / 100;
