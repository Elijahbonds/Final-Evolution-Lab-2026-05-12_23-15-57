// DAILY-DRILL — the client's half: today's chart rebuilt from phase references, the copy's links, the claim call.
import { describe, expect, it } from 'vitest';
import { composeDailyDrill, specMinutes } from './compose';
import { ACCOUNT_HREF, DAILY_DRILL_CLAIM_PATH, JUMP_CHECK_HREF, doneLine, measureNudge, rewardLine, whyLine } from './copy';
import * as tiles from '@/lib/profile-v2/tiles';
import { WAKE_UP } from '@/lib/drills/drills';

describe('composeDailyDrill', () => {
  it('copies the catalogue\'s phases as written, in the order given, under the main drill\'s source', () => {
    const d = composeDailyDrill({ key: 'form:countermovement-geometry', name: 'X', drillId: 'countermovement-geometry', phases: [
      { drill: 'wake-up', phase: 'pressurize' }, { drill: 'countermovement-geometry', phase: 'geometry' },
    ] })!;
    expect(d.id).toBe('daily:form:countermovement-geometry');
    expect(d.phases[0]).toBe(WAKE_UP.phases.find((p) => p.id === 'pressurize'));
    expect(d.source.chapter).toBe(6);
    expect(specMinutes({ phases: [{ drill: 'wake-up', phase: 'pressurize' }, { drill: 'countermovement-geometry', phase: 'geometry' }] })).toBe(2);
  });

  it('refuses a phase the catalogue does not have, a phase twice, an unknown drill, or no phases', () => {
    expect(composeDailyDrill({ key: 'k', name: 'n', drillId: 'wake-up', phases: [{ drill: 'wake-up', phase: 'nope' }] })).toBeNull();
    expect(composeDailyDrill({ key: 'k', name: 'n', drillId: 'wake-up', phases: [{ drill: 'wake-up', phase: 'pressurize' }, { drill: 'wake-up', phase: 'pressurize' }] })).toBeNull();
    expect(composeDailyDrill({ key: 'k', name: 'n', drillId: 'nope', phases: [{ drill: 'wake-up', phase: 'pressurize' }] })).toBeNull();
    expect(composeDailyDrill({ key: 'k', name: 'n', drillId: 'wake-up', phases: [] })).toBeNull();
  });
});

describe('the copy', () => {
  it('its links are profile v2\'s empty-state links (spelled here to keep the page\'s bundle small)', () => {
    expect(JUMP_CHECK_HREF).toBe(tiles.JUMP_CHECK_HREF);
    expect(ACCOUNT_HREF).toBe(tiles.ACCOUNT_HREF);
    expect(DAILY_DRILL_CLAIM_PATH).toBe('/api/daily-drill/claim');
  });

  it('says the number, the reward and the done state plainly', () => {
    expect(whyLine('starter', null, false)).toContain('Pre-Game Wake-Up');
    expect(rewardLine(10, true, 4)).toBe('Finish it for 10 Lab Credits, and day 4 of your streak.');
    expect(rewardLine(10, false, 4)).toBe('Finish it for 10 Lab Credits. Your streak already counts today.');
    expect(doneLine(30, 1)).toBe('+30 Lab Credits. Streak: 1 day. A new drill tomorrow.');
    expect(measureNudge({ adult: false, canSaveScan: false }).href).toBe('/screen');
  });
});
