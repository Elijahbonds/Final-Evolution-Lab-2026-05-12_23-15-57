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

// SCREEN-FIXES (2026-11-10, beyond the brief, flagged): the every-screen scan's 7 critical findings on /profile/edit were the
// card editor's fields named by their placeholder only. Field's label now wraps its field; the hex box has its own name.
describe('the card editor\'s fields are named', () => {
  it('Field wraps its field in the label (an implicit label)', () => {
    const field = src.slice(src.indexOf('function Field('));
    expect(field).toMatch(/<label className="mt-3 block">\s*<span[^>]*>\{label\}<\/span>\s*<span className="mt-1 block">\{children\}<\/span>\s*<\/label>/);
  });
  it('the accent\'s hex box, the second field in its label, has a name of its own', () => {
    expect(src).toMatch(/placeholder="#00E5FF" aria-label="Accent color, as a hex code"/);
  });
  it('"Copy" on the invite card is on the same AA fill as "Save card"', () => {
    const ref = readFileSync(join(__dirname, '../marketing/referral-card.tsx'), 'utf8');
    expect(ref).not.toMatch(/bg-\[#A855F7\] px-4 py-3 font-semibold text-white/);
    expect(ref).toMatch(/bg-\[#9333EA\] px-4 py-3 font-semibold text-white/);
  });
});
