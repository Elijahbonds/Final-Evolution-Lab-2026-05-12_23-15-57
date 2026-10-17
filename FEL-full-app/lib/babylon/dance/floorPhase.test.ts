// floorPhase — when a dance move is on the floor, and the crossfade that leaves it. Re-landed 2026-10-13 from closed PR #46
// (MUSIC-SUITE P9 FIX PASS), trimmed to the eight DANCE_LIBRARY moves of today's design.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DANCE_LIBRARY, beatDuration } from '../core/DanceCore';
import { stepsForSong } from '../core/danceTracks';
import { DANCE_CAPTURES, MOVE_CAPTURES } from '../anim/danceClips';
import { CAPTURED_MOVES, danceMove } from './moves';
import { FEL_SONGS } from './felSongs';
import { chartStepsFor } from './chart';
import { FLOOR_PHASE, RISE_FADE_BEATS, STEP_FADE_SEC, floorPhaseOf, moveFadeSec, onFloor } from './floorPhase';

const beatsOf = (id: string): number => danceMove(id)!.beats;   // lane/dance-extras: the whole vocabulary (a chart may opt in to a captured move)
const read = (rel: string): string => readFileSync(join(process.cwd(), rel), 'utf8');

/** Where a chart switches move while the move being left is on the floor. */
function floorCuts(steps: readonly { clipId: string; beat: number }[]): number {
  let n = 0;
  for (let i = 1; i < steps.length; i++) if (onFloor(steps[i - 1].clipId, steps[i].beat - steps[i - 1].beat, beatsOf(steps[i - 1].clipId))) n++;
  return n;
}

describe('the table is the clips\' own drop and rise', () => {
  it('the captured pair (windmill, six step): down at ¾, rise at the clip\'s length − 1 — danceClips.ts composeCapturedStep', () => {
    for (const id of Object.keys(DANCE_CAPTURES)) expect(FLOOR_PHASE[id], id).toEqual({ down: 0.75, rise: beatsOf(id) - 1 });
    const clips = read('lib/babylon/anim/danceClips.ts');
    // test changed (lane/dance-extras, 2026-10-14): composeCapturedStep now serves the captured moves too, so its drop and rise come from the
    // step's capture PLAN; the pair's plan is the same ¾ in / 1 out, pinned on the next line, and danceClips.captures.test.ts holds the
    // pair's composed keys byte for byte
    expect(clips).toContain('const T = beats(n), tIn = beats(plan.inBeats), tOut = T - beats(plan.outBeats);');
    expect(clips).toContain("if (rec) return { clip: rec, kind: 'cycle', inBeats: 0.75, outBeats: 1 };");
  });
  it('the procedural baby freeze: STAND, the freeze at ½, held to 1½, STAND at 2', () => {
    const clips = read('lib/babylon/anim/danceClips.ts');
    expect(clips).toContain('return [key(0, STAND), key(beats(0.5), freeze), key(beats(1.5), { ...freeze, bones: { ...freeze.bones, Neck: [-24, 0, 0] } }), key(beats(2), STAND)];');
    expect(FLOOR_PHASE.dance_freeze_baby).toEqual({ down: 0.5, rise: 1.5 });
    expect(beatsOf('dance_freeze_baby')).toBe(2);
  });
  it('the captured floor moves: down at the capture plan\'s drop, rise at its step\'s end minus the plan\'s rise (danceClips.ts MOVE_CAPTURES)', () => {
    for (const id of ['dance_freeze_side', 'dance_power_headstand', 'dance_power_helicopter']) {
      expect(FLOOR_PHASE[id], id).toEqual({ down: MOVE_CAPTURES[id].inBeats, rise: beatsOf(id) - MOVE_CAPTURES[id].outBeats });
    }
  });
  it('the floor and freeze families are in it; no standing move is', () => {
    // test changed (lane/dance-extras, 2026-10-14): the table now also holds the three captured FLOOR moves, which are not DANCE_LIBRARY rows,
    // so the family of each row is read through danceMove (the same objects for the library's rows) and no standing move of EITHER list is in it
    for (const id of Object.keys(FLOOR_PHASE)) expect(['freeze', 'power', 'footwork']).toContain(danceMove(id)!.category);
    for (const c of [...DANCE_LIBRARY, ...CAPTURED_MOVES].filter((x) => !(x.id in FLOOR_PHASE))) expect(floorPhaseOf(c.id), c.id).toBeNull();
    expect(floorPhaseOf('dance_freeze_baby.M')).toEqual(FLOOR_PHASE.dance_freeze_baby);   // a mirror is the same move
    expect(floorPhaseOf(null)).toBeNull();
  });
});

describe('a cut off the floor rises; a cut standing is the room\'s 0.12 s', () => {
  it('moveFadeSec', () => {
    const bd = beatDuration(112);
    expect(STEP_FADE_SEC).toBe(0.12);
    expect(RISE_FADE_BEATS).toBe(0.5);
    expect(moveFadeSec('dance_power_windmill', 4, bd, 8)).toBeCloseTo(0.5 * bd, 9);         // a hook starts the next move at beat 4
    expect(moveFadeSec('dance_power_windmill', 7.5, bd, 8)).toBe(STEP_FADE_SEC);              // already rising
    expect(moveFadeSec('dance_power_windmill', 0.5, bd, 8)).toBe(STEP_FADE_SEC);              // not down yet
    expect(moveFadeSec('dance_toprock_basic', 2, bd, 4)).toBe(STEP_FADE_SEC);
    expect(moveFadeSec(null, 2, bd)).toBe(STEP_FADE_SEC);
    expect(moveFadeSec('dance_freeze_baby', 3, bd, 2)).toBeCloseTo(0.5 * bd, 9);              // a loop: beat 3 is its 1 again
    expect(moveFadeSec('dance_freeze_baby', 2.1, bd, 2)).toBe(STEP_FADE_SEC);                 // beat 0.1 of the next cycle: standing
    expect(moveFadeSec('dance_power_windmill', Number.NaN, bd, 8)).toBe(STEP_FADE_SEC);
  });
  it('the rise is never shorter than the ordinary fade, at any song tempo', () => {
    for (const s of FEL_SONGS) expect(moveFadeSec('dance_power_windmill', 4, beatDuration(s.bpm), 8)).toBeGreaterThanOrEqual(STEP_FADE_SEC);
  });
});

describe('where the charts cut a floor move', () => {
  it('the generated steps barely did (a baby freeze looping on its second cycle); the authored charts do, per song (a new cut fails here and gets named)', () => {
    expect(Object.fromEntries(FEL_SONGS.map((s) => [s.id, floorCuts(stepsForSong(s))]))).toEqual({ warmup: 0, cypher: 0, goldenhour: 1, battle: 0, canals: 1, evolution: 1 });
    const cuts = Object.fromEntries(FEL_SONGS.map((s) => [s.id, floorCuts(chartStepsFor(s)!)]));
    // test changed (lane/dance-extras, 2026-10-14): evolution 9 → 8. Its second hook now opts in to the CAPTURED helicopter (chart phrase ehBc),
    // a 4-beat move that is back on its feet (rise at beat 3) before the next step, where the 8-beat windmill it stood in for was cut mid-floor
    // (it is on the floor from beat ¾ to 7): one fewer switch made while the body is down. The other five songs are untouched.
    // test changed (lane/dance-options, owner 2026-10-17, Q1 A): battle 9 → 8 and canals 9 → 8. Their charts now spell the captured
    // helicopter (battle's second hook) and headstand spin (canals' second verse) where the 8-beat windmill stood in: a 4-beat floor move that
    // is back on its feet (rise at beat 3) before the next step, where the windmill was cut mid-floor. Measured before the change by
    // scripts/dance-options-measure.ts (variant A3). The other four songs are untouched.
    expect(cuts).toEqual({ warmup: 2, cypher: 6, goldenhour: 4, battle: 8, canals: 8, evolution: 8 });
  });
});

describe('DanceMode crossfades by it', () => {
  const room = read('lib/babylon/modes/DanceMode.ts');
  it('playStep fades by moveFadeSec off the step being left, and keeps 0.12 s for the first step of a run', () => {
    expect(room).toContain('moveFadeSec(lastStep.clipId, s.beat - lastStep.beat, beatDuration(track.bpm), CLIP_BY_ID.get(lastStep.clipId)?.beats) : STEP_FADE_SEC');
    expect(room).toContain('body?.loop(currentClip, { fadeSec: fade, speedRatio: clipSpeed() });');
    expect(room).toContain('lastStep = null;');   // resetImproveRun: a new run starts with no step being left
  });
});
