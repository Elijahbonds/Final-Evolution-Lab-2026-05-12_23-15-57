// The lane pick (SCREEN-SHIP A3-3, A3-6, A4-1): Red beats Yellow, the top Yellow when no Red, all-green → dunking only on
// a clean screen, ties by check order, hidden/TODO never drive, and the table covers every graded check.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GRADED_CHECKS, SCREEN_CHECKS, type BandWord, type CheckId } from './PROPOSED-thresholds';
import { LANE_SLUGS, LANE_TABLE, LANES, isLaneSlug, laneOfCheck, pickLane, sampleDrill, PROGRAM_LANES_HEADER } from './PROPOSED-program-lanes';

const c = (id: CheckId, band: BandWord | null) => ({ id, band });

describe('the lane table', () => {
  it('is headed PROPOSED, NOT FINAL, pending Elijah', () => {
    expect(PROGRAM_LANES_HEADER).toBe('PROPOSED, NOT FINAL, pending Elijah');
    expect(readFileSync(join(__dirname, 'PROPOSED-program-lanes.ts'), 'utf8').split('\n')[0]).toMatch(/^\/\/ PROPOSED, NOT FINAL, pending Elijah\./);
  });

  it('every graded check has exactly one active row; hidden and no-band rows never drive', () => {
    for (const g of GRADED_CHECKS) {
      const rows = LANE_TABLE.filter((r) => r.check === g.id);
      expect(rows, g.id).toHaveLength(1);
      expect(rows[0].active, g.id).toBe(true);
      expect(rows[0].lane, g.id).not.toBeNull();
    }
    for (const s of SCREEN_CHECKS.filter((x) => x.status !== 'graded')) expect(laneOfCheck(s.id), s.id).toBeNull();
  });

  it('A4-1: arms fall forward → posture and heel lift → correctives are confirmed; the Autopilot rows stay PROPOSED', () => {
    const row = (id: string) => LANE_TABLE.find((r) => r.check === id)!;
    expect(row('ohs.armsForward')).toMatchObject({ lane: 'posture', placement: 'confirmed (squad 9:55 PM PT)' });
    expect(row('ohs.heelLift')).toMatchObject({ lane: 'correctives', placement: 'confirmed (squad 9:55 PM PT)' });
    for (const id of ['ohs.depth', 'ohs.lateralShift', 'sls.kneeCave']) expect(row(id).placement, id).toBe('PROPOSED (unlisted, Autopilot placement)');
    expect(row('all-green')).toMatchObject({ lane: 'dunking', placement: 'rule' });
  });

  it('the brief\'s own rows', () => {
    const want: Record<string, string> = {
      'ohs.kneeCave': 'correctives', 'ohs.forwardLean': 'posture', 'ktw.shinAngle': 'correctives', 'ktw.lrGap': 'correctives',
      'sls.hipDrop': 'posture', 'sls.trunkLean': 'posture', 'sls.lrGap': 'correctives', 'jump.landingKneeCave': 'dunking', 'jump.stiffLanding': 'dunking',
      'ohs.depth': 'correctives', 'ohs.lateralShift': 'posture', 'sls.kneeCave': 'correctives', 'ohs.armsForward': 'posture', 'ohs.heelLift': 'correctives',
    };
    for (const [id, lane] of Object.entries(want)) expect(laneOfCheck(id as CheckId), id).toBe(lane);
  });

  it('three lanes, with their names', () => {
    expect(LANE_SLUGS).toEqual(['correctives', 'posture', 'dunking']);
    expect(LANES.posture.name).toBe('Static & Dynamic Posture');
    expect(LANES.dunking.name).toBe('Dunking & Plyometrics');
    expect(isLaneSlug('dunking')).toBe(true);
    expect(isLaneSlug('snowboard')).toBe(false);
  });
});

describe('pickLane', () => {
  it('red beats yellow: a later Red outranks an earlier Yellow', () => {
    expect(pickLane([c('ohs.forwardLean', 'yellow'), c('jump.stiffLanding', 'red')], false)).toEqual({ lane: 'dunking', flag: 'jump.stiffLanding', band: 'red' });
  });
  it('the top Yellow when there is no Red', () => {
    expect(pickLane([c('ohs.kneeCave', 'green'), c('sls.hipDrop', 'yellow'), c('ktw.lrGap', 'yellow')], false)).toEqual({ lane: 'correctives', flag: 'ktw.lrGap', band: 'yellow' });
  });
  it('ties in a band go by check order (T1 → T2 → T3 → T5), whatever order they arrive in', () => {
    expect(pickLane([c('sls.trunkLean', 'red'), c('ohs.lateralShift', 'red'), c('ktw.shinAngle', 'red')], false).flag).toBe('ohs.lateralShift');
    expect(pickLane([c('ohs.heelLift', 'yellow'), c('ohs.armsForward', 'yellow')], false)).toMatchObject({ flag: 'ohs.armsForward', lane: 'posture' });
  });
  it('all green → dunking, only on a clean screen', () => {
    const green = GRADED_CHECKS.map((g) => c(g.id, 'green'));
    expect(pickLane(green, true)).toEqual({ lane: 'dunking', flag: null, band: null });
    expect(pickLane(green, false)).toEqual({ lane: null, flag: null, band: null });
    expect(pickLane([], false).lane).toBeNull();
  });
  it('hidden and TODO checks never drive a lane, whatever band they are handed', () => {
    expect(pickLane([c('jump.landingWeightShift', 'red'), c('jump.height', 'red')], false).lane).toBeNull();
  });
  it('several flags pointing at one lane still give ONE lane', () => {
    const p = pickLane([c('ohs.kneeCave', 'red'), c('ktw.shinAngle', 'red'), c('sls.lrGap', 'red')], false);
    expect(p.lane).toBe('correctives');
    expect(typeof p.lane).toBe('string');
  });
});

describe('the lane page\'s sample drill: the trigger\'s own draft cue, else the lane\'s default draft cue', () => {
  it('a knee cave → the draft\'s OHS knee-cave cue', () => {
    expect(sampleDrill('correctives', 'ohs.kneeCave').cue).toBe('Band lateral walks, clamshells, goblet squat with knees pushed out');
  });
  it('a hip drop → the draft\'s side-plank cue', () => {
    expect(sampleDrill('posture', 'sls.hipDrop').cue).toBe('Side planks, single-leg glute bridge');
  });
  it('lateral shift has no draft cue → the posture lane\'s wall-slides cue', () => {
    expect(sampleDrill('posture', 'ohs.lateralShift').cue).toBe('Wall slides, lat stretch, foam roll upper back');
  });
  it('a clean screen → the dunking lane\'s snap-down cue', () => {
    expect(sampleDrill('dunking', null).cue).toBe('Snap-down landings, drop-and-stick holds');
  });
});
