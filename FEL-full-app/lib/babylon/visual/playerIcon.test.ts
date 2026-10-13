import { describe, it, expect } from 'vitest';
import { iconForDiscipline, readPlayerIcon } from './playerIcon';
import { RING_GLYPH, type RingIcon } from './PlayerRing';
import type { EquippedCard } from '../core/playerIdentity';
describe('playerIcon', () => {
  it('maps disciplines to the glyphs the owner named', () => {
    expect(iconForDiscipline('onevone')).toBe('basketball'); expect(iconForDiscipline('dunk')).toBe('basketball');
    expect(iconForDiscipline('studio')).toBe('music'); expect(iconForDiscipline('dance')).toBe('dance');
    expect(iconForDiscipline('scene')).toBe('camera'); expect(iconForDiscipline('brainbrawl')).toBe('controller');
  });
  it('with no window and no record, a gamer', () => { expect(readPlayerIcon()).toBe('controller'); });
});

// QA P1-01 (2026-09-27): a basketball rode over the player in Storm Duel, Ring's Edge and Venice Lines. Every sport mapped
// to the basketball glyph, and a derived identity carried it into every mode.

describe('playerIcon: the basketball is hoops only (QA P1-01)', () => {
  it('the three modes the QA named are not the basketball', () => {
    for (const m of ['karate-vs', 'karate_vs', 'mixedcombat', 'skateboard', 'skate']) expect(iconForDiscipline(m), m).not.toBe('basketball');
  });

  it('each sport has its own glyph, and hoops keeps the ball', () => {
    const want: Record<string, RingIcon> = {
      'karate-vs': 'martial', mixedcombat: 'martial', showdown: 'martial', karate: 'martial', duel: 'martial',
      skateboard: 'skate', snowboard: 'snow', 'big-air': 'snow', surf: 'surf', golf: 'golf', soccer: 'soccer', penalty: 'soccer',
      tennis: 'tennis', tiebreak: 'tennis', volleyball: 'volleyball', football: 'football', baseball: 'baseball', derby: 'baseball',
      onevone: 'basketball', threevthree: 'basketball', threepoint: 'basketball', dunk: 'basketball',
      kart: 'controller', brainbrawl: 'controller',
    };
    for (const [m, icon] of Object.entries(want)) expect(iconForDiscipline(m), m).toBe(icon);
  });

  it('every icon has a glyph, and only the basketball draws 🏀', () => {
    const icons = Object.keys(RING_GLYPH) as RingIcon[];
    expect(icons.filter((i) => RING_GLYPH[i] === '🏀')).toEqual(['basketball']);
    for (const i of icons) expect(RING_GLYPH[i].length).toBeGreaterThan(0);
  });

  it('a hoops identity shows the basketball in hoops, the mode\'s own sport elsewhere, the controller in a non-sport mode', () => {
    const hooper = { mode: 'dunk' } as EquippedCard;
    expect(readPlayerIcon(hooper, 'onevone')).toBe('basketball');
    expect(readPlayerIcon(hooper, 'karate-vs')).toBe('martial');
    expect(readPlayerIcon(hooper, 'mixedcombat')).toBe('martial');
    expect(readPlayerIcon(hooper, 'skateboard')).toBe('skate');
    expect(readPlayerIcon(hooper, 'brainBrawl')).toBe('controller');
    expect(readPlayerIcon(hooper, null)).toBe('basketball');     // no mode mounted (a card preview): the identity itself
  });

  it('any other identity is kept as it is, in every mode', () => {
    expect(readPlayerIcon({ mode: 'studio' } as EquippedCard, 'karate-vs')).toBe('music');
    expect(readPlayerIcon({ mode: 'skateboard' } as EquippedCard, 'onevone')).toBe('skate');
  });
});
