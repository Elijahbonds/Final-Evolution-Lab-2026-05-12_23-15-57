// THE MIC (2026-09-24): every name the game can put on screen has a clip the MC can say after a line.
import { describe, it, expect } from 'vitest';
import { allStingers, dunkStingers, numberWords, slug, speakable, PLAIN_DUNK_LABELS } from './names';
import { DUNK_TRICKS, RUNWAY_TRICKS, SIGNATURE_DUNKS, SPIN_720 } from '@/lib/babylon/core/DunkSystem';
import { DUNK_RIVALS } from '@/lib/babylon/core/DunkRivals';

const keys = new Set(allStingers().map((s) => s.key));

describe('the name clips', () => {
  it('every trick, runway trick, signature, plain and game dunk, rival and number 0–60 has one', () => {
    for (const t of [...DUNK_TRICKS, SPIN_720, ...RUNWAY_TRICKS]) expect(keys.has(`dunk:${slug(t.label)}`), t.label).toBe(true);
    for (const s of SIGNATURE_DUNKS) expect(keys.has(`dunk:${slug(s.name)}`), s.name).toBe(true);
    for (const l of PLAIN_DUNK_LABELS) expect(keys.has(`dunk:${slug(l)}`), l).toBe(true);
    for (const r of DUNK_RIVALS) expect(keys.has(`rival:${r.id}`), r.id).toBe(true);
    for (let n = 0; n <= 60; n++) expect(keys.has(`num:${n}`)).toBe(true);
  });
  it('the voice reads them as words: no digits, no symbols, sentence case', () => {
    for (const s of allStingers()) { expect(s.text, s.key).not.toMatch(/\d|&|→/); expect(s.text[0]).toBe(s.text[0].toUpperCase()); }
    expect(speakable('THE 720')).toBe('The seven-twenty');
    expect(speakable('360 EASTBAY')).toBe('Three-sixty east bay');
    expect(speakable('LOST & FOUND')).toBe('Lost and found');
    expect(numberWords(47)).toBe('forty-seven'); expect(numberWords(30)).toBe('thirty'); expect(numberWords(13)).toBe('thirteen');
  });
  it('a signature is called by its own name; a chain piece by piece; a finish banner without its "!"', () => {
    expect(dunkStingers('THE CARTWHEEL EASTBAY')).toEqual(['dunk:the-cartwheel-eastbay']);
    expect(dunkStingers('SELF-LOB → WINDMILL')).toEqual(['dunk:self-lob', 'dunk:windmill']);
    expect(dunkStingers('TWO-HAND HAMMER!')).toEqual(['dunk:two-hand-hammer']);
    for (const k of dunkStingers('KICK-UP → 360 → EASTBAY')) expect(keys.has(k), k).toBe(true);
  });
});
