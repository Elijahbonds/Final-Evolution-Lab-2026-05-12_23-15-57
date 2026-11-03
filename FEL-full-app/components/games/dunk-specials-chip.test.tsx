// HUD-SEASONPASS-LABEL (2026-10-20): live /try (guest) showed "SPECIALS · SEASON PASS" on the dunk HUD. Guests get no pass label;
// the signed-in HUD is unchanged. Static markup plus a source scan of the host's wiring (no DOM here).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DunkSpecialsChip } from './dunk-specials-chip';

const read = (f: string) => readFileSync(path.resolve(__dirname, f), 'utf8');
const LABEL = 'SPECIALS · SEASON PASS';

describe('the dunk HUD season-specials chip', () => {
  it('guest HUD: no SPECIALS · SEASON PASS, even with the specials locked', () => {
    expect(renderToStaticMarkup(h(DunkSpecialsChip, { specials: 'LOCKED', guest: true }))).toBe('');
  });
  it('signed-in HUD: still shows SPECIALS · SEASON PASS when the specials are locked', () => {
    expect(renderToStaticMarkup(h(DunkSpecialsChip, { specials: 'LOCKED', guest: false }))).toContain(LABEL);
    expect(renderToStaticMarkup(h(DunkSpecialsChip, { specials: 'LOCKED' }))).toContain(LABEL);
  });
  it('shows nothing when the specials are not locked', () => {
    for (const v of [undefined, null, 'OPEN', true, 0]) expect(renderToStaticMarkup(h(DunkSpecialsChip, { specials: v as never }))).toBe('');
  });
  it('the dunk host draws the chip through the guest flag, and the label lives only in the chip', () => {
    const host = read('dunk-babylon.tsx');
    expect(host).toContain('<DunkSpecialsChip specials={hud.specials} guest={guest} />');
    expect(host).not.toContain(LABEL);
  });
  it('/try\'s guest shell mounts the dunk host as a guest', () => {
    expect(read('guest-dunk-shell.tsx')).toMatch(/<DunkBabylon[^>]*\n\s*guest\n/);
  });
});
