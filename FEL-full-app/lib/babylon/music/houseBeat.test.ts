// MUSIC-SUITE P6 (2026-09-26): the Arena's house beat and its judge (lib/babylon/music/houseBeat.ts). Owner decision #12:
// "house beat seeded by the match, locked tempo, one attempt, count-in". Proven here: the beat is a pure function of the
// match id (repeat calls, a JSON round trip — the wire the client and the server share); different matches get different
// beats; every beat is playable (notes in every bar, no lane denser than 16ths, notes only where the beat hits, one
// lane per step); only FEL's own synthesized kits sound; every beat has the same note count, so one ceiling; and the
// judge is the room's PerformSet, which a masher loses and a steady player wins.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  houseBeatFor, judgeHouseSet, houseTap, houseTapJudged, parseHouseTaps, houseBarTracks, houseBeatMax, houseBeatSummary,
  houseSetMs, houseCountInMs, houseMinFinishMs, houseBarSec,
  HOUSE_LANES, HOUSE_LANE_SAMPLE, HOUSE_KITS, HOUSE_BPMS, HOUSE_SWINGS, HOUSE_SET_NOTES, HOUSE_SET_MAX, HOUSE_SET_BARS,
  HOUSE_PATTERN_BARS, HOUSE_BAR_NOTES, HOUSE_PATTERN_NOTES, HOUSE_MAX_TAPS, HOUSE_SCHEDULE_AHEAD_S, HOUSE_NOTE_PRIORITY,
  HOUSE_ARENA_RULES, HOUSE_BEAT_VERSION, HOUSE_LANE_LABELS, houseLaneOf, type HouseBeat, type HouseTap,
} from './houseBeat';
import { PerformSet, performSetMax, isPerformLane, PERFORM_LANES, PERFORM_SET_BARS, PERFORM_STEPS_PER_BAR, PERFORM_EXPIRE_S } from './performSet';
import { songStepTime, stepDurSec, SWING_DEPTH } from './stepTime';
import { KIT_META, KIT_SLOTS } from './SynthKit';

const SEEDS = Array.from({ length: 300 }, (_, i) => (i % 3 === 0 ? `cm${(i * 7919).toString(36)}x${i}` : i % 3 === 1 ? `m-${i}` : `legacy-${i}-seed`));
const src = (rel: string): string => readFileSync(join(process.cwd(), rel), 'utf8');

/** A deterministic LCG for the tests' players (never Math.random: a failure must replay). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 0x100000000; };
}
const perfectTaps = (b: HouseBeat): HouseTap[] => b.notes.map((n) => houseTap(n.lane, n.t));

describe('houseBeatFor: the beat is the match id, and nothing else', () => {
  it('takes one argument — there is no tempo or swing to pass in', () => {
    expect(houseBeatFor.length).toBe(1);
  });

  it('the same seed builds the identical beat on repeated calls', () => {
    for (const seed of SEEDS.slice(0, 40)) expect(houseBeatFor(seed), seed).toEqual(houseBeatFor(seed));
  });

  it('survives a JSON round trip unchanged — the client and the server read the same numbers', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const b = houseBeatFor(seed);
      const wire = JSON.parse(JSON.stringify(b)) as HouseBeat;
      expect(wire, seed).toEqual(b);
      expect(wire.notes.map((n) => n.t)).toEqual(b.notes.map((n) => n.t));   // exact doubles, not "close"
      // and the judge reads a round-tripped beat and tap list to the same result
      const r = lcg(seed.length * 31 + 7);
      const taps = b.notes.map((n) => houseTap(n.lane, n.t + (r() - 0.5) * 0.2));
      expect(judgeHouseSet(wire, JSON.parse(JSON.stringify(taps))), seed).toEqual(judgeHouseSet(b, taps));
    }
  });

  it('different seeds build different beats (kit, tempo, swing and chart all vary)', () => {
    const sig = (b: HouseBeat) => `${b.kit}|${b.bpm}|${b.swing}|${b.notes.slice(0, HOUSE_PATTERN_NOTES).map((n) => `${n.step}${n.lane}`).join('')}`;
    const beats = SEEDS.map(houseBeatFor);
    expect(new Set(beats.map(sig)).size).toBeGreaterThan(250);                  // 300 seeds, almost all distinct
    expect(new Set(beats.map((b) => b.kit))).toEqual(new Set(HOUSE_KITS));
    expect(new Set(beats.map((b) => b.bpm))).toEqual(new Set(HOUSE_BPMS));
    expect(new Set(beats.map((b) => b.swing))).toEqual(new Set(HOUSE_SWINGS));
    expect(sig(houseBeatFor('m-1'))).not.toBe(sig(houseBeatFor('m-2')));
    expect(houseBeatFor('m-1').seed).toBe('m-1');
  });
});

describe('every house beat is playable', () => {
  const beats = SEEDS.map(houseBeatFor);

  it(`charts exactly ${HOUSE_SET_NOTES} notes over ${HOUSE_SET_BARS} bars (the Arena set's length), in time order`, () => {
    expect(HOUSE_SET_BARS).toBe(PERFORM_SET_BARS);
    expect(HOUSE_PATTERN_NOTES).toBe(48);
    expect(HOUSE_SET_NOTES).toBe(192);
    for (const b of beats) {
      expect(b.notes, b.seed).toHaveLength(HOUSE_SET_NOTES);
      expect(b.notes.every((n, i) => n.i === i && (i === 0 || n.t > b.notes[i - 1].t)), b.seed).toBe(true);
      expect(Math.max(...b.notes.map((n) => n.bar)), b.seed).toBe(HOUSE_SET_BARS - 1);
      for (const n of b.notes) expect(n.t, b.seed).toBe(songStepTime(n.bar, n.step, PERFORM_STEPS_PER_BAR, b.bpm, b.swing));
    }
  });

  it('has notes in at least half its bars (in fact every bar), each bar the counts HOUSE_BAR_NOTES says', () => {
    for (const b of beats) {
      const perBar = Array.from({ length: HOUSE_SET_BARS }, (_, bar) => b.notes.filter((n) => n.bar === bar).length);
      expect(perBar.filter((c) => c > 0).length, b.seed).toBeGreaterThanOrEqual(HOUSE_SET_BARS / 2);
      expect(perBar, b.seed).toEqual(Array.from({ length: HOUSE_SET_BARS }, (_, bar) => HOUSE_BAR_NOTES[bar % HOUSE_PATTERN_BARS]));
    }
  });

  it('no lane is denser than 16ths: one note per step, and no two notes closer than a (swung) 16th', () => {
    for (const b of beats) {
      const minGap = stepDurSec(b.bpm) * (1 - b.swing * SWING_DEPTH) - 1e-9;
      const steps = b.notes.map((n) => n.bar * PERFORM_STEPS_PER_BAR + n.step);
      expect(new Set(steps).size, b.seed).toBe(steps.length);                                  // one lane per step
      for (const name of HOUSE_LANES) {
        const t = b.notes.filter((n) => n.lane === name).map((n) => n.t);
        for (let i = 1; i < t.length; i++) expect(t[i] - t[i - 1], `${b.seed} ${name}`).toBeGreaterThanOrEqual(minGap);
        // the pattern too: a lane is 16 steps a bar, one hit a step at most
        expect(b.lanes[name].pattern, `${b.seed} ${name}`).toHaveLength(HOUSE_PATTERN_BARS * PERFORM_STEPS_PER_BAR);
      }
      for (let i = 1; i < b.notes.length; i++) expect(b.notes[i].t - b.notes[i - 1].t, b.seed).toBeGreaterThanOrEqual(minGap);
    }
  });

  it('notes only where the beat hits (decision #11): every note is a hit of its own lane, and the lane the priority names', () => {
    for (const b of beats) {
      for (const n of b.notes) {
        const at = (n.bar % HOUSE_PATTERN_BARS) * PERFORM_STEPS_PER_BAR + n.step;
        expect(isPerformLane(houseLaneOf(n.lane)), `${b.seed} ${n.bar}:${n.step}`).toBe(true);
        expect(b.lanes[n.lane].pattern[at], `${b.seed} ${n.bar}:${n.step}`).toBe(true);
        const first = HOUSE_NOTE_PRIORITY.find((l) => b.lanes[l].pattern[at]);
        expect(first, `${b.seed} ${n.bar}:${n.step}`).toBe(n.lane);
      }
      // the house frame: a kick on every bar's 1, the snare on 2 and 4, all charted
      for (let bar = 0; bar < HOUSE_SET_BARS; bar++) {
        const mine = b.notes.filter((n) => n.bar === bar).map((n) => `${n.step}${n.lane}`);
        expect(mine, `${b.seed} bar ${bar}`).toEqual(expect.arrayContaining(['0kick', '4snare', '12snare']));
      }
    }
  });

  it('uses every lane across the seeds, and the pattern is the same four passes', () => {
    const lanes = new Set(beats.flatMap((b) => b.notes.map((n) => houseLaneOf(n.lane))));
    expect(lanes).toEqual(new Set([0, 1, 2, 3]));                        // PERFORM's four lanes, every one charted
    expect(HOUSE_LANES.map(houseLaneOf)).toEqual([0, 1, 2, 3]);
    expect(PERFORM_LANES.slice(0, 3)).toEqual(HOUSE_LANES.slice(0, 3));  // kick, snare, hats are PERFORM's own; lane 3 is the perc
    expect(HOUSE_LANE_LABELS).toEqual(['KICK', 'SNARE', 'HATS', 'PERC']);
    for (const b of beats.slice(0, 20)) {
      const pass = (p: number) => b.notes.filter((n) => Math.floor(n.bar / HOUSE_PATTERN_BARS) === p).map((n) => `${n.bar % HOUSE_PATTERN_BARS}:${n.step}${n.lane}`);
      for (let p = 1; p < HOUSE_SET_BARS / HOUSE_PATTERN_BARS; p++) expect(pass(p), b.seed).toEqual(pass(0));
    }
  });

  it('houseBarTracks hands the engine one bar of the pattern, looping every 8 bars', () => {
    const b = beats[0];
    for (const bar of [0, 3, 7, 8, 15, 31]) {
      const tracks = houseBarTracks(b, bar);
      expect(tracks.map((t) => t.lane)).toEqual([0, 1, 2, 3]);
      expect(tracks.map((t) => t.name)).toEqual([...HOUSE_LANES]);
      for (const t of tracks) {
        expect(t.pattern).toHaveLength(PERFORM_STEPS_PER_BAR);
        expect(t.sampleId).toBe(HOUSE_LANE_SAMPLE[t.name]);
        const from = (bar % HOUSE_PATTERN_BARS) * PERFORM_STEPS_PER_BAR;
        expect(t.pattern).toEqual(b.lanes[t.name].pattern.slice(from, from + PERFORM_STEPS_PER_BAR));
        t.pattern.forEach((on, s) => expect(t.vels[s] > 0, `${bar}:${s}`).toBe(on));   // a hit has a velocity, a rest has none
      }
    }
  });
});

describe("FEL's own kits only (the IP rule)", () => {
  it('every kit is a SynthKit kit — synthesized at load, no audio file behind it — and every lane a KIT_SLOTS voice', () => {
    for (const k of HOUSE_KITS) expect(Object.keys(KIT_META)).toContain(k);
    const slots = KIT_SLOTS.map((s) => s.id);
    for (const lane of HOUSE_LANES) expect(slots).toContain(HOUSE_LANE_SAMPLE[lane]);
    for (const seed of SEEDS) {
      const b = houseBeatFor(seed);
      expect(HOUSE_KITS).toContain(b.kit);
      for (const lane of HOUSE_LANES) expect(b.lanes[lane].sampleId).toBe(HOUSE_LANE_SAMPLE[lane]);
    }
  });

  it('the module names no audio file, URL or sample: the beat is kit slots and steps', () => {
    const s = src('lib/babylon/music/houseBeat.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');   // code, not comments
    expect(s).not.toMatch(/\.(wav|mp3|ogg|m4a|flac)\b/i);
    expect(s).not.toMatch(/https?:\/\//);
    expect(s).not.toMatch(/fetch\(|new Audio|AudioContext/);
    expect(s).not.toMatch(/Math\.random|Date\.now|new Date/);
  });
});

describe('judgeHouseSet: the room\'s judge on the house beat', () => {
  it(`a perfect set scores exactly HOUSE_SET_MAX (${HOUSE_SET_MAX.toLocaleString('en-US')}) on every seed, grade S, won`, () => {
    expect(HOUSE_SET_MAX).toBe(performSetMax(HOUSE_SET_NOTES));
    expect(HOUSE_SET_MAX).toBe(378_300);
    for (const seed of SEEDS.slice(0, 60)) {
      const b = houseBeatFor(seed);
      expect(houseBeatMax(b)).toBe(HOUSE_SET_MAX);
      const r = judgeHouseSet(b, perfectTaps(b));
      expect(r, seed).toMatchObject({ score: HOUSE_SET_MAX, perfects: HOUSE_SET_NOTES, goods: 0, misses: 0, extras: 0, grade: 'S', won: true, bars: HOUSE_SET_BARS, arena: true, maxCombo: HOUSE_SET_NOTES });
    }
  });

  it('no tap list scores above the ceiling: doubled taps, taps on every 16th, perfect plus extras', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const b = houseBeatFor(seed);
      const step = stepDurSec(b.bpm);
      const every16th = Array.from({ length: HOUSE_SET_BARS * PERFORM_STEPS_PER_BAR }, (_, i) => houseTap('kick', songStepTime(Math.floor(i / 16), i % 16, 16, b.bpm, b.swing)));
      for (const taps of [[...perfectTaps(b), ...perfectTaps(b)], every16th, [...perfectTaps(b), ...perfectTaps(b).map((t) => ({ ...t, tMs: t.tMs + step * 500 }))]]) {
        expect(judgeHouseSet(b, taps).score, seed).toBeLessThanOrEqual(HOUSE_SET_MAX);
      }
    }
  });

  // A masher taps fast and without the beat: any phase, a little jitter. (Four taps a second locked to the grid is not a
  // masher at 120 BPM — it is an 8th-note player, and on some beats that plays a C: tapping in time is playing.)
  it('a masher loses: 6, 10 and 20 taps a second at any phase score grade D and under 4 % of a perfect set', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const b = houseBeatFor(seed);
      const rnd = lcg(seed.length * 71 + 11);
      for (const rate of [6, 10, 20]) {
        const phase = rnd() * 0.5;
        const taps = Array.from({ length: Math.floor((houseSetMs(b) / 1000) * rate) }, (_, i) => houseTap('kick', phase + i / rate + (rnd() - 0.5) * 0.04));
        const r = judgeHouseSet(b, taps);
        expect(r.grade, `${seed} ${rate}/s`).toBe('D');
        expect(r.won, `${seed} ${rate}/s`).toBe(false);
        expect(r.score, `${seed} ${rate}/s`).toBeLessThan(0.04 * HOUSE_SET_MAX);
      }
    }
  });

  it('a steady player within ±30 ms wins grade A or S; a sloppy one (±120 ms, 10 % skipped) scores well under a tight one', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const b = houseBeatFor(seed);
      const r = lcg(seed.length * 97 + 3);
      const tight = judgeHouseSet(b, b.notes.map((n) => houseTap(n.lane, n.t + (r() - 0.5) * 0.06)));
      expect(['A', 'S'], seed).toContain(tight.grade);
      expect(tight.won).toBe(true);
      const sloppy = judgeHouseSet(b, b.notes.filter(() => r() > 0.1).map((n) => houseTap(n.lane, n.t + (r() - 0.5) * 0.24)));
      expect(sloppy.score, seed).toBeLessThan(tight.score / 2);
    }
  });

  it('the count-in is not judged, and nothing after the set ends is either', () => {
    const b = houseBeatFor('count-in');
    const base = judgeHouseSet(b, perfectTaps(b));
    const clicks = Array.from({ length: 4 }, (_, i) => houseTap('kick', -houseCountInMs(b) / 1000 + i * 60 / b.bpm));
    expect(judgeHouseSet(b, [...clicks, ...perfectTaps(b)])).toEqual(base);                  // tapping along with the clicks costs nothing
    for (const c of clicks) expect(houseTapJudged(b, c.tMs)).toBe(false);
    const after = houseTap('snare', houseSetMs(b) / 1000 + 0.5);
    expect(houseTapJudged(b, after.tMs)).toBe(false);
    expect(judgeHouseSet(b, [...perfectTaps(b), after])).toEqual(base);
    // a tap just inside the first note's early window IS judged: it takes the first note, EARLY
    expect(houseTapJudged(b, -(PERFORM_EXPIRE_S * 1000) + 1)).toBe(true);
  });

  // Lane 1's lane judge (performSet.ts, MUSIC-SUITE P6): a tap takes only a note of its own lane.
  it('judges lanes: a perfectly timed tap in the wrong lane is never a hit on its note — every lane rotated loses', () => {
    const b = houseBeatFor('lanes');
    const wrong = b.notes.map((n) => houseTap(HOUSE_LANES[(houseLaneOf(n.lane) + 1) % 4], n.t));
    const r = judgeHouseSet(b, wrong);
    expect(r).toMatchObject({ perfects: 0, grade: 'D', won: false });                // (a rotated tap can still reach a
    expect(r.score).toBeLessThan(0.01 * HOUSE_SET_MAX);                               //  NEIGHBOURING note of its own lane: a GOOD)
    expect(r.wrongLanes).toBeGreaterThan(0.8 * HOUSE_SET_NOTES);                      // most read WRONG LANE
    // one lane wrong, the rest right: only that lane's notes are lost
    const oneOff = b.notes.map((n) => houseTap(n.lane === 'hats' ? 'perc' : n.lane, n.t));
    const hats = b.notes.filter((n) => n.lane === 'hats').length;
    expect(judgeHouseSet(b, oneOff).hits).toBe(HOUSE_SET_NOTES - hats);
    // the recap reads per lane, and every lane of the chart is there
    expect(judgeHouseSet(b, perfectTaps(b)).lanes.map((l) => l.lane)).toEqual([...new Set(b.notes.map((n) => houseLaneOf(n.lane)))].sort());
  });

  it('a four-key masher (every lane pressed together on every 8th) loses', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const b = houseBeatFor(seed);
      const eighth = 2 * stepDurSec(b.bpm);
      const taps: HouseTap[] = [];
      for (let t = 0; t < houseSetMs(b) / 1000; t += eighth) for (const l of HOUSE_LANES) taps.push(houseTap(l, t));
      const r = judgeHouseSet(b, taps);
      expect(r.won, seed).toBe(false);
      expect(r.score, seed).toBeLessThan(0.1 * HOUSE_SET_MAX);
    }
  });

  it('is the order of the taps\' times, not of the list', () => {
    const b = houseBeatFor('order');
    const r = lcg(5);
    const taps = b.notes.map((n) => houseTap(n.lane, n.t + (r() - 0.5) * 0.15));
    expect(judgeHouseSet(b, [...taps].reverse())).toEqual(judgeHouseSet(b, taps));
  });

  it(`offers each step ${HOUSE_SCHEDULE_AHEAD_S * 1000} ms ahead, as AudioEngine schedules it`, () => {
    expect(src('lib/babylon/music/AudioEngine.ts')).toMatch(new RegExp(`const SCHEDULE_AHEAD_S = ${HOUSE_SCHEDULE_AHEAD_S};`));
  });

  // The room's live PerformSet is fed by AudioEngine's 25 ms scheduler and expire()d on each animation frame. The judge
  // calls expire() the instant each window closes (header, WHY THE ROOM'S LIVE NUMBER). With the lane judge a live number
  // is not quite stable (a 60 Hz and a 120 Hz drive of one set differ on ~5 % of sloppy sets), so this holds the judge to
  // "almost always the live number, and never far from it" — and the submitted number is the judge's on both sides.
  it('agrees with a live drive (25 ms scheduler, 120 Hz frames) on ≥ 85 % of sloppy sets, and is never 600 points off', () => {
    const live = (b: HouseBeat, taps: HouseTap[], phase: number): number => {
      const set = new PerformSet({ arena: true });
      const laneAt = new Map(b.notes.map((n) => [n.bar * 16 + n.step, houseLaneOf(n.lane)]));
      const tOf = (i: number) => songStepTime(Math.floor(i / 16), i % 16, 16, b.bpm, b.swing);
      const end = tOf(HOUSE_SET_BARS * 16 - 1) + PERFORM_EXPIRE_S;
      const ev: { at: number; k: number; i: number; lane: 0 | 1 | 2 | 3 | null }[] = [];
      let next = 0;
      for (let tick = -0.2 + phase; tick < end + 0.1; tick += 0.025) {
        while (next < HOUSE_SET_BARS * 16 && tOf(next) < tick + HOUSE_SCHEDULE_AHEAD_S) ev.push({ at: tick, k: 0, i: next++, lane: null });
      }
      for (let f = -0.2; f < end + 0.05; f += 1 / 120) ev.push({ at: f, k: 2, i: -1, lane: null });
      for (const t of taps) if (houseTapJudged(b, t.tMs)) ev.push({ at: t.tMs / 1000, k: 1, i: -1, lane: houseLaneOf(t.lane) });
      ev.sort((x, y) => x.at - y.at || x.k - y.k);
      for (const e of ev) {
        if (e.k === 0) { const l = laneAt.get(e.i); if (l !== undefined) set.chartStep(e.i % 16, tOf(e.i), e.at, [l]); else set.rest(e.i % 16, tOf(e.i), e.at); }
        else if (e.k === 1) set.tap(e.at, e.lane); else set.expire(e.at);
      }
      return set.result(end + 0.02).score;
    };
    let agree = 0, total = 0;
    for (const seed of SEEDS.slice(0, 30)) {
      const b = houseBeatFor(seed);
      const r = lcg(seed.length * 13 + 1);
      const taps = b.notes.filter(() => r() > 0.15).map((n) => houseTap(n.lane, n.t + (r() - 0.5) * 0.26));
      const judged = judgeHouseSet(b, taps).score;
      for (const phase of [0, 0.011, 0.019]) {
        const l = live(b, taps, phase);
        total++;
        if (l === judged) agree++;
        expect(Math.abs(l - judged), `${seed} phase ${phase}`).toBeLessThanOrEqual(600);
      }
    }
    expect(agree / total).toBeGreaterThanOrEqual(0.85);
  });
});

describe('a recorded tap and a posted tap list', () => {
  it('houseTap rounds to 0.1 ms, and the rounded number survives JSON exactly', () => {
    const t = houseTap('perc', 12.345678);
    expect(t).toEqual({ lane: 'perc', tMs: 12345.7 });
    expect(JSON.parse(JSON.stringify(t))).toEqual(t);
    expect(houseTap('kick', -0.00004).tMs === 0).toBe(true);
  });

  it('parseHouseTaps keeps a good list exactly (two fields, the order given)', () => {
    const b = houseBeatFor('parse');
    const taps = perfectTaps(b);
    const p = parseHouseTaps(b, taps.map((t) => ({ ...t, extra: 'dropped' })));
    expect(p).toEqual({ ok: true, taps });
    expect(parseHouseTaps(b, [])).toEqual({ ok: true, taps: [] });
  });

  it('refuses a list that is not one, a lane that is not a lane, a time that is not in the set, and too many taps', () => {
    const b = houseBeatFor('parse');
    const bad = (raw: unknown) => { const p = parseHouseTaps(b, raw); return p.ok ? 'ok' : p.code; };
    expect(bad('nope')).toBe('TAPS_INVALID');
    expect(bad({ taps: [] })).toBe('TAPS_INVALID');
    for (const lane of ['cowbell', 'KICK', 0, 3, null]) expect(bad([{ lane, tMs: 10 }]), String(lane)).toBe('TAPS_INVALID');   // a lane is a part's name
    expect(bad([{ lane: 'kick' }])).toBe('TAPS_INVALID');
    expect(bad([{ lane: 'kick', tMs: '10' }])).toBe('TAPS_INVALID');
    for (const tMs of [NaN, Infinity, -Infinity, houseSetMs(b) + 1001, -houseCountInMs(b) - 1001]) expect(bad([{ lane: 'kick', tMs }]), String(tMs)).toBe('TAPS_INVALID');
    expect(bad([null])).toBe('TAPS_INVALID');
    expect(bad(Array.from({ length: HOUSE_MAX_TAPS }, (_, i) => ({ lane: HOUSE_LANES[i % 4], tMs: i * 10 })))).toBe('ok');
    expect(bad(Array.from({ length: HOUSE_MAX_TAPS + 1 }, (_, i) => ({ lane: HOUSE_LANES[i % 4], tMs: i * 10 })))).toBe('TOO_MANY_TAPS');
    expect(HOUSE_MAX_TAPS).toBe(2048);
  });

  it('times the set and its fastest honest finish: 90 % of the set after the start', () => {
    const b = houseBeatFor('timing');
    expect(houseSetMs(b)).toBeCloseTo(HOUSE_SET_BARS * houseBarSec(b) * 1000, 6);
    expect(houseMinFinishMs(b)).toBeCloseTo(0.9 * houseSetMs(b), 6);
    // at the fastest house tempo the set is still over a minute
    expect(HOUSE_SET_BARS * houseBarSec({ bpm: Math.max(...HOUSE_BPMS), stepsPerBar: 16 })).toBeGreaterThan(60);
  });

  it('a start event records which beat was played', () => {
    const b = houseBeatFor('summary');
    expect(houseBeatSummary(b)).toEqual({ v: HOUSE_BEAT_VERSION, kit: b.kit, bpm: b.bpm, swing: b.swing, notes: HOUSE_SET_NOTES });
  });

  it('the rules line says one attempt, the count-in and the forfeit (owner decision #29)', () => {
    expect(HOUSE_ARENA_RULES).toMatch(/ONE attempt/);
    expect(HOUSE_ARENA_RULES).toMatch(/count-in/);
    expect(HOUSE_ARENA_RULES).toMatch(/scores 0/);
    expect(HOUSE_ARENA_RULES).toMatch(/tempo and swing locked/);
  });
});

// MUSIC-SUITE P6 FIX PASS (2026-09-26): the room's live chart feed as a pure helper (it was a filter inline in StudioMode's
// onStepScheduled), held to the chart judgeHouseSet offers; and the rules line says WHEN the attempt is used.
describe('P6 fix pass: houseStepLanes is the chart, step by step', () => {
  it('every step of the set offers exactly the chart\'s notes there, in their lanes; the last step of each bar is flagged', async () => {
    const { houseStepLanes, houseLastStepOfBar } = await import('./houseBeat');
    for (const seed of ['feed-1', 'feed-2', 'feed-3']) {
      const beat = houseBeatFor(seed);
      let offered = 0;
      for (let i = 0; i < beat.setBars * beat.stepsPerBar; i++) {
        const lanes = houseStepLanes(beat, i);
        const want = beat.notes.filter((n) => n.bar * beat.stepsPerBar + n.step === i).map((n) => houseLaneOf(n.lane));
        expect(lanes, `${seed} step ${i}`).toEqual(want);
        expect(lanes.length).toBeLessThanOrEqual(1);                   // one lane per step (the curated chart)
        offered += lanes.length;
        expect(houseLastStepOfBar(beat, i)).toBe(i % 16 === 15);
      }
      expect(offered).toBe(beat.notes.length);
    }
  });

  it('the rules say the attempt is used at START (it is recorded then), not "after the count-in"', () => {
    expect(HOUSE_ARENA_RULES).toMatch(/used the moment you press START/);
    expect(HOUSE_ARENA_RULES).not.toMatch(/after the count-in scores 0/);
  });
});
