// MUSIC-SUITE P9 (2026-09-29): the Arena's house song and its judge (lib/babylon/dance/houseSong.ts). Owner decision #10:
// "Arena dance (fixed): same house song for both players, accuracy-based score; own songs free play only". Proven here:
// the song is a pure function of the match id (repeat calls, a JSON round trip — the wire the client and the server
// share); different matches spread over all six FEL songs, each at its own difficulty; a house song is only ever an FEL
// song on its authored chart (never the player's own export); every house chart is press-only; the score is accuracy on
// one 10,000 scale for every song (a flawless set is 10,000 wherever it is danced), the judge is the room's own
// DancePerformance (press holds and freestyle picks replayed), and the room's frame-driven judge and this rejudge agree
// exactly; a masher loses to the 5,000 baseline and an honest beginner beats it; the press list is checked whole.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  houseSongFor, houseSongSteps, houseSongTrack, houseSongSummary, houseSongOf, judgeDanceSet, danceArenaScore, dancePress,
  parseDancePresses, housePressJudged, houseSongEndSec, houseSongSetMs, houseSongCountInMs, houseSongMinFinishMs, houseChartBeats,
  houseSongMax, isPressChart, dancePressPlausibility, houseChartPrint,
  HOUSE_SONG_VERSION, HOUSE_SONG_CHOICES, DANCE_ARENA_SCALE, DANCE_MAX_PRESSES, DANCE_ACCURACY_WEIGHTS,
  HOUSE_SONG_COUNT_IN_BEATS, DANCE_ARENA_RULES, DANCE_PLAUSIBILITY_MIN_HITS,
  HOUSE_CHART_PRINTS, HouseChartDrift, assertHouseChart, houseChartMatches, houseSongChoicesFor, isHouseSongVersion,
  dancePressPrint, danceReplayOf,
  type HouseSong, type HousePress,
} from './houseSong';
import { DancePerformance, accuracyOf, beatDuration, isPressHold, isFreeSlot, MISS_AFTER, type Judgement } from '../core/DanceCore';
import { DANCE_TRACKS, stepsForSong } from '../core/danceTracks';
import { chartStepsFor, FREESTYLE_PAD } from './chart';
import { FEL_SONG_IDS, FEL_SONGS, songFor } from './felSongs';

const SEEDS = Array.from({ length: 600 }, (_, i) => (i % 3 === 0 ? `cm${(i * 7919).toString(36)}x${i}` : i % 3 === 1 ? `m-${i}` : `legacy-${i}-seed`));
const PAD_MOVES: readonly string[] = Object.values(FREESTYLE_PAD);

/** A deterministic LCG for the tests' players (never Math.random: a failure must replay). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 0x100000000; };
}
const gauss = (r: () => number): number => { let u = 0; for (let i = 0; i < 6; i++) u += r(); return (u - 3) / Math.sqrt(0.5); };
const houseOn = (songId: string): HouseSong => houseSongFor(SEEDS.find((s) => houseSongFor(s).songId === songId)!);
const stepTimes = (h: HouseSong): number[] => { const bd = beatDuration(h.bpm); return houseSongSteps(h).map((s) => s.beat * bd); };

/**
 * A dancer who presses every step `sd` seconds off (Gaussian), skipping a share of them, on key A, cycling the four pad
 * moves on freestyle slots, and letting go 80 ms later — or, on a press hold, at its end (`keepHolds`) or 100 ms in.
 */
function dancer(h: HouseSong, o: { sd?: number; skip?: number; keepHolds?: boolean; seed?: number; oneMove?: boolean } = {}): HousePress[] {
  const r = lcg(o.seed ?? 7);
  const bd = beatDuration(h.bpm);
  const out: HousePress[] = [];
  let k = 0;
  for (const s of houseSongSteps(h)) {
    if (r() < (o.skip ?? 0)) continue;
    const t = s.beat * bd + gauss(r) * (o.sd ?? 0);
    out.push(dancePress(t, { key: 'A', move: isFreeSlot(s) ? (o.oneMove ? PAD_MOVES[0] : PAD_MOVES[k++ % 4]) : undefined }));
    const up = isPressHold(s) ? ((o.keepHolds ?? true) ? (s.beat + s.pressHoldBeats!) * bd + 0.02 : t + 0.1) : t + 0.08;
    out.push(dancePress(up, { key: 'A', up: true }));
  }
  return out.sort((a, b) => a.tMs - b.tMs);
}
const perfect = (h: HouseSong): HousePress[] => dancer(h);

describe('houseSongFor: the song is the match id, and nothing else', () => {
  it('takes one argument — there is no song, difficulty or tempo to pass in', () => {
    expect(houseSongFor.length).toBe(1);
  });

  it('the same seed picks the identical song on repeated calls', () => {
    for (const seed of SEEDS.slice(0, 60)) expect(houseSongFor(seed), seed).toEqual(houseSongFor(seed));
  });

  it('survives a JSON round trip unchanged, and the judge reads the round-tripped song and presses to the same result', () => {
    for (const seed of SEEDS.slice(0, 24)) {
      const h = houseSongFor(seed);
      const wire = JSON.parse(JSON.stringify(h)) as HouseSong;
      expect(wire, seed).toEqual(h);
      const presses = dancer(h, { sd: 0.1, skip: 0.2, seed: seed.length * 31 + 7 });
      expect(judgeDanceSet(wire, JSON.parse(JSON.stringify(presses))), seed).toEqual(judgeDanceSet(h, presses));
    }
  });

  it('different seeds spread over all six FEL songs (600 seeds: every song, none more than twice its share)', () => {
    const count = new Map<string, number>();
    for (const seed of SEEDS) { const id = houseSongFor(seed).songId; count.set(id, (count.get(id) ?? 0) + 1); }
    expect(new Set(count.keys())).toEqual(new Set(FEL_SONG_IDS));
    for (const [id, n] of count) {
      expect(n, id).toBeGreaterThan(SEEDS.length / FEL_SONG_IDS.length / 2);
      expect(n, id).toBeLessThan((SEEDS.length / FEL_SONG_IDS.length) * 2);
    }
    expect(new Set(['m-1', 'm-2', 'm-4', 'm-5', 'm-7'].map((s) => houseSongFor(s).songId)).size).toBeGreaterThan(1);
  });

  it('every house song is an FEL song at its own difficulty (easy → hard): picking the song locks the difficulty', () => {
    expect(HOUSE_SONG_CHOICES.map((c) => c.songId)).toEqual([...FEL_SONG_IDS]);
    for (const c of HOUSE_SONG_CHOICES) expect(c.difficulty, c.songId).toBe(songFor(c.songId)!.difficulty);
    for (const seed of SEEDS.slice(0, 100)) {
      const h = houseSongFor(seed);
      expect(FEL_SONG_IDS).toContain(h.songId);
      expect(h.difficulty).toBe(houseSongOf(h).difficulty);
      expect(h.v).toBe(HOUSE_SONG_VERSION);
      expect(h.seed).toBe(seed);
      expect(h.bpm).toBe(houseSongOf(h).bpm);
    }
  });

  it('OWN SONGS ARE FREE PLAY ONLY: the track is a shipped DANCE_TRACKS entry, never allTracks()\'s exported slot', () => {
    for (const c of HOUSE_SONG_CHOICES) {
      const t = houseSongTrack(c);
      expect(DANCE_TRACKS).toContain(t);
      expect(t.song?.id).toBe(c.songId);
    }
    expect(() => houseSongTrack({ songId: 'mine' })).toThrow();
    expect(() => houseSongSteps({ songId: 'mine' })).toThrow();
    // the code (not its comments) never reaches the exported slot
    const code = readFileSync(join(process.cwd(), 'lib/babylon/dance/houseSong.ts'), 'utf8').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/allTracks\(|readExportedTrack|stepsFor\(/);
    expect(code).toMatch(/chartStepsFor\(/);
  });
});

describe('the house charts', () => {
  it('each is the song\'s AUTHORED chart (chart.ts), press-only, sorted, with every hold ended before the next press', () => {
    for (const c of HOUSE_SONG_CHOICES) {
      const steps = houseSongSteps(c);
      const authored = chartStepsFor(c.songId);
      expect(authored, `${c.songId}: the authored chart must validate (chart.test.ts says why when it does not)`).not.toBeNull();
      expect(steps).toEqual(authored);
      expect(steps.length, c.songId).toBeGreaterThan(stepsForSong(FEL_SONGS.find((s) => s.id === c.songId)!).length);
      expect(isPressChart(steps), c.songId).toBe(true);
      for (let i = 1; i < steps.length; i++) expect(steps[i].beat, c.songId).toBeGreaterThanOrEqual(steps[i - 1].beat);
      for (let i = 0; i < steps.length - 1; i++) {
        if (isPressHold(steps[i])) expect(steps[i].beat + steps[i].pressHoldBeats!, c.songId).toBeLessThan(steps[i + 1].beat);
      }
    }
  });

  it('a fresh copy every call — a caller that sorts or edits it cannot change the next duel\'s chart', () => {
    const h = houseSongFor('m-9');
    const a = houseSongSteps(h);
    a[0].beat = 999;
    expect(houseSongSteps(h)[0].beat).not.toBe(999);
  });

  it('the summary names the song, difficulty, tempo, step count, chart fingerprint and version (what a start event records)', () => {
    const h = houseSongFor('cm-summary');
    expect(houseSongSummary(h)).toEqual({
      v: HOUSE_SONG_VERSION, songId: h.songId, difficulty: h.difficulty, bpm: h.bpm, steps: houseSongSteps(h).length, chart: houseChartPrint(houseSongSteps(h)),
    });
    // the fingerprint is the chart: stable, different per song, and moved by any field the judge reads
    const prints = HOUSE_SONG_CHOICES.map((c) => houseChartPrint(houseSongSteps(c)));
    expect(new Set(prints).size).toBe(HOUSE_SONG_CHOICES.length);
    expect(houseChartPrint(houseSongSteps(h))).toMatch(/^[0-9a-f]{8}$/);
    const steps = houseSongSteps(h);
    const edited = steps.map((s, i) => (i === steps.length - 1 ? { ...s, pressHoldBeats: (s.pressHoldBeats ?? 0) + 0.5 } : s));
    expect(houseChartPrint(edited)).not.toBe(houseChartPrint(steps));
    expect(houseChartPrint(steps.map((s, i) => (i === 0 ? { ...s, beat: s.beat + 0.25 } : s)))).not.toBe(houseChartPrint(steps));
  });

  it('the set ends one beat after the last step\'s clip (DanceMode: songBeat > totalBeats + 1); count-in = 4 beats', () => {
    for (const c of HOUSE_SONG_CHOICES) {
      const h = houseOn(c.songId);
      const perf = new DancePerformance(h.bpm);
      perf.setRoutine(houseSongSteps(h));
      expect(houseChartBeats(houseSongSteps(h))).toBe(perf.totalBeats);
      expect(houseSongEndSec(h)).toBeCloseTo((perf.totalBeats + 1) * beatDuration(h.bpm), 9);
      expect(houseSongSetMs(h)).toBeCloseTo(houseSongEndSec(h) * 1000, 6);
      expect(houseSongMinFinishMs(h)).toBeCloseTo(0.9 * houseSongSetMs(h), 6);
      expect(houseSongCountInMs(h)).toBeCloseTo(HOUSE_SONG_COUNT_IN_BEATS * beatDuration(h.bpm) * 1000, 6);
      // every house set is a real song's length: 55 s .. 2 min
      expect(houseSongSetMs(h) / 1000).toBeGreaterThan(55);
      expect(houseSongSetMs(h) / 1000).toBeLessThan(125);
    }
  });

  it('DanceMode reads nothing the rejudge does not: its end rule and count-in are the ones this file mirrors', () => {
    const room = readFileSync(join(process.cwd(), 'lib/babylon/modes/DanceMode.ts'), 'utf8');
    expect(room).toContain('if (songBeat > perf.totalBeats + 1) {');   // (the free-dance branch goes back to the pick screen; a judged run finishes)
    expect(room).toContain('startAt = now + bd * 4;');
  });
});

describe('the score is accuracy, on one scale for every song', () => {
  it('danceArenaScore = DanceCore.accuracyOf × 10,000, rounded (the weights are accuracyOf\'s)', () => {
    const r = lcg(99);
    for (let i = 0; i < 500; i++) {
      const c: Record<Judgement, number> = { PERFECT: Math.floor(r() * 60), GREAT: Math.floor(r() * 40), GOOD: Math.floor(r() * 40), MISS: Math.floor(r() * 80) };
      expect(danceArenaScore(c)).toBe(Math.round(accuracyOf(c) * DANCE_ARENA_SCALE));
    }
    for (const j of ['PERFECT', 'GREAT', 'GOOD', 'MISS'] as Judgement[]) {
      const one: Record<Judgement, number> = { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0, [j]: 1 };
      expect(DANCE_ACCURACY_WEIGHTS[j] / 100).toBe(accuracyOf(one));
    }
    expect(danceArenaScore({ PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 })).toBe(0);
  });

  it('a flawless set scores exactly 10,000 on every house song — whose points totals run from ~22,000 to ~174,000', () => {
    const points: number[] = [];
    for (const c of HOUSE_SONG_CHOICES) {
      const h = houseOn(c.songId);
      const v = judgeDanceSet(h, perfect(h));
      expect(v.score, c.songId).toBe(DANCE_ARENA_SCALE);
      expect(v.score).toBe(houseSongMax(h));
      const holds = houseSongSteps(h).filter(isPressHold).length;
      expect(v.counts, c.songId).toEqual({ PERFECT: v.steps + holds, GREAT: 0, GOOD: 0, MISS: 0 });
      // a hold still down at its end is kept without a release (the room's update() keeps it)
      expect(judgeDanceSet(h, stepTimes(h).map((t) => dancePress(t))).score, c.songId).toBe(DANCE_ARENA_SCALE);
      points.push(v.points);
    }
    // the reason for the accuracy scale: on points the song decided the duel
    expect(Math.max(...points) / Math.min(...points)).toBeGreaterThan(5);
  });

  it('no presses: every step and every hold tail a MISS, score 0; a set danced only in its first half scores about half', () => {
    for (const c of HOUSE_SONG_CHOICES) {
      const h = houseOn(c.songId);
      const none = judgeDanceSet(h, []);
      expect(none.score).toBe(0);
      expect(none.counts.MISS).toBe(none.steps + houseSongSteps(h).filter(isPressHold).length);
      const half = judgeDanceSet(h, perfect(h).filter((p) => p.tMs / 1000 < houseSongEndSec(h) / 2));
      expect(half.score).toBeGreaterThan(3000);
      expect(half.score).toBeLessThan(6500);
    }
  });

  it('a masher and a 16th-tapper lose to the 5,000 baseline on every song; honest dancers beat it', () => {
    for (const c of HOUSE_SONG_CHOICES) {
      const h = houseOn(c.songId);
      const end = houseSongEndSec(h);
      const bd = beatDuration(h.bpm);
      const r = lcg(c.songId.length * 97);
      const mash: HousePress[] = [];
      for (let t = 0; t < end; t += 0.125 + (r() - 0.5) * 0.05) mash.push(dancePress(t));
      const sixteenths = Array.from({ length: Math.floor((end / bd) * 4) }, (_, i) => dancePress((i * bd) / 4));
      expect(judgeDanceSet(h, mash).score, `${c.songId} masher`).toBeLessThan(1200);
      expect(judgeDanceSet(h, sixteenths).score, `${c.songId} every 16th`).toBeLessThan(1200);
      expect(judgeDanceSet(h, dancer(h, { sd: 0.03, seed: 11 })).score, `${c.songId} ±30 ms`).toBeGreaterThan(9000);
      expect(judgeDanceSet(h, dancer(h, { sd: 0.09, skip: 0.1, seed: 12 })).score, `${c.songId} ±90 ms, 10 % skipped`).toBeGreaterThan(5000);
    }
  });

  it('MEASURED, FLAGGED: one press on every beat (never reading the cue) is a grade-C set at best, far under a dancer', () => {
    // (outbox musicsuite/p9/fair-duels-proof.json has the per-song numbers: on the densest charts, whose notes sit mostly
    // on the beat, it lands around the 5,000 cold-start house — the owner's call, arena-rivals.ts ARENA_SCORE_BASELINES)
    for (const c of HOUSE_SONG_CHOICES) {
      const h = houseOn(c.songId);
      const bd = beatDuration(h.bpm);
      const beats = judgeDanceSet(h, Array.from({ length: Math.floor(houseSongEndSec(h) / bd) }, (_, i) => dancePress(i * bd))).score;
      expect(beats, c.songId).toBeLessThan(7000);
      expect(beats, c.songId).toBeLessThan(judgeDanceSet(h, dancer(h, { sd: 0.03, seed: 11 })).score - 2500);
    }
  });
});

describe('judgeDanceSet: the room\'s own judge, frame-rate proof, holds and freestyle replayed', () => {
  it('equals a frame-driven DancePerformance (the room\'s loop: update() each frame, hit()/release() between) at 30/60/144 Hz', () => {
    let runs = 0;
    for (const c of HOUSE_SONG_CHOICES) {
      for (const hz of [30, 60, 144]) {
        for (let k = 0; k < 8; k++) {
          const h = houseOn(c.songId);
          const r = lcg(hz * 1000 + k * 17 + c.songId.length);
          const presses = k % 4 === 0 ? dancer(h, { sd: 0.08, seed: k })
            : k % 4 === 1 ? (() => { const o: HousePress[] = []; for (let t = -0.3; t < houseSongEndSec(h) + 1; t += 0.1 + r() * 0.3) o.push(dancePress(t)); return o; })()
              : k % 4 === 2 ? dancer(h, { sd: 0.12, skip: 0.3, keepHolds: false, seed: k })
                : dancer(h, { sd: 0.05, skip: 0.1, oneMove: true, seed: k });
          const judged = judgeDanceSet(h, presses);
          const end = houseSongEndSec(h);
          const perf = new DancePerformance(h.bpm);
          perf.setRoutine(houseSongSteps(h));
          perf.start(0);
          const ps = presses.filter((p) => housePressJudged(h, p.tMs));
          const fire = (p: HousePress) => {
            const t = p.tMs / 1000;
            if (p.up) perf.release(t, p.key);
            else perf.hit(t, p.key !== undefined || p.move !== undefined ? { key: p.key, move: p.move } : undefined);
          };
          let pi = 0;
          for (let f = r() / hz; f <= end + 1 / hz; f += 1 / hz) {
            while (pi < ps.length && ps[pi].tMs / 1000 <= f) fire(ps[pi++]);
            if (f >= 0) perf.update(Math.min(f, end));
          }
          while (pi < ps.length) fire(ps[pi++]);
          perf.update(end);
          const live = perf.result();
          expect(live.counts, `${c.songId} ${hz} Hz #${k}`).toEqual(judged.counts);
          expect(danceArenaScore(live.counts)).toBe(judged.score);
          runs++;
        }
      }
    }
    expect(runs).toBe(HOUSE_SONG_CHOICES.length * 24);
  });

  it('a press hold let go early drops its tail (a MISS): the same timing, held, scores more', () => {
    for (const c of HOUSE_SONG_CHOICES) {
      const h = houseOn(c.songId);
      const holds = houseSongSteps(h).filter(isPressHold).length;
      expect(holds, c.songId).toBeGreaterThan(0);
      const kept = judgeDanceSet(h, dancer(h, { sd: 0.02, seed: 3 }));
      const dropped = judgeDanceSet(h, dancer(h, { sd: 0.02, seed: 3, keepHolds: false }));
      // let go 100 ms in: dropped, unless the hold is so short that 100 ms in is already inside its last 200 ms
      const long = houseSongSteps(h).filter((s) => isPressHold(s) && s.pressHoldBeats! * beatDuration(h.bpm) > MISS_AFTER + 0.1 + 0.03).length;
      expect(long, c.songId).toBeGreaterThan(0);
      expect(dropped.holds!.dropped, c.songId).toBeGreaterThanOrEqual(long);
      expect(dropped.holds!.kept + dropped.holds!.dropped, c.songId).toBe(holds);
      expect(kept.holds?.dropped ?? 0, c.songId).toBe(0);
      expect(dropped.score, c.songId).toBeLessThan(kept.score);
    }
  });

  it('a release by ANOTHER key does not end the hold (release(now, key)): the key is replayed as recorded', () => {
    const h = houseOn('battle');
    const holdStep = houseSongSteps(h).find(isPressHold)!;
    const bd = beatDuration(h.bpm);
    const base = perfect(h).filter((p) => !p.up);
    const t0 = holdStep.beat * bd;
    const otherKeyUp = [...base, dancePress(t0 + 0.05, { key: 'B', up: true })];
    const sameKeyUp = [...base, dancePress(t0 + 0.05, { key: 'A', up: true })];
    expect(judgeDanceSet(h, otherKeyUp).holds).toEqual({ kept: houseSongSteps(h).filter(isPressHold).length, dropped: 0 });
    expect(judgeDanceSet(h, sameKeyUp).holds?.dropped).toBe(1);
  });

  it('freestyle picks are replayed: variety moves the POINTS, never the Arena score (the judgement stays timing)', () => {
    for (const c of HOUSE_SONG_CHOICES) {
      const h = houseOn(c.songId);
      expect(houseSongSteps(h).some(isFreeSlot), c.songId).toBe(true);
      const varied = judgeDanceSet(h, dancer(h, { seed: 5 }));
      const same = judgeDanceSet(h, dancer(h, { seed: 5, oneMove: true }));
      expect(same.score).toBe(varied.score);
      expect(same.counts).toEqual(varied.counts);
      expect(same.points, c.songId).toBeLessThan(varied.points);
      expect(varied.variety).toBe(1);
      expect(same.variety!).toBeLessThan(0.5);
    }
  });

  it('hears a count-in press only inside beat 0\'s early window, and nothing after the set has ended', () => {
    const h = houseSongFor('m-count');
    expect(housePressJudged(h, -MISS_AFTER * 1000)).toBe(true);
    expect(housePressJudged(h, -MISS_AFTER * 1000 - 1)).toBe(false);
    expect(housePressJudged(h, houseSongEndSec(h) * 1000)).toBe(true);
    expect(housePressJudged(h, houseSongEndSec(h) * 1000 + 1)).toBe(false);
    expect(housePressJudged(h, Number.NaN)).toBe(false);
    // clapping along with the four count-in clicks costs nothing; the same presses inside the set would be wild MISSes
    const bd = beatDuration(h.bpm);
    const clicks = [-4, -3, -2, -1].map((b) => dancePress(b * bd));
    expect(judgeDanceSet(h, [...clicks, ...perfect(h)]).score).toBe(DANCE_ARENA_SCALE);
    expect(judgeDanceSet(h, [...clicks, ...perfect(h)]).judgedPresses).toBe(houseSongSteps(h).length);
  });

  it('dancePress keeps the time unrounded (a double survives JSON exactly) and only what the list may carry', () => {
    expect(dancePress(1.23456)).toEqual({ tMs: 1.23456 * 1000 });
    expect(JSON.parse(JSON.stringify(dancePress(1.23456789012345))).tMs).toBe(1.23456789012345 * 1000);
    expect(dancePress(1.5, { key: 'A', move: 'dance_wave_arm' })).toEqual({ tMs: 1500, key: 'A', move: 'dance_wave_arm' });
    expect(dancePress(1.5, { key: 'A', move: 'dance_wave_arm', up: true })).toEqual({ tMs: 1500, key: 'A', up: true });
    expect(dancePress(1, { key: 'no spaces', move: 'not_a_clip' })).toEqual({ tMs: 1000 });
  });
});

describe('parseDancePresses: the list a finish posts, checked whole', () => {
  const h = houseSongFor('m-parse');
  it('keeps { tMs, key?, move?, up? } in order and nothing else', () => {
    const p = parseDancePresses(h, [{ tMs: 10, extra: 'x' }, { tMs: -100, key: 'X', move: 'dance_wave_arm' }, { tMs: 5.5, key: 'X', up: true }]);
    expect(p).toEqual({ ok: true, presses: [{ tMs: 10 }, { tMs: -100, key: 'X', move: 'dance_wave_arm' }, { tMs: 5.5, key: 'X', up: true }] });
  });
  it('refuses a list that is not one, too long, a bad time, a bad key, a bad move or a bad release flag', () => {
    expect(parseDancePresses(h, 'nope')).toMatchObject({ ok: false, code: 'PRESSES_INVALID' });
    expect(parseDancePresses(h, Array.from({ length: DANCE_MAX_PRESSES + 1 }, () => ({ tMs: 1 })))).toMatchObject({ ok: false, code: 'TOO_MANY_PRESSES' });
    for (const bad of [
      { tMs: 'x' }, { tMs: Number.POSITIVE_INFINITY }, { tMs: houseSongSetMs(h) + 1001 }, { tMs: -houseSongCountInMs(h) - 1001 },
      { tMs: 1, key: '' }, { tMs: 1, key: 'has space' }, { tMs: 1, key: 7 }, { tMs: 1, move: 'dance_moonwalk_nope' },
      { tMs: 1, move: 3 }, { tMs: 1, up: false }, { tMs: 1, up: 'yes' }, { tMs: 1, up: true, move: 'dance_wave_arm' }, null,
    ]) expect(parseDancePresses(h, [bad]), JSON.stringify(bad)).toMatchObject({ ok: false, code: 'PRESSES_INVALID' });
    expect(parseDancePresses(h, [])).toEqual({ ok: true, presses: [] });
  });
});

describe('the rules line and the plausibility read', () => {
  it('says ONE attempt, used at START, the same song for both, accuracy, difficulty locked', () => {
    expect(DANCE_ARENA_RULES).toMatch(/same house song/);
    expect(DANCE_ARENA_RULES).toMatch(/ONE attempt/);
    expect(DANCE_ARENA_RULES).toMatch(/START/);
    expect(DANCE_ARENA_RULES).toMatch(/accuracy/);
    expect(DANCE_ARENA_RULES).toMatch(/difficulty locked/);
  });
  it('flags a list built from the chart and not a human one; releases are not read; records, never refuses', () => {
    const h = houseOn('evolution');
    const bot = dancePressPlausibility(h, perfect(h));
    expect(bot.flagged).toBe(true);
    expect(bot.spreadMs).toBe(0);
    expect(bot.hits).toBe(houseSongSteps(h).length);
    expect(houseSongSteps(h).length).toBeGreaterThanOrEqual(DANCE_PLAUSIBILITY_MIN_HITS);
    expect(dancePressPlausibility(h, dancer(h, { sd: 0.03, seed: 5 })).flagged).toBe(false);
    expect(dancePressPlausibility(h, [])).toEqual({ hits: 0, spreadMs: null, flagged: false });
  });
});

// ── MUSIC-SUITE P9 FIX PASS (2026-09-29) ─────────────────────────────────────────────────────────────────────────────
describe('P9 FIX PASS: a version IS its charts — pinned, carried, checked', () => {
  // THE PIN. Any edit to a house chart, a song's tempo, or the song list fails HERE until it ships as a NEW
  // HOUSE_SONG_VERSION (with v1's charts kept buildable beside it): a duel in flight is judged on the version its start
  // recorded (lib/arena-music.ts), so v1 must never change under it.
  it(`v${HOUSE_SONG_VERSION}: the six songs, in pick order, their tempi, step counts and chart prints`, () => {
    expect(HOUSE_SONG_VERSION).toBe(1);
    const live = HOUSE_SONG_CHOICES.map((c) => {
      const steps = houseSongSteps(c);
      return [c.songId, c.difficulty, songFor(c.songId)!.bpm, steps.length, houseChartPrint(steps)];
    });
    expect(live).toEqual([
      ['warmup', 1, 88, 49, '7baab3a9'],
      ['cypher', 2, 96, 80, 'a753eee3'],
      ['goldenhour', 3, 104, 106, '54f4d0ce'],
      ['battle', 4, 112, 135, '24f9d722'],
      ['canals', 5, 118, 173, 'b3c20628'],
      ['evolution', 6, 126, 205, '59589cf7'],
    ]);
    expect(HOUSE_CHART_PRINTS[1]).toEqual(Object.fromEntries(live.map((r) => [r[0], r[4]])));
    expect(houseSongChoicesFor(1)).toEqual(HOUSE_SONG_CHOICES);
    for (const c of HOUSE_SONG_CHOICES) expect(() => assertHouseChart({ songId: c.songId, v: 1 }), c.songId).not.toThrow();
  });

  it('every pinned version is buildable, and an unknown one refuses loudly rather than pick', () => {
    for (const v of Object.keys(HOUSE_CHART_PRINTS).map(Number)) {
      expect(isHouseSongVersion(v)).toBe(true);
      expect(houseSongChoicesFor(v).length).toBeGreaterThan(0);
    }
    expect(isHouseSongVersion(2)).toBe(false);
    expect(isHouseSongVersion('1')).toBe(false);
    expect(() => houseSongFor('m-1', 2)).toThrow(HouseChartDrift);
    expect(() => assertHouseChart({ songId: 'warmup', v: 2 })).toThrow(HouseChartDrift);
    expect(() => assertHouseChart({ songId: 'mine', v: 1 })).toThrow();
  });

  it('houseSongFor(id, v): the recorded version picks — the current one by default, the same song for the same id', () => {
    for (const seed of SEEDS.slice(0, 40)) expect(houseSongFor(seed, HOUSE_SONG_VERSION)).toEqual(houseSongFor(seed));
    expect(houseSongFor('m-9').v).toBe(HOUSE_SONG_VERSION);
  });

  it('houseChartMatches: a start\'s recorded print is this song\'s, or refused; an unrecorded one is not checked', () => {
    const h = houseOn('canals');
    expect(houseChartMatches(h, houseChartPrint(houseSongSteps(h)))).toBe(true);
    expect(houseChartMatches(h, 'ac64fdc9')).toBe(false);          // canals' print before the fix pass moved kvD's double
    expect(houseChartMatches(h, undefined)).toBe(true);
    expect(houseChartMatches(h, null)).toBe(true);
  });

  it('the rules line says there is no pause (owner decision #40 carried to the Cypher)', () => {
    expect(DANCE_ARENA_RULES).toMatch(/No pause: the song runs to its end\./);
  });
});

describe('P9 FIX PASS: a replayed press list is fingerprinted and named — never refused', () => {
  it('dancePressPrint is the list to the millisecond, in order, with its keys, moves and releases', () => {
    const h = houseOn('warmup');
    const list = perfect(h);
    expect(dancePressPrint(list)).toMatch(/^[0-9a-f]{8}$/);
    expect(dancePressPrint(list)).toBe(dancePressPrint(JSON.parse(JSON.stringify(list))));
    const whole = list.map((p) => ({ ...p, tMs: Math.round(p.tMs) }));
    expect(dancePressPrint(whole.map((p) => ({ ...p, tMs: p.tMs + 0.3 })))).toBe(dancePressPrint(whole));   // sub-ms: the same
    expect(dancePressPrint(list.map((p, i) => (i === 3 ? { ...p, tMs: p.tMs + 2 } : p)))).not.toBe(dancePressPrint(list));
    expect(dancePressPrint(list.map((p, i) => (i === 0 ? { ...p, key: 'B' } : p)))).not.toBe(dancePressPrint(list));
  });

  it('danceReplayOf: the earlier finish on the SAME song with the SAME print, by match id; nothing for an empty list', () => {
    const prior = [
      { matchId: 'cm_a', songId: 'canals', print: 'aaaa0001' },
      { matchId: 'cm_b', songId: 'warmup', print: 'bbbb0002' },
      { matchId: 7, songId: 'canals', print: 'cccc0003' },
      { songId: 'canals', print: 'dddd0004' },
    ];
    expect(danceReplayOf('canals', 'aaaa0001', 120, prior)).toBe('cm_a');
    expect(danceReplayOf('warmup', 'aaaa0001', 120, prior)).toBeNull();        // another song: not a replay
    expect(danceReplayOf('canals', 'cccc0003', 120, prior)).toBeNull();        // a row with no usable match id
    expect(danceReplayOf('canals', 'aaaa0001', 0, prior)).toBeNull();          // an empty set repeats nothing worth a flag
  });
});
