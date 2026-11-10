// DUNK-FLAGSHIP P10 — "the dunk host renders through the design system's tokens with no layout shift at 390×844".
// Measured on the real host (scripts/probes/_dunk-host-cls.mts, docs/DUNK-FLAGSHIP.md §15): in play, every shift came from the
// bottom column — its box was anchored at the bottom only, so it grew and shrank with what it held, and the runway's hint (one
// line or two, re-worded every few seconds) moved the rows above it. The fix, pinned here: the column's box is fixed (top and
// bottom), and the hint's row is always two lines tall with the plate at its top.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const HOST = readFileSync(path.join(__dirname, 'dunk-babylon.tsx'), 'utf8');
const col = HOST.slice(HOST.indexOf('<div data-dunk-bottom'), HOST.indexOf('NIGHT CARD (TRY-ONBOARD G1)'));
const open = /<div data-dunk-bottom className="([^"]*)" style=\{\{ bottom: PAD_LIFT \}\}>/.exec(col);

describe('the dunk HUD\'s bottom column does not shift the layout', () => {
  it('the column\'s box is fixed: anchored at the top of the stage AND at the hint\'s slot, the rows still stacking up from the bottom', () => {
    expect(open, 'the column').not.toBeNull();
    const cls = open![1].split(/\s+/);
    for (const c of ['absolute', 'inset-x-0', 'top-0', 'flex', 'flex-col-reverse', 'pointer-events-none']) expect(cls, c).toContain(c);   // fails on the old column (no top: its box followed its content)
    expect(cls.some((c) => /^justify-/.test(c)), 'the rows start at the bottom (flex-col-reverse, main-start)').toBe(false);
  });
  it('the hint\'s row reserves two lines (the clamp\'s limit) on the hint\'s own type, with the plate at the top of the row', () => {
    expect(HOST).toContain("const HINT_SLOT_STYLE = { minHeight: 'calc(2lh + 0.75rem)' } as const;");
    const hint = col.slice(col.indexOf('{hint && ('), col.indexOf('{takeoff && ('));
    // the row is typed as the hint is (size="body"), so `lh` is the hint's line; the plate's py-1.5 is the 0.75rem
    expect(hint).toMatch(/<HudText as="div" size="body" className="w-full text-center" style=\{HINT_SLOT_STYLE\}>\s*<HudPlate as="span" className="inline-block max-w-\[min\(92%,980px\)\] px-3 py-1\.5 align-top">\s*<HudText as="div" size="body" alpha=\{0\.8\} style=\{LINE_CLAMP_STYLE\}>\{hint\}<\/HudText>/);
    expect(readFileSync(path.join(__dirname, 'tv-hud/banner.tsx'), 'utf8')).toMatch(/LINE_CLAMP_STYLE: CSSProperties = \{\s*display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2,/);   // two lines is the most a hint shows
  });
  it('nothing else in the column changed: the same rows, in the same order, through the same HUD kit', () => {
    for (const k of ['{hint && (', '{takeoff && (', '{strip && <DunkBeatStrip', '{mic && <MicCaption flow', '{call && (']) expect(col, k).toContain(k);
    expect(col.indexOf('{hint && (')).toBeLessThan(col.indexOf('{takeoff && ('));
    expect(col.indexOf('{takeoff && (')).toBeLessThan(col.indexOf('{strip && <DunkBeatStrip'));
    expect(col.indexOf('{mic && <MicCaption flow')).toBeLessThan(col.indexOf('{call && ('));
    expect(col).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);          // no raw colour: the palette
    expect(col).not.toMatch(/text-\[\d+px\]|fontSize/);      // no size of its own: the type scale
  });
});
