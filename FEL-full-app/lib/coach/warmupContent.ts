// lib/coach/warmupContent.ts — MIRROR-COACH P6 (2026-09-29): what the warm-up generator (lib/coach/warmup.ts) builds
// with, as data. The rock-and-hold stretch steps and the pattern primers, each tagged with the patterns it fits, the
// Movement Screen zone it aims at, youthSafe, impact, its seconds and ONE cue.
//
// WHY THIS FILE EXISTS. The crossref (crossref-wf_dfad67b3-209.json, matrix "Six-phase warm-up" and the three rows after
// it) found the owner's Pre-Game Wake-Up written as Playbook text and as a camera drill (lib/drills/drills.ts:88 WAKE_UP)
// that nothing keyed to a session: no stretch aimed at what the athlete's Movement Screen flagged, and no primer
// matched to the day's main pattern. Owner decision #7 is to EXTEND the Wake-Up with exactly those two things; #14 says
// the owner wrote the Wake-Up before reading the book, so the Wake-Up stays the spine and this file only adds to it.
//
// WHOSE WORDS (owner decision #8, the IP rule): every name, cue and dose here is FEL's, or the owner's own Playbook where
// a row cites it (`source`). "Rock and Hold" is FEL's name for FEL's step: a few small, easy rocks into a position,
// then a still hold with a long breath out. Its timing is ours (ROCK_SEC, HOLD_SEC below). No book method name, no book
// phase name, no book dose, no book sentence. warmup.test.ts lints every string here.
//
// HONESTY RULE (lib/share/screen.ts): coaching words about what to do, never a claim about a body. Nothing here names a
// condition, promises an outcome, or says it lowers the chance of anything; a warm-up builds capacity for the work, and
// that is all the copy says.
//
// IMPACT. `impact: true` means the step leaves the floor and lands (a jump, a hop, a bound). Owner decision #6 and the
// P6 rule (b): impact primers are OFF for athletes under 18 and for a blank birth year unless a coach assigned them, and
// OFF on a day the athlete's pain check-in stepped them down or stopped them. Every pattern therefore has a primer with
// `impact: false`, so a gated athlete still gets a primer rather than none.
//
// EXTERNAL FOCUS (MIRROR-COACH P9, 2026-09-30): every cue here is linted by lib/coach/cueLint.ts's policy — a cue that
// names a body part leads with the floor, a wall, the doorway or the ceiling, and nothing names a muscle to squeeze.
// Seven cues were reworded in FEL's words (the hip-front rock said "Squeeze the back-leg glute"; the ankle rock led
// with the knee). The 90/90 row's POSITION is the owner's (ch4); its rock-and-hold cue is FEL's step, reworded here.
//
// Pure data: no DOM, no Prisma client value (types only).
import type { MovementPattern } from '@/public/_prisma/client';

// ── zones: what the Movement Screen can point the stretch at ─────────────────────────────────────────────────────────

/**
 * The four areas a graded Movement Screen can flag, in FEL's plain words. Three are the Mirror's own zones the screen's
 * corrective mapping already uses (lib/mirror/screenCorrectives.ts CORRECTIVE_BLOCK); the heel line has no Mirror zone
 * (no corrective block works the foot), so the warm-up names it 'foot' itself. The order is the tie-break when two
 * areas flag equally: from the ground up, the Wake-Up's own order (feet before joints before trunk).
 */
export type WarmupZone = 'foot' | 'posterior_chain' | 'lumbo_pelvic' | 'rib_thoracic';
export const WARMUP_ZONES: readonly WarmupZone[] = ['foot', 'posterior_chain', 'lumbo_pelvic', 'rib_thoracic'];
export const isWarmupZone = (v: unknown): v is WarmupZone => typeof v === 'string' && (WARMUP_ZONES as readonly string[]).includes(v);

/**
 * How the athlete reads each area. Plain words: no anatomy lecture, no condition.
 *
 * MIRROR-COACH P6 FIX (2026-09-29, code review — honesty rule): each area is named by WHAT THE CAMERA READ, never by
 * the tissue a stretch works. zoneNote renders "The stretch aims at <words>, the area your last Movement Screen flagged
 * most", so the words are a claim about the camera. They said "your upper back and ribs" for a flag from shoulderLevel
 * or headFloat (the shoulder and head landmarks: MediaPipe's 33 have no rib or abdomen point, and the P6 contract bars
 * rib/abdomen reads), and "your hips and the backs of your legs" for a knee-window flag (hip, knee and ankle points — the
 * backs of the legs are not a landmark). Now: shoulders and upper back for the upper zone (the shoulder line and where
 * the head sits over it), hips and knees for the knee window. warmup.test.ts lints every word here and every zone note for rib, abdomen, belly, and the backs of the legs.
 */
export const ZONE_WORDS: Record<WarmupZone, string> = {
  foot: 'your feet and ankles',
  posterior_chain: 'your hips and knees',
  lumbo_pelvic: 'your hips and trunk',
  rib_thoracic: 'your shoulders and upper back',
};

/**
 * The screen's six camera checks → the area a flag points the stretch at. Five follow the corrective mapping's zone
 * (screenCorrectives.ts CORRECTIVE_BLOCK, held together by warmup.test.ts); the heel line, which has no block, is the
 * foot. Keyed by the grader ids (lib/mirror/stationGraders.ts GRADER_IDS) as plain strings so this file stays free of
 * lib/mirror.
 */
export const CHECK_ZONE: Readonly<Record<string, WarmupZone>> = {
  heelLine: 'foot',
  kneeWindow: 'posterior_chain',
  hipLevel: 'lumbo_pelvic',
  singleLeg: 'lumbo_pelvic',
  shoulderLevel: 'rib_thoracic',
  headFloat: 'rib_thoracic',
};

// ── the rock-and-hold step ───────────────────────────────────────────────────────────────────────────────────────────

/** Seconds of small, easy rocks into the position (about ten). Ours. */
export const ROCK_SEC = 20;
/** Seconds held still at the new end of the range, with one long breath out. Ours. */
export const HOLD_SEC = 10;
/** Rounds of rock-then-hold per step: one per side, or a two-sided position twice. Ours. */
export const ROCK_HOLD_ROUNDS = 2;
/** One rock-and-hold step, all rounds (s). */
export const ROCK_HOLD_SEC = ROCK_HOLD_ROUNDS * (ROCK_SEC + HOLD_SEC);

export interface RockHoldStep {
  id: string;
  name: string;
  /** The screen areas it aims at (WARMUP_ZONES). */
  zones: readonly WarmupZone[];
  /** The main patterns it gets the body ready for. */
  patterns: readonly MovementPattern[];
  /** 'each' = one round per side; 'both' = a two-sided position, done twice. */
  sides: 'each' | 'both';
  /** The position, in a few words. */
  setup: string;
  /** The one cue. */
  cue: string;
  /** Never pins, never loads: every rock-and-hold here is youth-safe (owner decision #6 bars pin-and-stretch, not this). */
  youthSafe: true;
  impact: false;
  seconds: number;
  /** 'fel', or the owner's Playbook where the position is the owner's. */
  source: string;
}

const HOLD_LINE = 'Then hold still where it stops and let one long breath out.';

const rockHold = (r: Omit<RockHoldStep, 'youthSafe' | 'impact' | 'seconds'>): RockHoldStep =>
  ({ ...r, youthSafe: true, impact: false, seconds: ROCK_HOLD_SEC });

/**
 * The rock-and-hold steps, in the order the generator prefers them on a tie (warmup.ts pickRockHolds): the lower body
 * from the ground up, then the upper body. Every pattern has at least two that fit it (warmup.test.ts holds that), so a
 * 14-minute warm-up never has to repeat one.
 */
export const ROCK_HOLDS: readonly RockHoldStep[] = [
  rockHold({
    id: 'ankle-rock', name: 'Ankle Rock and Hold', zones: ['foot'], patterns: ['squat', 'lunge', 'locomotion', 'carry'], sides: 'each',
    setup: 'Half-kneeling, front foot flat, hands on the front knee.',
    cue: `Rock toward a spot on the floor past your toes in small pulses, heel down. ${HOLD_LINE}`, source: 'fel',
  }),
  rockHold({
    id: 'wall-calf-rock', name: 'Wall Calf Rock and Hold', zones: ['foot'], patterns: ['locomotion', 'squat', 'hinge', 'carry'], sides: 'each',
    setup: 'Hands on a wall, back leg long, back heel down.',
    cue: `Lean in and out in small pulses, the back heel stays on the floor. ${HOLD_LINE}`, source: 'fel',
  }),
  rockHold({
    id: 'deep-squat-rock', name: 'Deep Squat Rock and Hold', zones: ['foot', 'posterior_chain'], patterns: ['squat', 'locomotion'], sides: 'both',
    setup: 'Hold a door frame or a post and sit into a deep squat, heels down.',
    cue: `Rock gently side to side and front to back. ${HOLD_LINE}`, source: 'fel',
  }),
  rockHold({
    id: 'hinge-rock', name: 'Hinge Rock and Hold', zones: ['posterior_chain'], patterns: ['hinge', 'squat', 'lunge'], sides: 'both',
    setup: 'Standing, soft knees, hands sliding down the fronts of the thighs.',
    cue: `Push the hips back toward the wall behind you in small rocks, back long. ${HOLD_LINE}`, source: 'fel',
  }),
  // MIRROR-COACH P9 fix (2026-09-30, code review): THE HALF-KNEEL HIP ROCK AND HOLD IS GONE. Half-kneeling, easing the hips
  // forward and holding is the kneeling hip-flexor stretch, and the owner's Playbook says not to do it: ch4's Trainer's
  // Note, "Don't stretch the psoas — strengthen the stabilizers … kneeling lunge stretch, hold for 60 seconds, done"
  // (lib/education/playbook.data.json). P9 dropped the couch stretch from lib/mirror/program.ts on that same line, while
  // this one ran before every lunge, hinge, squat, locomotion and carry session and in their cool-downs. Owner decision
  // #7 asks for a rock-then-hold STEP, not this stretch, and the eight below keep it: every pattern still has two that fit
  // (warmup.test.ts), and the hips' own is the owner's 90/90 (ch4). The owner can restore it in one entry (P9 fix report).
  rockHold({
    id: 'ninety-ninety-rock', name: '90/90 Rock and Hold', zones: ['lumbo_pelvic', 'posterior_chain'], patterns: ['squat', 'rotation', 'lunge', 'hinge', 'mobility', 'breath'], sides: 'each',
    setup: 'Seated 90/90: front shin across, back shin out to the side, both knees bent.',
    cue: `Rock forward toward a spot on the floor past the front shin in small moves, chest tall. ${HOLD_LINE}`, source: 'playbook ch4 (The Hip 90/90 Position)',
  }),
  rockHold({
    id: 'open-book-rock', name: 'Open Book Rock and Hold', zones: ['rib_thoracic'], patterns: ['rotation', 'push', 'pull', 'carry', 'breath', 'mobility'], sides: 'each',
    setup: 'Lying on your side, knees stacked and bent, arms out in front.',
    cue: `Open the top arm toward the floor behind you in small rocks, knees stay together. ${HOLD_LINE}`, source: 'fel',
  }),
  rockHold({
    id: 'kneeling-reach-rock', name: 'Kneeling Reach Rock and Hold', zones: ['rib_thoracic'], patterns: ['push', 'pull', 'carry', 'rotation'], sides: 'both',
    setup: 'Kneeling, hands on a bench or the floor out in front, arms long.',
    cue: `Sit the hips back toward the heels in small rocks, chest easing toward the floor. ${HOLD_LINE}`, source: 'fel',
  }),
  rockHold({
    id: 'doorway-chest-rock', name: 'Doorway Chest Rock and Hold', zones: ['rib_thoracic'], patterns: ['push', 'pull'], sides: 'each',
    setup: 'One forearm on a door frame, elbow at shoulder height.',
    cue: `Step through the doorway a little at a time, easy on the front of the shoulder. ${HOLD_LINE}`, source: 'fel',
  }),
];

/** When nothing picks a stretch (no pattern, no screen area): the hips and the upper back, the two most patterns use. */
export const GENERAL_ROCK_HOLDS: readonly string[] = ['ninety-ninety-rock', 'open-book-rock'];

// ── the primer ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** A primer's dose: sets × reps, with the rest between sets, and how long it takes in all (s). */
export interface PrimerDose { sets: number; reps: string; seconds: number }

export interface Primer {
  id: string;
  name: string;
  /** The main patterns it primes. 'general' = the fallback for an untagged key set (and breath / mobility / other). */
  patterns: readonly MovementPattern[] | 'general';
  /** Leaves the floor and lands (P6 rule (b) gates these). */
  impact: boolean;
  /** False for every impact primer: off under 18 / blank birth year unless a coach assigned it (owner decision #6). */
  youthSafe: boolean;
  dose: PrimerDose;
  /** The low-readiness dose: one set, shorter. */
  lowDay: PrimerDose;
  cue: string;
  source: string;
}

/**
 * The primers. Doses are FEL's: a low total count of quick, crisp reps (the Prime section's own meaning in lib/coach/
 * taxonomy.ts: "A few quick, crisp reps that wake the pattern up"), two short sets, one on a low day. An impact primer
 * caps its landings at six. The generator picks the impact primer for a pattern when the gates allow it, else the
 * pattern's non-impact one (warmup.ts pickPrimer).
 */
export const PRIMERS: readonly Primer[] = [
  {
    id: 'squat-jump-primer', name: 'Squat Jump Primer', patterns: ['squat'], impact: true, youthSafe: false,
    dose: { sets: 2, reps: '3 low jumps', seconds: 60 }, lowDay: { sets: 1, reps: '3 low jumps', seconds: 30 },
    cue: 'Dip, jump a little way up, land quiet and stick it for a two-count. Reset, go again.', source: 'fel',
  },
  {
    id: 'fast-squat-primer', name: 'Fast Squat Primer', patterns: ['squat'], impact: false, youthSafe: true,
    dose: { sets: 2, reps: '5', seconds: 60 }, lowDay: { sets: 1, reps: '5', seconds: 30 },
    cue: 'Sit down under control, stand up as fast as you can. Heels stay on the floor.', source: 'fel',
  },
  {
    id: 'broad-jump-primer', name: 'Short Broad Jump Primer', patterns: ['hinge'], impact: true, youthSafe: false,
    dose: { sets: 2, reps: '2 short jumps', seconds: 60 }, lowDay: { sets: 1, reps: '2 short jumps', seconds: 30 },
    cue: 'Swing the arms, jump forward a short way, land quiet on both feet and stick it. Walk back, go again.', source: 'fel',
  },
  {
    id: 'hip-snap-primer', name: 'Hip Snap Primer', patterns: ['hinge'], impact: false, youthSafe: true,
    dose: { sets: 2, reps: '6', seconds: 60 }, lowDay: { sets: 1, reps: '6', seconds: 30 },
    cue: 'Hands on hips, push them back toward the wall behind you, then snap up tall, fast.', source: 'fel',
  },
  {
    id: 'split-hop-primer', name: 'Split Stance Hop Primer', patterns: ['lunge'], impact: true, youthSafe: false,
    dose: { sets: 2, reps: '3 small hops a side', seconds: 60 }, lowDay: { sets: 1, reps: '3 small hops a side', seconds: 30 },
    cue: 'In a split stance, small quick hops, landing in the same stance each time. Quiet feet.', source: 'fel',
  },
  {
    id: 'split-drive-primer', name: 'Split Squat Drive Primer', patterns: ['lunge'], impact: false, youthSafe: true,
    dose: { sets: 2, reps: '4 a side', seconds: 60 }, lowDay: { sets: 1, reps: '4 a side', seconds: 30 },
    cue: 'Lower slow, then drive the floor away fast through the front heel.', source: 'fel',
  },
  {
    id: 'fast-push-primer', name: 'Fast Push-Up Primer', patterns: ['push'], impact: false, youthSafe: true,
    dose: { sets: 2, reps: '4', seconds: 60 }, lowDay: { sets: 1, reps: '4', seconds: 30 },
    cue: 'Hands on a bench or the floor. Lower under control, push the floor away fast.', source: 'fel',
  },
  {
    id: 'fast-row-primer', name: 'Fast Row Primer', patterns: ['pull'], impact: false, youthSafe: true,
    dose: { sets: 2, reps: '5', seconds: 60 }, lowDay: { sets: 1, reps: '5', seconds: 30 },
    cue: 'Hold a sturdy door frame, lean back, pull the chest in fast, lower slow. Elbows toward your back pockets.', source: 'fel',
  },
  {
    id: 'tall-march-primer', name: 'Tall March Primer', patterns: ['carry'], impact: false, youthSafe: true,
    dose: { sets: 2, reps: '20 seconds', seconds: 60 }, lowDay: { sets: 1, reps: '20 seconds', seconds: 30 },
    cue: 'Grow toward the ceiling as you march in place, knees up quick, arms driving.', source: 'fel',
  },
  {
    id: 'turn-stop-primer', name: 'Turn and Stop Primer', patterns: ['rotation'], impact: false, youthSafe: true,
    dose: { sets: 2, reps: '4 each way', seconds: 60 }, lowDay: { sets: 1, reps: '4 each way', seconds: 30 },
    cue: 'Hands together in front, turn fast from the hips, then stop square and still.', source: 'fel',
  },
  {
    id: 'pogo-stick-primer', name: 'Pogo and Stick Primer', patterns: ['locomotion'], impact: true, youthSafe: false,
    dose: { sets: 2, reps: '8 pogos, then 1 low hop and stick', seconds: 60 }, lowDay: { sets: 1, reps: '8 pogos, then 1 low hop and stick', seconds: 30 },
    cue: 'Quick, quiet pogos on the balls of the feet, then one low hop: land and stick it.', source: 'fel',
  },
  {
    id: 'wall-drive-primer', name: 'Wall Drive Primer', patterns: ['locomotion'], impact: false, youthSafe: true,
    dose: { sets: 2, reps: '4 a side', seconds: 60 }, lowDay: { sets: 1, reps: '4 a side', seconds: 30 },
    cue: 'Hands on a wall, body in a straight ramp, drive one knee up fast and set it back down.', source: 'playbook ch7 (The Wall Drive)',
  },
  {
    id: 'squat-reach-primer', name: 'Squat and Reach Primer', patterns: 'general', impact: false, youthSafe: true,
    dose: { sets: 2, reps: '5', seconds: 60 }, lowDay: { sets: 1, reps: '5', seconds: 30 },
    cue: 'Squat down, stand up into a long reach overhead. Start smooth, finish brisk.', source: 'fel',
  },
];

/** The general primer's id: an untagged key set, and breath / mobility / other days. */
export const GENERAL_PRIMER_ID = 'squat-reach-primer';
