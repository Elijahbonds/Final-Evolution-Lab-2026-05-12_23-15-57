// The one token set (A11-06): every token has its CSS property with the same value, every text step reads (WCAG 1.4.3
// on every surface), and the TV HUD's tones are all in the set.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COLOR, COLOR_VAR, TAILWIND_FEL, TEXT_LADDER, TEXT_SURFACES, BODY_CONTRAST_MIN, type ColorToken } from './tokens';
import { INK, PALETTE, SURFACE } from './palette';
import { contrastRatio, parseColor } from '@/lib/a11y/wcag';
import { HUD_RGB, HUD_TONES } from '@/components/games/tv-hud/tokens';

const ROOT = join(__dirname, '..', '..');
const theme = readFileSync(join(ROOT, 'app/theme.css'), 'utf8');
const hex = (h: string) => parseColor(h)!;

describe('every token is in app/theme.css with the same value', () => {
  for (const k of Object.keys(COLOR) as ColorToken[]) {
    it(`${k} = ${COLOR_VAR[k]}`, () => {
      const m = new RegExp(`${COLOR_VAR[k]}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(theme);
      expect(m, COLOR_VAR[k]).not.toBeNull();
      expect(m![1].toLowerCase()).toBe(COLOR[k].toLowerCase());
    });
  }
});

describe('the signed-off values are carried, not changed', () => {
  it('the accents, the ink and the card are the palette', () => {
    for (const [k, v] of Object.entries(PALETTE)) expect(COLOR[k as ColorToken]).toBe(v);
    expect(COLOR.bg).toBe(INK);
    expect(COLOR.surface).toBe(SURFACE);
  });
  it('every TV HUD tone is a token: one set for the app and the HUD', () => {
    const values = new Set(Object.values(COLOR).map((v) => v.toLowerCase()));
    for (const t of HUD_TONES) {
      const h = `#${HUD_RGB[t].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
      expect(values.has(h), `${t} ${h}`).toBe(true);
    }
  });
});

describe('the text ladder reads on every surface (WCAG 1.4.3, 4.5:1)', () => {
  for (const t of TEXT_LADDER) {
    for (const s of TEXT_SURFACES) {
      it(`${t} on ${s}`, () => {
        expect(contrastRatio(hex(COLOR[t]), hex(COLOR[s]))).toBeGreaterThanOrEqual(BODY_CONTRAST_MIN);
      });
    }
  }
  it('is ordered brightest first', () => {
    const r = TEXT_LADDER.map((t) => contrastRatio(hex(COLOR[t]), hex(COLOR.bg)));
    for (let i = 1; i < r.length; i++) expect(r[i]).toBeLessThan(r[i - 1]);
  });
  it('the focus ring is at least 3:1 against every surface (1.4.11 non-text contrast)', () => {
    for (const s of TEXT_SURFACES) expect(contrastRatio(hex(COLOR.focus), hex(COLOR[s]))).toBeGreaterThanOrEqual(3);
  });
});

describe('Tailwind exposes the set as fel-* classes', () => {
  it('tailwind.config.ts reads TAILWIND_FEL, and every class maps to a token value', () => {
    expect(readFileSync(join(ROOT, 'tailwind.config.ts'), 'utf8')).toMatch(/fel: TAILWIND_FEL/);
    const values = new Set(Object.values(COLOR));
    for (const v of Object.values(TAILWIND_FEL)) expect(values.has(v)).toBe(true);
  });
});
