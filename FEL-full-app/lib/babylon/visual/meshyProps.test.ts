import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ballKindFor, HOOP_SCAN, MESHY_PROP_URL } from './meshyProps';
import { readPlayerIcon } from './playerIcon';
import type { EquippedCard } from '../core/playerIdentity';

describe('meshy props — the owner\'s scans as game props', () => {
  it('picks the ball skin by the mode\'s sphere diameter and leaves the rest alone', () => {
    expect(ballKindFor(0.24)).toBe('basketball');
    expect(ballKindFor(0.22)).toBe('soccer');
    expect(ballKindFor(0.067)).toBe('tennis');
    expect(ballKindFor(0.21)).toBeNull();   // volleyball keeps its sphere (no scan)
    expect(ballKindFor(0.1)).toBeNull();    // golf
    expect(ballKindFor(0.12)).toBeNull();   // baseball
  });
  it('the hoop scan\'s ring is measured below the 3.05 m rim so the scale-up is small', () => {
    const s = 3.05 / HOOP_SCAN.rimY;
    expect(s).toBeGreaterThan(1); expect(s).toBeLessThan(1.1);
    expect(HOOP_SCAN.rimZ).toBeGreaterThan(0);   // the ring sits in front of the pivot
  });
  it('props live under /models/meshy', () => { expect(MESHY_PROP_URL('hoop')).toBe('/models/meshy/hoop.glb'); });
});

// QA P1-02 (2026-09-27): "a basketball stands in as the ball in baseball, volleyball and golf". None of the three live
// modes dresses a basketball (the ball the QA saw was the player ring's glyph, P1-01); these hold both.
describe('no basketball outside hoops (QA P1-02)', () => {
  it('the derby, golf and volleyball balls are never the basketball scan (golf is not a tennis ball either)', () => {
    expect(ballKindFor(0.075)).toBeNull();   // baseball (DERBY_CONFIG)
    expect(ballKindFor(0.043)).toBeNull();   // golf (GOLF_CONFIG)
    expect(ballKindFor(0.21)).toBeNull();    // volleyball (VolleyballMode)
    expect(ballKindFor(0.12)).toBeNull();    // the derby's live sphere
  });

  it('only the hoops modes (and the carnival slam) dress the basketball', () => {
    const root = path.resolve(__dirname, '../modes');
    const callers = readdirSync(root).filter((f) => f.endsWith('.ts') && !f.includes('.test.'))
      .filter((f) => /dress(?:Meshy)?Ball\([^)]*'basketball'\)/.test(readFileSync(path.join(root, f), 'utf8')));
    // DunkDuelMode joined the hoops modes on the release (IMPROVE 2026-10-06 #10: the duel ball is a basketball)
    expect(callers.sort()).toEqual(['DunkDuelMode.ts', 'DunkMode.ts', 'OneVOneMode.ts', 'ThreePointMode.ts', 'ThreeVThreeMode.ts', 'carnivalEvents.ts']);
  });

  it('the player ring shows the mode\'s own ball in the derby, volleyball and golf, never the basketball', () => {
    const hooper = { mode: 'dunk' } as EquippedCard;
    expect(readPlayerIcon(hooper, 'baseball')).toBe('baseball');
    expect(readPlayerIcon(hooper, 'volleyball')).toBe('volleyball');
    expect(readPlayerIcon(hooper, 'golf')).toBe('golf');
  });
});
