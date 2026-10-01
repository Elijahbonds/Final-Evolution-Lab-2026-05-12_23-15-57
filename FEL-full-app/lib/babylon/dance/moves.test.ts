// MUSIC-SUITE P9 (2026-09-29), moves — the Cypher's move vocabulary (dance/moves.ts): DANCE_LIBRARY untouched, every
// captured move a real capture with its licence, charted and named by every reader, and no placeholder anywhere.
import { describe, expect, it } from 'vitest';
import { DANCE_LIBRARY, generateRoutine } from '../core/DanceCore';
import { ALL_DANCE_MOVES, CAPTURED_MOVES, danceMove, isCapturedMove } from './moves';
import { MOCAP_DANCE_CLIPS } from '../anim/authored/mocapDance';
import { MOCAP_STYLE_CLIPS } from '../anim/authored/mocapStyles';
import { CAPTURE_SIBLING, DANCE_ALIASES, DANCE_CLIP_IDS, MOVE_CAPTURES } from '../anim/danceClips';
import { CHART_MOVES, chartFor, CHART_SONG_IDS, clipStem, expandChart, moveClip, validateChart } from './chart';
import { cueLane, FAMILY_COLOR, FAMILY_GLYPH } from '../core/danceTracks';
import { songCategories } from './ui/InstrumentChips';
import { songFor } from './felSongs';

const CMU_LICENCE = /CMU Graphics Lab Motion Capture Database .*free in commercial products/;

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
    for (const c of DANCE_LIBRARY) expect(danceMove(c.id)).toBe(c);
    expect(ALL_DANCE_MOVES.slice(0, DANCE_LIBRARY.length)).toEqual(DANCE_LIBRARY);
    expect(danceMove('nope')).toBeNull();
    expect(danceMove(undefined)).toBeNull();
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
    // the generated module's own dance field names the move it dances
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
});

describe('every reader knows the captured moves', () => {
  it('the chart: an alias per move, each earning its family\'s stem', () => {
    for (const m of CAPTURED_MOVES) {
      const alias = Object.entries(CHART_MOVES).find(([, id]) => id === m.id)?.[0];
      expect(alias, m.id).toBeTruthy();
      expect(moveClip(alias)).toBe(m);
      expect(clipStem(m.id)).toBe(clipStem(DANCE_LIBRARY.find((c) => c.category === m.category)!.id));
    }
  });
  it('the shipped charts call every captured move, the harder songs only, and every chart still validates', () => {
    const calledBy = new Map<string, Set<string>>();
    for (const id of CHART_SONG_IDS) {
      const song = songFor(id)!;
      const chart = chartFor(id)!;
      expect(validateChart(chart, song), id).toEqual([]);
      for (const p of expandChart(chart, song).presses) if (isCapturedMove(p.clipId)) {
        (calledBy.get(p.clipId) ?? calledBy.set(p.clipId, new Set()).get(p.clipId)!).add(id);
      }
    }
    for (const m of CAPTURED_MOVES) expect(calledBy.get(m.id)?.size ?? 0, `${m.id} charted`).toBeGreaterThan(0);
    for (const [, songs] of calledBy) for (const id of songs) expect(songFor(id)!.difficulty).toBeGreaterThanOrEqual(3);
    // the side freeze carries a break bar's freeze hold (a freeze-family move on a break downbeat)
    const battle = expandChart(chartFor('battle')!, songFor('battle')!);
    expect(battle.presses.some((p) => p.clipId === 'dance_freeze_side' && p.hold !== undefined && p.kind === 'move')).toBe(true);
  });
  it('the cue lane names a captured move in its family\'s colours, as a press cue', () => {
    const lane = cueLane([{ time: 1, step: { clipId: 'dance_pop_robot', beat: 2, holdBeats: 4, mirrored: false } }], 0);
    expect(lane).toEqual([{ in: 1, name: 'Robot', family: 'wave', glyph: FAMILY_GLYPH.wave, color: FAMILY_COLOR.wave, mirrored: false, move: 'tap' }]);
  });
  it('the instrument chips: a chart of captured moves calls for their families', () => {
    expect([...songCategories([{ clipId: 'dance_freeze_side' }, { clipId: 'dance_pop_moonwalk' }])].sort()).toEqual(['freeze', 'wave']);
  });
});
