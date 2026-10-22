// danceOptions.test.ts — the owner's 2026-10-17 dance choices (lane/dance-options; docs/DANCE-EXTRAS-OPTIONS.md "Chosen and built"):
//   Q1 A  five short names spelled as the captured moves' ids in the chart files (kick step, helicopter, headstand, moonwalk, robot);
//   Q2 A  the VARIETY bonus: +50 STYLE a different button that took a slot, past the first, at most +150 a section;
//   Q3 A  a second freestyle section on every song, at the end of the first hook;
//   Q4 A  moonwalk and robot timing unchanged (nothing to test here: danceClips.captures.test.ts pins their composition);
//   Q5 A  canals' captured moonwalk on the first hook's arm wave (beat 84), where the cap keeps it scored and it plays whole;
//   Q6    the section's EDGE: a wrong button in its last moment never fumbles the next step, and the EXIT GRACE absorbs a would-be wild tap.
// What none of them may move is held here too: the scored steps, a flawless NORMAL / EASY score, the combo of a flawless run, and the rule
// that a step nobody presses expires a MISS that breaks the combo.
import { describe, expect, it } from 'vitest';
import type { FelInput } from '../core/InputBus';
import { MISS_AFTER, beatDuration, DancePerformance, type DanceStep } from '../core/DanceCore';
import { CHART_SONG_IDS, chartFor, planChart, stepsFromPresses, styleBeatsFromPresses, validateChart, type DanceChart } from './chart';
import { buttonForStep, chartForLevel, GROOVE_STYLE } from './chartPlay';
import { EXIT_GRACE_SEC, VARIETY_CAP, VARIETY_STYLE, exitGraceForgives, routeFreestyle, varietyBonus, type FreeSpan, type PadSlot } from './freestyle';
import { danceMove, isCapturedMove } from './moves';
import { songFor } from './felSongs';
import { runChain, type TimedInput } from '../../../tests/helpers/dancePressChain';

const press = (btn: PadSlot, pressed = true): FelInput => ({ t: 'button', btn, pressed });
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const flawless = (steps: readonly DanceStep[], bpm: number): number => {
  const perf = new DancePerformance(bpm);
  perf.setRoutine([...steps]);
  perf.start(0);
  const bd = beatDuration(bpm);
  for (const x of steps) { perf.update(x.beat * bd); perf.hit(x.beat * bd); }
  return perf.result().score;
};

/** A shipped chart as the room plays it: its scored steps, STYLE beats and sections, and a flawless player's presses. */
function played(id: string) {
  const song = songFor(id)!;
  const plan = planChart(chartFor(id)!, song);
  const steps = stepsFromPresses(plan.scored);
  const styleBeats = styleBeatsFromPresses(plan.style);
  const spans = plan.freeSpans;
  const bd = beatDuration(song.bpm);
  const inSpan = (b: number) => spans.some((f) => b >= f.start && b < f.end);
  const slots = styleBeats.filter(inSpan);
  /** Every step on its beat with its MATCH button (A with MATCH off), every STYLE tap outside the sections on its beat; `late` (s) shifts
   *  the presses that come within a second after a section's end (the player dancing on, a little late). */
  const onBeat = (late = 0, match = true): TimedInput[] => {
    const nearEnd = (b: number) => spans.some((f) => b >= f.end && (b - f.end) * bd < 1);
    return [
      // with MATCH off only A and B are taps (SongClock.danceTap): the player taps A
      ...steps.map((s) => ({ at: s.beat * bd + (nearEnd(s.beat) ? late : 0), ev: press(match ? buttonForStep(s) : 'A') })),
      ...styleBeats.filter((b) => !inSpan(b)).map((b) => ({ at: b * bd + (nearEnd(b) ? late : 0), ev: press('A') })),
    ];
  };
  const endAt = (Math.max(...steps.map((s) => s.beat + s.holdBeats)) + 4) * bd;
  const run = (inputs: TimedInput[], o: { match?: boolean; edgeFix?: boolean } = {}) =>
    runChain({ steps, bpm: song.bpm, match: o.match ?? true, inputs, styleBeats, freeSpans: spans, endAt, edgeFix: o.edgeFix });
  return { song, plan, steps, styleBeats, spans, bd, slots, onBeat, run };
}

// ── Q2: the VARIETY bonus ──────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('Q2 the VARIETY bonus: +50 a different button that took a slot, past the first, at most +150 a section', () => {
  it('TUNED (new, owner 2026-10-17): 50 a button, 150 a section', () => {
    expect(VARIETY_STYLE).toBe(50);
    expect(VARIETY_CAP).toBe(150);
    expect(VARIETY_CAP).toBe(3 * VARIETY_STYLE);   // the cap is all four buttons, not a fifth
  });
  it('the rule: one button 0, however often; two +50; three +100; four +150; repeats and order change nothing', () => {
    expect(varietyBonus([])).toBe(0);
    expect(varietyBonus(['A'])).toBe(0);
    expect(varietyBonus(Array(40).fill('B'))).toBe(0);
    expect(varietyBonus(['A', 'B'])).toBe(50);
    expect(varietyBonus(['A', 'B', 'X'])).toBe(100);
    expect(varietyBonus(['Y', 'A', 'Y', 'X', 'A', 'B', 'B'])).toBe(150);
    expect(varietyBonus(['B', 'X', 'A', 'Y', 'A', 'B', 'X', 'Y'])).toBe(VARIETY_CAP);
  });

  const { slots, spans, bd, onBeat, run } = played('battle');   // 8 slots a section, a slot every beat
  const sectionPresses = (pick: (i: number) => PadSlot, at: (b: number) => number = (b) => b * bd): TimedInput[] =>
    spans.flatMap((f) => slots.filter((b) => b >= f.start && b < f.end).map((b, i) => ({ at: at(b), ev: press(pick(i)) })));
  const base = run(onBeat());

  it('MASHING ONE BUTTON earns no variety: 8 presses a second through every section, one button, any of the four', () => {
    for (const btn of ['A', 'B', 'X', 'Y'] as const) {
      const mash: TimedInput[] = spans.flatMap((f) => {
        const out: TimedInput[] = [];
        for (let t = f.start * bd + 0.01; t < f.end * bd - MISS_AFTER; t += 0.125) out.push({ at: t, ev: press(btn) });
        return out;
      });
      const r = run([...onBeat(), ...mash]);
      expect(r.variety, btn).toBe(0);
      expect(r.score, btn).toBe(base.score);
    }
  });
  it('three buttons on the slots earn +100 a section, four +150, and five passes over the pad still +150 (the cap)', () => {
    const three = run([...onBeat(), ...sectionPresses((i) => (['A', 'B', 'X'] as const)[i % 3])]);
    expect(three.variety).toBe(100 * spans.length);
    const four = run([...onBeat(), ...sectionPresses((i) => (['A', 'B', 'X', 'Y'] as const)[i % 4])]);
    expect(four.variety).toBe(VARIETY_CAP * spans.length);
    expect(four.style - base.style).toBe(slots.length * GROOVE_STYLE + VARIETY_CAP * spans.length);
    const many = run([...onBeat(), ...sectionPresses((i) => (['A', 'B', 'X', 'Y', 'Y'] as const)[i % 5])]);
    expect(many.variety).toBe(VARIETY_CAP * spans.length);
  });
  it('only a press that TOOK a slot counts: new buttons pressed off the beat add nothing', () => {
    // A on every slot, and B / X / Y half a beat off every slot (inside the section, out of any slot's window): still one button
    const off = sectionPresses((i) => (['B', 'X', 'Y'] as const)[i % 3], (b) => (b + 0.5) * bd);
    const r = run([...onBeat(), ...sectionPresses(() => 'A'), ...off]);
    expect(r.variety).toBe(0);
    expect(r.freestyle).toBe(2 * slots.length);   // every one of them danced
  });
  it('it is STYLE only: the score, the combo, the counts and the labels are what the same run without the section presses has', () => {
    const r = run([...onBeat(), ...sectionPresses((i) => (['A', 'B', 'X', 'Y'] as const)[i % 4])]);
    expect({ score: r.score, maxCombo: r.maxCombo, counts: r.counts, labels: r.labels }).toEqual({ score: base.score, maxCombo: base.maxCombo, counts: base.counts, labels: base.labels });
  });
});

// ── Q6: the section's EDGE ─────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('Q6 the EDGE, the pure rules', () => {
  const step: DanceStep = { clipId: 'dance_toprock_basic', beat: 21, holdBeats: 4, mirrored: false };   // an A step
  const bd = beatDuration(120);
  const route = (e: FelInput, matchOn?: boolean) => routeFreestyle({
    e, tap: false, upcoming: [{ time: 10.1, step }], heardNow: 10, beatPos: 20, beatSec: bd, styleBeats: [], taken: new Set(), matchOn,
  });
  it('in a section, with the next step in reach: its own button is the step\'s; with MATCH on another button dances and pays nothing', () => {
    expect(route(press('A'), true)).toBeNull();
    for (const b of ['B', 'X', 'Y'] as const) expect(route(press(b), true), b).toEqual({ slot: b, slotBeat: null });
    // MATCH off (or absent: every caller before this lane): exactly as before — the step's
    for (const b of ['A', 'B', 'X', 'Y'] as const) { expect(route(press(b), false), b).toBeNull(); expect(route(press(b)), b).toBeNull(); }
  });
  const spans: FreeSpan[] = [{ start: 16, end: 24 }];
  const g = (beatPos: number, last: number | null, graceSec?: number) => exitGraceForgives({ spans, beatPos, beatSec: bd, lastSectionPressBeat: last, graceSec });
  it('TUNED (new, owner 2026-10-17): the grace is 100 ms — the GREAT window (90 ms) and a hair (measured: 95 ms is the least that clears every shipped chart)', () => {
    expect(EXIT_GRACE_SEC).toBe(0.1);
  });
  it('the grace: from the section\'s end to EXIT_GRACE_SEC after it, only for a player who pressed in the section\'s last MISS_AFTER', () => {
    const lastIn = 24 - 0.1 / bd;                                          // 100 ms before the end
    expect(g(24, lastIn)).toBe(true);
    expect(g(24 + (EXIT_GRACE_SEC - 0.001) / bd, lastIn)).toBe(true);
    expect(g(24 + (EXIT_GRACE_SEC + 0.001) / bd, lastIn)).toBe(false);    // too late
    expect(g(24 - 0.01, lastIn)).toBe(false);                             // still inside: that press is the section's own
    expect(g(24, 24 - (MISS_AFTER + 0.01) / bd)).toBe(false);             // the last press was not the section's last moment
    expect(g(24, 24 - (MISS_AFTER - 0.01) / bd)).toBe(true);
    expect(g(24, null)).toBe(false);                                      // never pressed in a section
    expect(g(24, 30)).toBe(false);                                        // a press outside the section does not count
    expect(g(24, lastIn, 0)).toBe(true);                                  // the boundary itself
    expect(exitGraceForgives({ spans: [], beatPos: 24, beatSec: bd, lastSectionPressBeat: lastIn })).toBe(false);
  });
});

describe('Q6 the EDGE on every shipped chart: a last-moment press never breaks the combo of the next on-beat step', () => {
  for (const id of CHART_SONG_IDS) {
    const { spans, steps, bd, onBeat, run } = played(id);
    const nextBtn = (f: FreeSpan): PadSlot => buttonForStep(steps.find((s) => s.beat >= f.end)!);
    // "right" = the button the player will press for the next step (its MATCH button, or A with MATCH off); "wrong" = another tap
    const lastMoment = (ms: number, right: boolean, match = true): TimedInput[] =>
      spans.map((f) => { const want = match ? nextBtn(f) : 'A'; return { at: f.end * bd - ms / 1000, ev: press(right ? want : want === 'A' ? 'B' : 'A') }; });
    it(`${id}: a press 20–190 ms before a section ends, right button or wrong, MATCH on or off, then dancing on up to 90 ms late: a full combo, no MISS`, () => {
      for (const match of [true, false]) for (const late of [0, 0.03, 0.06, 0.09]) for (const ms of [20, 60, 100, 150, 190]) for (const right of [true, false]) {
        const r = run([...onBeat(late, match), ...lastMoment(ms, right, match)], { match });
        const at = `${match ? 'MATCH' : 'any'} late ${late} press ${ms} ms ${right ? 'right' : 'wrong'}`;
        expect(r.counts.MISS, at).toBe(0);
        expect(r.maxCombo, at).toBe(steps.length);
      }
    });
    it(`${id}: without the fix (the room before this lane) the same players lose the combo — the case is real on this chart`, () => {
      let broken = 0;
      for (const match of [true, false]) for (const ms of [20, 60, 100, 150, 190]) for (const right of [true, false]) {
        const r = run([...onBeat(0.06, match), ...lastMoment(ms, right, match)], { match, edgeFix: false });
        if (r.counts.MISS > 0 || r.maxCombo < steps.length) broken++;
      }
      expect(broken).toBeGreaterThan(0);
    });
    it(`${id}: a step nobody presses is still a MISS that breaks the combo, with the grace on and a last-moment press`, () => {
      for (const f of spans) {
        const next = steps.find((s) => s.beat >= f.end)!;
        // the player presses in the section's last moment (wrong button: it dances) and then never presses the step after it
        const inputs = [...onBeat().filter((x) => Math.abs(x.at - next.beat * bd) > 1e-9), { at: f.end * bd - 0.1, ev: press(nextBtn(f) === 'A' ? 'B' : 'A') }];
        const r = run(inputs, { match: true });
        expect(r.counts.MISS, `${f.end}`).toBe(1);
        expect(r.maxCombo, `${f.end}`).toBeLessThan(steps.length);
        const plain = run(onBeat().filter((x) => Math.abs(x.at - next.beat * bd) > 1e-9), { match: true, edgeFix: false });
        expect(r.counts, `${f.end}`).toEqual(plain.counts);                 // exactly the miss the room always called
      }
    });
    it(`${id}: a flawless run is the same with the fix on: the same score, combo and labels, nothing graced`, () => {
      const on = run(onBeat()), off = run(onBeat(), { edgeFix: false });
      expect({ score: on.score, maxCombo: on.maxCombo, labels: on.labels }).toEqual({ score: off.score, maxCombo: off.maxCombo, labels: off.labels });
      expect(on.graced).toBe(0);
      expect(on.score).toBe(flawless(steps, songFor(id)!.bpm));
    });
  }
});

// ── Q1 / Q3 / Q5: the charts ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** The captured ids Q1 spelled, back to the short names the charts used before (and Q5's moonwalk back to the arm wave it was). */
const SHORT: Readonly<Record<string, string>> = {
  dance_toprock_kick: 'kickstep', dance_power_helicopter: 'helicopter', dance_power_headstand: 'headstand', dance_pop_moonwalk: 'moonwalk', dance_pop_robot: 'robot',
};
function unflipped(c0: DanceChart): DanceChart {
  const c = clone(c0);
  for (const [pid, ph] of Object.entries(c.phrases)) for (const n of ph.notes ?? []) if (n.m && SHORT[n.m]) n.m = pid === 'khAm' ? 'wave' : SHORT[n.m];
  return c;
}

describe('Q1 the five short names as the captures: only the clip a step dances changes', () => {
  for (const id of CHART_SONG_IDS) {
    it(`${id}: valid, and the same scored steps, STYLE taps, demotions and flawless NORMAL / EASY / HARD as the same chart with the short names`, () => {
      const song = songFor(id)!;
      const now = chartFor(id)!, before = unflipped(now);
      expect(validateChart(now, song)).toEqual([]);
      const a = planChart(now, song), b = planChart(before, song);
      const shape = (p: typeof a) => p.scored.map((x) => ({ at: x.swungBeat, fam: danceMove(x.clipId)!.category, mir: x.mirrored }));
      expect(shape(a)).toEqual(shape(b));
      expect(styleBeatsFromPresses(a.style)).toEqual(styleBeatsFromPresses(b.style));
      expect(a.demoted.map((x) => x.swungBeat)).toEqual(b.demoted.map((x) => x.swungBeat));
      const sa = stepsFromPresses(a.scored), sb = stepsFromPresses(b.scored);
      for (const level of ['normal', 'easy', 'hard'] as const) {
        const la = chartForLevel(sa, level, a.freeSpans), lb = chartForLevel(sb, level, b.freeSpans);
        expect(la.length, level).toBe(lb.length);
        expect(flawless(la, song.bpm), level).toBe(flawless(lb, song.bpm));
      }
      // no short name of the five is left in the chart, and the side freeze stays the baby freeze
      const raw = JSON.stringify(now);
      for (const name of Object.values(SHORT)) expect(raw, name).not.toContain(`"m": "${name}"`);
      expect(planChart(now, song).presses.some((p) => p.clipId === 'dance_freeze_side')).toBe(false);
    });
  }
  it('the captured moves players now see as scored steps: goldenhour 1, battle 2, canals 3, evolution 7', () => {
    const scoredCaptures = Object.fromEntries(CHART_SONG_IDS.map((id) => [id, planChart(chartFor(id)!, songFor(id)!).scored.filter((p) => isCapturedMove(p.clipId)).length]));
    expect(scoredCaptures).toEqual({ warmup: 0, cypher: 0, goldenhour: 1, battle: 2, canals: 3, evolution: 7 });
  });
});

describe('Q5 canals\' captured moonwalk is a scored step that plays whole', () => {
  it('beat 84 (the first hook\'s first arm wave): the moonwalk, scored, on MATCH\'s X, with its 4 beats before the next step', () => {
    const song = songFor('canals')!;
    const steps = stepsFromPresses(planChart(chartFor('canals')!, song).scored);
    const i = steps.findIndex((s) => s.clipId === 'dance_pop_moonwalk');
    expect(i).toBeGreaterThan(-1);
    expect(steps[i].beat).toBe(84);
    expect(steps[i].holdBeats).toBe(4);
    expect(buttonForStep(steps[i])).toBe('X');
    expect(steps[i + 1].beat - steps[i].beat).toBeGreaterThanOrEqual(steps[i].holdBeats);   // nothing cuts it
    expect(steps.filter((s) => s.clipId === 'dance_pop_moonwalk')).toHaveLength(1);       // the last verse's moonwalk stays a STYLE tap, as ever
  });
});

describe('Q3 two freestyle sections a song: the first hook\'s end and the last hook\'s', () => {
  it('the sections, in song beats', () => {
    expect(Object.fromEntries(CHART_SONG_IDS.map((id) => [id, planChart(chartFor(id)!, songFor(id)!).freeSpans]))).toEqual({
      warmup: [{ start: 72, end: 80 }, { start: 128, end: 136 }],
      cypher: [{ start: 72, end: 80 }, { start: 136, end: 144 }],
      goldenhour: [{ start: 72, end: 80 }, { start: 152, end: 160 }],
      battle: [{ start: 72, end: 80 }, { start: 168, end: 176 }],
      canals: [{ start: 104, end: 112 }, { start: 184, end: 192 }],
      evolution: [{ start: 88, end: 96 }, { start: 208, end: 216 }],
    });
  });
  it('HARD\'s fill keeps clear of the new sections: the flawless HARD run, pinned per song (before the second section: 12,240 / 21,930 / 24,200 / 22,490 / 23,055 / 28,980 over 32 / 51 / 55 / 52 / 53 / 63 steps)', () => {
    const hard = Object.fromEntries(CHART_SONG_IDS.map((id) => {
      const song = songFor(id)!;
      const plan = planChart(chartFor(id)!, song);
      const steps = chartForLevel(stepsFromPresses(plan.scored), 'hard', plan.freeSpans);
      return [id, [steps.length, flawless(steps, song.bpm)]];
    }));
    expect(hard).toEqual({
      warmup: [31, 11780], cypher: [47, 19740], goldenhour: [54, 23625], battle: [50, 21375], canals: [52, 22490], evolution: [61, 27755],
    });
  });
});
