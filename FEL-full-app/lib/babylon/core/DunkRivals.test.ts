// A PERSONALITY MUST NOT BE A DIFFICULTY INCREASE WITH A NAME ON IT (2026-09-14).
//
// If a showman reaches for harder dunks AND lands them at the same rate as the steady one, he is not a
// character — he is strictly better, and drawing the steady rival becomes a punishment for the player.
// RivalNerve's invariant applies to the ROSTER too: whoever swings bigger must also miss more. The sweep
// below reads DUNK_RIVALS directly rather than a hand-written list, so adding a rival out of order fails
// here instead of quietly inverting the contest.

import { describe, it, expect } from 'vitest';
import {
  DUNK_RIVALS, DEFAULT_RIVAL, rivalForNight, rivalById, rivalIntro, hitSignature,
} from './DunkRivals';

describe('DunkRivals — the invariant', () => {
  // THE POINT OF THE FILE.
  it('never lets a rival reach further without risking more, for any pair', () => {
    for (const a of DUNK_RIVALS) {
      for (const b of DUNK_RIVALS) {
        if (a.reach === b.reach) continue;
        if (a.reach > b.reach) expect(a.risk).toBeGreaterThan(b.risk);
      }
    }
  });

  it('is declared in order, safest to wildest, so the array itself reads as the ladder', () => {
    for (let i = 1; i < DUNK_RIVALS.length; i++) {
      expect(DUNK_RIVALS[i].reach).toBeGreaterThan(DUNK_RIVALS[i - 1].reach);
      expect(DUNK_RIVALS[i].risk).toBeGreaterThan(DUNK_RIVALS[i - 1].risk);
    }
  });

  it('keeps every multiplier sane — nobody is switched off and nobody is unbeatable', () => {
    for (const r of DUNK_RIVALS) {
      expect(r.reach).toBeGreaterThan(0.5);
      expect(r.reach).toBeLessThan(1.6);
      expect(r.risk).toBeGreaterThan(0.4);
      expect(r.risk).toBeLessThan(2);
    }
  });

  it('has somebody at each end and somebody neutral in the middle', () => {
    expect(DUNK_RIVALS.some((r) => r.reach < 1 && r.risk < 1)).toBe(true);
    expect(DUNK_RIVALS.some((r) => r.reach > 1 && r.risk > 1)).toBe(true);
    expect(DEFAULT_RIVAL.reach).toBe(1);
    expect(DEFAULT_RIVAL.risk).toBe(1);
  });
});

describe('DunkRivals — who you face', () => {
  // The whole point of a roster is that coming back is different.
  it('gives a different opponent on each of the first N nights', () => {
    const seen = new Set<string>();
    for (let n = 1; n <= DUNK_RIVALS.length; n++) seen.add(rivalForNight(n).id);
    expect(seen.size).toBe(DUNK_RIVALS.length);
  });

  it('wraps rather than running out', () => {
    expect(rivalForNight(DUNK_RIVALS.length + 1).id).toBe(rivalForNight(1).id);
    expect(rivalForNight(DUNK_RIVALS.length * 3 + 2).id).toBe(rivalForNight(2).id);
  });

  it('treats anything before night one as night one', () => {
    expect(rivalForNight(0).id).toBe(DUNK_RIVALS[0].id);
    expect(rivalForNight(-7).id).toBe(DUNK_RIVALS[0].id);
    expect(rivalForNight(NaN).id).toBe(DUNK_RIVALS[0].id);
  });

  it('falls back rather than throwing on an unknown id', () => {
    expect(rivalById('nobody')).toBe(DEFAULT_RIVAL);
    expect(rivalById('stack').name).toBe('STACK');
  });
});

describe('DunkRivals — the words', () => {
  it('gives one introduction line so no surface phrases its own', () => {
    expect(rivalIntro(DUNK_RIVALS[0])).toBe(`${DUNK_RIVALS[0].name} — ${DUNK_RIVALS[0].tag}`);
  });

  it('recognises a rival landing the dunk they are known for', () => {
    const zo = rivalById('zo');
    expect(hitSignature(zo, 'EASTBAY')).toBe(true);
    expect(hitSignature(zo, 'eastbay')).toBe(true);
    expect(hitSignature(zo, 'WINDMILL')).toBe(false);
    expect(hitSignature(zo, '')).toBe(false);
  });

  it('gives every rival a signature that is a real trick label', () => {
    const labels = new Set(['WINDMILL', '360', 'EASTBAY', 'TOMAHAWK', 'BETWEEN THE LEGS', 'SCORPION', 'LOST & FOUND', 'HIDE & SEEK']);
    for (const r of DUNK_RIVALS) expect(labels.has(r.signature)).toBe(true);
  });
});
