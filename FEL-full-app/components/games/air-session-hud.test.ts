// QA P2-02 (2026-09-27): Stomp showed CLEAN on spawn — a landing grade before any jump. The HUD holds grade lines (and
// BEST) until the rider has been in the air this run; the run-up's lines still show.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { landingReadout } from './air-session-babylon';

describe('Stomp\'s HUD: no landing grade before the first air', () => {
  it('the initial HUD (on the ground, never airborne) shows no grade and no BEST', () => {
    for (const g of ['CLEAN', 'CLEAN — NO TRICK, NO POINTS', 'STUCK IT! — NO TRICK, NO POINTS', 'SKETCHY  1.0 ROT FS', 'CRASH']) {
      expect(landingReadout(g, 'CLEAN', false), g).toEqual({ banner: '', best: '' });
    }
  });

  it('the run-up\'s own lines still show before the first air', () => {
    for (const l of ['PERFECT STRIDE', 'GOOD', 'BOOST!', 'STUMBLE!', 'SPIN IN THE AIR']) expect(landingReadout(l, null, false).banner).toBe(l);
  });

  it('once airborne, the grades and BEST read as before', () => {
    expect(landingReadout('CLEAN  1.5 ROT BS', 'CLEAN', true)).toEqual({ banner: 'CLEAN  1.5 ROT BS', best: 'CLEAN' });
    expect(landingReadout(null, null, true)).toEqual({ banner: '', best: '' });
  });

  it('the host latches airborne on the mode\'s Air / Land phase and renders through the readout', () => {
    const src = readFileSync(path.resolve(__dirname, 'air-session-babylon.tsx'), 'utf8');
    expect(src).toContain("if (u.phase === 'Air' || u.phase === 'Land') setAirborne(true);");
    expect(src).toContain('const readout = landingReadout(hud.banner, hud.best, airborne);');
    expect(src).not.toMatch(/\{typeof hud\.banner === 'string' && hud\.banner && \(/);
  });
});
