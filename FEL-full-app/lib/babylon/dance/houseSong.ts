// lib/babylon/dance/houseSong.ts — THE ARENA'S HOUSE SONG, and the judge that scores a staked dance set on it. PURE (no
// audio, no Babylon, no React, no clock, no Math.random), so the Cypher and the server build the SAME song and chart from
// the same match id, and the server rejudges a staked set with the judge the room dances by.
//
// MUSIC-SUITE P9 (2026-09-29), owner decision #10: "Arena dance (fixed): same house song for both players, accuracy-based
// score; own songs free play only; friend challenges same rule". What was wrong (lib/stakingPause.ts's header, P1's
// outbox musicsuite/p1/STAKING-PAUSE.md, the understand map's problems), and why dance staking has been paused since P1:
//   * the SONG decided a staked duel, not the dancing. Each player picked their own track, and a DanceCore score grows
//     with the chart: n steps pay n × 300 + 5 × n(n+1)/2 at best, so a longer chart out-scored a better dancer. Measured
//     on this tree with the six FEL songs' P7 charts (danceTracks.stepsForSong): a flawless set scores 9,555 on
//     MORNING BOARDWALK (26 steps) and 19,740 on EVOLUTION (47) — and a player's own exported 64-bar song reached the
//     79,680 ceiling (lib/arena-score-integrity.ts danceCeiling). Two players in one duel were never on the same chart;
//   * the house rival's band (lib/arena-rivals.ts) centred on the player's past dance scores in ANY song, so a first-duel
//     rival of 5,000 ±18 % could not be beaten on a short song and was a walkover on a long one;
//   * the server settled whatever number the shell posted, up to that 79,680.
// Now:
//   * houseSongFor(matchId) IS the song of a dance duel: one of the six FEL songs (lib/babylon/dance/felSongs.ts — FEL's
//     own rendered audio, provenance in public/audio/songs/PROVENANCE.json; never a player's own song, which stays free
//     play only) with its one authored chart at its own difficulty, from the match id through the seeded integer PRNG
//     houseBeat.ts uses. Both players of a duel get the same song, the same chart, the same difficulty and the same
//     tempo; the room shows no pick screen and no difficulty (nothing here takes one);
//   * the score is ACCURACY, not points: danceArenaScore = DanceCore.accuracyOf's weighted accuracy (PERFECT 1, GREAT
//     0.75, GOOD 0.4, a MISS — an unanswered step or a wild press — 0) on a DANCE_ARENA_SCALE of 10,000. A flawless set
//     scores 10,000 on EVERY house song, so duels on different songs are on one scale and the house rival's band means the
//     same thing from duel to duel; and the cold-start baseline of 5,000 (kept, decision #10's "5,000 baseline") is now a
//     grade-C set — the line decision #13 draws for a music win. Accuracy is also the number the frame rate cannot move:
//     every step is either taken by a press (its judgement decided at the press) or expires a MISS, whenever expiry runs,
//     so the room's live accuracy and this rejudge agree exactly (the points total, whose combo term depends on WHEN a
//     miss resets it, does not — the same trap houseBeat.ts's header measured for music);
//   * judgeDanceSet(house, presses) is the rejudge: the press list the room recorded, driven through the room's own
//     DancePerformance (lib/babylon/core/DanceCore.ts — imported, never re-implemented) on the chart the room played. The
//     ROOM SUBMITS judgeDanceSet's score for the list it posts, and /api/arena/submit-score runs the same function on the
//     same list (lib/arena-music.ts, HOUSE_SET_RULES.dance).
//
// MOVEMENT PLAY'S TERMS (docs/LANES.md; approved 2026-09-29): DanceCore.ts is read here, never changed. The judge is fed
// PRESSES and RELEASES only — hit() and release(), the press path. A body event is not a press and never reaches this
// list; a house chart is press-only (houseSong.test.ts holds every one), so no body step can be on it.
//
// TIME BASE of a press (HousePress.tMs): milliseconds on the HEARD clock from the chart's beat 0 (the first downbeat after
// the count-in) — (the song-clock time the room judged it at − the room's latencySec − the song-clock time of beat 0) ×
// 1000, by dancePress(). The room judges a press on exactly that heard time (DanceMode onInput: perf.hit(clock.song(a) −
// latencySec)), so the judge runs with the chart starting at 0 on those times. NOT ROUNDED, unlike a music tap (houseBeat
// houseTap rounds to 0.1 ms): measured on 72 simulated room runs (arenaDance.test.ts — 8 songs' seeds × 30/60/144 Hz ×
// steady / sloppy / mashing), 0.1 ms rounding moved one judgement across the 90 ms GREAT/GOOD edge on 2 runs (−26 on
// 10,000), and the unrounded list matched the room's own judge on 72 of 72. Both sides judge the list as posted either way
// (JSON carries a double exactly); unrounded, what the dancer saw in the room is also what the Arena settles.
//
// THE AUTHORED CHARTS (MUSIC-SUITE P9 (b), lib/babylon/dance/chart.ts) bring two press-path things the list must carry so
// the rejudge can replay them exactly (DanceCore.ts, the P9 press-only fields): a press HOLD ends on its key's RELEASE
// (DancePerformance.release(now, key)), so a release is recorded too ({ tMs, key, up: true }); and a FREESTYLE slot's
// award reads the move the button picked (hit(now, { key, move })), so a press records its key and move. The ARENA
// SCORE is accuracy, which a hold's tail moves (kept = PERFECT, dropped = MISS) and the variety factor does not (it
// scales points only: DanceCore varietyFactor — the judgement stays pure timing); both are replayed all the same, so the
// rejudge's full result is the room's.

import { seededHouseRng } from '../music/houseBeat';
import {
  DancePerformance, beatDuration, isBodyStep, isPressHold, MISS_AFTER, DANCE_LIBRARY,
  type DanceResult, type DanceStep, type Judgement,
} from '../core/DanceCore';
import { DANCE_TRACKS, stepsForSong, type DanceTrack } from '../core/danceTracks';
import { chartStepsFor } from './chart';
import { FEL_SONG_IDS, songFor, type FelSong, type SongDifficulty } from './felSongs';

/**
 * Bumped with a new chart set or a new pick. A duel's song must never change under it: the start event records `v`
 * (arena-music.ts), and a v2 must keep v1 buildable for a duel started on v1. Only v1 exists: the six authored charts of
 * MUSIC-SUITE P9 (lib/babylon/dance/chart.ts), each at its song's own difficulty.
 */
export const HOUSE_SONG_VERSION = 1;

/**
 * MUSIC-SUITE P9 FIX PASS (2026-09-29): WHAT A VERSION IS, PINNED. The rule above was a comment: houseSongFor always seeded
 * with the CURRENT version and picked from the CURRENT song list, houseSongSteps always built from the live chart JSON, and
 * nothing read back the `v` and `chart` a start event records — so a chart edit shipped after a duel started silently
 * re-charted it (the server rejudged the stored presses on a chart the dancer never saw: a 422 SCORE_MISMATCH, or a
 * settlement on the new chart; one stored press past a shortened chart's end refused the whole stored list, and the set
 * rejudged to 0), and the documented way out — bump the version — re-picked the song of every duel in flight (the version
 * is in the PRNG seed; so is the length of the song list). Now:
 *   · each version's songs and charts are pinned HERE by their houseChartPrint, in pick order. houseSong.test.ts holds the
 *     live charts, tempi and step counts to the current version's row, so any chart, bpm or song-list edit fails loudly
 *     until it ships as a NEW version, with the old version's charts kept buildable beside it;
 *   · houseSongFor(matchId, v) picks from THAT version's songs with THAT version's seed, and lib/arena-music.ts hands it
 *     the `v` the attempt's START recorded — a bump never re-picks a duel in flight;
 *   · the server will not judge on a chart that is not the one its version pins, or not the one its start recorded
 *     (assertHouseChart, houseChartMatches — lib/arena-music.ts): the route answers an error and the expiry sweep leaves the
 *     duel untouched and logs it. No stake ever settles on a chart the dancer did not dance.
 * The prints are the P9 charts as they land (canals includes the fix pass's kvD double, moved from 3.5 + a sixteenth — a
 * swung second tap 0.225 beats before the next move, which chart.ts's spacing rule now refuses — to 3 + an eighth, both
 * taps still on the kick / clap and the bass). NEVER edit a shipped version's row: add the next version.
 */
export const HOUSE_CHART_PRINTS: Readonly<Record<number, Readonly<Record<string, string>>>> = {
  1: { warmup: '7baab3a9', cypher: 'a753eee3', goldenhour: '54f4d0ce', battle: '24f9d722', canals: 'b3c20628', evolution: '59589cf7' },
};

/** The error the Arena never settles past: a house chart that is not the one its version (or its start) pinned. */
export class HouseChartDrift extends Error {
  readonly code = 'HOUSE_CHART_DRIFT';
  constructor(detail: string) { super(`[FEL-HOUSE-SONG] ${detail}`); this.name = 'HouseChartDrift'; }
}

/** A house-song version this build can build (a key of HOUSE_CHART_PRINTS). */
export function isHouseSongVersion(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && Object.prototype.hasOwnProperty.call(HOUSE_CHART_PRINTS, v);
}

/** The songs a version picks from, in pick order: FEL_SONG_IDS' order, only the ones its row pins. */
export function houseSongChoicesFor(v: number = HOUSE_SONG_VERSION): readonly { songId: string; difficulty: SongDifficulty }[] {
  if (!isHouseSongVersion(v)) throw new HouseChartDrift(`house-song version ${String(v)} is not one this build can build`);
  const row = HOUSE_CHART_PRINTS[v];
  return FEL_SONG_IDS.filter((id) => id in row).map((songId) => ({ songId, difficulty: songFor(songId)!.difficulty }));
}

/**
 * Every house song: one of the six FEL songs (never a player's own), at ITS difficulty. The authored charts are one per
 * song, easy → hard (chart.ts DIFFICULTY_RULES by the song's own 1..6 difficulty, map.json), so picking the song picks the
 * difficulty — the room shows none, and nothing here takes one: that is the lock. (The current version's list.)
 */
export const HOUSE_SONG_CHOICES: readonly { songId: string; difficulty: SongDifficulty }[] = houseSongChoicesFor(HOUSE_SONG_VERSION);

/** The score of a flawless Arena dance set, on every house song: 100.00 % accuracy in hundredths of a percent. */
export const DANCE_ARENA_SCALE = 10_000;
/** The count-in before beat 0, in beats (the room's one bar of four clicks: DanceMode update(), `startAt = now + bd × 4`). */
export const HOUSE_SONG_COUNT_IN_BEATS = 4;
/** The most presses a finished attempt may carry — far past any hand (≈ 20 a second over the longest song). */
export const DANCE_MAX_PRESSES = 2_048;
/** An input's name as the room hands it to DancePerformance.hit(now, { key }) — short and plain. */
export const HOUSE_PRESS_KEY = /^[A-Za-z0-9_:.-]{1,24}$/;

/**
 * What the room says BEFORE the count-in (the rule P6 set for music, decision #29), and what the Arena lobby says about a
 * dance duel before anything is staked.
 */
export const DANCE_ARENA_RULES =
  'Both dancers get the same house song and chart, set by the match — no pick, difficulty locked. Scored on accuracy (10,000 = every step PERFECT). ONE attempt: it is used the moment you press START (a one-bar count-in follows), and leaving or reloading after that scores 0. No pause: the song runs to its end.';
// MUSIC-SUITE P9 FIX PASS (2026-09-29): "No pause" — owner decision #40 ("everything else as P6 built it") carries P6's
// Arena rule (StudioMode.tsx: "An Arena set runs to its end — there is no pause") to the Cypher. It did not: START or a
// hidden tab paused the song clock and the resume counted back in ONE BAR BEFORE the pause point, reopening presses
// MISS_AFTER before it — and the recorded times are song-clock times, which leave the pause out, so the rejudge could not
// tell a paused set from a clean one. Measured with the real SongClock, DancePerformance and judgeDanceSet on CANALS at
// 120 Hz: a dancer 150 ms late on every step scores 4,145; the same dancer pausing just after each beat (the step still
// pending), waiting and pressing on the replayed beat scores 10,000. An Arena run's song now never holds
// (danceRoomFlow.holdAction's `arena`): a pause passes every step it covers as a MISS, like any step left unpressed.

export interface HouseSong {
  v: number;
  seed: string;
  /** One of the six FEL songs (felSongs.ts FEL_SONG_IDS). */
  songId: string;
  /** Its own difficulty, 1..6 (felSongs FelSong.difficulty) — locked with the song. */
  difficulty: SongDifficulty;
  bpm: number;
}

/**
 * One recorded input: its heard time in ms from beat 0 (see TIME BASE above); the input's name (`key`, what the room
 * passed to hit() / release()); for a press, the move its button picked (`move`, a DANCE_LIBRARY clip id — read only on
 * a freestyle slot); `up` = a release (it ends a press hold held by the same key). A press has no `up`.
 */
export interface HousePress { tMs: number; key?: string; move?: string; up?: true }

/**
 * THE house song of a duel. `seed` is the match id. Same seed → the same song (and so its chart and difficulty), on the
 * client and on the server, call after call; nothing the room does can change it. `v` (MUSIC-SUITE P9 FIX PASS) is the
 * house-song version — the current one for a new attempt, the one its START recorded for an attempt already danced (see
 * HOUSE_CHART_PRINTS): a song, never a difficulty or a tempo, is what the match id picks, from that version's own list.
 */
export function houseSongFor(seed: string, v: number = HOUSE_SONG_VERSION): HouseSong {
  const s = String(seed ?? '');
  const choices = houseSongChoicesFor(v);
  const r = seededHouseRng(`fel-house-song:v${v}:${s}`);
  const c = choices[r() % choices.length];
  return { v, seed: s, songId: c.songId, difficulty: c.difficulty, bpm: songFor(c.songId)!.bpm };
}

/** The FEL song behind a house song. */
export function houseSongOf(h: Pick<HouseSong, 'songId'>): FelSong {
  const song = songFor(h.songId);
  if (!song) throw new Error(`houseSong: "${h.songId}" is not one of the six FEL songs`);
  return song;
}

/** The shipped track the room loads for it (the same entry the pick screen would show — DANCE_TRACKS, never allTracks()). */
export function houseSongTrack(h: Pick<HouseSong, 'songId'>): DanceTrack {
  const t = DANCE_TRACKS.find((x) => x.id === h.songId);
  if (!t) throw new Error(`houseSong: no shipped track for "${h.songId}"`);
  return t;
}

/**
 * The chart both dancers of the duel dance, and the one the rejudge judges: the song's AUTHORED chart (chart.ts
 * chartStepsFor — validated, a fresh copy every call), or, only if that chart failed validation (chart.test.ts fails
 * first; chartStepsFor shouts it at runtime), the song's generated steps (danceTracks.stepsForSong) — the same fallback
 * danceTracks.stepsFor makes for free play, taken here directly so a player's own export can never answer a house song.
 * Both sides call this one function, so the room and the server always judge the same steps.
 */
export function houseSongSteps(h: Pick<HouseSong, 'songId'>): DanceStep[] {
  const song = houseSongOf(h);
  return chartStepsFor(song) ?? stepsForSong(song).map((s) => ({ ...s }));
}

/**
 * A fingerprint of a chart (FNV-1a over every field the judge reads, in order): what a start event records, so an audit
 * can tell which chart an attempt was danced to — and see it if a chart edit ever reaches a duel without a
 * HOUSE_SONG_VERSION bump (the rule above). Stable across calls and engines (integer ops only).
 */
export function houseChartPrint(steps: readonly DanceStep[]): string {
  let hsh = 0x811c9dc5;
  const text = steps.map((s) => [s.beat, s.holdBeats, s.clipId, s.mirrored ? 1 : 0, s.pressHoldBeats ?? '', s.pressFree ? 1 : 0, s.pressKind ?? ''].join(',')).join(';');
  for (let i = 0; i < text.length; i++) { hsh ^= text.charCodeAt(i); hsh = Math.imul(hsh, 0x01000193) >>> 0; }
  return (hsh >>> 0).toString(16).padStart(8, '0');
}

/** MUSIC-SUITE P9 FIX PASS: memo of assertHouseChart's check (a chart cannot change inside one running build). */
const checkedCharts = new Map<string, string | null>();

/**
 * MUSIC-SUITE P9 FIX PASS (2026-09-29): the house song's chart IS the one HOUSE_CHART_PRINTS pins for its version, or
 * this throws HouseChartDrift. The Arena's dance rows (lib/arena-music.ts HOUSE_SET_RULES.dance) call it before they
 * start, parse or judge anything, so an edited chart that reached a build without a version bump refuses loudly instead of
 * re-charting a duel. Never called at import (the free-play ceiling table builds from the same charts at load — a throw
 * there would take every session post down with it).
 */
export function assertHouseChart(h: Pick<HouseSong, 'songId'> & { v?: number }): void {
  const v = h.v ?? HOUSE_SONG_VERSION;
  const key = `${v}:${h.songId}`;
  let problem = checkedCharts.get(key);
  if (problem === undefined) {
    const want = isHouseSongVersion(v) ? HOUSE_CHART_PRINTS[v][h.songId] : undefined;
    const got = houseChartPrint(houseSongSteps(h));
    problem = !want ? `"${h.songId}" is not a house song of version ${v}`
      : got !== want ? `the "${h.songId}" chart is ${got}, but house-song v${v} pins ${want} — a chart edit must ship as a new HOUSE_SONG_VERSION` : null;
    checkedCharts.set(key, problem);
  }
  if (problem) throw new HouseChartDrift(problem);
}

/** Does a recorded chart fingerprint (a start event's `chart`) match what this song builds? Absent = not recorded (true). */
export function houseChartMatches(h: Pick<HouseSong, 'songId'>, recorded: unknown): boolean {
  if (recorded === undefined || recorded === null) return true;
  return recorded === houseChartPrint(houseSongSteps(h));
}

/** What a start event records of the song (the audit trail: which song and chart the attempt was danced to). */
export function houseSongSummary(h: HouseSong): { v: number; songId: string; difficulty: number; bpm: number; steps: number; chart: string } {
  const steps = houseSongSteps(h);
  return { v: h.v, songId: h.songId, difficulty: h.difficulty, bpm: h.bpm, steps: steps.length, chart: houseChartPrint(steps) };
}

/**
 * Beats in the chart exactly as DancePerformance.totalBeats counts them: the LAST step (in beat order, the stable sort
 * setRoutine makes) plus its clip — not the furthest-reaching clip, which on an authored chart can be an earlier windmill
 * followed by accents inside it. The room ends a beat after this (DanceMode update()), so the rejudge must too.
 */
export function houseChartBeats(steps: readonly DanceStep[]): number {
  if (steps.length === 0) return 0;
  const last = [...steps].sort((a, b) => a.beat - b.beat)[steps.length - 1];
  return last.beat + last.holdBeats;
}

/** The count-in's length in ms (before beat 0). */
export function houseSongCountInMs(h: Pick<HouseSong, 'bpm'>): number { return HOUSE_SONG_COUNT_IN_BEATS * beatDuration(h.bpm) * 1000; }
/**
 * Where the set ends, in seconds from beat 0: one beat after the chart's last step and its clip (DanceMode update(): the
 * room finishes when `songBeat > perf.totalBeats + 1`, so a final PERFECT is never cut off by the results screen).
 */
export function houseSongEndSec(h: Pick<HouseSong, 'songId' | 'bpm'>): number {
  return (houseChartBeats(houseSongSteps(h)) + 1) * beatDuration(h.bpm);
}
/** The set's length in ms, beat 0 to its end. */
export function houseSongSetMs(h: Pick<HouseSong, 'songId' | 'bpm'>): number { return houseSongEndSec(h) * 1000; }
/**
 * The soonest a finish may arrive after its start: 90 % of the set itself (the start is posted before the count-in; 10 %
 * is room for a start request that landed late — houseBeat.ts houseMinFinishMs, the same rule). Sooner was not danced.
 */
export function houseSongMinFinishMs(h: Pick<HouseSong, 'songId' | 'bpm'>): number { return 0.9 * houseSongSetMs(h); }

/**
 * Is a press at `tMs` one the judge hears? The room feeds its judge a count-in press only inside beat 0's early window
 * (danceRoomFlow.countInTapReaches: heard ≥ beat 0 − MISS_AFTER) and nothing after the set has ended, so the rejudge
 * hears exactly those: an earlier count-in press (counting along with the clicks) costs nothing, as it costs nothing live.
 */
export function housePressJudged(h: Pick<HouseSong, 'songId' | 'bpm'>, tMs: number, endSec: number = houseSongEndSec(h)): boolean {
  const sec = tMs / 1000;
  return Number.isFinite(sec) && sec >= -MISS_AFTER && sec <= endSec;
}

/**
 * An input as the room records it: heard seconds from beat 0 → ms, unrounded (see TIME BASE above; what is posted is
 * judged), with the input's name, the picked move and `up` for a release — each only when it is one the list may carry
 * (parseDancePresses).
 */
export function dancePress(heardSecFromBeat0: number, o: { key?: string | null; move?: string | null; up?: boolean } = {}): HousePress {
  const p: HousePress = { tMs: heardSecFromBeat0 * 1000 };
  if (typeof o.key === 'string' && HOUSE_PRESS_KEY.test(o.key)) p.key = o.key;
  if (!o.up && typeof o.move === 'string' && CLIP_IDS.has(o.move)) p.move = o.move;
  if (o.up) p.up = true;
  return p;
}
const CLIP_IDS: ReadonlySet<string> = new Set(DANCE_LIBRARY.map((c) => c.id));

/** The accuracy weights, in hundredths, by judgement: DanceCore.accuracyOf's (1, 0.75, 0.4, 0) — the test holds them equal. */
export const DANCE_ACCURACY_WEIGHTS: Readonly<Record<Judgement, number>> = { PERFECT: 100, GREAT: 75, GOOD: 40, MISS: 0 };

/**
 * THE ARENA DANCE SCORE: DanceCore.accuracyOf's weighted accuracy (DANCE_ACCURACY_WEIGHTS) in hundredths of a percent,
 * 0..DANCE_ARENA_SCALE. Integer arithmetic, so the client and the server round the same counts to the same number (0.4
 * has no exact binary form; 40 does).
 */
export function danceArenaScore(counts: Readonly<Record<Judgement, number>>): number {
  const w = DANCE_ACCURACY_WEIGHTS;
  const judged = counts.PERFECT + counts.GREAT + counts.GOOD + counts.MISS;
  if (judged <= 0) return 0;
  const weighted = counts.PERFECT * w.PERFECT + counts.GREAT * w.GREAT + counts.GOOD * w.GOOD + counts.MISS * w.MISS;
  return Math.round((weighted * DANCE_ARENA_SCALE) / (judged * 100));
}

/** The most a house song's set can score: every step PERFECT — DANCE_ARENA_SCALE on every song. */
export function houseSongMax(_h?: Pick<HouseSong, 'songId'>): number { return DANCE_ARENA_SCALE; }

/** What the rejudge makes of a set: DancePerformance's own result, the Arena score, and the steps it was judged on. */
export interface DanceSetVerdict extends DanceResult {
  /** danceArenaScore(counts): the score a duel settles on. */
  score: number;
  /** DancePerformance's points total (PERFECT 300 + combo × 5, a freestyle slot × its variety…): shown in free play,
   *  never settled on in the Arena. */
  points: number;
  steps: number;
  /** Presses (not releases) the judge heard (housePressJudged). */
  judgedPresses: number;
}

/** expire() runs this long after a window closes (DancePerformance's cutoff is strict: `time < now − MISS_AFTER`). */
const CLOSE_EPS_S = 1e-6;

/**
 * THE JUDGE of an Arena dance set: `presses` driven through DancePerformance on the house chart — started at 0 (beat 0);
 * each step's time handed to update() as it comes due and again the instant its window closes, and each press hold's end
 * (its charted time + pressHoldBeats) handed to update() too (so an unanswered step is a MISS, and a hold still down is
 * KEPT, at that instant whatever the frame rate — see "Accuracy is also the number the frame rate cannot move" above);
 * every judged press to hit(t, { key, move }) and every release to release(t, key) at its time; and update() once more at
 * the set's end. Events in time order: a due step, then presses and releases in the list's own order, then an expiry or
 * a hold's end. The same function runs in the room when the set ends and on the server at submit; its `score` is the
 * one that must be submitted.
 */
export function judgeDanceSet(h: Pick<HouseSong, 'songId' | 'bpm'>, presses: readonly HousePress[]): DanceSetVerdict {
  const steps = houseSongSteps(h);
  const bd = beatDuration(h.bpm);
  const endSec = (houseChartBeats(steps) + 1) * bd;
  const perf = new DancePerformance(h.bpm);
  perf.setRoutine(steps);
  perf.start(0);
  const ev: { at: number; kind: 0 | 1 | 2; p?: HousePress }[] = [];
  for (const s of steps) {
    ev.push({ at: s.beat * bd, kind: 0 }, { at: s.beat * bd + MISS_AFTER + CLOSE_EPS_S, kind: 2 });
    if (isPressHold(s)) ev.push({ at: (s.beat + s.pressHoldBeats!) * bd + CLOSE_EPS_S, kind: 2 });
  }
  let judgedPresses = 0;
  for (const p of presses) {
    if (!housePressJudged(h, p.tMs, endSec)) continue;
    if (!p.up) judgedPresses++;
    ev.push({ at: p.tMs / 1000, kind: 1, p });
  }
  ev.sort((a, b) => a.at - b.at || a.kind - b.kind);
  for (const e of ev) {
    if (e.kind !== 1) { perf.update(e.at); continue; }
    const p = e.p!;
    if (p.up) perf.release(e.at, p.key);
    else perf.hit(e.at, p.key !== undefined || p.move !== undefined ? { ...(p.key !== undefined ? { key: p.key } : {}), ...(p.move !== undefined ? { move: p.move } : {}) } : undefined);
  }
  perf.update(endSec);
  perf.stop();
  const r = perf.result();
  return { ...r, score: danceArenaScore(r.counts), points: r.score, steps: steps.length, judgedPresses };
}

export type DancePressRefusal = 'PRESSES_INVALID' | 'TOO_MANY_PRESSES';

/**
 * The list a finished attempt posts, checked: an array of at most DANCE_MAX_PRESSES { tMs, key?, move?, up? } with a
 * finite time inside [count-in − 1 s, set end + 1 s], a plain input name, a move that is a DANCE_LIBRARY clip (never on a
 * release) and `up` only as `true`. Returns the list as it will be stored and judged — only those fields, in the order
 * given (the judge sorts by time; a stable sort keeps equal times in this order). Anything else is refused whole: a list
 * the server changed would no longer be the list the room scored.
 */
export function parseDancePresses(
  h: Pick<HouseSong, 'songId' | 'bpm'>, raw: unknown,
): { ok: true; presses: HousePress[] } | { ok: false; code: DancePressRefusal; detail: string } {
  if (!Array.isArray(raw)) return { ok: false, code: 'PRESSES_INVALID', detail: 'taps must be a list of { tMs }.' };
  if (raw.length > DANCE_MAX_PRESSES) return { ok: false, code: 'TOO_MANY_PRESSES', detail: `${raw.length} presses; a set records at most ${DANCE_MAX_PRESSES}.` };
  const lo = -houseSongCountInMs(h) - 1000, hi = houseSongSetMs(h) + 1000;
  const presses: HousePress[] = [];
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i] as { tMs?: unknown; key?: unknown; move?: unknown; up?: unknown } | null;
    const o = p && typeof p === 'object' ? p : null;
    const bad = (why: string) => ({ ok: false as const, code: 'PRESSES_INVALID' as const, detail: `Press ${i + 1} ${why}.` });
    if (!o || typeof o.tMs !== 'number' || !Number.isFinite(o.tMs) || o.tMs < lo || o.tMs > hi) return bad('is not a time inside the set');
    if (o.key !== undefined && !(typeof o.key === 'string' && HOUSE_PRESS_KEY.test(o.key))) return bad('names no input');
    if (o.up !== undefined && o.up !== true) return bad('is neither a press nor a release');
    if (o.move !== undefined && (o.up === true || typeof o.move !== 'string' || !CLIP_IDS.has(o.move))) return bad('names no move');
    const out: HousePress = { tMs: o.tMs };
    if (o.key !== undefined) out.key = o.key as string;
    if (o.move !== undefined) out.move = o.move as string;
    if (o.up === true) out.up = true;
    presses.push(out);
  }
  return { ok: true, presses };
}

/** Is every step of this chart a press step (no body target)? A house chart must be (houseSong.test.ts). */
export function isPressChart(steps: readonly DanceStep[]): boolean {
  return steps.every((s) => !isBodyStep(s));
}

// ── the rejudge's limit, recorded (lib/arena-music.ts musicTapPlausibility's twin) ──────────────────────────────────
/** Hits read before a set's timing is judged at all, and the spread under which it is machine-exact. TUNE(elijah). */
export const DANCE_PLAUSIBILITY_MIN_HITS = 20;
export const DANCE_PLAUSIBILITY_MIN_SPREAD_MS = 3;
/**
 * How machine-exact a finished set's timing is: every press within MISS_AFTER of a chart step is a hit here, and its
 * signed error's standard deviation is the spread. A list built from the chart (houseSongSteps ships in the client) has a
 * spread of ~0; a human's is tens of ms. Recorded for review in the SCORE_SUBMITTED event; nothing is refused on it.
 */
export function dancePressPlausibility(h: Pick<HouseSong, 'songId' | 'bpm'>, presses: readonly HousePress[]): { hits: number; spreadMs: number | null; flagged: boolean } {
  const bd = beatDuration(h.bpm);
  const times = houseSongSteps(h).map((s) => s.beat * bd * 1000);
  const errs: number[] = [];
  for (const p of presses) {
    if (p.up) continue;   // a release is not aimed at a step
    let best = Infinity;
    for (const at of times) { const e = p.tMs - at; if (Math.abs(e) < Math.abs(best)) best = e; }
    if (Math.abs(best) <= MISS_AFTER * 1000) errs.push(best);
  }
  if (!errs.length) return { hits: 0, spreadMs: null, flagged: false };
  const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
  const spreadMs = Math.sqrt(errs.reduce((a, e) => a + (e - mean) ** 2, 0) / errs.length);
  return {
    hits: errs.length, spreadMs: Math.round(spreadMs * 100) / 100,
    flagged: errs.length >= DANCE_PLAUSIBILITY_MIN_HITS && spreadMs < DANCE_PLAUSIBILITY_MIN_SPREAD_MS,
  };
}

// ── MUSIC-SUITE P9 FIX PASS (2026-09-29): a replayed press list, recorded (review, minor) ────────────────────────────
/**
 * A press list's fingerprint: FNV-1a over every entry (time rounded to 1 ms, key, move, release), in order. What a dance
 * finish records beside its songId. A music tap list cannot be replayed into a later duel (houseBeatFor(matchId) is a new
 * beat every match), but a dance duel shares its song with one duel in six, and nothing in a press list is tied to its
 * match: a player's own lucky run on a song could be posted verbatim as the finish of every later duel on that song, and
 * dancePressPlausibility (which flags only machine-exact timing) never sees a human list. Pure; stable across engines.
 */
export function dancePressPrint(presses: readonly HousePress[]): string {
  let hsh = 0x811c9dc5;
  const text = presses.map((p) => `${Math.round(p.tMs)},${p.key ?? ''},${p.move ?? ''},${p.up ? 1 : 0}`).join(';');
  for (let i = 0; i < text.length; i++) { hsh ^= text.charCodeAt(i); hsh = Math.imul(hsh, 0x01000193) >>> 0; }
  return (hsh >>> 0).toString(16).padStart(8, '0');
}

/**
 * Which earlier finish (by the same player, on the same song) this list repeats exactly, or null. `prior` = that player's
 * earlier dance finishes as { matchId, songId, print } (their payloads). Recorded for review in the finish and logged —
 * never refused (decision #40: machine-looking lists are logged only, reviewed after a week; a replay is the same kind of
 * thing). An empty list (a set left unplayed) repeats nothing worth a flag.
 */
export function danceReplayOf(
  songId: string, print: string, presses: number, prior: readonly { matchId?: unknown; songId?: unknown; print?: unknown }[],
): string | null {
  if (presses === 0) return null;
  const hit = prior.find((p) => p.songId === songId && p.print === print && typeof p.matchId === 'string');
  return hit ? (hit.matchId as string) : null;
}
