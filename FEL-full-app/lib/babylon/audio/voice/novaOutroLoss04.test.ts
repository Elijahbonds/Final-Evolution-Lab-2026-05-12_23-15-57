// VOICE-NP1: Nova's outro.loss.04 was re-recorded with the NP-1 text. The bank index, the bank file and the voice script
// must agree: the clip's byte range sits inside the bank, it is a real AAC/m4a clip, and no copy says "opens soon".
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const DIR = 'public/audio/voice/v1/nova';
const TEXT = 'Hands together for our cadet, Orbit! Brave flight. Next launch window: stay ready.';
const man = JSON.parse(readFileSync(`${DIR}/shared.json`, 'utf8'));
const line = man.lines.find((l: { id: string }) => l.id === 'outro.loss.04');

describe('nova outro.loss.04 (re-recorded for NP-1)', () => {
  it('the index carries the new text and points at a bank that exists', () => {
    expect(line.text).toBe(TEXT);
    expect(existsSync(`${DIR}/${man.bank}`)).toBe(true);
    expect(readdirSync(DIR).filter((f) => f.startsWith('shared.') && f.endsWith('.bin'))).toEqual([man.bank]);
  });

  it('every clip in the bank is a back-to-back m4a whose range fits, ending at the bank size', () => {
    const bank = readFileSync(`${DIR}/${man.bank}`);
    let off = 0;
    for (const l of man.lines) {
      expect(l.off).toBe(off);
      expect(bank.subarray(l.off + 4, l.off + 8).toString('latin1')).toBe('ftyp');
      off += l.len;
    }
    expect(off).toBe(bank.length);
    expect(line.sec).toBeGreaterThan(3);
    expect(line.sec).toBeLessThan(6);
  });

  it('the voice script says the same words, so a re-render keeps them', () => {
    const script = readFileSync('lib/babylon/audio/mic/script/nova.json', 'utf8');
    expect(script).toContain(TEXT);
    expect(script).not.toMatch(/opens soon/i);
    expect(readFileSync(`${DIR}/shared.json`, 'utf8')).not.toMatch(/opens soon/i);
  });
});
