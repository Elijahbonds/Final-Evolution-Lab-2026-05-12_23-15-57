// moves.test.ts — the Cypher's move vocabulary: DANCE_LIBRARY's eight, then the six captured moves (lane/dance-extras, 2026-10-14; from
// closed PR #46's moves.test.ts, redesigned for MATCH and for today's charts). What these hold:
//   1. DANCE_LIBRARY is untouched (movement play's file; generateRoutine and DanceExport read it).
//   2. every captured move is a real capture with its licence, registered with the rest, with a sibling and a last-resort alias.
//   3. EVERY READER KNOWS THEM: each captured move has a MATCH button (its family's), a name and colour on the cue lane, an
//      instrument its family earns, the HOLD rule when it is a freeze, a floor phase when it goes to the floor.
//   4. EXISTING CHARTS ARE UNCHANGED: the six short names still answer with the library clip they always did, and every shipped chart
//      still validates; no chart calls a captured move unless it names one (the opt-in phrases, dance/charts/*.json, are the only ones).
import { describe, expect, it } from 'vitest';
import { DANCE_LIBRARY, generateRoutine } from '../core/DanceCore';
import { ALL_DANCE_MOVES, CAPTURED_MOVES, MOVE_BY_ID, danceMove, isCapturedMove } from './moves';
import { MOCAP_DANCE_CLIPS } from '../anim/authored/mocapDance';
import { MOCAP_STYLE_CLIPS } from '../anim/authored/mocapStyles';
import { CAPTURE_SIBLING, DANCE_ALIASES, DANCE_CLIP_IDS, MOVE_CAPTURES } from '../anim/danceClips';
import { CHART_MOVES, chartFor, CHART_SONG_IDS, clipStem, expandChart, moveClip, validateChart } from './chart';
import { cueLane, FAMILY_COLOR, FAMILY_GLYPH } from '../core/danceTracks';
import { songCategories } from './ui/InstrumentChips';
import { CLIP_BY_ID, FAMILY_BUTTON, buttonForStep, categoryOf, chartForLevel } from './chartPlay';
import { FLOOR_PHASE, floorPhaseOf } from './floorPhase';
import { CATEGORY_STEM } from '../audio/StemBand';
import { songFor } from './felSongs';

const CMU_LICENCE = /CMU Graphics Lab Motion Capture Database .*free in commercial products/;
const step = (clipId: string, beat = 0) => ({ clipId, beat, holdBeats: danceMove(clipId)?.beats ?? 4, mirrored: false });

describe('DANCE_LIBRARY is untouched (movement play\'s file; generateRoutine reads it)', () => {
  it('the same eight rows, in order, and a seeded routine never draws a captured move', () => {
    expect(DANCE_LIBRARY.map((c) => c.id)).toEqual([
      'dance_toprock_basic', 'dance_bounce_two_step', 'dance_wave_arm', 'dance_footwork_six',
      'dance_freeze_baby', 'dance_power_windmill', 'dance_trans_spin', 'dance_bounce_shoulder',
    ]);
    for (const seed of [1, 7, 0xba77]) for (const difficulty of [1, 2, 3] as const) {
      for (const s of generateRoutine({ bars: 32, difficulty, seed })) expect(isCapturedMove(s.clipId)).toBe(false);
    }
  });
  it('danceMove answers a DANCE_LIBRARY id with DANCE_LIBRARY\'s OWN object (every old lookup is identical)', () => {
    for (const c of DANCE_LIBRARY) { expect(danceMove(c.id)).toBe(c); expect(CLIP_BY_ID.get(c.id)).toBe(c); }
    expect(ALL_DANCE_MOVES.slice(0, DANCE_LIBRARY.length)).toEqual(DANCE_LIBRARY);
    expect(danceMove('nope')).toBeNull();
    expect(danceMove(undefined)).toBeNull();
    expect(MOVE_BY_ID.size).toBe(DANCE_LIBRARY.length + CAPTURED_MOVES.length);
  });
});

describe('the captured moves (owner decision #17: breaking + popping)', () => {
  it('six moves, unique ids, in DANCE_LIBRARY\'s own families, breaking and popping both present', () => {
    expect(CAPTURED_MOVES.map((m) => m.id)).toEqual([
      'dance_toprock_kick', 'dance_freeze_side', 'dance_power_helicopter', 'dance_power_headstand', 'dance_pop_moonwalk', 'dance_pop_robot',
    ]);
    expect(new Set(ALL_DANCE_MOVES.map((m) => m.id)).size).toBe(ALL_DANCE_MOVES.length);
    const families = new Set(DANCE_LIBRARY.map((c) => c.category));
    for (const m of CAPTURED_MOVES) expect(families.has(m.category), m.id).toBe(true);
    expect(CAPTURED_MOVES.filter((m) => m.style === 'breaking').length).toBe(4);
    expect(CAPTURED_MOVES.filter((m) => m.style === 'popping').map((m) => m.name)).toEqual(['Moonwalk', 'Robot']);
  });
  it('NEVER A PLACEHOLDER: every captured move plays a real CMU capture with a root track, carries its licence, and has no procedural keys to fall back on', () => {
    for (const m of CAPTURED_MOVES) {
      const plan = MOVE_CAPTURES[m.id];
      expect(plan?.clip, m.id).toBe(m.capture);
      const cap = MOCAP_DANCE_CLIPS.find((c) => c.name === m.capture) ?? MOCAP_STYLE_CLIPS.find((c) => c.name === m.capture);
      expect(cap, `${m.id} capture ${m.capture}`).toBeTruthy();
      expect(cap!.source, m.id).toMatch(/^cmu:\d+_\d+\.bvh /);
      expect(cap!.license, m.id).toMatch(CMU_LICENCE);
      expect(cap!.root?.length, `${m.id} root track`).toBeGreaterThan(5);
      expect(cap!.keys.length, `${m.id} keys`).toBeGreaterThan(10);
    }
    for (const c of MOCAP_DANCE_CLIPS) expect(CAPTURED_MOVES.find((m) => m.capture === c.name)?.id).toBe(c.dance);
  });
  it('registered with the rest (DANCE_CLIP_IDS), each with a sibling in its family and a resolvable last-resort alias', () => {
    for (const m of CAPTURED_MOVES) {
      expect(DANCE_CLIP_IDS).toContain(m.id);
      const sib = danceMove(CAPTURE_SIBLING[m.id]);
      expect(sib && DANCE_LIBRARY.includes(sib), m.id).toBe(true);
      expect(sib!.category, m.id).toBe(m.category);
      expect(typeof DANCE_ALIASES[m.id]).toBe('string');
    }
  });
  it('every captured move is at least as long as the shortest library clip: the Arena ceiling\'s step count (danceCeiling) cannot rise', () => {
    const shortest = Math.min(...DANCE_LIBRARY.map((c) => c.beats));
    for (const m of CAPTURED_MOVES) expect(m.beats, m.id).toBeGreaterThanOrEqual(shortest);
  });
});

describe('MATCH: a captured move needs no case of its own — its family is its button', () => {
  const BUTTON: Record<string, 'A' | 'B' | 'X' | 'Y'> = {
    dance_toprock_kick: 'A', dance_freeze_side: 'Y', dance_power_helicopter: 'B', dance_power_headstand: 'B', dance_pop_moonwalk: 'X', dance_pop_robot: 'X',
  };
  it('each captured move lands on its family\'s button (the pinned table, and the one the judge reads)', () => {
    for (const m of CAPTURED_MOVES) {
      expect(FAMILY_BUTTON[m.category], m.id).toBe(BUTTON[m.id]);
      expect(buttonForStep(step(m.id)), m.id).toBe(BUTTON[m.id]);
      expect(categoryOf(step(m.id)), m.id).toBe(m.category);
    }
  });
  it('a captured move takes the same button as the library clip of its family (kick step = top rock, moonwalk = arm wave …)', () => {
    for (const m of CAPTURED_MOVES) {
      const lib = DANCE_LIBRARY.find((c) => c.category === m.category)!;
      expect(buttonForStep(step(m.id))).toBe(buttonForStep(step(lib.id)));
    }
  });
  it('the instrument it earns is its family\'s (StemBand.CATEGORY_STEM), through the chart\'s own stem lookup and the chip row\'s', () => {
    for (const m of CAPTURED_MOVES) {
      expect(clipStem(m.id)).toBe(CATEGORY_STEM[m.category].toLowerCase());
      expect(clipStem(m.id)).toBe(clipStem(DANCE_LIBRARY.find((c) => c.category === m.category)!.id));
    }
    expect([...songCategories([{ clipId: 'dance_freeze_side' }, { clipId: 'dance_pop_moonwalk' }])].sort()).toEqual(['freeze', 'wave']);
  });
  it('the cue lane names a captured move in its family\'s colours, as a press cue; MATCH puts its button on the marker', () => {
    const lane = cueLane([{ time: 1, step: step('dance_pop_robot', 2) }], 0);
    expect(lane).toEqual([{ in: 1, name: 'Robot', family: 'wave', glyph: FAMILY_GLYPH.wave, color: FAMILY_COLOR.wave, mirrored: false, move: 'tap' }]);
    expect(FAMILY_BUTTON[lane[0].family as keyof typeof FAMILY_BUTTON]).toBe('X');
  });
  it('the side freeze is a freeze: the stage camera drops, the HOLD rule holds it, and its floor phase is the clip\'s own drop and rise', () => {
    expect(categoryOf(step('dance_freeze_side'))).toBe('freeze');
    expect(floorPhaseOf('dance_freeze_side')).toEqual({ down: MOVE_CAPTURES.dance_freeze_side.inBeats, rise: 4 - MOVE_CAPTURES.dance_freeze_side.outBeats });
  });
  it('the floor table holds each captured floor move to its own capture plan, and no standing capture is on the floor', () => {
    for (const m of CAPTURED_MOVES) {
      const plan = MOVE_CAPTURES[m.id];
      const row = FLOOR_PHASE[m.id];
      if (m.id === 'dance_freeze_side' || m.id === 'dance_power_headstand' || m.id === 'dance_power_helicopter') {
        expect(row, m.id).toEqual({ down: plan.inBeats, rise: m.beats - plan.outBeats });
      } else expect(row, `${m.id} stays standing`).toBeUndefined();
    }
  });
  it('HARD (chartForLevel) fills with a family\'s library clips and never invents a captured move', () => {
    const chart = [step('dance_toprock_kick', 0), step('dance_pop_robot', 16)];
    for (const s of chartForLevel(chart, 'hard')) if (!chart.includes(s)) expect(isCapturedMove(s.clipId)).toBe(false);
  });
});

describe('existing charts are unchanged unless they opt in', () => {
  it('the six short names still answer with the library clip they always did', () => {
    expect(CHART_MOVES).toMatchObject({
      kickstep: 'dance_toprock_basic', sidefreeze: 'dance_freeze_baby', helicopter: 'dance_power_windmill',
      headstand: 'dance_power_windmill', moonwalk: 'dance_wave_arm', robot: 'dance_wave_arm',
    });
    for (const name of ['kickstep', 'sidefreeze', 'helicopter', 'headstand', 'moonwalk', 'robot']) expect(isCapturedMove(moveClip(name)!.id), name).toBe(false);
  });
  it('a chart names a captured move by its id: it resolves to the captured move', () => {
    for (const m of CAPTURED_MOVES) expect(moveClip(m.id)).toBe(m);
  });
  it('every shipped chart validates, and only the opt-in phrases call a captured move', () => {
    for (const id of CHART_SONG_IDS) {
      const song = songFor(id)!;
      const chart = chartFor(id)!;
      expect(validateChart(chart, song), id).toEqual([]);
      const raw = JSON.stringify(chart);
      const called = expandChart(chart, song).presses.filter((p) => isCapturedMove(p.clipId));
      // a captured move is in the expanded chart iff the chart's JSON names its id (no alias reaches one)
      expect(called.length > 0, `${id}: calls a captured move`).toBe(CAPTURED_MOVES.some((m) => raw.includes(`"${m.id}"`)));
    }
  });
});

// ── the opt-in phrases: the captures change the clip a step dances, and nothing else ─────────────────────────────────────────────
import { planChart, stepsFromPresses, styleBeatsFromPresses, type DanceChart } from './chart';
import { DancePerformance, beatDuration } from '../core/DanceCore';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
/** The shipped opt-in phrases and the stand-in phrase each one replaces (same notes, the short names the chart always used). */
const OPT_IN: { song: string; phrase: string; base: string; section: number; captured: string[] }[] = [
  { song: 'evolution', phrase: 'ehBc', base: 'ehB', section: 7, captured: ['dance_toprock_kick', 'dance_power_helicopter'] },
  { song: 'canals', phrase: 'kvDc', base: 'kvD', section: 5, captured: ['dance_pop_moonwalk'] },
];
const flawless = (steps: ReturnType<typeof stepsFromPresses>, bpm: number) => {
  const perf = new DancePerformance(bpm);
  perf.setRoutine(steps);
  perf.start(0);
  const bd = beatDuration(bpm);
  for (const x of steps) { perf.update(x.beat * bd); perf.hit(x.beat * bd); }
  return perf.result();
};

describe('the opt-in phrases: only the clip a step dances changes', () => {
  for (const o of OPT_IN) {
    const song = songFor(o.song)!;
    const actual = chartFor(o.song)!;
    // the same chart with this phrase's section playing the stand-in phrase again
    const baseline: DanceChart = clone(actual);
    baseline.sections[o.section].play = baseline.sections[o.section].play.map((p) => (p === o.phrase ? o.base : p));

    it(`${o.song}: ${o.phrase} is ${o.base} with its short names spelled as the captures' ids — same beats, accents, doubles and mirrors`, () => {
      const a = actual.phrases[o.phrase], b = actual.phrases[o.base];
      expect(a.bars).toBe(b.bars);
      expect(a.notes!.length).toBe(b.notes!.length);
      a.notes!.forEach((n, i) => {
        const { m: ma, ...ra } = n, { m: mb, ...rb } = b.notes![i];
        expect(ra, `note ${i}`).toEqual(rb);                                                  // every beat, double and mirror
        expect(ma === undefined, `note ${i} is a move in both`).toBe(mb === undefined);
        if (ma !== undefined && ma !== mb) {                                                   // a spelled-out id where the base has a short name…
          expect(isCapturedMove(ma), `${ma} is a captured id`).toBe(true);
          expect(danceMove(ma)!.category, `note ${i} family`).toBe(moveClip(mb)!.category);   // …of the same family: the MATCH button and the instrument
        }
      });
    });
    it(`${o.song}: the chart still validates, calls exactly ${o.captured.join(' + ')}, and plays the same scored steps, STYLE taps and flawless score as before`, () => {
      expect(validateChart(actual, song)).toEqual([]);
      const planA = planChart(actual, song), planB = planChart(baseline, song);
      expect(planA.problems).toEqual([]);
      const calls = (p: typeof planA) => p.presses.filter((x) => x.kind === 'move' && isCapturedMove(x.clipId)).map((x) => x.clipId).sort();
      expect(calls(planA)).toEqual([...o.captured].sort());
      expect(calls(planB)).toHaveLength(0);
      const shape = (p: typeof planA) => p.scored.map((x) => ({ at: x.swungBeat, fam: danceMove(x.clipId)!.category, mir: x.mirrored, kind: x.kind }));
      expect(shape(planA)).toEqual(shape(planB));                                              // the scored steps: when, which family, mirrored
      expect(styleBeatsFromPresses(planA.style)).toEqual(styleBeatsFromPresses(planB.style));  // the STYLE taps
      expect(planA.demoted.map((x) => x.swungBeat)).toEqual(planB.demoted.map((x) => x.swungBeat));   // the cap demotes the same moves
      const stepsA = stepsFromPresses(planA.scored), stepsB = stepsFromPresses(planB.scored);
      expect(flawless(stepsA, song.bpm)).toEqual(flawless(stepsB, song.bpm));                   // pay: a flawless run scores what it did
      // a step's hold is a freeze's only; no scored captured move here is one, so no hold changed
      expect(planA.scored.filter((x) => isCapturedMove(x.clipId) && danceMove(x.clipId)!.category === 'freeze')).toHaveLength(0);
    });
  }
});
