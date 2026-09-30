// lib/babylon/music/houseBeat.ts — THE ARENA'S HOUSE BEAT, and the judge that scores a staked set on it. PURE (no audio,
// no React, no clock, no Math.random), so the Groove Academy and the server build the SAME beat from the same match id,
// and the server rejudges a staked set with the judge the room plays by.
//
// MUSIC-SUITE P6 (2026-09-26), owner decision #12: "Arena music (fixed): house beat seeded by the match, locked tempo,
// one attempt, count-in; old music duel scores stop counting; 5,000 baseline kept until real scores exist". What was
// wrong (outbox musicsuite/p1/STAKING-PAUSE.md, lib/stakingPause.ts's header, the understand map's problems):
//   * an Arena music set was the player's OWN grid, so the song decided the duel: P1 measured an empty grid offering 512
//     notes, and P2 FIX PASS made a note only where the grid hits — so a dense grid offered more notes (and a longer
//     combo) than a sparse one, and two players in one duel were never playing the same set;
//   * STOP/PLAY and the BUILD tab restarted a set as often as you liked before END SET, and tempo and swing stayed
//     adjustable mid-set;
//   * the server settled whatever number the shell posted, up to performSetMax() = 2,647,100 (every one of an Arena
//     set's 512 steps a PERFECT note) — a ceiling no honest set on a real beat comes near.
// Now:
//   * houseBeatFor(matchId) IS the beat of a music duel: one of FEL's own synthesized kits (SynthKit: street / neon /
//     dust — no sample, no third-party audio), a house tempo and swing, an 8-bar pattern over kick / snare / hats /
//     perc, and the chart the player taps, all from the match id through a seeded integer PRNG. Both players of a duel
//     get the same beat; the room cannot change its tempo or swing (nothing here takes one);
//   * every house beat charts EXACTLY HOUSE_SET_NOTES notes — 48 per 8-bar pass, four passes in the 32-bar Arena set —
//     so every Arena music set has the one ceiling HOUSE_SET_MAX = performSetMax(192) = 378,300 (lib/arena-score-
//     integrity.ts reads it), duels on different beats are on one scale, and the house rival's band (lib/arena-rivals.ts,
//     banded on the player's own past sets) means the same thing from duel to duel;
//   * the chart is "notes only where the beat hits" (decision #11): each note is a step where its lane sounds, at most
//     ONE lane per step (snare > kick > perc > hats where lanes coincide), so the note count — and so the ceiling — is
//     the same however many lanes PERFORM judges. The lanes are PERFORM's four (performSet.ts PerformLane: 0 kick,
//     1 snare, 2 hats, and the fourth lane — free play's Flip — is the house beat's perc). A note and a tap both name
//     the PART ('kick' | 'snare' | 'hats' | 'perc'), played in lane HOUSE_LANES.indexOf(part) (houseLaneOf), and a tap
//     takes only a note of its own lane (lane 1's lane judge);
//   * judgeHouseSet(beat, taps) is the rejudge: the tap list the room recorded, driven through the room's own
//     PerformSet({ arena: true }) on the schedule the room's AudioEngine keeps (each step offered HOUSE_SCHEDULE_AHEAD_S
//     before it sounds, AudioEngine.ts SCHEDULE_AHEAD_S) — imported, never re-implemented. The ROOM SUBMITS
//     judgeHouseSet's score for the list it posts, and /api/arena/submit-score runs the same function on the same list.
//     WHY THE ROOM'S LIVE NUMBER IS NOT THE ONE SUBMITTED: PerformSet registers a miss when expire() next runs after its
//     window closes, and a WAITING tap when the schedule settles it, so a live set's combo depends on how often expire()
//     is called. Measured on 300 sloppy sets (±120–150 ms, 15 % of notes skipped; scratch probe, 2026-09-26), on the P2
//     one-lane judge: driving expire() only at each step's time — the first draft of this judge — disagreed with a 60 Hz
//     live drive on 56 of 300 scores; calling expire() the instant each note's and each tap's window closes (this judge:
//     the continuous-time limit a faster frame rate tends to) agreed with a 60 Hz drive on 299 of 300 and a 120 Hz one on
//     300 of 300. Re-measured on lane 1's LANE judge (P6, same day; 150 sloppy + 150 wrong-lane sets, two random streams;
//     outbox musicsuite/p6/arena-music-proof.json): this judge differs from a 60 Hz live drive on 18–20 of 300 and a
//     120 Hz one on 15–16 (by at most 450 points), the step-time draft from a live drive on 39–40 (up to 2,700) — and a
//     60 Hz and a 120 Hz live drive of the SAME set now differ from each other on 14–16 of 300 (the lane judge's spam lock
//     "both ways" prunes by the latest decision's time, and a WAITING tap is decided late), so no drive can reproduce
//     "the" live number. The number the player is paid on is this one, on both sides, and the end card shows it.
//
// TIME BASE of a tap (HouseTap.tMs): milliseconds on the HEARD clock from the set's first downbeat (the step after the
// count-in) — (tap's audio time − the room's latencySec − the downbeat's audio time) × 1000, rounded by houseTap(). The
// judge runs with latencySec 0 on those times. An Arena set's phone taps are judged on ARRIVAL, uncorrected (P5, owner
// decision: the phone answers its own timing pings), so the room records the arrival time: the rejudge sees exactly what
// the room judged.

import type { KitId } from './SynthKit';
import {
  PerformSet, performSetMax, PERFORM_SET_BARS, PERFORM_SET_NOTES, PERFORM_STEPS_PER_BAR, PERFORM_EXPIRE_S,
  type PerformResult, type PerformLane,
} from './performSet';
import { songStepTime, stepDurSec } from './stepTime';

/**
 * Bumped only with a new generator. A duel's beat must never change under it: a v2 must keep v1 buildable for duels whose
 * start event recorded v1 (music_attempt_start carries `v`). Only v1 exists.
 */
export const HOUSE_BEAT_VERSION = 1;

/** The four parts a house beat plays, by name. */
export type HouseLaneName = 'kick' | 'snare' | 'hats' | 'perc';
/**
 * The parts in PERFORM's lane order: HOUSE_LANES[l] is the part played in lane l (performSet.ts PerformLane 0..3). The
 * fourth lane — free play's FLIP, "the tune" — is the house beat's perc (a clap: the house has no tune to tap).
 */
export const HOUSE_LANES: readonly HouseLaneName[] = ['kick', 'snare', 'hats', 'perc'];
/** What an Arena set's lanes are called on screen (free play's are PERFORM_LANE_LABELS). */
export const HOUSE_LANE_LABELS: readonly string[] = ['KICK', 'SNARE', 'HATS', 'PERC'];
/** The PERFORM lane a part is played in. */
export function houseLaneOf(name: HouseLaneName): PerformLane { return HOUSE_LANES.indexOf(name) as PerformLane; }
/** The SynthKit slot each part sounds (KIT_SLOTS ids). */
export const HOUSE_LANE_SAMPLE: Readonly<Record<HouseLaneName, string>> = { kick: 'kick', snare: 'snare', hats: 'hat', perc: 'clap' };
/**
 * Where lanes coincide on a step, the chart's note goes to the first of these (a clap on the backbeat over the kick is
 * the snare's note). One note per step keeps the note count independent of how many lanes PERFORM judges.
 */
export const HOUSE_NOTE_PRIORITY: readonly HouseLaneName[] = ['snare', 'kick', 'perc', 'hats'];

/** FEL's own kits only — every one synthesized at load (SynthKit.ts), no audio file behind any of them. */
export const HOUSE_KITS: readonly KitId[] = ['street', 'neon', 'dust'];
/** House tempos. TUNE(elijah): 116–124 BPM; 32 bars last 66 s at 116, 62 s at 124. */
export const HOUSE_BPMS: readonly number[] = [116, 118, 120, 122, 124];
/** House swing (stepTime.ts: a fraction of SWING_DEPTH of a 16th on the odd 16ths): MPC 50 / 52.5 / 55. */
export const HOUSE_SWINGS: readonly number[] = [0, 0.1, 0.2];

/** Bars in the house pattern; the Arena set loops it. */
export const HOUSE_PATTERN_BARS = 8;
/** The Arena set's length: PerformSet({ arena: true }) ends itself after PERFORM_SET_BARS. */
export const HOUSE_SET_BARS = PERFORM_SET_BARS;
/** Passes of the pattern in a set. */
export const HOUSE_PASSES = HOUSE_SET_BARS / HOUSE_PATTERN_BARS;
/** Count-in before the set's first downbeat, in bars (4 clicks). Not judged: a tap before it is ignored (judgeHouseSet). */
export const HOUSE_COUNT_IN_BARS = 1;
/**
 * Notes charted in each bar of the pattern: three bars of groove A, a lighter turn, three of groove B, a fill. Every
 * house beat charts exactly these counts, whatever the seed. TUNE(elijah).
 */
export const HOUSE_BAR_NOTES: readonly number[] = [6, 6, 6, 5, 6, 6, 6, 7];
/** Notes in one pass of the pattern (48). */
export const HOUSE_PATTERN_NOTES = HOUSE_BAR_NOTES.reduce((a, b) => a + b, 0);
/** Notes in an Arena set (192): the same for every house beat. */
export const HOUSE_SET_NOTES = HOUSE_PATTERN_NOTES * HOUSE_PASSES;
/** The most an Arena music set can score: every note PERFECT in one combo. lib/arena-score-integrity.ts's music ceiling. */
export const HOUSE_SET_MAX = performSetMax(HOUSE_SET_NOTES);
/** How far ahead of its sound AudioEngine schedules (and so offers) a step: AudioEngine.ts SCHEDULE_AHEAD_S (a test holds it). */
export const HOUSE_SCHEDULE_AHEAD_S = 0.1;
/** The most taps a finished attempt may carry: four per 16th step of the set (32 a second at 120 BPM — past any hand). */
export const HOUSE_MAX_TAPS = PERFORM_SET_NOTES * 4;

/**
 * What the room says BEFORE the count-in (owner decision #29), and what the Arena lobby says about a music duel.
 * MUSIC-SUITE P6 FIX PASS (2026-09-26): the words now say WHEN the attempt is used — at START. It is recorded when START is
 * pressed (the room posts it, then counts in: StudioMode startArenaSet), so a reload during the one-bar count-in (~2 s)
 * already scores 0; the line said "after the count-in", which the room never did. Posting the start at the first downbeat
 * instead would put a network round trip inside the count-in, where a slow reply would start the set late or not at all
 * — the honest fix is the wording (#29's point, one attempt that a reload cannot replay, is unchanged).
 */
export const HOUSE_ARENA_RULES =
  'Both players play the same house beat, set by the match — tempo and swing locked. ONE attempt: it is used the moment you press START (a one-bar count-in follows), and leaving or reloading after that scores 0.';

/**
 * One charted note of the set: the part it is (`lane`, a HouseLaneName — played in PERFORM lane houseLaneOf(lane)) and
 * `t`, seconds from the set's first downbeat (the straight grid plus swing, stepTime.ts).
 */
export interface HouseNote { i: number; bar: number; step: number; lane: HouseLaneName; t: number }
/** One lane of the pattern: its kit slot and its HOUSE_PATTERN_BARS × 16 steps (sounding, and at what velocity 0..1). */
export interface HouseLanePattern { sampleId: string; pattern: boolean[]; vels: number[] }

export interface HouseBeat {
  v: number;
  seed: string;
  kit: KitId;
  bpm: number;
  swing: number;
  stepsPerBar: number;
  patternBars: number;
  setBars: number;
  countInBars: number;
  /** The pattern's sound, by part. */
  lanes: Record<HouseLaneName, HouseLanePattern>;
  /** The whole set's chart, in time order: HOUSE_SET_NOTES notes over HOUSE_SET_BARS bars. */
  notes: HouseNote[];
}

/**
 * One recorded tap: the part whose lane was pressed (HOUSE_LANES[the PERFORM lane]) and its heard time in ms from the
 * set's first downbeat (see TIME BASE above).
 */
export interface HouseTap { lane: HouseLaneName; tMs: number }

// ── the seeded generator ──────────────────────────────────────────────────────────────────────────────────────────
/** FNV-1a 32-bit (lib/arena-rivals.ts seedHash's hash): stable across runs and engines. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
/** mulberry32 over a 32-bit state: integer ops only, so the client and the server draw the same sequence. */
function rng(seed: string): () => number {
  let a = fnv1a(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}
const pick = <T,>(r: () => number, list: readonly T[]): T => list[r() % list.length];
/**
 * MUSIC-SUITE P9 (2026-09-29), fair dance duels: the same seeded integer PRNG, shared — lib/babylon/dance/houseSong.ts
 * picks an Arena dance duel's house song from the match id with it, so the client and the server draw the same sequence
 * for the same reason this file does (integer ops only). Namespaced by the caller's own seed string.
 */
export const seededHouseRng = rng;

type Role = 'A' | 'turn' | 'B' | 'fill';
const ROLES: readonly Role[] = ['A', 'A', 'A', 'turn', 'B', 'B', 'B', 'fill'];
/** The house frame every bar keeps: kick on the downbeat, snare (the clap) on 2 and 4. Always charted. */
const MUST: readonly number[] = [0, 4, 12];
const OFFBEATS = [2, 6, 10, 14];
const HAT_STYLES: readonly (readonly number[])[] = [
  OFFBEATS,                                  // the open offbeat: house's own hat
  [0, 2, 4, 6, 8, 10, 12, 14],               // straight 8ths
  [2, 3, 6, 7, 10, 11, 14, 15],              // offbeat and its "a"
  [2, 6, 7, 10, 14, 15],                     // offbeat, a pickup into beats 3 and 1
];
const PERC_FIGURES: readonly (readonly number[])[] = [[3, 11], [7, 15], [3, 10], [11], [5, 13], [7, 10, 15], [3, 7], [10, 15]];
const PERC_TURNS: readonly (readonly number[])[] = [[], [15], [14, 15]];
const KICK_TURNS: readonly (readonly number[])[] = [[0, 4, 8, 12, 14], [0, 4, 8, 14], [0, 4, 8, 10, 12]];
const KICK_FILLS: readonly (readonly number[])[] = [[0, 4, 8], [0, 4, 8, 11], [0, 4, 8, 10]];
const SNARE_GHOSTS: readonly (readonly number[])[] = [[], [15], [7], [11], [7, 15]];
const SNARE_FILLS: readonly (readonly number[])[] = [[4, 12, 13, 14, 15], [4, 10, 12, 14, 15], [4, 11, 12, 14, 15], [4, 12, 14, 15], [4, 9, 12, 13, 15]];
/**
 * How much a lane wants a spare chart slot: kicks and ghost snares first; then groove A is charted on the perc and groove
 * B on the hats (with one weight for both, the perc figure took every spare slot and the hats lane was never charted —
 * seen on four seeds in the first smoke); the fill's snares before anything.
 */
const CHART_WEIGHT: Readonly<Record<Role, Readonly<Record<HouseLaneName, number>>>> = {
  A: { kick: 3, snare: 3, perc: 2, hats: 1 },
  turn: { kick: 3, snare: 3, perc: 2, hats: 1 },
  B: { kick: 3, snare: 3, perc: 1, hats: 2 },
  fill: { kick: 3, snare: 5, perc: 2, hats: 1 },
};

/** One bar's sound, by lane: the steps each lane hits. */
type BarHits = Record<HouseLaneName, readonly number[]>;

/** The lane a step's note belongs to (HOUSE_NOTE_PRIORITY), or null when nothing sounds there. */
function noteLane(hits: BarHits, step: number): HouseLaneName | null {
  for (const lane of HOUSE_NOTE_PRIORITY) if (hits[lane].includes(step)) return lane;
  return null;
}

/**
 * Chart `n` notes out of one bar's hits: the house frame (MUST), then the spare slots by CHART_WEIGHT with a seeded
 * tie-break. Every bar sounds at least the 8 steps of kick-on-1 + backbeat + offbeat hats, so `n` ≤ 8 always fills.
 */
function chartBar(hits: BarHits, role: Role, n: number, r: () => number): { step: number; lane: HouseLaneName }[] {
  const out = MUST.map((step) => ({ step, lane: noteLane(hits, step)! }));
  const spare: { step: number; lane: HouseLaneName; key: number }[] = [];
  for (let step = 0; step < PERFORM_STEPS_PER_BAR; step++) {
    if (MUST.includes(step)) continue;
    const lane = noteLane(hits, step);
    if (lane) spare.push({ step, lane, key: CHART_WEIGHT[role][lane] * 0x100000 + (r() & 0xfffff) });
  }
  spare.sort((a, b) => b.key - a.key || a.step - b.step);
  for (const s of spare.slice(0, n - MUST.length)) out.push({ step: s.step, lane: s.lane });
  return out.sort((a, b) => a.step - b.step);
}

/**
 * THE house beat of a duel. `seed` is the match id. Same seed → the same beat, on the client and on the server, call
 * after call; nothing the room does can change it.
 */
export function houseBeatFor(seed: string): HouseBeat {
  const s = String(seed ?? '');
  const r = rng(`fel-house:v${HOUSE_BEAT_VERSION}:${s}`);
  const kit = pick(r, HOUSE_KITS);
  const bpm = pick(r, HOUSE_BPMS);
  const swing = pick(r, HOUSE_SWINGS);
  const hatsA = pick(r, HAT_STYLES), hatsB = pick(r, HAT_STYLES);
  const percA = pick(r, PERC_FIGURES), percB = pick(r, PERC_FIGURES), percTurn = pick(r, PERC_TURNS);
  const kickTurn = pick(r, KICK_TURNS), kickFill = pick(r, KICK_FILLS);
  const ghosts = pick(r, SNARE_GHOSTS), snareFill = pick(r, SNARE_FILLS);
  const four = [0, 4, 8, 12];
  const byRole: Record<Role, BarHits> = {
    A: { kick: four, snare: [4, 12], hats: hatsA, perc: percA },
    turn: { kick: kickTurn, snare: [4, 12], hats: hatsA, perc: percTurn },
    B: { kick: four, snare: [4, 12, ...ghosts], hats: hatsB, perc: percB },
    fill: { kick: kickFill, snare: snareFill, hats: OFFBEATS, perc: [] },
  };
  // one chart per role, so a repeated bar is tapped the same way (a rhythm is learnt by its repeats)
  const chartOf = new Map<Role, { step: number; lane: HouseLaneName }[]>();
  for (let b = 0; b < HOUSE_PATTERN_BARS; b++) {
    const role = ROLES[b];
    if (!chartOf.has(role)) chartOf.set(role, chartBar(byRole[role], role, HOUSE_BAR_NOTES[b], r));
  }

  const len = HOUSE_PATTERN_BARS * PERFORM_STEPS_PER_BAR;
  const lanes = {} as Record<HouseLaneName, HouseLanePattern>;
  for (const lane of HOUSE_LANES) lanes[lane] = { sampleId: HOUSE_LANE_SAMPLE[lane], pattern: new Array(len).fill(false), vels: new Array(len).fill(0) };
  for (let b = 0; b < HOUSE_PATTERN_BARS; b++) {
    const hits = byRole[ROLES[b]];
    for (const lane of HOUSE_LANES) {
      for (const step of hits[lane]) {
        const at = b * PERFORM_STEPS_PER_BAR + step;
        lanes[lane].pattern[at] = true;
        lanes[lane].vels[at] = velocityOf(lane, step, ROLES[b]);
      }
    }
  }

  const notes: HouseNote[] = [];
  for (let pass = 0; pass < HOUSE_PASSES; pass++) {
    for (let b = 0; b < HOUSE_PATTERN_BARS; b++) {
      const bar = pass * HOUSE_PATTERN_BARS + b;
      for (const c of chartOf.get(ROLES[b])!) {
        notes.push({ i: notes.length, bar, step: c.step, lane: c.lane, t: songStepTime(bar, c.step, PERFORM_STEPS_PER_BAR, bpm, swing) });
      }
    }
  }
  return {
    v: HOUSE_BEAT_VERSION, seed: s, kit, bpm, swing, stepsPerBar: PERFORM_STEPS_PER_BAR, patternBars: HOUSE_PATTERN_BARS,
    setBars: HOUSE_SET_BARS, countInBars: HOUSE_COUNT_IN_BARS, lanes, notes,
  };
}

/** A hit's velocity: the frame loud, the offbeat hat open, ghosts and in-between 16ths soft. */
function velocityOf(lane: HouseLaneName, step: number, role: Role): number {
  if (lane === 'kick') return step % 4 === 0 ? 1 : 0.85;
  if (lane === 'snare') return step === 4 || step === 12 ? 0.95 : role === 'fill' ? 0.8 : 0.55;
  if (lane === 'hats') return OFFBEATS.includes(step) ? 0.7 : 0.4;
  return 0.6;
}

/**
 * The pattern's sound for one bar of the SET (it loops every HOUSE_PATTERN_BARS), as the engine's 16-step tracks, in lane
 * order (each with its PERFORM lane, so the band's per-lane gains can follow the player).
 */
export function houseBarTracks(beat: HouseBeat, setBar: number): { lane: PerformLane; name: HouseLaneName; sampleId: string; pattern: boolean[]; vels: number[] }[] {
  const b = ((Math.floor(setBar) % beat.patternBars) + beat.patternBars) % beat.patternBars;
  const from = b * beat.stepsPerBar, to = from + beat.stepsPerBar;
  return HOUSE_LANES.map((name) => ({
    lane: houseLaneOf(name), name, sampleId: beat.lanes[name].sampleId,
    pattern: beat.lanes[name].pattern.slice(from, to), vels: beat.lanes[name].vels.slice(from, to),
  }));
}

/**
 * MUSIC-SUITE P6 FIX PASS (2026-09-26): the lanes step `i` of the SET offers (0 = bar 0's first 16th; one lane where the
 * chart has a note, none elsewhere) — the room's live chart feed, which was inline in StudioMode's onStepScheduled
 * (a filter over the whole chart per step). The same notes judgeHouseSet offers, by construction: both read beat.notes.
 */
export function houseStepLanes(beat: HouseBeat, i: number): PerformLane[] {
  const spb = beat.stepsPerBar;
  const bar = Math.floor(i / spb), step = ((i % spb) + spb) % spb;
  return beat.notes.filter((n) => n.bar === bar && n.step === step).map((n) => houseLaneOf(n.lane));
}
/** Is step `i` of the set the last of its bar (the room hands the engine the NEXT bar's tracks as it is scheduled)? */
export function houseLastStepOfBar(beat: HouseBeat, i: number): boolean { return i % beat.stepsPerBar === beat.stepsPerBar - 1; }

/** What a start event records of the beat (the audit trail: which beat the attempt was played on). */
export function houseBeatSummary(beat: HouseBeat): { v: number; kit: KitId; bpm: number; swing: number; notes: number } {
  return { v: beat.v, kit: beat.kit, bpm: beat.bpm, swing: beat.swing, notes: beat.notes.length };
}

/** Seconds per bar of this beat. */
export function houseBarSec(beat: Pick<HouseBeat, 'bpm' | 'stepsPerBar'>): number { return stepDurSec(beat.bpm) * beat.stepsPerBar; }
/** The count-in's length in ms (before the first downbeat). */
export function houseCountInMs(beat: HouseBeat): number { return beat.countInBars * houseBarSec(beat) * 1000; }
/** The set's length in ms, first downbeat to the end of its last bar. */
export function houseSetMs(beat: HouseBeat): number { return beat.setBars * houseBarSec(beat) * 1000; }
/**
 * The soonest a finish may arrive after its start: 90 % of the set itself (the start is posted at the count-in, before
 * the set plays; 10 % is room for a start request that landed late). A finish sooner than this was not played.
 */
export function houseMinFinishMs(beat: HouseBeat): number { return 0.9 * houseSetMs(beat); }

/** Where the judge stops listening: the last step's window closing (PerformSet.over()). Seconds from the first downbeat. */
function judgeEndSec(beat: HouseBeat): number {
  const steps = beat.setBars * beat.stepsPerBar;
  return songStepTime(Math.floor((steps - 1) / beat.stepsPerBar), (steps - 1) % beat.stepsPerBar, beat.stepsPerBar, beat.bpm, beat.swing) + PERFORM_EXPIRE_S;
}

/**
 * Is a tap at `tMs` one the judge hears? Not in the count-in (earlier than the first note's early window — tapping along
 * with the clicks is natural and costs nothing), not after the set has ended. The room feeds its live PerformSet only
 * these, so what the player watches is what is rejudged.
 */
export function houseTapJudged(beat: HouseBeat, tMs: number): boolean {
  const sec = tMs / 1000;
  return Number.isFinite(sec) && sec >= -PERFORM_EXPIRE_S && sec <= judgeEndSec(beat);
}

/** A tap as the room records it: heard seconds from the first downbeat → ms rounded to 0.1 ms (what is posted is judged). */
export function houseTap(lane: HouseLaneName, heardSecFromDownbeat: number): HouseTap {
  return { lane, tMs: Math.round(heardSecFromDownbeat * 10_000) / 10 };
}

/** expire() runs this long after a window closes (PerformSet's cutoffs are strict: `time < heard − PERFORM_EXPIRE_S`). */
const CLOSE_EPS_S = 1e-6;

/**
 * THE JUDGE of an Arena music set: `taps` driven through PerformSet({ arena: true }) on this beat's schedule — each of the
 * set's 512 steps offered HOUSE_SCHEDULE_AHEAD_S before it sounds (a note where the chart has one, a rest elsewhere),
 * every judged tap at its time, and expire() the instant each note's window and each tap's window closes (see WHY THE
 * ROOM'S LIVE NUMBER in the header); events in time order, an offer before a tap at the same instant and an expiry after
 * both (performSet.test.ts drive()'s order). The same function runs in the room at the end of the set and on the server
 * at submit; the score it returns is the one that must be submitted.
 *
 * LANES: each note is offered in its lane through PerformSet.chartStep (a curated chart: offered as charted, no 8th cap)
 * and each tap is tap(at, lane) — a tap takes only a note of its own lane; one in the wrong lane is an EXTRA (WRONG
 * LANE). The chart has one lane per step, so the note count and the ceiling are what they would be with one lane.
 */
export function judgeHouseSet(beat: HouseBeat, taps: readonly HouseTap[]): PerformResult {
  const set = new PerformSet({ arena: true });
  const spb = beat.stepsPerBar;
  const steps = beat.setBars * spb;
  const laneAt = new Map<number, PerformLane>(beat.notes.map((n) => [n.bar * spb + n.step, houseLaneOf(n.lane)]));
  const timeOf = (i: number): number => songStepTime(Math.floor(i / spb), i % spb, spb, beat.bpm, beat.swing);
  const ev: { at: number; kind: 0 | 1 | 2; i: number; lane: PerformLane | null }[] = [];
  for (let i = 0; i < steps; i++) {
    const t = timeOf(i);
    ev.push({ at: t - HOUSE_SCHEDULE_AHEAD_S, kind: 0, i, lane: null });
    if (laneAt.has(i)) ev.push({ at: t + PERFORM_EXPIRE_S + CLOSE_EPS_S, kind: 2, i, lane: null });   // its window closes: a MISS lands now
  }
  for (const tap of taps) {
    if (!houseTapJudged(beat, tap.tMs)) continue;
    const at = tap.tMs / 1000;
    ev.push({ at, kind: 1, i: -1, lane: houseLaneOf(tap.lane) }, { at: at + PERFORM_EXPIRE_S + CLOSE_EPS_S, kind: 2, i: -1, lane: null });   // a waiting tap is decided by now
  }
  ev.sort((a, b) => a.at - b.at || a.kind - b.kind);
  for (const e of ev) {
    if (e.kind === 1) { set.tap(e.at, e.lane); continue; }
    if (e.kind === 2) { set.expire(e.at); continue; }
    const t = timeOf(e.i);
    const lane = laneAt.get(e.i);
    if (lane !== undefined) set.chartStep(e.i % spb, t, e.at, [lane]); else set.rest(e.i % spb, t, e.at);
  }
  return set.result(judgeEndSec(beat) + 1e-3);
}

/** The most this beat's set can score (every note PERFECT in one combo). Every house beat: HOUSE_SET_MAX. */
export function houseBeatMax(beat: HouseBeat): number { return performSetMax(beat.notes.length); }

export type HouseTapRefusal = 'TAPS_INVALID' | 'TOO_MANY_TAPS';

/**
 * The tap list a finished attempt posts, checked: an array of at most HOUSE_MAX_TAPS { lane, tMs } with a known part and
 * a finite time inside [count-in − 1 s, set end + 1 s]. Returns the list as it will be stored and judged — only the two
 * fields, in the order given (the judge sorts by time; a stable sort keeps equal times in this order). Anything else is
 * refused whole: a list the server changed would no longer be the list the room scored.
 */
export function parseHouseTaps(beat: HouseBeat, raw: unknown): { ok: true; taps: HouseTap[] } | { ok: false; code: HouseTapRefusal; detail: string } {
  if (!Array.isArray(raw)) return { ok: false, code: 'TAPS_INVALID', detail: 'taps must be a list of { lane, tMs }.' };
  if (raw.length > HOUSE_MAX_TAPS) return { ok: false, code: 'TOO_MANY_TAPS', detail: `${raw.length} taps; a set records at most ${HOUSE_MAX_TAPS}.` };
  const lo = -houseCountInMs(beat) - 1000, hi = houseSetMs(beat) + 1000;
  const taps: HouseTap[] = [];
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i] as { lane?: unknown; tMs?: unknown } | null;
    const lane = t && typeof t === 'object' ? t.lane : undefined;
    const tMs = t && typeof t === 'object' ? t.tMs : undefined;
    if (typeof lane !== 'string' || !(HOUSE_LANES as readonly string[]).includes(lane)) {
      return { ok: false, code: 'TAPS_INVALID', detail: `Tap ${i + 1} has no lane (${HOUSE_LANES.join(' / ')}).` };
    }
    if (typeof tMs !== 'number' || !Number.isFinite(tMs) || tMs < lo || tMs > hi) {
      return { ok: false, code: 'TAPS_INVALID', detail: `Tap ${i + 1} is not a time inside the set.` };
    }
    taps.push({ lane: lane as HouseLaneName, tMs });
  }
  return { ok: true, taps };
}
