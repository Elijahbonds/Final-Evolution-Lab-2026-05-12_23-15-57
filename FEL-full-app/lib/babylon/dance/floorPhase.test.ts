// MUSIC-SUITE P9 FIX PASS (2026-09-29): the floor phase of a dance move (lib/babylon/dance/floorPhase.ts) — the table held
// to the clips it describes (danceClips.ts), the rise a cut makes, the held freeze pose, and the charts' floor cuts pinned
// per song (a new one fails here and gets named). floorPhase.rig.test.ts plays the held pose on the real hero rig.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FLOOR_PHASE, floorPhaseOf, onFloor, moveFadeSec, holdPoseDue, floorCuts, STEP_FADE_SEC, RISE_FADE_BEATS, HOLD_POSE_LEAD_BEATS,
} from './floorPhase';
import { DANCE_CAPTURES, MOVE_CAPTURES } from '../anim/danceClips';
import { danceMove } from './moves';
import { expandChart, chartFor, CHART_SONG_IDS, chartStepsFor } from './chart';
import { songFor, FEL_SONGS } from './felSongs';
import { beatDuration, isPressHold } from '../core/DanceCore';

describe('the table is the clips\' own drop and rise', () => {
  it('every captured floor move: down = its plan\'s drop, rise = its length − its plan\'s rise (danceClips.ts)', () => {
    for (const [id, f] of Object.entries(FLOOR_PHASE)) {
      const beats = danceMove(id)!.beats;
      if (DANCE_CAPTURES[id]) expect(f, id).toEqual({ down: 0.75, rise: beats - 1 });              // the RECOGNISABLE pair: ¾ in, 1 out
      else if (MOVE_CAPTURES[id]) expect(f, id).toEqual({ down: MOVE_CAPTURES[id].inBeats, rise: beats - MOVE_CAPTURES[id].outBeats });
      else expect(id).toBe('dance_freeze_baby');                                                   // the one procedural floor move
    }
    // the procedural baby freeze: STAND, the freeze at ½, held to 1½, STAND at 2
    const clips = readFileSync(join(process.cwd(), 'lib/babylon/anim/danceClips.ts'), 'utf8');
    expect(clips).toContain('return [key(0, STAND), key(beats(0.5), freeze), key(beats(1.5), { ...freeze, bones: { ...freeze.bones, Neck: [-24, 0, 0] } }), key(beats(2), STAND)];');
    expect(FLOOR_PHASE.dance_freeze_baby).toEqual({ down: 0.5, rise: 1.5 });
    expect(danceMove('dance_freeze_baby')!.beats).toBe(2);
  });

  it('every floor or freeze family move is in it; no standing move is', () => {
    const cats = (id: string) => danceMove(id)!.category;
    for (const id of Object.keys(FLOOR_PHASE)) expect(['freeze', 'power', 'footwork'], id).toContain(cats(id));
    for (const id of ['dance_toprock_basic', 'dance_bounce_two_step', 'dance_wave_arm', 'dance_trans_spin', 'dance_bounce_shoulder', 'dance_toprock_kick', 'dance_pop_moonwalk', 'dance_pop_robot']) {
      expect(floorPhaseOf(id), id).toBeNull();
    }
    expect(floorPhaseOf('dance_freeze_baby.M')).toEqual(FLOOR_PHASE.dance_freeze_baby);          // a mirror is the same move
  });
});

describe('a cut off the floor rises; a cut standing is the room\'s 0.12 s', () => {
  it('moveFadeSec', () => {
    const bd = beatDuration(112);
    expect(STEP_FADE_SEC).toBe(0.12);
    expect(RISE_FADE_BEATS).toBe(0.5);
    expect(moveFadeSec('dance_power_windmill', 4, bd, 8)).toBeCloseTo(0.5 * bd, 9);             // battle's hook: windmill → move at 4
    expect(moveFadeSec('dance_power_windmill', 7.5, bd, 8)).toBe(STEP_FADE_SEC);                  // already rising
    expect(moveFadeSec('dance_power_windmill', 0.5, bd, 8)).toBe(STEP_FADE_SEC);                  // not down yet
    expect(moveFadeSec('dance_toprock_basic', 2, bd, 4)).toBe(STEP_FADE_SEC);
    expect(moveFadeSec(null, 2, bd)).toBe(STEP_FADE_SEC);
    expect(moveFadeSec('dance_freeze_baby', 3, bd, 2)).toBeCloseTo(0.5 * bd, 9);                  // a loop: beat 3 is its 1 again
    expect(onFloor('dance_freeze_side', 3.1, 4)).toBe(true);
    expect(onFloor('dance_freeze_side', 3.3, 4)).toBe(false);
  });

  it('DanceMode crossfades by it', () => {
    const room = readFileSync(join(process.cwd(), 'lib/babylon/modes/DanceMode.ts'), 'utf8');
    expect(room).toContain('moveFadeSec(moveClipId, (heardNow - moveStartHeard) / bd, bd, moveOf(moveClipId)?.beats)');
    expect(room).toContain('body?.loop(currentClip, { fadeSec: fade, speedRatio: clipSpeed() });');
  });
});

describe('a held freeze holds its pose while the button is down', () => {
  it('holdPoseDue: only while a hold is down on THIS move, from just before its rise', () => {
    const at = (beatsInto: number, o: Partial<Parameters<typeof holdPoseDue>[0]> = {}) =>
      holdPoseDue({ holding: true, heldClipId: 'dance_freeze_baby', playingClipId: 'dance_freeze_baby', beatsInto, ...o });
    expect(at(1.0)).toBe(false);
    expect(at(1.5 - HOLD_POSE_LEAD_BEATS)).toBe(true);
    expect(at(2.7)).toBe(true);                                                                     // stays held however long
    expect(at(1.4, { holding: false })).toBe(false);
    expect(at(1.4, { playingClipId: 'dance_trans_spin' })).toBe(false);
    expect(at(1.4, { playingClipId: 'dance_freeze_baby.M' })).toBe(true);
    expect(at(1.4, { heldClipId: 'dance_toprock_basic', playingClipId: 'dance_toprock_basic' })).toBe(false);
    expect(at(Number.NaN)).toBe(false);
  });

  it('every charted baby-freeze hold longer than the clip\'s floor (the eight the review found, and more) is one it holds', () => {
    let long = 0;
    for (const s of FEL_SONGS) {
      for (const st of chartStepsFor(s)!.filter(isPressHold)) {
        const f = floorPhaseOf(st.clipId);
        if (!f) continue;
        if (st.pressHoldBeats! > f.rise) {
          long++;
          expect(holdPoseDue({ holding: true, heldClipId: st.clipId, playingClipId: st.clipId, beatsInto: f.rise - HOLD_POSE_LEAD_BEATS }), s.id).toBe(true);
        }
      }
    }
    expect(long).toBeGreaterThanOrEqual(8);
  });

  it('DanceMode stops the clip there while holding, and lets it rise when the hold ends', () => {
    const room = readFileSync(join(process.cwd(), 'lib/babylon/modes/DanceMode.ts'), 'utf8');
    expect(room).toContain('holdPoseDue({ holding: perf.holding, heldClipId, playingClipId: moveClipId, beatsInto: (heard - moveStartHeard) / bd })');
    expect(room).toContain('me.animator.setSpeed(currentClip, HOLD_POSE_SPEED);');
    const holdEnd = room.slice(room.indexOf('function onHoldEnd('), room.indexOf('function onHoldEnd(') + 400);
    expect(holdEnd).toContain('releasePose(');
  });
});

describe('the charts\' floor cuts, pinned per song (the owner\'s re-authoring call — a NEW one fails here)', () => {
  it('counted with floorCuts over every move start and freestyle slot', () => {
    const counts: Record<string, number> = {};
    for (const id of CHART_SONG_IDS) {
      const { presses } = expandChart(chartFor(id)!, songFor(id)!);
      const starts = presses.filter((p) => p.kind === 'move' || p.kind === 'free').map((p) => ({ beat: p.swungBeat, clipId: p.clipId }));
      counts[id] = floorCuts(starts, (c) => danceMove(c)?.beats).length;
    }
    // every one of these now RISES over half a beat (moveFadeSec) instead of snapping up in 120 ms
    expect(counts).toEqual({ warmup: 1, cypher: 7, goldenhour: 10, battle: 9, canals: 9, evolution: 13 });
  });
});
