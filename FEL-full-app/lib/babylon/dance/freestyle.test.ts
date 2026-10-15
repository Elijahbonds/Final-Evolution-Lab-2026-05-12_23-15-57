// freestyle.test.ts — the FREESTYLE SECTION, redesigned for MATCH (lane/dance-extras, 2026-10-14). What these hold:
//   1. THE BUTTONS: every freestyle move is a move of the family MATCH gives its button, every captured move is reachable here, and a deck
//      cycles deterministically.
//   2. THE ROUTE: a face button (any of the four, MATCH on or off) or a tap picks a move; a release, a stick or a d-pad does not; a press
//      the judge would take for a step is NOT taken; a press on a freestyle slot pays GROOVE_STYLE once and nothing else pays anything.
//   3. THE CHART'S HALF: a section holds no scored move, ends a freeze's hold a clear gap before it, is two bars at least; flagging a free
//      phrase changes no step, no STYLE beat and no density (so no pay); HARD's fill leaves a section empty.
//   4. THE SCORE DOES NOT KNOW: a whole chart played with a mashing thumb in every section scores the same, combo for combo, as the same
//      chart without one; the only difference is the STYLE tally.
import { describe, expect, it } from 'vitest';
import type { FelInput } from '../core/InputBus';
import { DANCE_LIBRARY, MISS_AFTER, beatDuration } from '../core/DanceCore';
import { FAMILY_BUTTON, GROOVE_STYLE, GROOVE_WINDOW_SEC, chartForLevel } from './chartPlay';
import { CAPTURED_MOVES, danceMove } from './moves';
import {
  FREESTYLE_PAD, FreestyleDeck, freeButtonOf, freeName, freeSpanAt, freeStyleFor, legendLine, nextFreeSpan, routeFreestyle, type FreeSpan, type PadSlot,
} from './freestyle';
import {
  CHART_SONG_IDS, chartFor, chartFreeSpansFor, chartStats, chartStepsFor, chartStyleBeatsFor, expandChart, planChart, stepsFromPresses, styleBeatsFromPresses, validateChart,
  type DanceChart,
} from './chart';
import { songFor } from './felSongs';
import { freeSpansFor, DANCE_TRACKS, stepsFor } from '../core/danceTracks';
import { runChain, sampleSteps, type TimedInput } from '../../../tests/helpers/dancePressChain';

const SLOTS: PadSlot[] = ['A', 'B', 'X', 'Y'];
const press = (btn: PadSlot, pressed = true): FelInput => ({ t: 'button', btn, pressed });
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('the buttons: each dances a move of the family MATCH gives it', () => {
  it('every freestyle move is a real move, and its family is that button\'s MATCH family', () => {
    for (const slot of SLOTS) {
      expect(FREESTYLE_PAD[slot].length, slot).toBeGreaterThanOrEqual(2);
      expect(new Set(FREESTYLE_PAD[slot]).size, `${slot} has no repeats`).toBe(FREESTYLE_PAD[slot].length);
      for (const id of FREESTYLE_PAD[slot]) {
        expect(danceMove(id), id).not.toBeNull();
        expect(FAMILY_BUTTON[danceMove(id)!.category], `${id} on ${slot}`).toBe(slot);
        expect(freeButtonOf(id)).toBe(slot);
      }
    }
  });
  it('the six captured moves are all here — freestyle is where a player picks them — and the eight library moves too', () => {
    const all = new Set(SLOTS.flatMap((s) => FREESTYLE_PAD[s]));
    for (const m of CAPTURED_MOVES) expect(all.has(m.id), m.id).toBe(true);
    for (const c of DANCE_LIBRARY) expect(all.has(c.id), c.id).toBe(true);
  });
  it('a deck cycles each button through its moves in order, deterministically, and wraps', () => {
    const d = new FreestyleDeck();
    const seen: string[] = [];
    for (let i = 0; i < FREESTYLE_PAD.B.length + 2; i++) seen.push(d.press('B').clipId);
    expect(seen.slice(0, FREESTYLE_PAD.B.length)).toEqual([...FREESTYLE_PAD.B]);
    expect(seen[FREESTYLE_PAD.B.length]).toBe(FREESTYLE_PAD.B[0]);
    const e = new FreestyleDeck();
    expect(e.press('A').clipId).toBe(FREESTYLE_PAD.A[0]);              // a fresh deck starts the same way every time
    e.reset();
    expect(e.press('A').clipId).toBe(FREESTYLE_PAD.A[0]);
  });
  it('the legend is what each button will dance next, by name; consecutive presses alternate the mirror', () => {
    const d = new FreestyleDeck();
    expect(d.legend()).toEqual({ A: 'TOP ROCK', B: 'SIX STEP', X: 'ARM WAVE', Y: 'BABY FREEZE' });
    expect(legendLine(d.legend())).toBe('A TOP ROCK · B SIX STEP · X ARM WAVE · Y BABY FREEZE');
    expect(d.press('A').mirrored).toBe(false);
    expect(d.legend().A).toBe('KICK STEP');                              // the next press of A
    expect(d.press('A').mirrored).toBe(true);
    expect(d.press('X').mirrored).toBe(false);
    expect(freeName('dance_power_headstand')).toBe('HEADSTAND SPIN');
  });
});

describe('spans', () => {
  const spans: FreeSpan[] = [{ start: 8, end: 16 }, { start: 40, end: 48 }];
  it('are half-open [start, end), found by position, and never confused with the gaps', () => {
    expect(freeSpanAt(spans, 7.999)).toBeNull();
    expect(freeSpanAt(spans, 8)).toBe(spans[0]);
    expect(freeSpanAt(spans, 15.999)).toBe(spans[0]);
    expect(freeSpanAt(spans, 16)).toBeNull();
    expect(freeSpanAt(spans, 44)).toBe(spans[1]);
    expect(freeSpanAt(spans, 48)).toBeNull();
    expect(freeSpanAt([], 10)).toBeNull();
    expect(freeSpanAt(spans, Number.NaN)).toBeNull();
    expect(freeSpanAt(spans, -3)).toBeNull();
  });
  it('the next one is the first that starts after a position', () => {
    expect(nextFreeSpan(spans, 0)).toBe(spans[0]);
    expect(nextFreeSpan(spans, 8)).toBe(spans[1]);
    expect(nextFreeSpan(spans, 40)).toBeNull();
  });
});

describe('the route: a freestyle press is a move, never the judge', () => {
  const bd = beatDuration(120);                                       // 0.5 s
  const route = (e: FelInput, o: Partial<Parameters<typeof routeFreestyle>[0]> = {}) => routeFreestyle({
    e, tap: false, upcoming: [], heardNow: 10, beatPos: 20, beatSec: bd, styleBeats: [], taken: new Set(), ...o,
  });
  it('every face button picks, MATCH on or off: X and Y are moves here even though they are not taps outside MATCH', () => {
    for (const slot of SLOTS) expect(route(press(slot))?.slot).toBe(slot);
  });
  it('a trigger pull or SPACE (a tap with no button) is an A', () => {
    expect(route({ t: 'trigger', side: 'R', value: 1 }, { tap: true })?.slot).toBe('A');
  });
  it('a release, a stick, a d-pad and a shoulder are not freestyle presses', () => {
    expect(route(press('A', false))).toBeNull();
    expect(route({ t: 'stick', side: 'L', x: 1, y: 0 })).toBeNull();
    expect(route({ t: 'dpad', dir: 'left', pressed: true })).toBeNull();
    expect(route({ t: 'button', btn: 'L1', pressed: true })).toBeNull();
    expect(route({ t: 'button', btn: 'A', pressed: true, src: 'space' })).toBeNull();      // SPACE's made-up key-up A
  });
  it('a press the judge would take for a step is NOT taken: the section\'s edges belong to the steps', () => {
    const step = { clipId: 'dance_toprock_basic', beat: 21, holdBeats: 4, mirrored: false };
    for (const dt of [-MISS_AFTER + 0.001, -0.05, 0, 0.05, MISS_AFTER - 0.001]) {
      expect(route(press('A'), { upcoming: [{ time: 10 + dt, step }] }), `step ${dt} s away`).toBeNull();
    }
    expect(route(press('A'), { upcoming: [{ time: 10 + MISS_AFTER + 0.05, step }] })).not.toBeNull();    // out of reach: a move
    expect(route(press('A'), { upcoming: [{ time: 10 - MISS_AFTER - 0.05, step }] })).not.toBeNull();
  });
  it('a press on a freestyle slot takes it once and pays GROOVE_STYLE; off a slot it pays nothing; the same slot twice pays once', () => {
    const slots = [18, 20, 22];
    const taken = new Set<number>();
    const on = route(press('A'), { styleBeats: slots, beatPos: 20.05, taken });
    expect(on).toEqual({ slot: 'A', slotBeat: 20 });
    expect(freeStyleFor(on!)).toBe(GROOVE_STYLE);
    taken.add(20);
    const again = route(press('B'), { styleBeats: slots, beatPos: 20.02, taken });
    expect(again).toEqual({ slot: 'B', slotBeat: null });
    expect(freeStyleFor(again!)).toBe(0);
    const off = route(press('Y'), { styleBeats: slots, beatPos: 21 });
    expect(off).toEqual({ slot: 'Y', slotBeat: null });
    expect(freeStyleFor(off!)).toBe(0);
    // the window is the one every STYLE tap has (the GREAT window): a hair inside takes it, a hair outside does not
    const w = GROOVE_WINDOW_SEC / bd;
    expect(route(press('A'), { styleBeats: slots, beatPos: 20 + w - 0.001 })!.slotBeat).toBe(20);
    expect(route(press('A'), { styleBeats: slots, beatPos: 20 + w + 0.001 })!.slotBeat).toBeNull();
  });
  it('the only STYLE number is the one that already existed (a groove tap\'s)', () => {
    expect(GROOVE_STYLE).toBe(50);
    for (const slotBeat of [null, 1, 2.5]) expect([0, GROOVE_STYLE]).toContain(freeStyleFor({ slot: 'A', slotBeat }));
  });
});

// ── the chart's half ───────────────────────────────────────────────────────────────────────────────────────────

describe('a chart marks a section; the validator holds its half of the promise', () => {
  // the chart without its shipped marks (cypher's last hook ends in a section now): the tests below add their own
  const cypher = () => { const c = clone(chartFor('cypher')!); for (const p of Object.values(c.phrases)) if (p.free) delete p.free.freestyle; return c; };
  const flag = (c: DanceChart, pid: string) => { c.phrases[pid].free!.freestyle = true; return c; };

  it('flagging a free phrase makes each play of it a FREESTYLE section: the same slots, so the same steps, STYLE beats and density', () => {
    const song = songFor('cypher')!;
    const plain = cypher(), marked = flag(cypher(), 'free2');
    expect(validateChart(marked, song)).toEqual([]);
    const a = planChart(plain, song), b = planChart(marked, song);
    expect(a.freeSpans).toEqual([]);
    expect(b.freeSpans.length).toBe(plain.sections.reduce((n, sec) => n + sec.play.filter((p) => p === 'free2').length, 0));
    for (const f of b.freeSpans) { expect(f.end - f.start).toBe(8); expect(f.start % 4).toBe(0); }
    expect(stepsFromPresses(b.scored)).toEqual(stepsFromPresses(a.scored));                                // no step changed
    expect(styleBeatsFromPresses(b.style)).toEqual(styleBeatsFromPresses(a.style));                        // no slot moved
    expect(chartStats(marked, song)).toEqual(chartStats(plain, song));                                     // no density change
  });
  it('two flagged phrases in a row are one section', () => {
    const song = songFor('cypher')!;
    const c = cypher();
    c.phrases.fsA = { bars: 2, free: { every: 2, freestyle: true } };
    // verse(23, 6 bars): cvA cvC free2 → put two flagged free phrases back to back at the end of the outro instead of called notes would change the chart's
    // moves; the expansion rule is what is tested, on a bare expansion
    const sec = c.sections[4];
    sec.play = ['cvA', 'cvC', 'fsA'];
    const ex = expandChart(c, song);
    expect(ex.freeSpans).toEqual([{ start: (23 - 1) * 4 + 16, end: (23 - 1) * 4 + 24 }]);
    c.sections[4].play = ['cvA', 'fsA', 'fsA'];                                // 2 + 2 + 2 bars: not the song's 6… the expansion still merges
    const ex2 = expandChart(c, song);
    expect(ex2.freeSpans).toEqual([{ start: (23 - 1) * 4 + 8, end: (23 - 1) * 4 + 24 }]);
  });
  it('a section is a free phrase of two bars or more; a called phrase cannot be one; the flag is true or absent', () => {
    const song = songFor('cypher')!;
    const short = cypher(); short.phrases.fs1 = { bars: 1, free: { every: 2, freestyle: true } };
    short.sections[2].play = ['chA', 'free2', 'chA', 'free2'];
    expect(validateChart(short, song)).toEqual([]);                                // an unused phrase is no section
    short.sections[3] = { ...short.sections[3], play: ['brk'] };
    const used = cypher(); used.phrases.fs1 = { bars: 1, free: { every: 2, freestyle: true } };
    used.sections[5] = { ...used.sections[5], bars: 7, play: ['chB', 'free2', 'chA', 'fs1'] };                  // 2 + 2 + 2 + 1 = 7 ≠ 8, which the validator also says
    expect(validateChart(used, song).join('|')).toContain('needs at least two');
    const called = cypher(); called.phrases.chA.free = { every: 2, freestyle: true } as never;
    expect(validateChart(called, song).join('|')).toMatch(/exactly one of notes \/ free|not a called one/);
    const odd = cypher(); (odd.phrases.free2.free as { freestyle?: unknown }).freestyle = 'yes';
    expect(validateChart(odd, song).join('|')).toContain('freestyle is true or absent');
  });
  it('a freeze held into a section, or ending less than a beat before it, is refused', () => {
    const song = songFor('cypher')!;
    const c = cypher();
    // the break's freeze (2 beats) at the start of its bar, then a section right after the break: bar 21–22 is the break; make the next phrase a freestyle one
    c.phrases.brkFree = { bars: 2, notes: [{ b: 0, m: 'babyfreeze' }] };
    c.phrases.fsB = { bars: 2, free: { every: 2, freestyle: true } };
    c.sections[3] = { ...c.sections[3], play: ['brkFree'] };
    c.sections[4] = { ...c.sections[4], play: ['fsB', 'cvC', 'free2'] };
    const problems = validateChart(c, song).join('|');
    expect(problems).not.toContain('the freeze at beat 80 is held until');           // 2 bars after its end: clear
    const near = cypher();
    near.phrases.brkNear = { bars: 2, notes: [{ b: 6, m: 'babyfreeze' }] };          // beats 6–8: ends exactly where the section starts
    near.phrases.fsB = { bars: 2, free: { every: 2, freestyle: true } };
    near.sections[3] = { ...near.sections[3], play: ['brkNear'] };
    near.sections[4] = { ...near.sections[4], play: ['fsB', 'cvC', 'free2'] };
    expect(validateChart(near, song).join('|')).toContain('less than 0.5 beat before the freestyle section');
  });
});

describe('the shipped charts', () => {
  it('only the charts\' own marked phrases are sections, each two bars, each on a bar line, each empty of steps', () => {
    for (const id of CHART_SONG_IDS) {
      const song = songFor(id)!;
      const chart = chartFor(id)!;
      expect(validateChart(chart, song), id).toEqual([]);
      const spans = chartFreeSpansFor(id)!;
      const flagged = Object.entries(chart.phrases).filter(([, p]) => p.free?.freestyle === true).map(([k]) => k);
      const uses = chart.sections.reduce((n, sec) => n + sec.play.filter((p) => flagged.includes(p)).length, 0);
      expect(spans.length, `${id}: one section per play of a flagged phrase`).toBe(uses);
      const steps = chartStepsFor(id)!;
      for (const f of spans) {
        expect(f.start % 4, `${id} section start`).toBe(0);
        expect(f.end - f.start, `${id} section length`).toBeGreaterThanOrEqual(8);
        expect(steps.filter((s) => s.beat >= f.start && s.beat < f.end), `${id}: a step inside ${f.start}–${f.end}`).toEqual([]);
      }
    }
  });
  it('the opt-in sections: each song\'s last hook ends in one (the climax), and nothing else changed', () => {
    for (const id of CHART_SONG_IDS) expect(chartFreeSpansFor(id)!.length, id).toBe(1);
  });
  it('the sections cost nothing: the song\'s scored steps and STYLE beats are what the same chart without the flags plays', () => {
    for (const id of CHART_SONG_IDS) {
      const song = songFor(id)!;
      const marked = chartFor(id)!;
      const plain = clone(marked);
      for (const p of Object.values(plain.phrases)) if (p.free) delete p.free.freestyle;
      const a = planChart(marked, song), b = planChart(plain, song);
      expect(stepsFromPresses(a.scored), id).toEqual(stepsFromPresses(b.scored));
      expect(styleBeatsFromPresses(a.style), id).toEqual(styleBeatsFromPresses(b.style));
      expect(chartStats(marked, song), id).toEqual(chartStats(plain, song));
      expect(chartStyleBeatsFor(id)).toEqual(styleBeatsFromPresses(b.style));
    }
  });
  it('freeSpansFor answers a shipped track\'s chart and nothing for any other track', () => {
    for (const t of DANCE_TRACKS) {
      if (t.song) expect(freeSpansFor(t), t.id).toEqual(chartFreeSpansFor(t.song));
      else expect(freeSpansFor(t), t.id).toEqual([]);
    }
    expect(freeSpansFor({ ...DANCE_TRACKS[0], id: 'export:nothing', song: undefined } as never)).toEqual([]);
  });
});

describe('HARD\'s fill leaves a section empty; every other level is untouched', () => {
  it('no step starts inside a section at any level, and with no sections the chart is byte for byte what it was', () => {
    for (const id of CHART_SONG_IDS) {
      const steps = chartStepsFor(id)!;
      const spans = chartFreeSpansFor(id)!;
      for (const level of ['easy', 'normal', 'hard'] as const) {
        const plain = chartForLevel(steps, level);
        expect(chartForLevel(steps, level, []), `${id} ${level} with no sections`).toEqual(plain);
        const kept = chartForLevel(steps, level, spans);
        for (const f of spans) expect(kept.filter((s) => s.beat >= f.start && s.beat < f.end), `${id} ${level} step inside ${f.start}–${f.end}`).toEqual([]);
        if (level !== 'hard') expect(kept, `${id} ${level}`).toEqual(plain);
      }
    }
  });
  it('HARD does fill gaps that are not sections (the guard is not a switch-off)', () => {
    const steps = [{ clipId: 'dance_toprock_basic', beat: 0, holdBeats: 4, mirrored: false }, { clipId: 'dance_toprock_basic', beat: 24, holdBeats: 4, mirrored: false }];
    expect(chartForLevel(steps, 'hard').length).toBeGreaterThan(2);
    const kept = chartForLevel(steps, 'hard', [{ start: 8, end: 16 }]);
    for (const s of kept) expect(s.beat >= 8 && s.beat < 16, `${s.beat}`).toBe(false);
    expect(kept.length).toBeGreaterThan(2);                                                   // the room before the section is still filled
  });
});

// ── the score does not know ────────────────────────────────────────────────────────────────────────────────────

describe('a whole chart with a mashing thumb in every section scores what it scores without one', () => {
  const bpm = 120, bd = beatDuration(bpm);
  const steps = sampleSteps();                                              // A B X Y A X B, beats 0 4 12 16 20 24 28 (the last ends at 36)
  const spans: FreeSpan[] = [{ start: 37, end: 45 }];                        // after the last step: inside one, the song is past its steps
  const T = (beat: number) => beat * bd;
  const flawless: TimedInput[] = steps.map((s, i) => ({ at: T(s.beat), ev: press((['A', 'B', 'X', 'Y', 'A', 'X', 'B'] as PadSlot[])[i]) }));
  const styleBeats = [38, 40, 42, 44];
  const mash = (n: number, from: number, to: number): TimedInput[] => Array.from({ length: n }, (_, i) => ({ at: from + ((to - from) * i) / n + (i % 3) * 0.013, ev: press(SLOTS[i % 4]) }));

  it('flawless play is the same with the section, press for press', () => {
    const a = runChain({ steps, bpm, match: true, inputs: flawless, endAt: T(50) });
    const b = runChain({ steps, bpm, match: true, inputs: flawless, endAt: T(50), freeSpans: spans, styleBeats });
    expect({ ...b, style: 0, freestyle: 0, moves: [] }).toEqual({ ...a, style: 0, freestyle: 0, moves: [] });
  });
  it('mashing inside the section: the score, the combo, the counts and the labels are untouched; only STYLE moves, by GROOVE_STYLE per slot', () => {
    const inputs = [...flawless, ...mash(40, T(37), T(45))];
    const without = runChain({ steps, bpm, match: true, inputs: flawless, endAt: T(50) });
    const withSection = runChain({ steps, bpm, match: true, inputs, endAt: T(50), freeSpans: spans, styleBeats });
    expect(withSection.score).toBe(without.score);
    expect(withSection.combo).toBe(without.combo);
    expect(withSection.maxCombo).toBe(without.maxCombo);
    expect(withSection.counts).toEqual(without.counts);
    expect(withSection.labels).toEqual(without.labels);
    expect(withSection.freestyle).toBe(40);                                               // every one of them was a move
    expect(withSection.moves.length).toBe(40);
    expect(withSection.style).toBeGreaterThan(0);
    expect(withSection.style % GROOVE_STYLE).toBe(0);
    expect(withSection.style).toBeLessThanOrEqual(styleBeats.length * GROOVE_STYLE);       // at most one payout per slot
  });
  it('the same mash with MATCH off is the same: X and Y dance too, and still nothing reaches the score', () => {
    const inputs = [...flawless.filter((x) => (x.ev as { btn: string }).btn === 'A' || (x.ev as { btn: string }).btn === 'B'), ...mash(40, T(37), T(45))];
    const without = runChain({ steps, bpm, match: false, inputs: inputs.filter((x) => x.at < T(37)), endAt: T(50) });
    const withSection = runChain({ steps, bpm, match: false, inputs, endAt: T(50), freeSpans: spans, styleBeats });
    expect(withSection.score).toBe(without.score);
    expect(withSection.counts).toEqual(without.counts);
    expect(withSection.freestyle).toBe(40);
  });
  it('and with no section the same presses are the wild taps they always were (the section is the only thing that changes the answer)', () => {
    const inputs = [...flawless, ...mash(40, T(37), T(45))];
    const plain = runChain({ steps, bpm, match: true, inputs, endAt: T(50), styleBeats });
    expect(plain.freestyle).toBe(0);
    expect(plain.counts.MISS).toBeGreaterThan(0);
  });
  it('a press at the section\'s edge that the judge would take for a step is the step\'s, judged exactly as before', () => {
    // a section that ends right before a step: the press on the step's beat is not a move
    const edge: FreeSpan[] = [{ start: 8, end: 12 }];                                       // the X step is at 12
    const inputs: TimedInput[] = [{ at: T(0), ev: press('A') }, { at: T(4), ev: press('B') }, { at: T(12), ev: press('X') }];
    const a = runChain({ steps: steps.slice(0, 3), bpm, match: true, inputs, endAt: T(30) });
    const b = runChain({ steps: steps.slice(0, 3), bpm, match: true, inputs, endAt: T(30), freeSpans: edge });
    expect(b).toEqual({ ...a, freestyle: 0 });
  });
});
