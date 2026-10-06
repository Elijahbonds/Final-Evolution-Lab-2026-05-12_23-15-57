// CREATOR-PLAN phase 4d: soft UI sounds and haptics through the game's own helpers.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FEEL, feel, type FeelOut } from './feel';

const rec = () => { const log: string[] = []; const out: FeelOut = { tick: (p, v) => log.push(`tick ${p} ${v}`), buzz: (b) => log.push(`buzz ${JSON.stringify(b)}`), rumble: (s, ms) => log.push(`rumble ${s} ${ms}`) }; return { log, out }; };

describe('feel', () => {
  it('a snap ticks and buzzes; with a pad in hand it rumbles instead', () => {
    const a = rec(); feel('snap', { out: a.out });
    expect(a.log).toEqual([`tick ${FEEL.snap.pitch} ${FEEL.snap.volume}`, `buzz ${JSON.stringify(FEEL.snap.buzz)}`]);
    const b = rec(); feel('snap', { out: b.out, pad: true });
    expect(b.log[1]).toBe(`rumble ${FEEL.snap.rumble![0]} ${FEEL.snap.rumble![1]}`);
    const c = rec(); feel('select', { out: c.out, pad: true });
    expect(c.log[1]).toBe(`buzz ${FEEL.select.buzz}`);   // no rumble for a select: the pad's own button buzz is enough
  });
  it('every cue is soft and short', () => {
    for (const f of Object.values(FEEL)) {
      expect(f.volume).toBeLessThanOrEqual(0.35);
      const ms = Array.isArray(f.buzz) ? f.buzz.reduce((a, b) => a + b, 0) : f.buzz;
      expect(ms).toBeLessThanOrEqual(60);
    }
  });
  it('through SoundKit and the one haptics adapter (no new audio asset, no second vibrate path)', () => {
    const src = readFileSync('lib/babylon/creator/studio/feel.ts', 'utf8').replace(/^\s*\/\/.*$/gm, '');
    expect(src).toContain("SoundKit.play('uiTick'");
    expect(src).toContain("from '../../premium/Haptics'");
    expect(src).not.toMatch(/navigator\.vibrate|new Audio|\.mp3|\.wav/);
  });
});
