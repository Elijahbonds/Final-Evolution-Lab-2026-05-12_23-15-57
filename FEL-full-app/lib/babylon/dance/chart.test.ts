// chart — the authored charts of the six FEL songs, re-landed from closed PR #46 on today's dance design (owner,
// 2026-10-13): DENSITY PAYS AS STYLE, NOT SCORE. These tests are the reason that sentence is true: a chart's steps are its
// moves only, every other press is a STYLE tap, and so a denser chart cannot move what a run scores or the score ceiling.
import { describe, expect, it, vi } from 'vitest';
import { DANCE_LIBRARY, DancePerformance, JUDGE_WINDOWS, MISS_AFTER, beatDuration, type DanceStep } from '../core/DanceCore';
import { DANCE_TRACKS, stepsFor, stepsForSong, styleBeatsFor } from '../core/danceTracks';
import { danceCeiling } from '@/lib/arena-score-integrity';
import { MAX_SONG_BARS } from '../music/Song';
import { FEL_SONGS, songFor, type FelSong } from './felSongs';
import { chartForLevel, grooveBeats, GROOVE_WINDOW_SEC, buttonForStep, FAMILY_BUTTON, categoryOf } from './chartPlay';
import { isStakingPaused } from '@/lib/stakingPause';
import {
  CHART_FORMAT, CHART_MOVES, CHART_SONG_IDS, DENSITY_BAND, DIFFICULTY_RULES, SCORED_STEP_CAP, chartFor, chartStats, chartStepsFor,
  chartStyleBeatsFor, clipStem, expandChart, moveClip, planChart, selectScored, stepsFromPresses, styleBeatsFromPresses, swingBeat,
  validateChart, type DanceChart,
} from './chart';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const song = (id: string): FelSong => songFor(id)!;
const MIN_CLIP = Math.min(...DANCE_LIBRARY.map((c) => c.beats));
/** What a player's own 64-bar export can hold, and what danceCeiling() has always counted: the score ceiling's steps. */
const CEILING_STEPS = Math.floor((MAX_SONG_BARS * 4) / MIN_CLIP);
/** `steps` steps all PERFECT in one combo: Σ (PERFECT points + 5 × combo) — DanceCore hit(). */
const flawless = (steps: DanceStep[], bpm: number) => {
  const perf = new DancePerformance(bpm);
  perf.setRoutine(steps);
  perf.start(0);
  const bd = beatDuration(bpm);
  for (const x of steps) { perf.update(x.beat * bd); perf.hit(x.beat * bd); }
  return perf.result();
};
const danceChartPerfect = (steps: number): number => steps * Math.max(...JUDGE_WINDOWS.map((w) => w.points)) + (5 * steps * (steps + 1)) / 2;

describe('every shipped chart is valid — and fails loudly when it is not', () => {
  it('there is a chart for each of the six songs, and for nothing else', () => {
    expect([...CHART_SONG_IDS].sort()).toEqual(FEL_SONGS.map((s) => s.id).sort());
  });
  for (const s of FEL_SONGS) {
    it(`${s.id}: no problems at difficulty ${s.difficulty}`, () => {
      expect(validateChart(chartFor(s.id)!, s)).toEqual([]);
    });
  }
  it('the density climbs with the difficulty, each inside its band around the song\'s own target', () => {
    const rows = FEL_SONGS.map((s) => ({ d: s.difficulty, tpm: chartStats(chartFor(s.id)!, s).tapsPerMin, target: s.targetTapsPerMin }));
    for (const r of rows) {
      expect(r.tpm).toBeGreaterThanOrEqual(DENSITY_BAND[0] * r.target);
      expect(r.tpm).toBeLessThanOrEqual(DENSITY_BAND[1] * r.target);
    }
    const byD = [...rows].sort((a, b) => a.d - b.d);
    for (let i = 1; i < byD.length; i++) expect(byD[i].tpm).toBeGreaterThan(byD[i - 1].tpm);
  });
  it('the format and the move names', () => {
    expect(CHART_FORMAT).toBe('fel-dance-chart/1');
    for (const id of Object.values(CHART_MOVES)) expect(DANCE_LIBRARY.some((c) => c.id === id), id).toBe(true);
    expect(moveClip('toprock')?.id).toBe('dance_toprock_basic');
    expect(moveClip('dance_trans_spin')?.id).toBe('dance_trans_spin');
    expect(moveClip('nope')).toBeNull();
    expect(clipStem('dance_freeze_baby')).toBe('horns');
    // #46's captured moves answer with the library clip of their family (instrument + MATCH button come from the family)
    expect(moveClip('moonwalk')?.category).toBe('wave');
    expect(moveClip('helicopter')?.category).toBe('power');
    expect(moveClip('sidefreeze')?.category).toBe('freeze');
    expect(moveClip('kickstep')?.category).toBe('toprock');
  });
});

describe('DENSITY PAYS AS STYLE: a chart\'s steps are its moves, every other press is a STYLE tap', () => {
  for (const s of FEL_SONGS) {
    it(`${s.id}: steps = the scored moves; accents, doubles, freestyle slots and capped-out moves are style beats, never steps`, () => {
      const chart = chartFor(s.id)!;
      const st = chartStats(chart, s);
      const steps = chartStepsFor(s)!;
      expect(steps.length).toBe(st.moves);
      expect(st.moves + st.demoted).toBe(st.authoredMoves);
      expect(st.styleTaps).toBe(st.accents + st.doubles + st.freeSlots + st.demoted);
      expect(st.styleTaps).toBeGreaterThan(0);                         // a real chart has density beyond its moves
      const style = chartStyleBeatsFor(s)!;
      expect(style.length).toBeGreaterThan(0);
      expect(style.length).toBeLessThanOrEqual(st.styleTaps);
      // sorted, no step shares a beat with a style tap, and every step is a plain DANCE_LIBRARY press step
      expect([...style].sort((a, b) => a - b)).toEqual(style);
      const stepBeats = new Set(steps.map((x) => x.beat));
      for (const b of style) expect(stepBeats.has(b), `style beat ${b} is also a step`).toBe(false);
      for (const x of steps) {
        expect(DANCE_LIBRARY.some((c) => c.id === x.clipId)).toBe(true);
        expect(Object.keys(x).sort()).toEqual(['beat', 'clipId', 'holdBeats', 'mirrored']);   // exactly stepsForSong's shape
        expect(x.holdBeats).toBe(DANCE_LIBRARY.find((c) => c.id === x.clipId)!.beats);
      }
    });
  }

  it('adding accents, doubles and freestyle to a chart adds style beats and not one step', () => {
    const s = song('warmup');
    const base = clone(chartFor('warmup')!);
    const run = (c: DanceChart) => { const plan = planChart(c, s); return { steps: stepsFromPresses(plan.scored), style: styleBeatsFromPresses(plan.style) }; };
    const before = run(base);
    const denser = clone(base);
    // warmup is difficulty 1 (quarters): every called phrase gets an accent on its beat 1
    for (const ph of Object.values(denser.phrases)) {
      if (ph.notes && !ph.notes.some((n) => n.b === 1)) { ph.notes.push({ b: 1 }); ph.notes.sort((a, b) => a.b - b.b); }
    }
    const after = run(denser);
    expect(after.style.length).toBeGreaterThan(before.style.length);
    expect(after.steps).toEqual(before.steps);
  });

  it('a flawless run of a chart scores its scored MOVES only — and sits under danceCeiling() on every song', () => {
    for (const s of FEL_SONGS) {
      const steps = chartStepsFor(s)!;
      const r = flawless(steps, s.bpm);
      expect(r.counts.PERFECT, s.id).toBe(steps.length);
      expect(r.score, s.id).toBe(danceChartPerfect(steps.length));
      expect(r.score, s.id).toBeLessThanOrEqual(danceCeiling());
      expect(steps.length, s.id).toBeLessThanOrEqual(CEILING_STEPS);
    }
  });

  // OWNER, 2026-10-13: scored steps per song are capped to the OLD generated counts, so pay is exactly unchanged.
  describe('the scored-step cap: pay is unchanged', () => {
    const OLD_COUNTS = { warmup: 26, cypher: 29, goldenhour: 32, battle: 38, canals: 41, evolution: 47 } as const;
    it('the cap table is the old generated counts, and they are what stepsForSong still generates', () => {
      expect(SCORED_STEP_CAP).toEqual(OLD_COUNTS);
      for (const s of FEL_SONGS) expect(stepsForSong(s).length, s.id).toBe(OLD_COUNTS[s.id as keyof typeof OLD_COUNTS]);
    });
    for (const s of FEL_SONGS) {
      it(`${s.id}: scored steps = min(authored moves, old count)`, () => {
        const st = chartStats(chartFor(s.id)!, s);
        const old = OLD_COUNTS[s.id as keyof typeof OLD_COUNTS];
        expect(chartStepsFor(s)!.length).toBe(Math.min(st.authoredMoves, old));
        expect(st.demoted).toBe(Math.max(0, st.authoredMoves - old));
        expect(chartStepsFor(s)!.length).toBe(old);          // every song has at least its old count authored: none is short
      });
      it(`${s.id}: a flawless run scores exactly what the generated chart scored`, () => {
        expect(flawless(chartStepsFor(s)!, s.bpm).score).toBe(flawless(stepsForSong(s), s.bpm).score);
      });
    }
    it('the flawless scores, pinned: pay is unchanged on all six songs, WARMUP included (26 scored moves, one promoted from an accent)', () => {
      expect(Object.fromEntries(FEL_SONGS.map((s) => [s.id, flawless(chartStepsFor(s)!, s.bpm).score]))).toEqual({
        warmup: 9_555, cypher: 10_875, goldenhour: 12_240, battle: 15_105, canals: 16_605, evolution: 19_740,
      });
      expect(chartStats(chartFor('warmup')!, song('warmup')).authoredMoves).toBe(26);   // no demotion needed: the chart HAS its 26
    });
    it('the moves beyond the cap are STYLE taps, not dropped, and are spread across the whole song', () => {
      for (const s of FEL_SONGS) {
        const plan = planChart(chartFor(s.id)!, s);
        for (const d of plan.demoted) {
          expect(plan.style.includes(d)).toBe(true);
          expect(styleBeatsFromPresses(plan.style).includes(d.swungBeat)).toBe(true);
          expect(plan.scored.includes(d)).toBe(false);
        }
        if (plan.demoted.length < 3) continue;
        const end = s.bars * 4;
        const third = (b: number) => Math.min(2, Math.floor((b / end) * 3));
        const perThird = [0, 0, 0];
        for (const d of plan.demoted) perThird[third(d.beat)]++;
        expect(perThird.every((n) => n >= 1), `${s.id} demoted per third ${perThird}`).toBe(true);
        // …so the scored steps are spread too: no stretch of the song is left without one for longer than the chart's own longest gap + a bar
        const gaps = (ms: { beat: number }[]) => ms.slice(1).map((m, i) => m.beat - ms[i].beat);
        const authored = planChart(chartFor(s.id)!, s).presses.filter((p) => p.kind === 'move');
        expect(Math.max(...gaps(plan.scored)), s.id).toBeLessThanOrEqual(Math.max(...gaps(authored)) + 8);
      }
    });
    it('what stays scored: the first and last move, every break freeze, and a caller of every instrument', () => {
      for (const s of FEL_SONGS) {
        const plan = planChart(chartFor(s.id)!, s);
        const moves = plan.presses.filter((p) => p.kind === 'move');
        expect(plan.scored[0]).toBe(moves[0]);
        expect(plan.scored[plan.scored.length - 1]).toBe(moves[moves.length - 1]);
        const stems = new Set(plan.scored.map((p) => clipStem(p.clipId)));
        for (const stem of new Set(s.sections.flatMap((x) => x.stems).filter((x) => x !== 'bed'))) expect(stems.has(stem), `${s.id} ${stem}`).toBe(true);
      }
    });
    it('a demoted move never lands in the 290 ms before a scored move, or inside a scored freeze (the validator is clean)', () => {
      for (const s of FEL_SONGS) {
        const plan = planChart(chartFor(s.id)!, s);
        expect(plan.problems, s.id).toEqual([]);
        const spb = 60 / s.bpm;
        for (const d of plan.demoted) {
          const next = plan.scored.find((m) => m.swungBeat > d.swungBeat);
          if (next) expect((next.swungBeat - d.swungBeat) * spb, `${s.id} beat ${d.beat}`).toBeGreaterThanOrEqual(MISS_AFTER + GROOVE_WINDOW_SEC - 1e-9);
        }
      }
    });
    it('selectScored repairs an even pick that would sit in the 290 ms before a scored move: the nearest safe move is demoted instead', () => {
      // 200 BPM (0.3 s a beat): a half beat is 150 ms. Moves at 0, 4, 8, 8.5, 16 — 0 and 16 are the first and last (kept), so the
      // free moves are 4, 8 and 8.5 and the even pick for one demotion is the move on 8 — 150 ms before the scored 8.5.
      const base = song('cypher');
      const fake: FelSong = { ...base, bpm: 200, breakBars: [], sections: [{ ...base.sections[0], stems: ['bed', 'perc'] }] };
      const press = (beat: number): ReturnType<typeof expandChart>['presses'][number] => ({
        kind: 'move', bar: Math.floor(beat / 4) + 1, beat, swungBeat: beat, clipId: 'dance_toprock_basic', mirrored: false, section: 0, phrase: 'x',
      });
      const presses = [0, 4, 8, 8.5, 16].map(press);
      const { demoted, problems } = selectScored(presses, fake, 4);
      expect(problems).toEqual([]);
      expect([...demoted].map((p) => p.beat)).toEqual([4]);                 // not 8
      // with nothing else to demote, the same pick cannot be met and says so
      const two = selectScored([0, 8, 8.5].map(press), fake, 2);
      expect(two.problems.join()).toMatch(/judge window/);
    });
    it('selectScored: an impossible cap is reported, never silently met', () => {
      const s = song('cypher');
      const { presses } = expandChart(chartFor('cypher')!, s);
      expect(selectScored(presses, s, 2).problems.join()).toMatch(/cannot be met/);
      expect(selectScored(presses, s, 999).demoted.size).toBe(0);
    });
  });

  it('the score ceiling did not move: 79,680 is still 128 steps, every one PERFECT in one combo', () => {
    expect(CEILING_STEPS).toBe(128);
    expect(danceCeiling()).toBe(79_680);
    expect(danceChartPerfect(128)).toBe(79_680);
    // …and the authored charts do not need more: the densest chart has far fewer moves than the ceiling counts
    const most = Math.max(...FEL_SONGS.map((s) => chartStepsFor(s)!.length));
    expect(most).toBeLessThan(CEILING_STEPS);
  });

  it('EASY, NORMAL and HARD of an authored chart stay under the ceiling\'s step count', () => {
    for (const s of FEL_SONGS) {
      const steps = chartStepsFor(s)!;
      for (const level of ['easy', 'normal', 'hard'] as const) {
        expect(chartForLevel(steps, level).length, `${s.id} ${level}`).toBeLessThanOrEqual(CEILING_STEPS);
      }
    }
  });

  it('what a shipped song plays: stepsFor is the authored chart, and its style beats replace the computed grooves', () => {
    for (const t of DANCE_TRACKS) {
      expect(stepsFor(t), t.id).toEqual(chartStepsFor(t.song!));
      expect(styleBeatsFor(t), t.id).toEqual(chartStyleBeatsFor(t.song!));
      // the authored taps are the chart's own density, not the computed gap-fillers (those stay for the export / community songs)
      expect(styleBeatsFor(t), t.id).not.toEqual(grooveBeats(chartStepsFor(t.song!)!));
    }
    // stepsForSong (the generated steps) is still callable, and still a different list (the same length now: the scored-step cap)
    for (const s of FEL_SONGS) expect(stepsForSong(s)).not.toEqual(chartStepsFor(s));
  });

  it('a chart that fails validation is never played silently: the generated steps stand in, and it is shouted about', async () => {
    vi.resetModules();
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.doMock('./charts/warmup.json', async () => {
      const real = (await vi.importActual<{ default: DanceChart }>('./charts/warmup.json')).default;
      return { default: { ...clone(real), bpm: real.bpm + 1 } };
    });
    const fresh = await import('./chart');
    const dt = await import('../core/danceTracks');
    expect(fresh.chartStepsFor('warmup')).toBeNull();
    expect(fresh.chartStyleBeatsFor('warmup')).toBeNull();
    const t = dt.DANCE_TRACKS.find((x) => x.id === 'warmup')!;
    expect(dt.stepsFor(t)).toEqual(dt.stepsForSong(t.song!));
    expect(dt.styleBeatsFor(t)).toBeNull();                       // → the room's computed groove beats
    expect(err.mock.calls.some((c) => String(c[0]).includes('chart "warmup" is INVALID'))).toBe(true);
    err.mockRestore();
    vi.doUnmock('./charts/warmup.json');
    vi.resetModules();
  });

  it('chartStepsFor hands out a fresh copy every call', () => {
    const a = chartStepsFor('cypher')!;
    a[0].beat = 999;
    expect(chartStepsFor('cypher')![0].beat).not.toBe(999);
    expect(chartStepsFor('nope')).toBeNull();
    expect(chartStyleBeatsFor(null)).toBeNull();
  });
});

describe('a freeze keeps the current hold: a step held through its clip, released on the beat', () => {
  it('every freeze on a shipped chart is an ordinary step with the clip\'s own beats, and the next move comes a clear gap after it', () => {
    let freezes = 0;
    for (const s of FEL_SONGS) {
      const steps = chartStepsFor(s)!;
      steps.forEach((x, i) => {
        if (DANCE_LIBRARY.find((c) => c.id === x.clipId)!.category !== 'freeze') return;
        freezes++;
        expect(x.holdBeats).toBe(2);
        const next = steps[i + 1];
        if (next) expect(next.beat - (x.beat + x.holdBeats), `${s.id} beat ${x.beat}`).toBeGreaterThanOrEqual(0.5 - 1e-9);
      });
    }
    expect(freezes).toBeGreaterThanOrEqual(12);
  });
});

describe('today\'s MATCH buttons and staking pause stand (owner, 2026-10-13)', () => {
  it('every step of every authored chart has its family\'s face button, exactly as chartPlay maps them; the freeze is alone on Y', () => {
    const seen = new Set<string>();
    for (const s of FEL_SONGS) {
      for (const x of chartStepsFor(s)!) {
        const fam = categoryOf(x)!;
        expect(buttonForStep(x), `${s.id} ${x.clipId}`).toBe(FAMILY_BUTTON[fam]);
        seen.add(`${fam}:${buttonForStep(x)}`);
      }
    }
    expect(seen.has('freeze:Y')).toBe(true);
    expect([...seen].filter((k) => k.endsWith(':Y')).every((k) => k.startsWith('freeze:'))).toBe(true);
    // the families a chart dances are all in today's map, unchanged
    expect(FAMILY_BUTTON).toEqual({ toprock: 'A', bounce: 'A', footwork: 'B', power: 'B', wave: 'X', transition: 'X', freeze: 'Y' });
  });
  it('dance staking is still off — it comes back only after the owner\'s real-DB proof (this change adds no staking code)', () => {
    expect(isStakingPaused('dance')).toBe(true);
  });
});

describe('the validator catches what it says it does', () => {
  const warm = (): { chart: DanceChart; song: FelSong } => ({ chart: clone(chartFor('warmup')!), song: song('warmup') });
  const cypher = (): { chart: DanceChart; song: FelSong } => ({ chart: clone(chartFor('cypher')!), song: song('cypher') });
  const first = (chart: DanceChart) => Object.values(chart.phrases).find((p) => p.notes)!;

  it('identity: wrong song, bpm, bars, format, author', () => {
    const { chart, song: s } = warm();
    expect(validateChart({ ...chart, song: 'cypher' }, s).join()).toMatch(/not "warmup"/);
    expect(validateChart({ ...chart, bpm: chart.bpm + 1 }, s).join()).toMatch(/bpm/);
    expect(validateChart({ ...chart, bars: chart.bars + 1 }, s).join()).toMatch(/bars/);
    expect(validateChart({ ...chart, format: 'x' }, s).join()).toMatch(/format/);
    expect(validateChart({ ...chart, author: '' }, s).join()).toMatch(/no author/);
  });
  it('a note off the difficulty\'s grid, and a double its difficulty does not allow', () => {
    const { chart, song: s } = warm();
    first(chart).notes!.push({ b: 7.5 });
    expect(validateChart(chart, s).join()).toMatch(/off the 1-beat grid/);
    const w = warm();
    first(w.chart).notes![1] = { ...first(w.chart).notes![1], x2: 0.5 };
    expect(validateChart(w.chart, w.song).join()).toMatch(/double of 0.5 beats is not allowed at difficulty 1/);
  });
  it('density too sparse or too dense for the song\'s own target', () => {
    const { chart: thin, song: s } = warm();
    for (const ph of Object.values(thin.phrases)) if (ph.notes) ph.notes = ph.notes.filter((n) => n.m !== undefined).slice(0, 1);
    expect(validateChart(thin, s).join()).toMatch(/taps a minute is outside/);
  });
  it('a style tap in the 290 ms before a move (it would be judged as an early press of the move)', () => {
    const { chart, song: s } = cypher();
    // cypher is 96 BPM (0.625 s a beat): a tap 0.25 beat (about 150 ms with the swing) before a phrase second move
    const ph = Object.values(chart.phrases).find((p) => p.notes && p.notes.filter((n) => n.m !== undefined).length >= 2)!;
    const second = ph.notes!.filter((n) => n.m !== undefined)[1];
    ph.notes!.push({ b: second.b - 0.25 });
    ph.notes!.sort((a, b) => a.b - b.b);
    expect(validateChart(chart, s).join('\n')).toMatch(/a accent tap at beat [0-9.]+ is \d+ ms before the move at beat/);
  });
  it('a style tap inside a freeze\'s hold (the button is already down)', () => {
    const { chart, song: s } = cypher();
    const ph = Object.values(chart.phrases).find((p) => p.notes?.some((n) => n.m === 'babyfreeze'))!;
    const f = ph.notes!.find((n) => n.m === 'babyfreeze')!;
    ph.notes!.push({ b: f.b + 1 });
    ph.notes!.sort((a, b) => a.b - b.b);
    expect(validateChart(chart, s).join('\n')).toMatch(/falls inside the freeze held from beat/);
  });
  it('a freeze with no room to let go before the next move', () => {
    const { chart, song: s } = cypher();
    const ph = Object.values(chart.phrases).find((p) => p.notes?.some((n) => n.m === 'babyfreeze'))!;
    const i = ph.notes!.findIndex((n) => n.m === 'babyfreeze');
    const next = ph.notes!.slice(i + 1).find((n) => n.m !== undefined);
    if (next) {
      next.b = ph.notes![i].b + 2;
      expect(validateChart(chart, s).join('\n')).toMatch(/less than 0.5 beat before the next move/);
    }
  });
  it('a missing break freeze, a section not filled, an unknown phrase and an unknown move', () => {
    const a = cypher();
    for (const ph of Object.values(a.chart.phrases)) ph.notes?.forEach((n) => { if (n.m === 'babyfreeze') n.m = 'toprock'; });
    expect(validateChart(a.chart, a.song).join('\n')).toMatch(/no freeze on its downbeat|no move ever calls horns/);
    const b = cypher();
    b.chart.sections[0].play.pop();
    expect(validateChart(b.chart, b.song).join('\n')).toMatch(/bars of phrases/);
    const c = cypher();
    c.chart.sections[0].play.push('ghost');
    expect(validateChart(c.chart, c.song).join('\n')).toMatch(/unknown phrase "ghost"/);
    const d = cypher();
    first(d.chart).notes![0] = { b: 0, m: 'cartwheel' };
    expect(validateChart(d.chart, d.song).join('\n')).toMatch(/"cartwheel" is not a move/);
  });
  it('every difficulty has a rule, from quarters to sixteenths', () => {
    expect(Object.keys(DIFFICULTY_RULES).map(Number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(DIFFICULTY_RULES[1].grid).toBe(1);
    expect(DIFFICULTY_RULES[6].grid).toBe(0.25);
  });
});

describe('the swing', () => {
  it('only an odd sixteenth is late, by 2 × (swing − 0.5) sixteenths', () => {
    expect(swingBeat(1, 0.55)).toBe(1);
    expect(swingBeat(1.5, 0.55)).toBe(1.5);                   // an eighth: even sixteenth
    expect(swingBeat(1.25, 0.55)).toBeCloseTo(1.25 + (2 * 0.05) / 4, 9);
    expect(swingBeat(1.75, 0.5)).toBe(1.75);
    expect(swingBeat(1.3, 0.55)).toBe(1.3);                   // off the sixteenth grid: untouched
  });
  it('a style tap lands where the band plays it: its swung beat, and a tap there is inside the groove window', () => {
    const s = song('canals');
    const { presses } = expandChart(chartFor('canals')!, s);
    const swung = presses.find((p) => p.swungBeat !== p.beat);
    expect(swung).toBeDefined();
    expect(chartStyleBeatsFor(s)!.includes(swung!.swungBeat) || chartStepsFor(s)!.some((x) => x.beat === swung!.swungBeat)).toBe(true);
    expect(GROOVE_WINDOW_SEC).toBeLessThan(MISS_AFTER);
  });
});
