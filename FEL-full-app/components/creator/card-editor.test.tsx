// SCREEN-FIXES (2026-11-10): /profile/edit's "Save card" was white on #A855F7, 3.96:1 (readable-2 measured it from pixels).
// The editor renders its loading line until the card is fetched, so this reads the button from the source.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as wcagNs from '@/lib/a11y/wcag';

const { contrastRatio, parseColor } = ((wcagNs as { default?: unknown }).default ?? wcagNs) as typeof wcagNs;
const src = readFileSync(join(__dirname, 'card-editor.tsx'), 'utf8');

describe('"Save card"', () => {
  it('is white on a fill that clears AA (4.5:1)', () => {
    const button = src.match(/<button[^>]*onClick=\{save\}[^>]*>/)?.[0] ?? '';
    expect(button).not.toBe('');
    const fill = button.match(/bg-\[(#[0-9a-fA-F]{6})\]/)?.[1];
    expect(fill).toBeDefined();
    expect(button).toMatch(/\btext-white\b/);
    expect(contrastRatio(parseColor('#ffffff')!, parseColor(fill!)!)).toBeGreaterThanOrEqual(4.5);
  });
});
