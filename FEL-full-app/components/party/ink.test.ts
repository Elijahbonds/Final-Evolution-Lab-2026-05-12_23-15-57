// SCREEN-FIXES (2026-11-10): /play/party's small coloured text at AA (components/party/ink.ts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PARTY_MODES } from '@/lib/party/catalog';
import { SEAT_COLORS } from '@/lib/party/seats';
import { AA, PARTY_INK_BG, badgeBackgrounds, quietInk, readableInk, worstContrast } from './ink';

const room = readFileSync(join(__dirname, 'party-room.tsx'), 'utf8');

describe('the colours as they were (what readable-2 measured)', () => {
  it('an empty seat\'s "P 1"–"P 4" at 40 % alpha, and two badges, are under AA', () => {
    for (const c of SEAT_COLORS) expect(worstContrast(`${c}66`, [[PARTY_INK_BG]])).toBeLessThan(AA);
    const under = PARTY_MODES.filter((m) => worstContrast(m.color, badgeBackgrounds(m.color)) < AA).map((m) => m.id);
    expect(under.length).toBe(2);   // Brain Brawl's violet and Who Scene It's rose
  });
});

describe('the inks the room uses now', () => {
  it('every players badge clears AA on its card, picked or not', () => {
    for (const m of PARTY_MODES) expect(worstContrast(readableInk(m.color, badgeBackgrounds(m.color)), badgeBackgrounds(m.color)), m.id).toBeGreaterThanOrEqual(AA);
  });
  it('every empty seat\'s label clears AA and is still dimmer than (or as bright as) the seat colour', () => {
    for (const c of SEAT_COLORS) {
      const ink = quietInk(c);
      expect(worstContrast(ink, [[PARTY_INK_BG]]), c).toBeGreaterThanOrEqual(AA);
      expect(worstContrast(ink, [[PARTY_INK_BG]])).toBeLessThanOrEqual(worstContrast(c, [[PARTY_INK_BG]]) + 1e-9);
    }
  });
  it('a colour that already clears AA comes back unchanged', () => {
    expect(readableInk('#22d3ee', badgeBackgrounds('#22d3ee'))).toBe('#22d3ee');
  });
  it('party-room.tsx draws them: no 40 %-alpha seat colour, the badge in its readable ink', () => {
    expect(room).not.toMatch(/SEAT_COLORS\[index\]\}66/);
    expect(room).toMatch(/color: SEAT_INK\[index\]/);
    expect(room).toMatch(/data-party-players[^>]*color: BADGE_INK\[m\.id\]/);
  });
});

describe('the join banner', () => {
  it('wraps on a phone instead of being cut off', () => {
    const banner = room.match(/<p data-testid="party-banner"[^>]*>/)?.[0] ?? '';
    expect(banner).not.toBe('');
    expect(banner).not.toMatch(/\btruncate\b|line-clamp|whitespace-nowrap/);
  });
});
