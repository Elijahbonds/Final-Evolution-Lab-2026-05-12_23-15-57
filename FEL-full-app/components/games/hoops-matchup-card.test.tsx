// hoops-p08 (2026-11-12): the matchup card a hoops court loads behind — its rules are the modes' own (no number a mode does not play),
// it names no rival a player has never seen, and the other modes keep the knowledge card.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { HOOPS_MATCHUP, HoopsMatchupCard, isHoopsMatchupMode } from './hoops-matchup-card';
import { BASKETBALL_MODE_IDS } from '@/lib/babylon/nexus/courtLocations';

const src = (f: string) => readFileSync(`lib/babylon/modes/${f}`, 'utf8');

describe('the hoops matchup card', () => {
  it('every number on it is the mode\'s own', () => {
    expect(src('OneVOneMode.ts')).toMatch(/const TARGET_SCORE = 11;/);
    expect(HOOPS_MATCHUP.onevone.rule).toMatch(/FIRST TO 11\b/);
    expect(src('OneVOneMode.ts')).toMatch(/MAKE IT, TAKE IT/);
    expect(src('ThreeVThreeMode.ts')).toMatch(/const TARGET_SCORE = 21;/);
    expect(src('threevthreeOvertime.ts')).toMatch(/export const THREE_GAME_SEC = 240;/);   // hoops-flow (owner 2026-11-12): 4 minutes, was 90 s
    expect(HOOPS_MATCHUP.threevthree.rule).toMatch(/^4 MINUTES · FIRST TO 21\b/);
    expect(src('threePointRules.ts')).toMatch(/export const TP_FINALISTS = 3;/);
    expect(HOOPS_MATCHUP.threepoint.rule).toMatch(/TOP 3\b/);
    // nothing else on any card is a number
    for (const [k, m] of Object.entries(HOOPS_MATCHUP)) {
      const nums = `${m.kicker} ${m.you} ${m.them} ${m.rule}`.match(/\d+/g) ?? [];
      const allowed: Record<string, string[]> = { onevone: ['1', '1', '11'], threevthree: ['3', '3', '4', '21'], threepoint: ['3'], dunkduel: ['1', '2'] };
      expect(nums, k).toEqual(allowed[k] ?? []);
    }
  });
  it('is shown for the five hoops court modes, and only those', () => {
    for (const m of ['onevone', 'threevthree', 'threepoint', 'dunk', 'dunkduel']) expect(isHoopsMatchupMode(m), m).toBe(true);
    for (const m of Object.keys(HOOPS_MATCHUP)) expect(BASKETBALL_MODE_IDS.has(m), m).toBe(true);
    for (const m of ['karate', 'skateboard', 'carnival', 'tennis']) expect(isHoopsMatchupMode(m), m).toBe(false);
  });
  it('draws the court, both sides, the rule and the picked opponent\'s own line', () => {
    const html = renderToStaticMarkup(<HoopsMatchupCard modeId="onevone" location="rooftop" tier="elite" tint="#ffb36b" />);
    expect(html).toContain('NIGHT ROOFTOP');
    expect(html).toContain('YOU');
    expect(html).toContain('THE RIVAL');
    expect(html).toContain('FIRST TO 11');
    expect(html).toContain('ELITE');
    expect(html).toContain('Punishes everything');
    expect(renderToStaticMarkup(<HoopsMatchupCard modeId="karate" location="venice" tier={null} tint="#fff" />)).toBe('');
  });
  it('the splash puts it in the learn card\'s place on a hoops court, and keeps the learn card elsewhere', () => {
    const splash = readFileSync('components/games/boot-splash.tsx', 'utf8');
    expect(splash).toMatch(/isHoopsMatchupMode\(props\.modeId\)\s*\n?\s*\? <HoopsMatchupCard/);
    expect(splash).toMatch(/: <LearnWhileYouWait compact/);
  });
});
