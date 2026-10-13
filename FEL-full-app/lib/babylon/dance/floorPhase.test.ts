// floorPhase — when a dance move is on the floor, and the crossfade that leaves it. Re-landed 2026-10-13 from closed PR #46
// (MUSIC-SUITE P9 FIX PASS), trimmed to the eight DANCE_LIBRARY moves of today's design.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DANCE_LIBRARY, beatDuration } from '../core/DanceCore';
import { stepsForSong } from '../core/danceTracks';
import { DANCE_CAPTURES } from '../anim/danceClips';
import { FEL_SONGS } from './felSongs';
import { chartStepsFor } from './chart';
import { FLOOR_PHASE, RISE_FADE_BEATS, STEP_FADE_SEC, floorPhaseOf, moveFadeSec, onFloor } from './floorPhase';

const beatsOf = (id: string): number => DANCE_LIBRARY.find((c) => c.id === id)!.beats;
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
    expect(clips).toContain('const T = beats(def.beats), tIn = beats(0.75), tOut = T - beats(1);');
  });
  it('the procedural baby freeze: STAND, the freeze at ½, held to 1½, STAND at 2', () => {
    const clips = read('lib/babylon/anim/danceClips.ts');
    expect(clips).toContain('return [key(0, STAND), key(beats(0.5), freeze), key(beats(1.5), { ...freeze, bones: { ...freeze.bones, Neck: [-24, 0, 0] } }), key(beats(2), STAND)];');
    expect(FLOOR_PHASE.dance_freeze_baby).toEqual({ down: 0.5, rise: 1.5 });
    expect(beatsOf('dance_freeze_baby')).toBe(2);
  });
  it('the floor and freeze families are in it; no standing move is', () => {
    for (const id of Object.keys(FLOOR_PHASE)) expect(['freeze', 'power', 'footwork']).toContain(DANCE_LIBRARY.find((c) => c.id === id)!.category);
    for (const c of DANCE_LIBRARY.filter((x) => !(x.id in FLOOR_PHASE))) expect(floorPhaseOf(c.id), c.id).toBeNull();
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
    expect(cuts).toEqual({ warmup: 2, cypher: 6, goldenhour: 4, battle: 9, canals: 9, evolution: 9 });
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
