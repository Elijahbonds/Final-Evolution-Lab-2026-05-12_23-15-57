// vis-hoops-court (owner 2026-10-14, "Go on hoops"): the three court-lane modes left the hoops hold, so the wave-2 shared look
// reaches them. Only THIS lane's modes are asserted — the dunk lane lifts its own, and a test here that said the others were still
// held would fail the day it merges.
import { describe, expect, it } from 'vitest';
import { wave2Look, WAVE2_HELD_MODES } from './lookPolicy';
import { fixtureLightsWanted } from './FixtureLights';
import { skyDomeWanted } from './SkyDome';
import { glossyFloorWanted } from './GlossyFloor';
import { atmosphereWanted } from './Atmosphere';

const MINE = ['onevone', 'threevthree', 'carnival', 'basketball', 'hoops1v1', 'hoops3v3'] as const;

describe('the court lane\'s modes take the wave-2 look', () => {
  for (const id of MINE) it(`${id} is not held`, () => { expect(WAVE2_HELD_MODES.has(id)).toBe(false); expect(wave2Look(id)).toBe(true); });
  it('so each shared system now reaches them', () => {
    for (const id of ['onevone', 'threevthree', 'carnival']) {
      expect(fixtureLightsWanted('desktop', id), `fixtures ${id}`).toBe(true);
      expect(skyDomeWanted('desktop', id), `sky ${id}`).toBe(true);
      expect(glossyFloorWanted('desktop', id, 'court'), `glossy ${id}`).toBe(true);
      expect(atmosphereWanted({ fogMode: 0, hasVenueSky: false, modeId: id, mood: 'goldenHour', off: false }), `haze ${id}`).toBe(true);
    }
  });
  it('phones still get none of the desktop-only systems (the tier rules are the systems\' own)', () => {
    expect(fixtureLightsWanted('mobile', 'onevone')).toBe(false);
    expect(skyDomeWanted('mobile', 'threevthree')).toBe(false);
    expect(glossyFloorWanted('mobile', 'carnival', 'court')).toBe(false);
  });
});
